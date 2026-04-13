# F-TS05: Import Orchestration Workflow

## Overview

- Feature ID: F-TS05
- Feature name: Import orchestration workflow (parse → validate → match → review → emit)
- Owner: —
- Status: Done
- Related requirement(s): R1, R3, R4, R6, R7
- Related milestone(s): M-TS2
- Python predecessor(s): `backend/ingestion/service.py` (`import_excel_into_project`), `backend/ingestion/mapping.py` (section delegation), `backend/ui_api/commands.py` (`import_race`, `apply_match_decision`), `backend/ui_api/queries.py` (`get_review_queue`)

## Problem Statement

The three upstream features — F-TS02 (Excel parsing), F-TS03 (matching engine), F-TS01 (event-sourced architecture) — are deliberately self-contained modules. Something needs to wire them together into a coherent import workflow: read a file, validate it against existing season state, run each parsed row through the matching engine, surface uncertain matches for user review, and once everything is resolved, atomically commit an event batch to the season log.

In the Python version this orchestration is spread across `service.py` (file-level validation, section iteration, save), `mapping.py` (section-to-workflow delegation), and `commands.py` / `queries.py` (review queue inspection, match decision application, standings recompute). The TS port consolidates this into a single, cleanly phased orchestration module.

The orchestrator's job is **general orchestration flow only** — it calls into the parser, the matching engine, and the event store, but contains none of their internal logic. Its responsibilities:

1. Accept a file from the UI layer.
2. Call the parser (F-TS02) to get structured sections.
3. Validate the parsed result against the current season state (duplicate import, category/race-no conflicts).
4. For each section, call the matching engine (F-TS03) to resolve every row to a team.
5. Collect entries that need user review into a staging area.
6. Once all entries are fully resolved (auto-accepted or user-confirmed), construct the event batch and commit it atomically to the season event log (F-TS01).
7. Return an import report summarizing what happened.

## Scope

### In Scope

- Orchestration of the parse → match → review → emit pipeline.
- Pre-import validation: duplicate SHA-256 detection, category/race-no conflict detection.
- Duplicate row detection within a single import (same name/yob/club/startnr).
- Construction of the full event batch: `import_batch.recorded`, `person.registered`, `team.registered`, `race.registered`, `ranking.eligibility_set` events.
- Staging area for unresolved (review-routed) entries, keyed by import session.
- Review resolution API: accept a candidate (link to existing team) or create a new identity.
- Auto-accept logic: entries routed to `auto` by the matching engine are accepted without user interaction.
- Import blocking: a new import cannot proceed while the current session has unresolved review entries.
- Distance conversion: `distance_km` (float, from parser) → `distance_m` (integer, for events).
- Eligibility clearing: emit `ranking.eligibility_set { eligible: true }` for each previously-excluded `(category, team)` pair.
- Import report: counts of auto-links, review items, new identities, conflicts, replays.
- Pure orchestration types and functions, framework-agnostic.

### Out of Scope

- Excel parsing internals (F-TS02).
- Matching engine internals: scoring, fingerprinting, blocking, strict mode logic (F-TS03).
- Event log storage, projection, and replay (F-TS01).
- Ranking/standings computation (F-TS04); standings are derived on-demand, not triggered by import.
- UI for file selection, progress display, or review queue rendering (future UI feature, M-TS5).
- PDF/CSV export.
- Identity merge or manual post-hoc entry reassignment (`entry.reassigned` is a separate UI command, not part of the import flow).
- Race rollback or batch rollback (separate commands that operate on committed events).

## Acceptance Criteria

