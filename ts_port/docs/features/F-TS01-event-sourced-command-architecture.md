# F-TS01: Event-Sourced Command Architecture

## Overview

- Feature ID: F-TS01
- Feature name: Event-sourced command architecture for race/team/season data
- Owner: —
- Status: Planned
- Related requirement(s): R1, R2, R3, R5, R7
- Related milestone(s): M-TS1
- Python predecessor(s): F01 (domain model & storage), parts of F02 (ingestion merge), F03 (matching decisions), F04 (standings), F09 (identity correction), F16 (identity merge)

## Problem Statement

The Python version stores the full materialized state (`ProjectDocument`) as a single JSON snapshot. Every mutation loads the whole document, mutates in memory, and writes it back. This approach:

1. Makes it impossible to inspect *what happened* without a separate audit log (`matching_decisions`).
2. Couples storage format tightly to the domain model – any schema change requires a migration.
3. Treats singles (`Person` + `participant_uid`) and couples (`Couple` + `team_uid`) as structurally different, causing branching logic everywhere.

The TS port replaces this with an **event-sourced / command-sourced** architecture where:

- The **command log** (append-only, ordered) is the single source of truth.
- The **current state** is a deterministic projection (fold) over all commands.
- **Teams** are the universal participant entity (size 1 = solo, size 2 = couple), eliminating the Person-vs-Couple split.
- Matching decisions, identity corrections, and rollbacks are all just commands in the same log – no separate audit table.

## Scope

### In Scope

- Define the full set of **command types** that can appear in the log.
- Define the **domain value types** (Team, Person, RaceEvent, Entry, Category, etc.) that the projection produces.
- Define the **projection function** that folds commands into current state.
- Define the **storage format** for the command log (JSON, IndexedDB schema).
- Define **snapshot** strategy for fast startup (optional cache, never authoritative).
- Define validation rules per command type.

### Out of Scope

