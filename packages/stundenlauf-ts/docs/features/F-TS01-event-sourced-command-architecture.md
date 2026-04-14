# F-TS01: Event-Sourced Architecture

## Overview

- Feature ID: F-TS01
- Feature name: Event-sourced architecture for race/team/season data
- Owner: —
- Status: Done
- Related requirement(s): R1, R2, R3, R5, R7
- Related milestone(s): M-TS1
- Python predecessor(s): F01 (domain model & storage), parts of F02 (ingestion/matching integration), F04 (standings), F09 (identity correction workflow), and the **result-correction use cases** previously handled in parts of F16 (identity merge)

## Problem Statement

The Python version stores the full materialized state (`ProjectDocument`) as a single JSON snapshot. Every mutation loads the whole document, mutates in memory, and writes it back. This approach:

1. Makes it impossible to inspect *what happened* without a separate audit log (`matching_decisions`).
2. Couples storage format tightly to the domain model – any schema change requires a migration.
3. Treats singles (`Person` + `participant_uid`) and couples (`Couple` + `team_uid`) as structurally different, causing branching logic everywhere.

The TS port replaces this with an **event-sourced** architecture where:

- The **event log** (append-only, sequenced) is the single source of truth.
- The **current state** is a deterministic projection (fold) over all events.
- **Persons** are first-class identities. **Teams** reference persons and are the universal participant entity (size 1 = solo, size 2 = couple), eliminating the Person-vs-Couple split.
- Identity corrections, rollbacks, and all other mutations are just events in the same log – no separate audit table.
- **Matching is external to the data model.** The matching engine (fuzzy scoring, candidate ranking, auto-link thresholds, strict mode, replay of past decisions) is a workflow that runs *before* events are emitted. Its output is simply "assign entry X to existing team T" or "create new team T and assign entry X to it." Both outcomes are expressed using the same `race.registered` and `team.registered` events.

## Scope

### In Scope

- Define the minimal set of **event types** that can appear in the log.
- Define the **domain value types** (Person, Team, RaceEvent, Entry, Category, etc.) that the projection produces.
- Define the **projection function** that folds events into current state.
- Define the **storage format** for the event log (JSON, IndexedDB schema).
- Define **snapshot** strategy for fast startup (optional cache, never authoritative).
- Define validation rules per event type.
- Establish the boundary: matching logic is **outside** this data model.
- Define the separation between **workspace-level operations** (season lifecycle) and **season-domain events** (the event log).

### Out of Scope

- UI framework choice (future feature, M-TS5).
- Excel parsing (separate feature).
- Matching engine internals (fuzzy scoring, candidate ranking, thresholds, replay heuristics). Matching is a separate workflow module that *produces* events; it is not part of the event model itself.
- PDF/CSV export.
- Deployment and PWA.

## Acceptance Criteria

- [ ] All **v1-supported season-domain** mutations are expressible as events in the season log, and workspace lifecycle operations are expressible in the workspace layer.
- [ ] A fresh projection from an empty log through any valid event sequence produces the same **user-visible race result state and standings inputs** as the Python version for supported workflows.
- [ ] **True identity merge/pruning is not required in v1**; operator correction of wrongly assigned imported results is supported via `entry.reassigned`, and orphaned person/team identities may remain in the registry.
- [ ] The event log uses a `schema_version`; replay on an unrecognized event type or schema version fails loudly rather than silently skipping.
- [ ] Solo participants and couples are both represented as Teams with validated member counts.
- [ ] Persons are first-class identities: correcting a person updates all teams that reference them.
- [ ] Standings are a pure derived view (re-computable from events), never stored as source of truth.
- [ ] The event log is serializable to/from JSON for file export/import.
- [ ] Season lifecycle operations (create, delete, reset, import) are workspace-level, not events within a season's own log.

---

## Technical Plan

### 1. Person and Team Model

Replace the Python `Person` / `Couple` split with two first-class concepts: **PersonIdentity** (individual human) and **Team** (participation unit referencing persons).

```
PersonIdentity {
  person_id: string           // uuid
  given_name: string          // parsed canonical
  family_name: string         // parsed canonical
  display_name: string        // canonical display form (non-normalized)
  name_normalized: string     // normalized name key used for matching consistency
  yob: number
  gender: "M" | "F" | "X"
  club: string | null         // current club affiliation (can change)
  club_normalized: string     // normalized for matching consistency
}

Team {
  team_id: string             // uuid
  member_person_ids: string[] // references to PersonIdentity; length 1 = solo, length 2 = couple
  team_kind: "solo" | "couple"
}
```

