# F-TS01: Event-Sourced Command Architecture

## Overview

- Feature ID: F-TS01
- Feature name: Event-sourced command architecture for race/team/season data
- Owner: —
- Status: Planned
- Related requirement(s): R1, R2, R3, R5, R7
- Related milestone(s): M-TS1
- Python predecessor(s): F01 (domain model & storage), parts of F02 (ingestion merge), F04 (standings), F09 (identity correction), F16 (identity merge)

## Problem Statement

The Python version stores the full materialized state (`ProjectDocument`) as a single JSON snapshot. Every mutation loads the whole document, mutates in memory, and writes it back. This approach:

1. Makes it impossible to inspect *what happened* without a separate audit log (`matching_decisions`).
2. Couples storage format tightly to the domain model – any schema change requires a migration.
3. Treats singles (`Person` + `participant_uid`) and couples (`Couple` + `team_uid`) as structurally different, causing branching logic everywhere.

The TS port replaces this with an **event-sourced / command-sourced** architecture where:

- The **command log** (append-only, ordered) is the single source of truth.
- The **current state** is a deterministic projection (fold) over all commands.
- **Teams** are the universal participant entity (size 1 = solo, size 2 = couple), eliminating the Person-vs-Couple split.
- Identity corrections, rollbacks, and all other mutations are just commands in the same log – no separate audit table.
- **Matching is external to the data model.** The matching engine (fuzzy scoring, candidate ranking, auto-link thresholds, strict mode, replay of past decisions) is a workflow that runs *before* commands are emitted. Its output is simply "assign entry X to existing team T" or "create new team T and assign entry X to it." Both outcomes are expressed using the same `race.register` and `team.register` commands.

## Scope

### In Scope

- Define the minimal set of **command types** that can appear in the log.
- Define the **domain value types** (Team, Person, RaceEvent, Entry, Category, etc.) that the projection produces.
- Define the **projection function** that folds commands into current state.
- Define the **storage format** for the command log (JSON, IndexedDB schema).
- Define **snapshot** strategy for fast startup (optional cache, never authoritative).
- Define validation rules per command type.
- Establish the boundary: matching logic is **outside** this data model.

### Out of Scope

- UI framework choice (F-TS02).
- Excel parsing (separate feature).
- Matching engine internals (fuzzy scoring, candidate ranking, thresholds, replay heuristics). Matching is a separate workflow module that *produces* commands; it is not part of the command/event model itself.
- PDF/CSV export.
- Deployment and PWA.

## Acceptance Criteria

- [ ] All Python-version state mutations are expressible as commands in the log.
- [ ] A fresh projection from an empty log through any valid command sequence produces the same logical state as the Python version would.
- [ ] The command log format is forward-compatible: new command types can be added without breaking replay of old logs.
- [ ] Solo participants and couples are both represented as Teams with validated member counts.
- [ ] Standings are a pure derived view (re-computable from commands), never stored as source of truth.
- [ ] The command log is serializable to/from JSON for file export/import.

---

## Technical Plan

### 1. Unified Team Model

Replace the Python `Person` / `Couple` split with a single `Team` concept:

```
Person {
  person_id: string       // uuid
  display_name: string    // as entered
  given_name: string      // parsed canonical
  family_name: string     // parsed canonical
  yob: number
  gender: "M" | "F" | "X"
  club: string | null
  club_normalized: string
}

Team {
  team_id: string         // uuid
  members: Person[]       // length 1 = solo, length 2 = couple
}
```

- Division rules validate team size: `men`/`women` divisions require `members.length === 1`; `couples_*` divisions require `members.length === 2`.
- Entries always reference `team_id`. There is no `participant_uid` vs `team_uid` branching.
- Member order within a couple team is canonical (stored in order, but matching is order-insensitive).

### 2. Command Types

Every state change is represented as exactly one command. Commands are **immutable facts** appended to the log. Each command has:

```
CommandEnvelope {
  command_id: string      // uuid, globally unique
  timestamp: string       // ISO 8601
  type: string            // discriminator
  payload: { ... }        // type-specific
  metadata?: {            // optional provenance
    source_file?: string
    source_sha256?: string
    parser_version?: string
  }
}
```

#### Design Principle: Matching Is Not a Command

The Python version has a `matching_decisions` table with 7 kinds of decision (auto, manual_link, manual_reject, replay, identity_correction, identity_merge, ...). This complexity exists because the Python model mixes *what happened to the data* with *how the matching engine arrived at that decision*.