- [x] A valid singles file with all rows auto-linked produces an event batch containing `import_batch.recorded`, the correct `person.registered` / `team.registered` events for new identities, and one `race.registered` per section with all entries carrying resolved `team_id`s.
- [x] A valid couples file produces the same event structure with couple teams.
- [x] A file whose SHA-256 matches an active import batch in the current season is rejected with a duplicate-import error.
- [x] A file whose SHA-256 matches only rolled-back batches is allowed (re-import after rollback).
- [x] A file whose parsed race-no + category collides with an existing effective race is rejected.
- [x] Duplicate incoming rows (same name/yob/club/startnr within a section) are rejected before matching begins.
- [x] Entries routed to `review` by the matching engine are held in a staging area and not included in the event batch until resolved.
- [x] The import blocks (returns a "pending review" status) until all review entries are resolved.
- [x] Review resolution with `link_existing` updates the staging entry's `team_id` and `ResolutionInfo` to `method: "manual"`.
- [x] Review resolution with `create_new_identity` creates new person(s) and team in the staging area and updates the entry accordingly, with `ResolutionInfo` `method: "new_identity"`.
- [x] After all reviews are resolved, the caller can finalize the import, producing the atomic event batch.
- [x] Previously-excluded `(category, team)` pairs have their exclusions cleared via `ranking.eligibility_set { eligible: true }` events in the batch.
- [x] Distance values are converted from `float` km to `integer` meters (rounded to nearest) before entering `RaceEntryInput.distance_m`.
- [x] The import report contains correct counts for auto-links, review items, new identities, conflicts, and replay overrides.
- [x] All orchestration logic is framework-agnostic (pure TS functions, no UI imports, no DOM access).
- [x] The orchestrator does not import or depend on matching internals (scoring functions, blocking indexes) — it calls the matching engine through its public API only.

---

## Technical Plan

### 1. Orchestration Phases

The import workflow proceeds through four distinct phases. The orchestrator manages transitions between them but delegates domain work to the upstream modules.

```
┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌───────────┐
│  PARSE   │ →  │ VALIDATE │ →  │ MATCH+STAGE  │ →  │  COMMIT   │
│ (F-TS02) │    │ (this)   │    │ (F-TS03+this)│    │ (F-TS01)  │
└──────────┘    └──────────┘    └──────────────┘    └───────────┘
                                       ↕
                                 ┌───────────┐
                                 │  REVIEW   │
                                 │  (UI loop)│
                                 └───────────┘
```

**Phase 1 — Parse:** Call F-TS02's `parseWorkbook()`. Returns a `ParsedWorkbook` with metadata and typed sections.

**Phase 2 — Validate:** Check the parsed result against the current `SeasonState`:
- **Duplicate import:** scan `import_batches` for an active batch with matching `source_sha256`. If found, reject. If all matching batches are rolled back, allow (re-import).
- **Category/race-no conflict:** for each parsed section, check if an effective race already exists with the same `(category, race_no)`. If so, reject.
- **Intra-file duplicate rows:** within each section, check for duplicate `(name, yob, club, startnr)` tuples. Reject if found.

**Phase 3 — Match + Stage:** For each section, iterate rows and call the matching engine (F-TS03). Each row returns one of three routing outcomes:
- `auto` → entry is fully resolved; add to the resolved set.
- `review` → entry needs user confirmation; add to the review staging area with the top candidate and alternatives.
- `new_identity` → new person(s) and team created by the matching engine; add to the resolved set.

The matching engine's public API receives the current season state (persons, teams) plus any identities created earlier in the same import session (to avoid creating duplicates within a single file).

**Phase 4 — Commit:** Once all entries are resolved (no pending reviews), construct the event batch and append it atomically to the season log.

### 2. Import Session

An import session is the stateful context that lives from file selection to event commitment. It holds all intermediate data.

```typescript
interface ImportSession {
  session_id: string;                     // uuid
  import_batch_id: string;                // uuid, becomes the batch provenance
  source_file: string;
  source_sha256: string;
  parser_version: string;
  phase: "parsing" | "validating" | "matching" | "reviewing" | "committing" | "done" | "failed";

  parsed: ParsedWorkbook | null;
  season_state_at_start: SeasonState;     // snapshot at session creation

  section_results: SectionMatchResult[];
  review_queue: ReviewEntry[];            // entries awaiting user decision
  resolved_entries: ResolvedEntry[];      // auto + review-resolved entries, grouped by section

  new_persons: PendingPerson[];           // persons created during this session
  new_teams: PendingTeam[];              // teams created during this session

  report: ImportReport;                   // running counts
}
```