When `club` is non-null, `club_normalized` must contain the normalization of `club` under the current normalization rules. When `club` is null, `club_normalized` must be the empty string.
`display_name`, `given_name`/`family_name`, and `name_normalized` form a dual-write consistency group: all three representations must normalize to the same name key after each `person.registered`/`person.corrected` replay step.

In v1, `Team` is intentionally named broadly to support future 1..n-person scoring units. However, the current implementation validates `member_person_ids.length` to **1 or 2 only**, and `team_kind` is currently limited to **`"solo" | "couple"`**. Larger teams are a future extension and are not part of this feature.

- Division rules validate **participation shape only**: `men`/`women` divisions require solo teams; `couples_*` divisions require couple teams.
- In v1, category validation is based on **solo-vs-couple structure**, not on recomputing or enforcing gender composition from `PersonIdentity.gender`.
- Entries always reference `team_id`. There is no `participant_uid` vs `team_uid` branching.
- Member order within a couple team is canonical (stored in order, but matching is order-insensitive).
- Correcting a person's canonical data (`person.corrected`) updates one place; the change is visible through all teams that reference that person.
- Cross-category or cross-season person linking is **not** in scope for now but is structurally possible because persons are independent of teams.

In v1, **person/team identity merge is intentionally not modeled as a first-class domain event**. The supported correction workflow is narrower: if an imported result was assigned to the wrong team, that mistake is corrected using `entry.reassigned`. As a consequence, duplicate or wrongly-created persons/teams may remain as orphan historical identities in the registry after corrections. This is acceptable in v1.

`gender` is stored as part of canonical person identity for provenance, display, and matching context, but in v1 it is **not used as a post-hoc structural validation input** for team legality. The system does not support gender reassignment/correction workflows in v1.

### 2. Event Types

Every state change is represented as exactly one event. Events are **committed, immutable facts** appended to the log. Each event has:

```
EventEnvelope {
  event_id: string            // uuid, globally unique
  seq: number                 // monotonic append-order sequence number (authoritative replay order)
  recorded_at: string         // ISO 8601 (informational, not used for ordering)
  type: string                // discriminator
  schema_version: number      // version of this event type's payload schema
  payload: { ... }            // type-specific
  metadata: {
    app_version: string       // version of the app that produced this event
    import_batch_id?: string  // required on all events emitted as part of an import batch
  }
}
```

**Replay order** is determined exclusively by `seq`, never by `recorded_at`. Timestamps are human-readable provenance metadata.

**Import-batch provenance:** For any event emitted by the import workflow as part of a specific import batch, `metadata.import_batch_id` is mandatory and must reference the corresponding `import_batch.recorded` event. This includes `race.registered` and any `ranking.eligibility_set` events emitted to clear prior exclusions. Without this, projection cannot reliably determine which events to suppress when a batch is rolled back.

**Unknown event types or schema versions** cause replay to **fail** with an explicit error. There is no silent skipping. Forward compatibility (old logs on new code) works naturally because new code understands all old event types. Backward compatibility (new event types on old code) is handled by requiring the user to update the app.

#### Design Principle: Matching Is Not an Event

The Python version has a `matching_decisions` table with 7 kinds of decision (auto, manual_link, manual_reject, replay, identity_correction, identity_merge, ...). This complexity exists because the Python model mixes *what happened to the data* with *how the matching engine arrived at that decision*.

In the TS port, matching is **purely external to the event log**. The matching engine is a workflow that:
1. Reads the current projected state (existing persons and teams) and the raw incoming Excel rows.
2. Decides, for each row: "this is existing team T" or "this needs a new team."
3. Emits plain `race.registered` and `team.registered` / `person.registered` events as output.

The *how* (fuzzy scores, candidate lists, auto-link thresholds, strict mode, replay of fingerprint decisions) is the matching engine's internal concern. It may store its own working state (candidate rankings, rejection preferences, replay hints) outside the event log — in a UI preferences store or ephemerally in memory. None of that is season data.

**What about the review queue?** In the Python version, some entries land in a "review" state after import — provisionally linked to a best-guess candidate, awaiting user confirmation. Two clean approaches:

- **Eager resolution (preferred):** The import workflow does not emit `race.registered` until every entry is fully resolved. Parsing + matching + user review is a staging process. Only once the user has confirmed all assignments does the atomic `race.registered` event go into the log with every entry carrying a definitive `team_id`. This means the event log never contains half-resolved state.
- **Deferred resolution (fallback):** Emit `race.registered` with `team_id: null` on unresolved entries, then use a single `entry.reassigned` event when the user resolves them. Still just one extra event type, not seven.

We will proceed with **eager resolution** as the default approach. The review queue lives in the UI/workflow layer, not the event log. Pairing this with `entry.reassigned` (see below) means a bad match can be corrected after the fact without full rollback.