In the TS port, matching is **purely external to the command log**. The matching engine is a workflow that:
1. Reads the current projected state (existing teams) and the raw incoming Excel rows.
2. Decides, for each row: "this is existing team T" or "this needs a new team."
3. Emits plain `race.register` and `team.register` commands as output.

The *how* (fuzzy scores, candidate lists, auto-link thresholds, strict mode, replay of fingerprint decisions) is the matching engine's internal concern. It may store its own working state (candidate rankings, rejection preferences, replay hints) outside the command log — in a UI preferences store or ephemerally in memory. None of that is season data.

**What about the review queue?** In the Python version, some entries land in a "review" state after import — provisionally linked to a best-guess candidate, awaiting user confirmation. Two clean approaches:

- **Eager resolution (preferred):** The import workflow does not emit `race.register` until every entry is fully resolved. Parsing + matching + user review is a staging process. Only once the user has confirmed all assignments does the atomic `race.register` command go into the log with every entry carrying a definitive `team_id`. This means the command log never contains half-resolved state.
- **Deferred resolution (fallback):** Emit `race.register` with `team_id: null` on unresolved entries, then use a single `entry.assign_team` command when the user resolves them. Still just one extra command type, not seven.

We will proceed with **eager resolution** as the default approach. The review queue lives in the UI/workflow layer, not the event log.

Below is the complete command catalog — intentionally minimal.

---

#### Season Lifecycle Commands

| Command Type | Purpose | Python Equivalent |
|---|---|---|
| `season.create` | Initialize a new season year | `create_series_year` |
| `season.reset` | Clear all data for a season, keeping the year slot | `reset_series_year` |
| `season.delete` | Remove a season entirely | `delete_series_year` |
| `season.import` | Restore a season from an exported archive | `import_series_year` |

**`season.create`**
```
{
  series_year: number
  project_id: string      // uuid for the new season
}
```

**`season.reset`**
```
{
  series_year: number
  confirmation_year: number  // must match series_year
}
```

**`season.delete`**
```
{
  series_year: number
  confirmation_year: number
}
```

**`season.import`**
```
{
  series_year: number
  imported_commands: CommandEnvelope[]  // the full command log from the archive
  conflict_resolution: "replace" | "new_year"
  target_year?: number                 // if new_year
}
```

---

#### Team & Identity Commands

| Command Type | Purpose | Python Equivalent |
|---|---|---|
| `team.register` | Create a new team identity (solo or couple) | Implicit in `process_singles_section` / `process_couples_section` (new_identity path); also `apply_match_decision(create_new_identity)` |
| `team.update_member` | Correct a team member's canonical identity | `update_participant_identity` |
| `team.merge` | Merge two duplicate team identities into one | `merge_standings_entities` |

**`team.register`**
```
{
  team_id: string
  members: PersonInput[]    // 1 or 2 members
}

PersonInput {
  person_id: string
  display_name: string
  given_name: string
  family_name: string
  yob: number
  gender: "M" | "F" | "X"
  club: string | null
  club_normalized: string
}
```

**`team.update_member`**
```
{
  team_id: string
  person_id: string
  member_slot: "sole" | "a" | "b"   // which member position
  updated_fields: {
    display_name?: string
    given_name?: string
    family_name?: string
    yob?: number
    club?: string | null
    club_normalized?: string
  }
  series_year: number                // scope for audit
  rationale: string
}
```

**`team.merge`**
```
{
  survivor_team_id: string
  absorbed_team_id: string
  category_key: string
  series_year: number
  rationale: string
}
```

---

#### Race Event Commands

| Command Type | Purpose | Python Equivalent |
|---|---|---|
| `race.register` | Register a fully-resolved race event with its entries | `import_excel_into_project` (after matching resolves all entries) |
| `race.rollback` | Soft-delete a race event | `rollback_race` |
| `race.rollback_batch` | Soft-delete all race events from a source file | `rollback_source_batch` |

**`race.register`** — the central import command. Entries arrive **fully resolved**: every entry carries its `team_id`. The matching engine has already done its work before this command is emitted. Each entry also preserves the **raw incoming data** from the source file for auditability.