- UI framework choice (F-TS02).
- Excel parsing (separate feature).
- Fuzzy matching algorithm details (separate feature – matching is *invoked by* import commands but the scoring logic is its own module).
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
  metadata: {             // optional provenance
    source_file?: string
    source_sha256?: string
    parser_version?: string
  }
}
```

Below is the complete catalog of command types, derived from analysis of every state mutation in the Python backend.

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

#### Race Event Commands

| Command Type | Purpose | Python Equivalent |
|---|---|---|
| `race.register` | Register a new race event with its entries | `import_excel_into_project` (core event creation) |
| `race.rollback` | Soft-delete a race event | `rollback_race` |
| `race.rollback_batch` | Soft-delete all race events from a source file | `rollback_source_batch` |

**`race.register`** — the central import command. In the Python version, importing an Excel file does many things in one transaction: creates Person/Couple entities, creates a RaceEvent with entries, runs matching, appends matching decisions. In the event-sourced model, we decompose this into sub-commands grouped in a **batch**:

```
{
  race_event_id: string     // uuid
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
  entry_id: string          // uuid
  startnr: string
  distance_km: number
  points: number
  // Raw incoming data for matching:
  incoming: {
    display_name: string    // singles: "Nachname, Vorname"; couples: "A / B"
    yob: number | null      // singles; null for couples (use yob_text)
    yob_text: string | null // couples: "1985 / 1990"
    club: string | null
    kind: "solo" | "team"
  }
}
```

This command does NOT assign team IDs to entries. The matching step (below) connects entries to teams.

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

#### Team & Identity Commands

| Command Type | Purpose | Python Equivalent |
|---|---|---|
| `team.register` | Create a new team identity (solo or couple) | Implicit in `process_singles_section` / `process_couples_section` (new_identity path) |
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

#### Matching / Linking Commands

| Command Type | Purpose | Python Equivalent |
|---|---|---|
| `match.auto_link` | System auto-links an entry to an existing team | `MatchingDecision(kind="auto")` with auto route |
| `match.auto_new_identity` | System creates a new team for an unmatched entry | `MatchingDecision(kind="auto")` with new_identity route |
| `match.review_pending` | System flags an entry for human review | `MatchingDecision(kind="auto")` with review route |
| `match.manual_link` | User confirms link to an existing team | `apply_match_decision(decision_action="link_existing")` |
| `match.manual_new_identity` | User rejects all candidates and creates a new team | `apply_match_decision(decision_action="create_new_identity")` |
| `match.replay` | System replays a previous manual decision for a fingerprint | `MatchingDecision(kind="replay")` |
| `match.reject_candidate` | User rejects a specific candidate (future use) | `MatchingDecision(kind="manual_reject")` – modeled but unused in Python |

Each matching command links a `race_event_id` + `entry_id` to a `team_id`:

**`match.auto_link`**
```
{
  race_event_id: string
  entry_id: string
  team_id: string
  fingerprint: string           // identity hash for replay
  confidence: number
  candidate_ids: string[]       // ranked
  candidate_confidences: number[]
  feature_scores: Record<string, number>
}
```

**`match.auto_new_identity`**
```
{
  race_event_id: string
  entry_id: string
  team_id: string               // the newly created team
  fingerprint: string
  confidence: number            // of best rejected candidate, if any
  candidate_ids: string[]
  candidate_confidences: number[]
  feature_scores: Record<string, number>
}
```

**`match.review_pending`**
```
{
  race_event_id: string
  entry_id: string
  team_id: string               // provisional link to best candidate
  fingerprint: string
  confidence: number
  candidate_ids: string[]
  candidate_confidences: number[]
  feature_scores: Record<string, number>
  conflict_flags: string[]
}
```

**`match.manual_link`**
```
{
  race_event_id: string
  entry_id: string
  team_id: string               // confirmed target
  fingerprint: string
  rationale: string
  field_resolutions: FieldResolution[]
}
```

**`match.manual_new_identity`**
```
{
  race_event_id: string
  entry_id: string
  team_id: string               // the new team created by user
  fingerprint: string
  rationale: string
}
```

**`match.replay`**
```
{
  race_event_id: string
  entry_id: string
  team_id: string
  fingerprint: string
  replayed_from_command_id: string   // the original manual decision
}
```

**`match.reject_candidate`**
```
{
  race_event_id: string
  entry_id: string
  rejected_team_id: string
  fingerprint: string
  rationale: string
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

### 3. Import as a Command Batch

In the Python version, a single `import_excel_into_project` call:
1. Parses the Excel file into rows.
2. For each row, either finds an existing identity or creates a new one.
3. Creates a `RaceEvent` with entries linked to identities.
4. Appends matching decisions.
5. Recomputes standings.
6. Clears ranking exclusions.
7. Saves.

In the event-sourced model, **importing a file** produces a **batch** of commands emitted atomically:

```
[
  team.register { ... }          // 0 or more, for new identities
  team.register { ... }
  race.register { ... entries }  // 1 per parsed section
  match.auto_link { ... }        // 1 per entry that auto-matched
  match.auto_new_identity { ... }
  match.review_pending { ... }
  ranking.clear_exclusions { ... }
]
```

The batch is appended to the log atomically. The projection function processes commands in order to build current state.

### 4. Derived / Projected State

The projection (fold) over the command log produces the following materialized state:

```
SeasonState {
  series_year: number
  project_id: string

  // Entity registries (built from team.register, team.update_member, team.merge)
  teams: Map<team_id, Team>
  persons: Map<person_id, Person>   // denormalized from teams for lookup

  // Race events (built from race.register, race.rollback*)
  events: Map<race_event_id, RaceEvent>
  // Each RaceEvent has state: "active" | "rolled_back"
  // Each entry within has its team_id set by matching commands

  // Matching state (built from match.* commands)
  entry_team_links: Map<entry_id, team_id>           // resolved links
  review_queue: Set<entry_id>                         // entries pending review
  fingerprint_decisions: Map<fingerprint, command_id> // latest decision per fingerprint (for replay)
  rejected_candidates: Map<fingerprint, Set<team_id>> // rejection log

  // Ranking exclusions (built from ranking.* commands)
  exclusions: Map<category_key, Set<team_id>>
}
```

**Standings** are NOT part of the projected state. They are computed on-demand from `SeasonState` using the ranking engine (same v1_legacy_top4 rules). This eliminates the need to store `StandingsSnapshot` and keeps the command log lean.

### 5. Storage Format

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

### 6. Projection Implementation

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
    case "team.register":       return applyTeamRegister(state, cmd.payload);
    case "team.update_member":  return applyTeamUpdateMember(state, cmd.payload);
    case "team.merge":          return applyTeamMerge(state, cmd.payload);
    case "race.register":       return applyRaceRegister(state, cmd.payload);
    case "race.rollback":       return applyRaceRollback(state, cmd.payload);
    case "race.rollback_batch": return applyRaceRollbackBatch(state, cmd.payload);
    case "match.auto_link":     return applyMatchLink(state, cmd.payload);
    // ... etc
    default: return state; // forward-compatible: unknown types are no-ops
  }
}
```

The projection is **pure** (no side effects, no I/O). This makes it trivially testable and deterministic.

### 7. Validation

Each command is validated before being appended to the log:

- `race.register`: no duplicate `race_event_id`; no active event with same category + race_no; no active event with same `source_sha256`.
- `team.register`: no duplicate `team_id`; members.length matches division constraints (validated on matching, not on registration).
- `team.merge`: both teams exist; no overlapping race participation in the same category.
- `match.*`: referenced `race_event_id` and `entry_id` must exist; `team_id` must exist (or be registered in the same batch).
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
- Matching decisions are commands in the log, not a separate audit table. The audit trail IS the data.
- Standings are never stored; they are computed on demand from projected state.
- `ranking_exclusions` are commands, not a field on the document.
- Rollbacks are commands that mark events as rolled back; the original `race.register` command stays in the log forever.

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
type MatchRoute = "auto" | "review" | "new_identity";
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
  team_id: string | null;        // null until matching resolves it
  distance_km: number;
  points: number;
  match_state: {
    route: MatchRoute;
    confidence: number;
    candidate_ids: string[];
    candidate_confidences: number[];
    feature_scores: Record<string, number>;
    conflict_flags: string[];
    fingerprint: string;
  } | null;
  incoming: {                     // raw import data preserved for review UI
    display_name: string;
    yob: number | null;
    yob_text: string | null;
    club: string | null;
    kind: "solo" | "team";
  };
}
```

### FieldResolution (for manual match audit)

```typescript
interface FieldResolution {
  field_name: string;
  kept_from: "incoming" | "existing" | "manual";
  value: string;
}
```

---

## Risks and Assumptions

- **Assumption:** Replay performance is acceptable for typical season sizes (≤10 races × ≤200 entries each = ≤2000 entries). With ~20 commands per entry (register + match), that's ~40k commands max – trivially fast to replay.
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
  - `backend/domain/models.py` – current data model
  - `backend/domain/enums.py` – enums
  - `backend/ui_api/commands.py` – all mutation handlers
  - `backend/ingestion/service.py` – import orchestration
  - `backend/matching/workflow.py` – matching + identity creation
  - `backend/domain/identity_merge.py` – merge logic
  - `backend/ranking/engine.py` – standings computation
  - `backend/storage/schema_v2.py` – serialization format
  - `backend/storage/repository.py` – persistence layer
  - `backend/ui_api/workspace.py` – season lifecycle