Below is the complete event catalog.

---

#### Import Batch Events

| Event Type | Purpose | Python Equivalent |
|---|---|---|
| `import_batch.recorded` | Record provenance for a file import operation | Implicit in `import_excel_into_project` |
| `import_batch.rolled_back` | Mark all race results from an import batch as ineffective | `rollback_source_batch` |

**`import_batch.recorded`** — emitted once per file import, before the person/team/race events it produces.

```
{
  import_batch_id: string     // uuid, referenced by subsequent events in the batch
  source_file: string         // original filename
  source_sha256: string       // content hash for deduplication
  parser_version: string      // version of the parser used
}
```

**`import_batch.rolled_back`**
```
{
  import_batch_id: string
  reason: string
}
```

`import_batch.rolled_back` is a **result-level rollback**, not a destructive entity rollback. During projection, all `race.registered` events associated with the rolled-back batch are treated as ineffective, and any `ranking.eligibility_set` events emitted by that batch are likewise ignored. `person.registered` and `team.registered` events from the batch remain part of the projected identity registries. This may leave orphaned persons or teams, which is acceptable.

---

#### Person & Team Identity Events

| Event Type | Purpose | Python Equivalent |
|---|---|---|
| `person.registered` | Register a new person identity | Implicit in new-identity path during import |
| `person.corrected` | Correct canonical fields on a person | `update_participant_identity` |
| `team.registered` | Create a new team referencing persons | Implicit in `process_singles_section` / `process_couples_section` |

**`person.registered`**
```
{
  person_id: string
  given_name: string
  family_name: string
  display_name?: string
  name_normalized?: string
  yob: number
  gender: "M" | "F" | "X"
  club: string | null
  club_normalized: string
}
```

**`person.corrected`**
```
{
  person_id: string
  updated_fields: {
    given_name?: string
    family_name?: string
    display_name?: string
    name_normalized?: string
    yob?: number
    club?: string | null
    club_normalized?: string
  }
  rationale: string
}
```

**`team.registered`**
```
{
  team_id: string
  member_person_ids: string[]   // 1 or 2 person_ids (must already be registered)
  team_kind: "solo" | "couple"
}
```

Operator matching mistakes (results imported under a wrongly-created team that should belong to an existing team) are corrected using `entry.reassigned`. Teams themselves are not merged in v1. Teams that lose all assigned results may remain as orphan identities — this is acceptable and handled in the UI layer (see Section 6).

---

#### Race Event Events

| Event Type | Purpose | Python Equivalent |
|---|---|---|
| `race.registered` | Register a fully-resolved race event with its entries | `import_excel_into_project` (after matching resolves all entries) |
| `race.rolled_back` | Soft-delete a race event | `rollback_race` |
| `race.metadata_corrected` | Fix race date, race number, or category | — (new) |

**`race.registered`** — the central import event. Entries arrive **fully resolved**: every entry carries its `team_id`. The matching engine has already done its work before this event is emitted. Each entry preserves the **raw incoming data** from the source file for auditability.

```
{
  race_event_id: string
  import_batch_id: string     // links to the import_batch.recorded event
  category: RaceCategory
  race_no: number
  race_date: string           // ISO 8601 date
  entries: RaceEntryInput[]
}

RaceEntryInput {
  entry_id: string
  startnr: string
  team_id: string             // always resolved — the whole point
  distance_m: number          // integer meters (avoids floating-point issues)
  points: number              // organizer-assigned fact, not derived
  incoming: IncomingRowData   // raw source data, preserved for audit
  resolution: ResolutionInfo  // how the matching engine arrived at this team_id
}

IncomingRowData {
  display_name: string        // as typed in Excel: "Müller, Max" or "A / B"
  yob: number | null          // solo; null for couples
  yob_text: string | null     // couples: "1985 / 1990"; null for solo
  club: string | null         // raw club string
  row_kind: "solo" | "team"   // shape of the imported row, not the canonical TeamKind
  sheet_name: string          // source worksheet name
  section_name: string        // parsed section header (e.g. "Herren 60min")
  row_index: number           // 0-based row index in the sheet
}

ResolutionInfo {
  method: "auto" | "manual" | "new_identity"
  confidence: number | null   // matching score, null for new_identity / manual without score
  candidate_count: number     // how many candidates were considered
}
```

Each entry carries two diagnostic fields alongside the resolved `team_id`:

- **`incoming`** — what the Excel row said (raw evidence). Enables "why is this result here?" audits and future re-matching without the original file. Includes source location (`sheet_name`, `section_name`, `row_index`) for tracing import bugs.
- **`resolution`** — how the matching engine resolved it (diagnostic trace). Three methods:
  - `auto`: the engine auto-linked at the given confidence level.
  - `manual`: the user picked this team from a candidate list.
  - `new_identity`: no suitable match existed; a new team was created.
  
  `confidence` captures the score at the time of resolution (null when not applicable). `candidate_count` records how many alternatives were considered, useful for spotting thin-candidate situations that might warrant review.

This is deliberately minimal — enough to debug "why was this matched wrong?" without replicating the full candidate ranking. The matching engine's internal state (full candidate list, per-feature scores, rejection history) remains ephemeral.

**`race.rolled_back`**
```
{
  race_event_id: string
  reason: string
}
```

**`race.metadata_corrected`**
```
{
  race_event_id: string
  updated_fields: {
    race_date?: string
    race_no?: number
    category?: RaceCategory
  }
  rationale: string
}
```

---

#### Entry Correction Events

| Event Type | Purpose | Python Equivalent |
|---|---|---|
| `entry.reassigned` | Move an entry to a different team | — (new; previously required full rollback) |
| `entry.corrected` | Fix distance, points, or startnr on a single entry | — (new; previously required full rollback) |

**`entry.reassigned`** — fixes a bad match after the fact without rolling back the entire race.

```
{
  entry_id: string
  race_event_id: string
  from_team_id: string
  to_team_id: string
  rationale: string
}
```

**`entry.corrected`**
```
{
  entry_id: string
  race_event_id: string
  updated_fields: {
    distance_m?: number
    points?: number
    startnr?: string
  }
  rationale: string
}
```

---

#### Ranking / Eligibility Events

| Event Type | Purpose | Python Equivalent |
|---|---|---|
| `ranking.eligibility_set` | Mark a team as außer Wertung (ineligible) or re-eligible in a category | `set_ranking_eligibility` |

**`ranking.eligibility_set`**
```
{
  category: RaceCategory
  team_id: string
  eligible: boolean           // false = außer Wertung
}
```

**Clearing exclusions after import:** In the Python app, all exclusions are cleared on successful import. Rather than a separate "clear all" event (which is a destructive global action), this is modeled as: for each previously-excluded `(category, team)`, the import batch emits an explicit `ranking.eligibility_set { eligible: true }` event. This makes each state change visible in the log and avoids a blanket reset.

---

### 3. Season Identity and Workspace Operations

A **season** represents a race series — typically spanning one calendar year, but the model does not enforce this. Seasons are identified by a `season_id` (uuid) and carry a human-readable label (which may include a year, e.g. "Stundenlauf 2025", but is not structurally tied to one).

Season lifecycle operations are **workspace-level**, not events in a season's own event log. The workspace maintains a registry of seasons:

```
SeasonDescriptor {
  season_id: string           // uuid
  label: string               // human-readable, e.g. "Stundenlauf 2025"
  created_at: string          // ISO 8601
}
```

Workspace operations (not stored in the season event stream):

| Operation | Purpose | Python Equivalent |
|---|---|---|
| Create season | Initialize a new season with an empty event log | `create_series_year` |
| Delete season | Remove a season and its event log | `delete_series_year` |
| Reset season | Clear all events for a season, keeping the season slot | `reset_series_year` |
| Import season | Restore a season from an exported archive | `import_series_year` |

These are imperative operations handled by the workspace/repository layer. They create, replace, or destroy event streams but are not themselves events within a stream. Import reads an archive, validates it, and creates or replaces the target season's event log.

### 4. What the Matching Engine Does (Outside the Event Log)

The matching engine is a **workflow module**, not part of the event-sourced core. It:

1. Takes raw parsed Excel rows and the current `SeasonState` as input.
2. For each row, decides: link to existing team T, or create new team.
3. Outputs a batch of events: `import_batch.recorded`, `person.registered` (for new persons), `team.registered` (for new teams), `race.registered` (with all entries carrying their resolved `team_id`), and `ranking.eligibility_set` events to clear prior exclusions.

The matching engine may maintain its own working state for features like:
- **Replay hints:** "fingerprint F was previously linked to team T" — derived by scanning the event log for past `race.registered` entries, not stored as separate events.
- **Rejection preferences:** "don't auto-link fingerprint F to team T" — UI preference, not season data.
- **Candidate scoring / confidence:** computed on the fly, surfaced in the review UI, never persisted in the log.

This keeps the event log minimal and focused on *what happened to the season data*, while the matching engine's heuristics can evolve independently.

### 5. Import Workflow → Event Batch

In the Python version, a single `import_excel_into_project` call does parsing, matching, event creation, decision logging, standings recompute, and exclusion clearing in one transaction.