```
{
  race_event_id: string
  series_year: number
  category: {
    year: number
    duration: "half_hour" | "hour"
    division: "men" | "women" | "couples_men" | "couples_women" | "couples_mixed"
  }
  race_no: number
  race_date: string
  source_file: string
  source_sha256: string
  entries: RaceEntryInput[]
}

RaceEntryInput {
  entry_id: string
  startnr: string
  team_id: string           // always resolved — the whole point
  distance_km: number
  points: number
  incoming: IncomingRowData  // raw source data, preserved for audit
  resolution: ResolutionInfo // how the matching engine arrived at this team_id
}

IncomingRowData {
  display_name: string      // as typed in Excel: "Müller, Max" or "A / B"
  yob: number | null        // solo; null for couples
  yob_text: string | null   // couples: "1985 / 1990"; null for solo
  club: string | null       // raw club string
  kind: "solo" | "team"
}

ResolutionInfo {
  method: "auto" | "manual" | "new_identity"
  confidence: number | null  // matching score, null for new_identity / manual without score
  candidate_count: number    // how many candidates were considered
}
```

Each entry carries two diagnostic fields alongside the resolved `team_id`:

- **`incoming`** — what the Excel row said (raw evidence). Enables "why is this result here?" audits and future re-matching without the original file.
- **`resolution`** — how the matching engine resolved it (diagnostic trace). Three methods:
  - `auto`: the engine auto-linked at the given confidence level.
  - `manual`: the user picked this team from a candidate list.
  - `new_identity`: no suitable match existed; a new team was created.
  
  `confidence` captures the score at the time of resolution (null when not applicable). `candidate_count` records how many alternatives were considered, useful for spotting thin-candidate situations that might warrant review.

This is deliberately minimal — enough to debug "why was this matched wrong?" without replicating the full candidate ranking. The matching engine's internal state (full candidate list, per-feature scores, rejection history) remains ephemeral.

**`race.rollback`**
```
{
  race_event_id: string
  reason: string
}
```

**`race.rollback_batch`**
```
{
  source_sha256: string
  reason: string
}
```

---

#### Ranking / Eligibility Commands

| Command Type | Purpose | Python Equivalent |
|---|---|---|
| `ranking.set_eligibility` | Mark a team as außer Wertung (ineligible) or re-eligible in a category | `set_ranking_eligibility` |
| `ranking.clear_exclusions` | Reset all exclusions (done automatically after import in Python) | Implicit in `import_excel_into_project` |

**`ranking.set_eligibility`**
```
{
  category_key: string
  team_id: string
  excluded: boolean        // true = außer Wertung
}
```

**`ranking.clear_exclusions`**
```
{
  series_year: number
}
```

---

### 3. What the Matching Engine Does (Outside the Command Log)

The matching engine is a **workflow module**, not part of the event-sourced core. It:

1. Takes raw parsed Excel rows and the current `SeasonState` as input.
2. For each row, decides: link to existing team T, or create new team.
3. Outputs a list of `team.register` commands (for new teams) and a single `race.register` command (with all entries carrying their resolved `team_id`).
4. Optionally appends `ranking.clear_exclusions`.

The matching engine may maintain its own working state for features like:
- **Replay hints:** "fingerprint F was previously linked to team T" — derived by scanning the command log for past `race.register` entries, not stored as separate commands.
- **Rejection preferences:** "don't auto-link fingerprint F to team T" — UI preference, not season data.
- **Candidate scoring / confidence:** computed on the fly, surfaced in the review UI, never persisted in the log.

This keeps the command log minimal and focused on *what happened to the season data*, while the matching engine's heuristics can evolve independently.

### 4. Import Workflow → Command Batch

In the Python version, a single `import_excel_into_project` call does parsing, matching, event creation, decision logging, standings recompute, and exclusion clearing in one transaction.

In the TS port, **importing a file** is a multi-step workflow:

1. **Parse:** Read Excel/CSV → raw row data.
2. **Match:** For each row, the matching engine resolves to an existing or new team. If some rows need review, the UI presents a review queue. This all happens *before* any commands are emitted.
3. **Emit:** Once every entry is resolved, emit commands atomically:

```
[
  team.register { ... }           // 0 or more, for newly created teams
  race.register { ... entries }   // 1 per parsed section, all entries resolved
  ranking.clear_exclusions { ... }
]
```

The batch is appended to the command log in a single IndexedDB transaction.

### 5. Derived / Projected State

The projection (fold) over the command log produces:

```
SeasonState {
  series_year: number
  project_id: string

  // Entity registries (built from team.register, team.update_member, team.merge)
  teams: Map<team_id, Team>

  // Race events (built from race.register, race.rollback*)
  events: Map<race_event_id, RaceEvent>
  // Each RaceEvent has state: "active" | "rolled_back"
  // Each entry has a team_id (always populated)

  // Ranking exclusions (built from ranking.* commands)
  exclusions: Map<category_key, Set<team_id>>
}
```