The session is an ephemeral in-memory object — it is not persisted in the event log or IndexedDB. If the user navigates away, the session is lost and the file must be re-imported. Only the final committed events are durable.

### 3. Section Match Result

Each parsed section produces a result after the matching phase:

```typescript
interface SectionMatchResult {
  context: ImportRaceContext;
  entries: StagedEntry[];                 // one per parsed row
  all_resolved: boolean;                  // true if no entries are in review
}

interface StagedEntry {
  entry_id: string;                       // uuid, assigned at staging time
  startnr: string;
  team_id: string | null;                 // null while unresolved
  distance_m: number;                     // converted from km
  points: number;
  incoming: IncomingRowData;
  resolution: ResolutionInfo | null;      // null while unresolved
  review_state: ReviewState | null;       // null if auto-resolved
}

type ReviewState = {
  status: "pending" | "resolved";
  top_candidate_team_id: string | null;
  candidate_team_ids: string[];
  candidate_confidences: number[];
  resolved_team_id?: string;
  resolved_method?: "manual" | "new_identity";
};
```

### 4. Review Queue

The review queue is a flat list of entries across all sections that the matching engine routed to `review`. Each entry carries candidate information for the UI to display.

```typescript
interface ReviewEntry {
  section_index: number;
  entry_index: number;                    // index into SectionMatchResult.entries
  entry_id: string;
  startnr: string;
  incoming: IncomingRowData;
  top_candidate: CandidateInfo | null;
  candidates: CandidateInfo[];
  confidence: number;
}

interface CandidateInfo {
  team_id: string;
  display_label: string;                  // pre-formatted for UI
  confidence: number;
  person_ids: string[];
}
```

### 5. Review Resolution

The UI calls the orchestrator's review resolution API with one of two actions:

**Link to existing team:**
```typescript
function resolveReviewEntry(
  session: ImportSession,
  entryId: string,
  action: { type: "link_existing"; team_id: string }
): ImportSession
```

Updates the staged entry: sets `team_id`, sets `resolution` to `{ method: "manual", confidence: ..., candidate_count: ... }`, marks review state as resolved.

**Create new identity:**
```typescript
function resolveReviewEntry(
  session: ImportSession,
  entryId: string,
  action: { type: "create_new_identity" }
): ImportSession
```

Creates new person(s) and a new team in the session's `new_persons` / `new_teams` arrays (based on the incoming row data), assigns the entry to the new team, and marks it resolved with `method: "new_identity"`.

After every resolution, the orchestrator checks if `review_queue` is fully resolved. If so, the session transitions to the `committing` phase.

### 6. Event Batch Construction

When all entries are resolved, the orchestrator constructs the event batch in the order defined by F-TS01:

```
1. import_batch.recorded             — 1 event
2. person.registered                 — 0+ events (new persons from auto+review)
3. team.registered                   — 0+ events (new teams from auto+review)
4. race.registered                   — 1 per section (with all entries fully resolved)
5. ranking.eligibility_set           — 0+ events (clearing prior exclusions)
```

**Distance conversion** happens here: `Math.round(distance_km * 1000)` → `distance_m`.

**Eligibility clearing:** The orchestrator scans the current `SeasonState.exclusions`. For each `(category, team_id)` that is currently excluded, it emits a `ranking.eligibility_set { eligible: true }` event. This replicates the Python behavior of `document = replace(document, ranking_exclusions=())` but as individual, auditable events.

**IncomingRowData construction:** The orchestrator maps parser output to the `IncomingRowData` structure stored on each entry:

- For singles: `display_name` = raw name, `yob` = parsed yob, `yob_text` = null, `club` = raw club, `row_kind` = "solo".
- For couples: `display_name` = "NameA / NameB", `yob` = null, `yob_text` = "yobA / yobB", `club` = raw clubs joined, `row_kind` = "team".
- Source location fields (`sheet_name`, `section_name`, `row_index`) carried through from the parser output.

### 7. Import Blocking

A new import cannot start while the current session has unresolved review entries. The orchestrator exposes a predicate:

```typescript
function canStartImport(session: ImportSession | null): boolean {
  if (session === null) return true;
  if (session.phase === "done" || session.phase === "failed") return true;
  return false;
}
```

The UI layer is responsible for enforcing this by checking `canStartImport()` before initiating a new file import.

### 8. Import Report

```typescript
interface ImportReport {
  auto_links: number;
  review_queue: number;
  new_identities: number;
  conflicts: number;
  replay_overrides: number;
  rows_imported: number;
  sections_imported: number;
  events_emitted: number;
}
```

Counts are accumulated during matching and updated during review resolution. `events_emitted` is set after the commit phase.

### 9. Public API

The orchestrator exposes a small, phased API:

```typescript
// Phase 1+2: Parse and validate
function startImport(
  file: File,
  seasonState: SeasonState,
  options?: { raceNoOverride?: number; sourceType?: "singles" | "couples" }
): Promise<ImportSession>

// Phase 3: Run matching
function runMatching(
  session: ImportSession,
  matchingConfig: MatchingConfig
): ImportSession

// Review loop
function getReviewQueue(session: ImportSession): ReviewEntry[]

function resolveReviewEntry(
  session: ImportSession,
  entryId: string,
  action: ReviewAction
): ImportSession

// Phase 4: Commit
function finalizeImport(
  session: ImportSession
): EventEnvelope[]
```

`startImport` handles parsing and validation (phases 1–2). `runMatching` handles the matching phase (phase 3). Review happens via `resolveReviewEntry` calls from the UI. `finalizeImport` constructs and returns the event batch (phase 4); the caller is responsible for appending it to the event log via the F-TS01 storage API.

This separation gives the UI full control over when to commit. The orchestrator produces the batch but does not perform I/O.

### 10. Module Structure

```
src/
  orchestration/
    import-session.ts      // ImportSession type and lifecycle helpers
    start-import.ts        // startImport(): parse + validate
    run-matching.ts        // runMatching(): iterate sections, call matching engine
    review.ts              // getReviewQueue(), resolveReviewEntry()
    finalize.ts            // finalizeImport(): event batch construction
    validate.ts            // duplicate-import, conflict, duplicate-row checks
    convert.ts             // distance_km → distance_m, IncomingRowData construction
    types.ts               // all orchestration-specific types
    report.ts              // ImportReport accumulation
```

All exports are pure functions (except `startImport` which is async due to file SHA-256 computation). No framework dependencies, no DOM access beyond `crypto.subtle`.

---

## Mapping from Python Implementation

### Python approach

- `service.py` (`import_excel_into_project`): single function that does everything — picks the parser, validates duplicates/conflicts, iterates sections via `mapping.py`, calls `recompute_project_standings`, clears ranking exclusions, and saves the document.
- `mapping.py`: thin delegation layer; `map_singles_section` / `map_couples_section` call the matching workflow.
- `workflow.py` (`process_singles_section` / `process_couples_section`): per-section orchestration; iterates rows, calls matching, builds entries, creates the race event, appends to document.
- `commands.py` (`import_race`): UI entry point; validates inputs, calls `import_excel_into_project`, returns JSON summary.
- `commands.py` (`apply_match_decision`): review resolution; updates entry and match meta in-place on the document, records matching decision.
- `queries.py` (`get_review_queue`): scans active events for entries with `route == "review"`, builds display data.
- Review state is stored *inside* the committed race events (entries with `match_meta.route == "review"`), not in a separate staging area.

### TS port differences