In the TS port, **importing a file** is a multi-step workflow:

1. **Parse:** Read Excel/CSV → raw row data.
2. **Match:** For each row, the matching engine resolves to an existing or new team. If some rows need review, the UI presents a review queue. This all happens *before* any events are emitted.
3. **Emit:** Once every entry is resolved, emit events atomically:

```
[
  import_batch.recorded { ... }           // 1, batch provenance
  person.registered { ... }              // 0+, for newly identified persons
  team.registered { ... }               // 0+, for newly created teams
  race.registered { ... entries }        // 1 per parsed section, all entries resolved
  ranking.eligibility_set { eligible: true, ... }  // 0+, clearing prior exclusions
]
```

The batch is appended to the event log in a single IndexedDB transaction. Validation runs against projected state plus earlier events in the same batch (e.g. a `race.registered` event can reference a `team_id` from a `team.registered` event earlier in the same batch).

**Idempotency:** The `import_batch_id` prevents accidental duplicate application. If a batch with the same ID is already in the log, the write is rejected.

### 6. Derived / Projected State

The projection (fold) over the event log produces:

```
SeasonState {
  season_id: string

  // Person registry (built from person.registered, person.corrected)
  persons: Map<person_id, PersonIdentity>

  // Team registry (built from team.registered)
  // Teams that lose all entries via entry.reassigned remain as orphan identities.
  teams: Map<team_id, Team>

  // Import batches (built from import_batch.recorded, import_batch.rolled_back)
  import_batches: Map<import_batch_id, ImportBatch>

  // Race events (built from race.registered, race.rolled_back, race.metadata_corrected)
  race_events: Map<race_event_id, RaceEvent>
  // Each RaceEvent has state: "active" | "rolled_back"

  // Entry overrides (built from entry.reassigned, entry.corrected)
  // Applied on top of the entries in race_events during projection

  // Ranking exclusions (built from ranking.eligibility_set)
  exclusions: Map<category_key, Set<team_id>>
}
```

A race's stored lifecycle state and its replay effectiveness are distinct:

- `race.state = "active" | "rolled_back"` captures race-level lifecycle.
- **Effective** is a derived projection concept meaning: the race is not race-rolled-back **and** its import batch is not rolled back.

Validation and standings computation must operate on **effective** races and effective entries, not merely on races whose local state is `"active"`.

No matching state, no review queue, no fingerprint index in the projected state. Those are concerns of the matching workflow layer.

**Standings** are NOT part of the projected state. They are computed on-demand from `SeasonState` using the ranking engine (same rules, ported as `stundenlauf_v1` ruleset; see F-TS04). This eliminates the need to store `StandingsSnapshot` and keeps the event log lean.

**Participation** is implicit: if a team has no entry in a given `race_event_id`, they didn't participate in that race. No explicit "did not participate" records are needed.

**Orphaned teams and persons** are expected. When an operator corrects a matching mistake by reassigning all of a wrongly-created team's entries to the correct team, the original team (and its referenced persons) may remain in the registry with no effective participation. This is intentional: the event log stays truthful, no destructive cleanup is needed, and projections stay simple. In the UI, orphaned teams or persons with no effective participation can be hidden by default and surfaced only in identity administration views.

### 7. Storage Format

The event log for each season is stored as:

```json
{
  "format": "stundenlauf-ts-eventlog",
  "format_version": 1,
  "season_id": "550e8400-e29b-41d4-a716-446655440000",
  "label": "Stundenlauf 2025",
  "events": [
    { "event_id": "...", "seq": 0, "recorded_at": "...", "type": "person.registered", "schema_version": 1, "payload": { ... }, "metadata": { ... } },
    { "event_id": "...", "seq": 1, "recorded_at": "...", "type": "team.registered", "schema_version": 1, "payload": { ... }, "metadata": { ... } },
    ...
  ]
}
```

In the browser, this is stored in **IndexedDB** (one object store per season, or one store with season key). For export/import, the entire log is serialized as the JSON above.

The storage adapter must expose methods for bulk event log access, consumed by F-TS07 (season data portability):

```typescript
// Read the full event log for a season, in seq order.
function getEventLog(seasonId: string): Promise<EventEnvelope[]>

// Write a complete event log for a season (used by import).
// Atomic: either all events are written and the season registered, or nothing changes.
function writeEventLog(seasonId: string, label: string, events: EventEnvelope[]): Promise<void>
```

`getEventLog` returns the raw persisted events without replaying them — the caller decides whether to project. `writeEventLog` is a bulk-write used exclusively by the import path; normal operation appends events individually or in batches via the standard commit path.