That's it. No matching state, no review queue, no fingerprint index in the projected state. Those are concerns of the matching workflow layer.

**Standings** are NOT part of the projected state. They are computed on-demand from `SeasonState` using the ranking engine (same v1_legacy_top4 rules). This eliminates the need to store `StandingsSnapshot` and keeps the command log lean.

**Participation** is implicit: if a team has no entry in a given `race_event_id`, they didn't participate in that race. No explicit "did not participate" records are needed.

### 6. Storage Format

The command log for each season year is stored as:

```json
{
  "format": "stundenlauf-ts-commandlog",
  "format_version": 1,
  "series_year": 2025,
  "project_id": "proj_abc123",
  "commands": [
    { "command_id": "...", "timestamp": "...", "type": "team.register", "payload": { ... } },
    { "command_id": "...", "timestamp": "...", "type": "race.register", "payload": { ... } },
    ...
  ]
}
```

In the browser, this is stored in **IndexedDB** (one object store per season, or one store with season key). For export/import, the entire log is serialized as the JSON above.

Snapshots (optional, for fast startup):
```json
{
  "format": "stundenlauf-ts-snapshot",
  "format_version": 1,
  "series_year": 2025,
  "project_id": "proj_abc123",
  "snapshot_after_command_id": "cmd_xyz",
  "state": { ... }  // serialized SeasonState
}
```

### 7. Projection Implementation

```typescript
function projectState(commands: CommandEnvelope[]): SeasonState {
  let state = emptySeasonState();
  for (const cmd of commands) {
    state = applyCommand(state, cmd);
  }
  return state;
}

function applyCommand(state: SeasonState, cmd: CommandEnvelope): SeasonState {
  switch (cmd.type) {
    case "season.create":       return applySeasonCreate(state, cmd.payload);
    case "season.reset":        return applySeasonReset(state, cmd.payload);
    case "team.register":       return applyTeamRegister(state, cmd.payload);
    case "team.update_member":  return applyTeamUpdateMember(state, cmd.payload);
    case "team.merge":          return applyTeamMerge(state, cmd.payload);
    case "race.register":       return applyRaceRegister(state, cmd.payload);
    case "race.rollback":       return applyRaceRollback(state, cmd.payload);
    case "race.rollback_batch": return applyRaceRollbackBatch(state, cmd.payload);
    case "ranking.set_eligibility":  return applySetEligibility(state, cmd.payload);
    case "ranking.clear_exclusions": return applyClearExclusions(state, cmd.payload);
    default: return state; // forward-compatible: unknown command types are no-ops
  }
}
```

The projection is **pure** (no side effects, no I/O). This makes it trivially testable and deterministic.

### 8. Validation

Each command is validated before being appended to the log:

- `race.register`: no duplicate `race_event_id`; no active event with same category + race_no; no active event with same `source_sha256`; every entry's `team_id` must reference a registered team.
- `team.register`: no duplicate `team_id`.
- `team.merge`: both teams exist; no overlapping race participation in the same category.
- `ranking.set_eligibility`: team must have entries in the category.
- `season.reset`: `confirmation_year === series_year`.

---

## Mapping from Python Implementation

### Python approach

- `ProjectDocument` is the root aggregate. It holds `people`, `couples`, `events`, `matching_decisions`, `standings`, `ranking_exclusions`.
- Every mutation loads the full document, applies changes in-memory, recomputes standings, and writes the whole thing back as JSON.
- Singles use `participant_uid` on entries; couples use `team_uid`. Logic branches on division to decide which field to use.
- `matching_decisions` is an append-only audit log stored alongside the document, but it's treated as metadata – the source of truth for identity links is the `participant_uid`/`team_uid` on entries.

### TS port differences

- The command log IS the source of truth. There is no separate "current state" file.
- `Team` replaces both `Person` (solo) and `Couple` (pair). Entries always reference `team_id`.
- **Matching is external to the data model.** The 7-kind `matching_decisions` table disappears entirely. The matching engine produces plain `team.register` and `race.register` commands. Audit provenance (scores, candidates) can optionally ride in `metadata` on the command envelope, but it's not domain state.
- Standings are never stored; they are computed on demand from projected state.
- `ranking_exclusions` are commands, not a field on the document.
- Rollbacks are commands that mark events as rolled back; the original `race.register` command stays in the log forever.
- The review queue is a UI workflow concern, not stored in the command log. Entries are never half-resolved in the log.