| Aspect | Python | TS Port |
|---|---|---|
| Orchestration scope | Spread across service.py, mapping.py, workflow.py, commands.py | Single `orchestration/` module with phased API |
| Review storage | Review entries stored in committed events (`route == "review"` on `match_meta`) | Review entries staged in ephemeral `ImportSession`; events only committed after full resolution (eager resolution) |
| Event commitment | Mutations applied to `ProjectDocument` incrementally, saved at the end | Event batch constructed at finalization, appended atomically |
| Standings recompute | Triggered inline after import (`recompute_project_standings`) | Not part of import; standings computed on-demand (F-TS04) |
| Ranking exclusion clearing | `document = replace(document, ranking_exclusions=())` — blanket wipe | Individual `ranking.eligibility_set { eligible: true }` events per exclusion |
| Distance representation | `float` km throughout | Parser outputs `float` km; orchestrator converts to `int` meters at event construction |
| Import blocking | Implicit (review queue on committed events blocks UI-side) | Explicit `canStartImport()` predicate on session state |
| Matching decisions log | `matching_decisions` table on document, used for replay | Replay hints derived from event log scanning; no separate decisions table |
| Source type detection | `"paare" in lower_name` | Same heuristic, but also available as override via parser (already in F-TS02) |

### Reusable logic (ported at orchestration level)

- Duplicate SHA-256 check: same logic, different data source (scan `SeasonState.import_batches` instead of `document.events`).
- Category/race-no conflict check: same logic against effective races in `SeasonState.race_events`.
- Intra-file duplicate row detection: same `(name, yob, club, startnr)` tuple check.
- Section iteration pattern: iterate `singles_sections` / `couples_sections`, delegate to matching engine per section.
- IncomingRowData construction for couples (name/yob/club joining): same formatting logic.
- Import report aggregation: same count accumulation across sections.

### Not ported (eliminated or moved)

- `recompute_project_standings` call: eliminated from import; standings are on-demand.
- `matching_decisions` table management: eliminated; replay uses event log scanning.
- In-place document mutation: replaced by event batch construction.
- `apply_match_decision` command pattern: replaced by `resolveReviewEntry` on the ephemeral session.

---

## Risks and Assumptions

- **Assumption:** The import session is ephemeral and fits in memory. A typical import file produces tens to low hundreds of entries across a handful of sections — trivially fits.
- **Assumption:** The UI layer will drive the review loop synchronously (one entry at a time or batch). The orchestrator does not assume a specific review UX.
- **Risk:** The eager resolution approach means a partially-reviewed import is lost if the user closes the tab.
  - Mitigation: This matches the Python version's behavior (import + review must complete in one session). A future enhancement could persist the `ImportSession` to IndexedDB for recovery.
- **Risk:** Distance float-to-int conversion introduces rounding differences for edge-case values.
  - Mitigation: `Math.round(distance_km * 1000)` is the canonical conversion. Document this and test with real fixture values. The Python version uses float km throughout, so the conversion is new — there is no parity concern.
- **Risk:** The matching engine's `SeasonState` snapshot may become stale if another session modifies the log concurrently.
  - Mitigation: Single-user local-first app — only one import session can be active at a time. `canStartImport()` enforces this.
- **Assumption:** The matching engine (F-TS03) exposes a public API that takes `(SeasonState, ParsedSection, MatchingConfig)` and returns per-row resolution results. The exact API shape will be refined when F-TS03 is implemented, but the orchestrator depends only on this boundary contract.

## Implementation Steps