Snapshots (optional, for fast startup):
```json
{
  "format": "stundenlauf-ts-snapshot",
  "format_version": 1,
  "season_id": "550e8400-e29b-41d4-a716-446655440000",
  "snapshot_after_seq": 42,
  "state": { ... }
}
```

### 8. Projection Implementation

```typescript
function projectState(seasonId: string, events: EventEnvelope[]): SeasonState {
  let state = emptySeasonState(seasonId);
  for (const rawEvent of events) {
    const event = upcastEvent(rawEvent);
    state = applyEvent(state, event);
  }
  return state;
}

function applyEvent(state: SeasonState, event: EventEnvelope): SeasonState {
  switch (event.type) {
    case "import_batch.recorded":      return applyImportBatchRecorded(state, event.payload);
    case "import_batch.rolled_back":   return applyImportBatchRolledBack(state, event.payload);
    case "person.registered":          return applyPersonRegistered(state, event.payload);
    case "person.corrected":           return applyPersonCorrected(state, event.payload);
    case "team.registered":            return applyTeamRegistered(state, event.payload);
    case "race.registered":            return applyRaceRegistered(state, event.payload);
    case "race.rolled_back":           return applyRaceRolledBack(state, event.payload);
    case "race.metadata_corrected":    return applyRaceMetadataCorrected(state, event.payload);
    case "entry.reassigned":           return applyEntryReassigned(state, event.payload);
    case "entry.corrected":            return applyEntryCorrected(state, event.payload);
    case "ranking.eligibility_set":    return applyEligibilitySet(state, event.payload);
    default:
      throw new UnknownEventTypeError(event.type, event.schema_version);
  }
}
```

The projection is **pure** (no side effects, no I/O). This makes it trivially testable and deterministic.

**Correction precedence:** The effective state of an entry is determined by replaying **all events affecting that entry in global `seq` order**. Start from the base entry as recorded in `race.registered`. When an `entry.corrected` event is encountered, it updates the current effective entry fields (`distance_m`, `points`, `startnr`). When an `entry.reassigned` event is encountered, it updates the current effective `team_id`. The fully replayed effective entry state is the source of truth.

### 9. Validation

Each event is validated before being appended to the log. Validation runs against the projected state produced by all prior events (including earlier events in the same batch):

- `person.registered`: no duplicate `person_id`.
- `team.registered`: no duplicate `team_id`; all `member_person_ids` must reference registered persons; member count matches `team_kind`.
- `race.registered`: no duplicate `race_event_id`; no effective race with same category + race_no; every entry's `team_id` must reference a registered team; every `entry_id` introduced by the event must be globally unique within the season event log.
- `entry.reassigned`: entry exists in an effective race; `from_team_id` matches current effective assignment; `to_team_id` references a registered team; `to_team_id` must match the race category's required **team shape** (solo for singles divisions, couple for couples divisions); the race must not already contain an effective entry for `to_team_id` (no duplicate team participation in a single race).
- `entry.corrected`: entry exists in an effective race.
- `race.metadata_corrected`: race event exists and is effective; the resulting `(category, race_no)` must not collide with another effective race; all effective entries in the race must remain compatible with the resulting category's required **team shape**; if the category change would invalidate existing category-scoped eligibility state, the correction must be rejected.
- `ranking.eligibility_set`: team must have entries in the given category.
- `import_batch.recorded`: no duplicate `import_batch_id`.
- `import_batch.rolled_back`: batch exists and has not already been rolled back.

**Cross-field consistency:** When `metadata.import_batch_id` is present on an event whose payload also carries `import_batch_id`, the two values must be identical.

**Import-batch provenance completeness:** Any event emitted as part of an import batch must carry `metadata.import_batch_id`.

---

## Mapping from Python Implementation

### Python approach

- `ProjectDocument` is the root aggregate. It holds `people`, `couples`, `events`, `matching_decisions`, `standings`, `ranking_exclusions`.
- Every mutation loads the full document, applies changes in-memory, recomputes standings, and writes the whole thing back as JSON.
- Singles use `participant_uid` on entries; couples use `team_uid`. Logic branches on division to decide which field to use.
- `matching_decisions` is an append-only audit log stored alongside the document, but it's treated as metadata – the source of truth for identity links is the `participant_uid`/`team_uid` on entries.

### TS port differences