### Reusable logic

- Ranking rules (`v1_legacy_top4`, top-4 selection, scoring, sorting) port directly.
- Identity fingerprint and scoring functions port directly.
- Name parsing and normalization port directly.
- Division/gender validation rules port directly.

---

## Datasets (Value Types Reference)

For completeness, here are the core value types carried inside commands and produced by projection:

### Enums

```typescript
type Gender = "M" | "F" | "X";
type RaceDuration = "half_hour" | "hour";
type Division = "men" | "women" | "couples_men" | "couples_women" | "couples_mixed";
type RaceEventState = "active" | "rolled_back";
```

### Person (value object, always nested in Team)

```typescript
interface Person {
  person_id: string;
  display_name: string;
  given_name: string;
  family_name: string;
  yob: number;
  gender: Gender;
  club: string | null;
  club_normalized: string;
}
```

### Team (universal participant entity)

```typescript
interface Team {
  team_id: string;
  members: Person[];  // 1 = solo, 2 = couple
}
```

### RaceCategory

```typescript
interface RaceCategory {
  year: number;
  duration: RaceDuration;
  division: Division;
}
```

### RaceEvent (projected state)

```typescript
interface RaceEvent {
  race_event_id: string;
  category: RaceCategory;
  race_no: number;
  race_date: string;
  state: RaceEventState;
  source_file: string;
  source_sha256: string;
  imported_at: string;
  entries: RaceEntry[];
  rollback?: {
    command_id: string;
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
  distance_km: number;
  points: number;
  incoming: IncomingRowData;
  resolution: ResolutionInfo;
}

interface IncomingRowData {
  display_name: string;
  yob: number | null;
  yob_text: string | null;
  club: string | null;
  kind: "solo" | "team";
}

interface ResolutionInfo {
  method: "auto" | "manual" | "new_identity";
  confidence: number | null;
  candidate_count: number;
}
```

Three levels of information on every entry:
- `team_id` + `distance_km` + `points` — the fact (who ran, what they achieved).
- `incoming` — the evidence (what the source file said).
- `resolution` — the diagnostic (how the assignment was made).

---

## Risks and Assumptions

- **Assumption:** Replay performance is acceptable for typical season sizes (≤10 races × ≤200 entries each = ≤2000 entries). With the simplified model (one `team.register` per new identity + one `race.register` per section), a full season is ~100–500 commands — trivially fast to replay.
- **Assumption:** Browser IndexedDB can hold the full command log for multiple seasons without hitting storage limits.
- **Risk:** Event schema evolution – if a command payload shape changes, old logs must still replay correctly.
  - Mitigation: Versioned command schemas; projection applies sensible defaults for missing fields; new command types are simply ignored by old projections (forward-compatible by default).
- **Risk:** Atomic batch writes in IndexedDB may fail partially.
  - Mitigation: Use IndexedDB transactions to ensure batch atomicity.

## Implementation Steps

1. Define TypeScript types for all command payloads, enums, and value objects.
2. Implement `CommandEnvelope` serialization/deserialization.
3. Implement `projectState` / `applyCommand` for each command type.
4. Implement validation functions per command type.
5. Implement `SeasonState` type and empty initializer.
6. Implement IndexedDB storage adapter for command logs.
7. Implement JSON import/export of command logs.
8. Write comprehensive tests: replay scenarios, validation, round-trip serialization.
9. Implement snapshot creation and restore (optimization, lower priority).

## Test Plan

- **Unit:** Each `applyCommand` handler tested in isolation with minimal state.
- **Integration:** Multi-command replay sequences that mirror real import workflows (register teams, register race, match entries, then query projected state).
- **Fixture-based:** Port key Python test scenarios to verify behavioral parity (same inputs → same projected state as Python `ProjectDocument`).
- **Round-trip:** Serialize command log to JSON, deserialize, replay, verify identical projected state.
- **Validation:** Verify that invalid commands are rejected (duplicate IDs, missing references, constraint violations).

## Definition of Done

- [ ] Code implemented in TypeScript
- [ ] Tests added/updated and passing (Vitest)
- [ ] Types are strict (no `any` escapes without justification)
- [ ] Docs updated
- [ ] Entry added to `ts_port/docs/ACCOMPLISHMENTS.md`
- [ ] Requirement/milestone status updated in `ts_port/PROJECT_PLAN.md`

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