1. Define all orchestration types (`ImportSession`, `StagedEntry`, `ReviewEntry`, `ImportReport`, etc.) in `types.ts`.
2. Implement `validate.ts`: duplicate-import check, category/race-no conflict check, intra-file duplicate-row check.
3. Implement `convert.ts`: `distance_km` → `distance_m` conversion, `IncomingRowData` construction for singles and couples.
4. Implement `start-import.ts`: wire up F-TS02 parser call, run validations, initialize session.
5. Implement `run-matching.ts`: iterate sections, call F-TS03 matching engine, populate staging areas, accumulate report counts.
6. Implement `review.ts`: `getReviewQueue()`, `resolveReviewEntry()` with both action types.
7. Implement `finalize.ts`: event batch construction, eligibility clearing, report finalization.
8. Implement `import-session.ts`: session lifecycle helpers, phase transitions, `canStartImport()`.
9. Write unit tests for validation functions (duplicate import, conflict detection, duplicate rows).
10. Write unit tests for distance conversion and IncomingRowData construction.
11. Write integration tests for the full pipeline: parse → validate → match (with mock matching engine) → review → finalize → verify event batch.
12. Write tests for review resolution (link existing, create new identity).
13. Write tests for edge cases: empty review queue (all auto), full review queue (all review), mixed.

## Test Plan

- **Unit (validate.ts):**
  - Active batch with matching SHA-256 → rejection.
  - Rolled-back-only batches with matching SHA-256 → allowed.
  - Category/race-no collision with effective race → rejection.
  - No collision → allowed.
  - Duplicate rows within section → rejection.
  - Unique rows → no error.

- **Unit (convert.ts):**
  - `distanceKmToMeters(12.5)` → `12500`.
  - `distanceKmToMeters(5.123)` → `5123`.
  - `distanceKmToMeters(0)` → `0`.
  - IncomingRowData construction for singles: correct field mapping.
  - IncomingRowData construction for couples: correct name/yob/club joining.

- **Unit (review.ts):**
  - Resolve with `link_existing` → staged entry updated with target team_id and manual method.
  - Resolve with `create_new_identity` → new person(s) + team added to session, entry updated.
  - Resolve last pending entry → session ready for finalization.

- **Integration (full pipeline):**
  - All-auto import: parse mock file → match (all auto) → finalize → verify batch has correct event sequence and all entries resolved.
  - Mixed import: parse → match (some auto, some review) → resolve reviews → finalize → verify batch.
  - All-new-identity import: first-ever import with no existing state → all entries create new teams → verify person.registered + team.registered + race.registered events.

- **Integration (event batch structure):**
  - Verify event ordering: import_batch.recorded → person.registered → team.registered → race.registered → ranking.eligibility_set.
  - Verify all events in the batch carry the correct `metadata.import_batch_id`.
  - Verify `race.registered` entries reference teams from `team.registered` events earlier in the same batch.

- **Edge cases:**
  - Import with zero rows after parsing (all rows skipped) → `no_rows` error from parser.
  - Import into empty season (no prior state) → no conflict checks fire, all new identities.
  - Re-import after full rollback of prior batch → allowed, produces fresh batch.

## Definition of Done

- [x] Code implemented in TypeScript
- [x] Tests added/updated and passing (Vitest)
- [x] Types are strict (no `any` escapes without justification)
- [x] Docs updated
- [x] Entry added to `packages/stundenlauf-ts/docs/ACCOMPLISHMENTS.md`
- [x] Requirement/milestone status updated in `packages/stundenlauf-ts/PROJECT_PLAN.md`

## Links

- Python source reference(s):
  - `backend/ingestion/service.py` — top-level import orchestration (`import_excel_into_project`)
  - `backend/ingestion/mapping.py` — section-to-matching delegation (`map_singles_section`, `map_couples_section`)
  - `backend/matching/workflow.py` — per-section matching workflow (`process_singles_section`, `process_couples_section`)
  - `backend/matching/config.py` — `MatchingConfig` (thresholds and weights)
  - `backend/matching/report.py` — `MatchingReport`, `aggregate_matching_reports`
  - `backend/ingestion/types.py` — intermediate types (`ParsedWorkbook`, `ImportResult`, etc.)
  - `backend/ui_api/commands.py` — `import_race` (UI entry point), `apply_match_decision` (review resolution)
  - `backend/ui_api/queries.py` — `get_review_queue` (review queue inspection)
  - `backend/ranking/engine.py` — `recompute_project_standings` (eliminated from import in TS port)