- The event log IS the source of truth. There is no separate "current state" file.
- `PersonIdentity` is a first-class entity with its own registry. `Team` references persons by `person_id` instead of embedding them.
- `Team` replaces both `Person` (solo) and `Couple` (pair). Entries always reference `team_id`.
- **Matching is external to the data model.** The 7-kind `matching_decisions` table disappears entirely. The matching engine produces plain `person.registered`, `team.registered` and `race.registered` events. Audit provenance (scores, candidates) rides in `ResolutionInfo` on entries, but is not domain state.
- Standings are never stored; they are computed on demand from projected state.
- Ranking exclusions are events, not a field on the document.
- Rollbacks are events that mark races as rolled back; the original `race.registered` event stays in the log forever.
- The review queue is a UI workflow concern, not stored in the event log. Entries are never half-resolved in the log.
- Season lifecycle is a workspace concern, not part of the season event stream.
- Seasons are identified by uuid + label, not tied to a single calendar year.
- Entry-level corrections (`entry.reassigned`, `entry.corrected`) allow targeted fixes without full rollback.

### Reusable logic

- Ranking rules (top-4 selection, scoring, sorting; see F-TS04 `stundenlauf_v1`) port directly.
- Identity fingerprint and scoring functions port directly.
- Name parsing and normalization port directly.
- Division/team-shape validation rules port directly (v1 validates solo-vs-couple structure, not gender composition).

---

## Datasets (Value Types Reference)

For completeness, here are the core value types carried inside events and produced by projection:

### Enums

```typescript
type Gender = "M" | "F" | "X";
type RaceDuration = "half_hour" | "hour";
type Division = "men" | "women" | "couples_men" | "couples_women" | "couples_mixed";
type RaceEventState = "active" | "rolled_back";
type TeamKind = "solo" | "couple";
```

### PersonIdentity (first-class entity)

```typescript
interface PersonIdentity {
  person_id: string;
  given_name: string;
  family_name: string;
  display_name: string;
  name_normalized: string;
  yob: number;
  gender: Gender;
  club: string | null;
  club_normalized: string;
}
```

### Team (universal participant entity, references persons)

```typescript
interface Team {
  team_id: string;
  member_person_ids: string[];  // 1 = solo, 2 = couple
  team_kind: TeamKind;
}
```

### RaceCategory

```typescript
interface RaceCategory {
  duration: RaceDuration;
  division: Division;
}
```

### ImportBatch (projected state)

```typescript
interface ImportBatch {
  import_batch_id: string;
  source_file: string;
  source_sha256: string;
  parser_version: string;
  state: "active" | "rolled_back";
  rollback?: {
    event_id: string;
    rolled_back_at: string;
    reason: string;
  };
}
```

### RaceEvent (projected state)

```typescript
interface RaceEvent {
  race_event_id: string;
  import_batch_id: string;
  category: RaceCategory;
  race_no: number;
  race_date: string;
  state: RaceEventState;
  imported_at: string;
  entries: RaceEntry[];
  rollback?: {
    event_id: string;
    rolled_back_at: string;
    reason: string;
  };
}
```

### RaceEntry (projected state)

```typescript
interface RaceEntry {
  entry_id: string;
  startnr: string;
  team_id: string;
  distance_m: number;          // integer meters
  points: number;              // organizer-assigned source fact
  incoming: IncomingRowData;
  resolution: ResolutionInfo;
}

interface IncomingRowData {
  display_name: string;
  yob: number | null;
  yob_text: string | null;
  club: string | null;
  row_kind: "solo" | "team";  // shape of the imported row, not the canonical TeamKind
  sheet_name: string;
  section_name: string;
  row_index: number;
}

interface ResolutionInfo {
  method: "auto" | "manual" | "new_identity";
  confidence: number | null;
  candidate_count: number;
}
```

Three levels of information on every entry:
- `team_id` + `distance_m` + `points` — the fact (who ran, what they achieved).
- `incoming` — the evidence (what the source file said, including source location).
- `resolution` — the diagnostic (how the assignment was made).

---

## Risks and Assumptions

- **Assumption:** Replay performance is acceptable for typical season sizes (≤10 races × ≤200 entries each = ≤2000 entries). With the simplified model (person/team registrations + race events), a full season is ~200–800 events — trivially fast to replay.
- **Assumption:** Browser IndexedDB can hold the full event log for multiple seasons without hitting storage limits.
- **Risk:** Event schema evolution – if an event payload shape changes, old logs must still replay correctly.
  - Mitigation: `schema_version` on each event envelope; upcasters transform old payload shapes to current; replay fails on unrecognized versions rather than silently degrading.
- **Risk:** Atomic batch writes in IndexedDB may fail partially.
  - Mitigation: Use IndexedDB transactions to ensure batch atomicity.
- **Risk:** Season not tied to a year could confuse users accustomed to the Python version's year-based model.
  - Mitigation: Default label includes the year; UI surfaces the label prominently. The change is structural, not UX-breaking.

## Implementation Steps

1. Define TypeScript types for all event payloads, enums, and value objects.
2. Implement `EventEnvelope` serialization/deserialization with `schema_version` validation.
3. Implement `projectState` / `applyEvent` for each event type.
4. Implement validation functions per event type (including intra-batch validation).
5. Implement `SeasonState` type and empty initializer.
6. Implement workspace-level season registry (create, delete, reset, import).
7. Implement IndexedDB storage adapter for event logs.
8. Implement JSON import/export of event logs.
9. Write comprehensive tests: replay scenarios, validation, round-trip serialization, unknown-event-type rejection.
10. Implement snapshot creation and restore (optimization, lower priority).

## Test Plan

- **Unit:** Each `applyEvent` handler tested in isolation with minimal state.
- **Integration:** Multi-event replay sequences that mirror real import workflows (register persons, register teams, register race, then query projected state).
- **Fixture-based:** Port key Python test scenarios to verify behavioral parity (same inputs → same projected state as Python `ProjectDocument`).
- **Round-trip:** Serialize event log to JSON, deserialize, replay, verify identical projected state.
- **Validation:** Verify that invalid events are rejected (duplicate IDs, missing references, constraint violations).
- **Error cases:** Verify that unknown event types and unsupported schema versions cause explicit replay failures.
- **Batch semantics:** Verify that events within a batch can reference entities created earlier in the same batch.
- **Correction events:** Verify that `entry.reassigned`, `entry.corrected`, `person.corrected`, and `race.metadata_corrected` produce the expected projected state.

## Definition of Done

- [ ] Code implemented in TypeScript
- [ ] Tests added/updated and passing (Vitest)
- [ ] Types are strict (no `any` escapes without justification)
- [ ] Docs updated
- [ ] Entry added to `packages/stundenlauf-ts/docs/ACCOMPLISHMENTS.md`
- [ ] Requirement/milestone status updated in `packages/stundenlauf-ts/PROJECT_PLAN.md`

## Links

- Python source reference(s):
  - `backend/domain/models.py` – current data model (Person, Couple, RaceEvent, RaceEntry, ProjectDocument)
  - `backend/domain/enums.py` – enums (Gender, Division, RaceDuration, RaceEventState)
  - `backend/ui_api/commands.py` – all mutation handlers (import_race, rollback, identity correction, merge, eligibility)
  - `backend/ingestion/service.py` – import orchestration (what becomes the import workflow above)
  - `backend/domain/identity_merge.py` – merge logic (rewiring entries, pruning orphans)
  - `backend/ranking/engine.py` – standings computation (pure projection from active events)
  - `backend/storage/schema_v2.py` – serialization format
  - `backend/storage/repository.py` – persistence layer (atomic JSON writes)
  - `backend/ui_api/workspace.py` – season lifecycle (create, delete, reset, export, import)
  - `backend/matching/workflow.py` – matching engine (external to this feature, but useful reference for the future matching feature)

## Review Acknowledgments

This plan incorporates feedback from an external architecture review. Key changes from the original draft:

1. **Persons separated from teams** — `PersonIdentity` is a first-class entity; teams reference persons by ID instead of embedding them.
2. **Event terminology** — the persisted log contains committed domain events, not commands. Naming reflects this throughout.
3. **Strict unknown-event handling** — replay fails on unrecognized event types or schema versions instead of silently skipping.
4. **Explicit import batch** — `import_batch.recorded` provides stable grouping for provenance, rollback, and idempotency.
5. **Entry-level corrections** — `entry.reassigned` and `entry.corrected` allow targeted fixes without full race rollback.
6. **Season lifecycle separated** — create/delete/reset/import are workspace operations, not season-stream events.
7. **Sequence-based replay** — `seq` field is authoritative for replay order; `recorded_at` is informational.
8. **Integer meters** — `distance_m` replaces `distance_km` to avoid floating-point issues.
9. **Enriched provenance** — `IncomingRowData` includes `sheet_name`, `section_name`, `row_index` for row-level traceability.
10. **Season ≠ year** — seasons are identified by uuid + label, decoupled from a single calendar year.
11. **Richer metadata** — `app_version` and `schema_version` on every event envelope.
12. **Result reassignment over merge** — explicit identity merge events are intentionally out of scope for v1. Operator correction of wrongly matched imports is modeled via `entry.reassigned`. The supported business operation is result reassignment, not registry cleanup. Orphaned persons/teams are acceptable historical artifacts in the registry.
13. **Per-entry eligibility clearing** — exclusions after import are cleared via individual `ranking.eligibility_set` events, not a blanket reset.
14. **Race metadata corrections** — `race.metadata_corrected` allows fixing race date/number/category without rollback.
15. **Points as source facts** — confirmed: points are organizer-assigned facts stored on entries, not derived.
