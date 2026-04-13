# F-TS04: Ranking Engine and Standings Computation

## Overview

- Feature ID: F-TS04
- Feature name: Configurable ranking engine with standings computation
- Owner: —
- Status: Done
- Related requirement(s): R5
- Related milestone(s): M-TS4
- Python predecessor(s): F04 (ranking engine, `backend/ranking/`)

## Problem Statement

After race results are imported and matched, users need cumulative standings per category — ranked tables showing each team's total points and distance across the season. The Python version computes standings via a "best N of all" aggregation (currently top 4 races), then sorts by total points and distance.

The TS port must replicate this computation as a **pure derived view** over `SeasonState` (per F-TS01: standings are never stored as source of truth). The engine must be designed so that future ranking approaches (different aggregation strategies, configurable N, alternative tie-breaking, weighted scoring) can be added without restructuring the core.

This feature covers **only the ranking computation and exclusion presentation logic**. It does **not** cover:

- The event model for eligibility exclusions (`ranking.eligibility_set` is defined in F-TS01).
- UI for standings display or exclusion toggling.
- PDF/CSV export of standings tables.

## Scope

### In Scope

- Define a `Ruleset` abstraction that parameterizes the ranking algorithm.
- Implement the `stundenlauf_v1` ruleset: top-4 aggregation, points-desc/distance-desc sorting.
- Compute per-category standings tables from `SeasonState`.
- Track which races count toward totals and which are dropped (per-team race contributions).
- Apply ranking exclusions ("außer Wertung") as a presentation-layer filter with rank renumbering.
- Provide both "full" standings (excluded teams marked but present) and "eligible-only" standings (excluded teams omitted, ranks renumbered).
- Support deterministic tie-breaking for reproducible output.
- All logic is pure functions over `SeasonState` — no I/O, no side effects, no framework dependencies.

### Out of Scope

- Event definitions for `ranking.eligibility_set` (defined in F-TS01).
- UI components for standings display, eligibility toggling, or settings.
- PDF/CSV export (F-TS06 or later).
- Alternative rulesets beyond `stundenlauf_v1` (the abstraction supports them; implementation is future work).
- Recomputing standings on every event append (the caller decides when to compute; the engine is stateless).

## Acceptance Criteria

- [ ] `computeStandings(state, ruleset)` produces a `StandingsSnapshot` with one `CategoryStandingsTable` per category that has effective entries.
- [ ] With ≤4 races for a team, all races count toward totals.
- [ ] With >4 races for a team, only the 4 highest-scoring races count; dropped races are tracked.
- [ ] When two races have equal points for the same team, the tie-break for top-N selection is ascending `race_event_id` (deterministic).
- [ ] Standings rows are sorted: highest `total_points` first, then highest `total_distance_m`, then `team_id` ascending.
- [ ] Each row gets a sequential `rank` (1, 2, 3…) with no shared ranks — deterministic ordering via `team_id`.
- [ ] Rolled-back races and rolled-back import batches are excluded from computation.
- [ ] Entry corrections (`entry.reassigned`, `entry.corrected`) are reflected in the effective entry state used for standings.
- [ ] `applyExclusions(table, exclusions)` produces an eligible-only table with renumbered sequential ranks.
- [ ] `markExclusions(table, exclusions)` produces a full table where excluded teams have `rank: null` and `excluded: true`; eligible teams keep sequential ranks.
- [ ] Empty categories (no effective entries) produce no table.
- [ ] Distance totals are rounded to 3 decimal places (configurable via ruleset).
- [ ] The ranking engine is framework-agnostic (pure TS functions, no UI imports).
- [ ] Producing standings for the same `SeasonState` and `Ruleset` is deterministic — identical output every time.

---

## Technical Plan

### 1. Ruleset Abstraction

The ranking engine is parameterized by a `Ruleset` — a versioned configuration that controls aggregation, sorting, and rounding. The current (and only) concrete ruleset is `stundenlauf_v1`. The abstraction exists so that future rulesets can be added without changing the engine's public API.

```typescript
interface Ruleset {
  readonly version_id: string;
  readonly top_n: number;
  readonly distance_decimals: number;
  readonly primary_sort: "points_desc";
  readonly tie_break: "distance_desc";
}

const RULESET_STUNDENLAUF_V1: Ruleset = {
  version_id: "stundenlauf_v1",
  top_n: 4,
  distance_decimals: 3,
  primary_sort: "points_desc",
  tie_break: "distance_desc",
};
```

The `primary_sort` and `tie_break` fields are declarative metadata — the `stundenlauf_v1` implementation hard-codes the sort logic. Future rulesets could use these fields to drive generic sort comparators.

### 2. Category Key

In the Python version, a category is `RaceSeriesCategory(year, duration, division)` with key `"<year>:<duration>:<division>"`. In the TS port, seasons are decoupled from calendar years (F-TS01), so the category is simply `RaceCategory { duration, division }`.

```typescript
interface RaceCategory {
  duration: RaceDuration;   // "half_hour" | "hour"
  division: Division;       // "men" | "women" | "couples_men" | "couples_women" | "couples_mixed"
}

function categoryKey(cat: RaceCategory): string {
  return `${cat.duration}:${cat.division}`;
}
```

Categories are compared by their string key. Standings tables are ordered by sorted category key.

### 3. Effective Entries

The ranking engine operates on **effective** race data — the subset of `SeasonState` that is neither rolled back at race level nor at import-batch level, with entry-level corrections applied.

From F-TS01, an entry is effective when:
- Its parent `RaceEvent` has `state: "active"`.
- Its parent `RaceEvent`'s import batch has `state: "active"`.
- Entry corrections (`entry.reassigned`, `entry.corrected`) have been applied during projection.

The engine receives a fully projected `SeasonState` and filters to effective entries. It does not need to understand the event log directly.

```typescript
function getEffectiveRaces(state: SeasonState): RaceEvent[] {
  return [...state.race_events.values()].filter(race => {
    if (race.state !== "active") return false;
    const batch = state.import_batches.get(race.import_batch_id);
    return batch != null && batch.state === "active";
  });
}
```

### 4. Entity Collection

In the TS port, all entries reference `team_id` — there is no `participant_uid` vs `team_uid` branching. Every entry's `team_id` is the entity key.

```typescript
function entitiesInCategory(
  races: RaceEvent[],
  catKey: string,
): Set<string> {
  const teamIds = new Set<string>();
  for (const race of races) {
    if (categoryKey(race.category) !== catKey) continue;
    for (const entry of race.entries) {
      teamIds.add(entry.team_id);
    }
  }
  return teamIds;
}
```

### 5. Per-Entity Race Row Collection

For a given team in a given category, collect one `(race_event_id, points, distance_m)` tuple per race the team participated in.

```typescript
interface RaceRow {
  race_event_id: string;
  points: number;
  distance_m: number;
}

function collectRaceRows(
  races: RaceEvent[],
  catKey: string,
  teamId: string,
): RaceRow[] {
  const rows: RaceRow[] = [];
  for (const race of races) {
    if (categoryKey(race.category) !== catKey) continue;
    for (const entry of race.entries) {
      if (entry.team_id !== teamId) continue;
      rows.push({
        race_event_id: race.race_event_id,
        points: entry.points,
        distance_m: entry.distance_m,
      });
    }
  }
  return rows;
}
```

The domain assumes at most one entry per team per race event. If violated, the engine would count both rows — this is a data integrity issue handled at validation time (F-TS01), not in the ranking engine.

### 6. Top-N Aggregation

The core aggregation: given all race rows for a team, select the best N (or all if fewer) and sum their points and distances.

```typescript
interface TopNAggregation {
  total_points: number;
  total_distance_m: number;
  selected_race_ids: string[];
  dropped_race_ids: string[];
}

function aggregateTopN(
  rows: RaceRow[],
  n: number,
  distanceDecimals: number,
): TopNAggregation {
  const sorted = [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.race_event_id < b.race_event_id ? -1 : 1;
  });

  const selected = sorted.slice(0, n);
  const selectedIds = new Set(selected.map(r => r.race_event_id));
  const dropped = sorted.slice(n);

  const totalPoints = selected.reduce((sum, r) => sum + r.points, 0);
  const totalDistance = selected.reduce((sum, r) => sum + r.distance_m, 0);
  const factor = 10 ** distanceDecimals;
  const roundedDistance = Math.round(totalDistance * factor) / factor;

  return {
    total_points: totalPoints,
    total_distance_m: roundedDistance,
    selected_race_ids: selected.map(r => r.race_event_id),
    dropped_race_ids: dropped.map(r => r.race_event_id),
  };
}
```

**Selection tie-break:** When two races have the same points, the one with the lexicographically smaller `race_event_id` is selected. This matches the Python behavior and ensures determinism.

**Distance rounding:** The Python version stores `distance_km: float` and rounds the summed km to 3 decimal places. The TS port stores `distance_m: number` (integer meters per F-TS01). The rounding still applies to the sum to handle any edge cases in aggregation, but with integer meter inputs the practical effect is that the distance total is exact. The `distance_decimals` parameter on the ruleset controls the rounding precision and defaults to 3 (matching Python behavior — in the Python version this rounds km, in the TS version it rounds meters, which is effectively a no-op for integer inputs but preserves the pattern for forward compatibility).

### 7. Race Contributions

For each team, the standings row includes a breakdown of every race they participated in, flagged with whether it counted toward the total.

```typescript
interface RaceContribution {
  race_event_id: string;
  points: number;
  distance_m: number;
  counts_toward_total: boolean;
}
```

Contributions are sorted by `race_event_id` ascending for stable output.

### 8. Standings Row

```typescript
interface StandingsRow {
  team_id: string;
  total_points: number;
  total_distance_m: number;
  rank: number;
  race_contributions: RaceContribution[];
}
```

### 9. Standings Table and Snapshot

```typescript
interface CategoryStandingsTable {
  category_key: string;
  rows: StandingsRow[];
}

interface StandingsSnapshot {
  ruleset_version: string;
  calculated_at: string;          // ISO 8601
  category_tables: CategoryStandingsTable[];
}
```

### 10. Main Engine Function

```typescript
function computeStandings(
  state: SeasonState,
  ruleset?: Ruleset,
  calculatedAt?: string,
): StandingsSnapshot {
  const rs = ruleset ?? RULESET_STUNDENLAUF_V1;
  const ts = calculatedAt ?? new Date().toISOString();

  const effectiveRaces = getEffectiveRaces(state);
  const catKeys = [...new Set(
    effectiveRaces.map(r => categoryKey(r.category))
  )].sort();

  const tables: CategoryStandingsTable[] = [];

  for (const catKey of catKeys) {
    const teamIds = [...entitiesInCategory(effectiveRaces, catKey)].sort();
    const rows: StandingsRow[] = [];

    for (const teamId of teamIds) {
      const raceRows = collectRaceRows(effectiveRaces, catKey, teamId);
      if (raceRows.length === 0) continue;

      const agg = aggregateTopN(raceRows, rs.top_n, rs.distance_decimals);
      const selectedSet = new Set(agg.selected_race_ids);

      const contributions: RaceContribution[] = raceRows
        .sort((a, b) => a.race_event_id < b.race_event_id ? -1 : 1)
        .map(r => ({
          race_event_id: r.race_event_id,
          points: r.points,
          distance_m: r.distance_m,
          counts_toward_total: selectedSet.has(r.race_event_id),
        }));

      rows.push({
        team_id: teamId,
        total_points: agg.total_points,
        total_distance_m: agg.total_distance_m,
        rank: 0,  // assigned below
        race_contributions: contributions,
      });
    }

    rows.sort((a, b) => {
      if (a.total_points !== b.total_points) return b.total_points - a.total_points;
      if (a.total_distance_m !== b.total_distance_m) return b.total_distance_m - a.total_distance_m;
      return a.team_id < b.team_id ? -1 : 1;
    });
    for (let i = 0; i < rows.length; i++) {
      rows[i] = { ...rows[i], rank: i + 1 };
    }

    if (rows.length > 0) {
      tables.push({ category_key: catKey, rows });
    }
  }

  return {
    ruleset_version: rs.version_id,
    calculated_at: ts,
    category_tables: tables,
  };
}
```

### 11. Ranking Exclusions ("außer Wertung")

Exclusions are modeled as events in the event log (`ranking.eligibility_set` from F-TS01) and projected into `SeasonState.exclusions: Map<category_key, Set<team_id>>`. The ranking engine itself does not read exclusions — it produces standings for all teams. Exclusion logic is a **presentation-layer concern** applied after computation.

Two presentation modes:

#### Eligible-only (for standard standings display)

Remove excluded teams and renumber ranks sequentially.

```typescript
function applyExclusions(
  table: CategoryStandingsTable,
  excludedTeamIds: Set<string>,
): CategoryStandingsTable {
  const eligible = table.rows.filter(r => !excludedTeamIds.has(r.team_id));
  const renumbered = eligible.map((row, i) => ({ ...row, rank: i + 1 }));
  return { ...table, rows: renumbered };
}
```

#### Full with exclusion markers (for admin/detail views)

Keep all rows. Excluded teams get `rank: null` and an `excluded: true` flag. Eligible teams get sequential ranks (skipping excluded rows).

```typescript
type StandingsRowWithExclusion = Omit<StandingsRow, "rank"> & {
  excluded: boolean;
  rank: number | null;
};

function markExclusions(
  table: CategoryStandingsTable,
  excludedTeamIds: Set<string>,
): { category_key: string; rows: StandingsRowWithExclusion[] } {
  let eligibleRank = 0;
  const rows = table.rows.map(row => {
    const excluded = excludedTeamIds.has(row.team_id);
    return {
      ...row,
      excluded,
      rank: excluded ? null : ++eligibleRank,
    };
  });
  return { category_key: table.category_key, rows };
}
```

#### Exclusion resolution from state

```typescript
function exclusionsForCategory(
  state: SeasonState,
  categoryKey: string,
): Set<string> {
  return state.exclusions.get(categoryKey) ?? new Set();
}
```

### 12. Module Structure

```
src/
  ranking/
    engine.ts           // computeStandings — main entry point
    aggregation.ts      // aggregateTopN, TopNAggregation
    rules.ts            // Ruleset interface, RULESET_STUNDENLAUF_V1
    exclusions.ts       // applyExclusions, markExclusions, exclusionsForCategory
    types.ts            // StandingsSnapshot, CategoryStandingsTable, StandingsRow,
                        //   RaceContribution, StandingsRowWithExclusion
```

All exports are pure functions with no side effects, no framework dependencies, no I/O.

---

## Mapping from Python Implementation

### Python approach

- `backend/ranking/rules.py`: `Ruleset` dataclass with `version_id`, `top_n`, `distance_decimals`, `primary_sort`, `tie_break`. Single concrete: `RULESET_V1_LEGACY_TOP4`.
- `backend/ranking/aggregation.py`: `sum_top_n_or_all_points_and_distance` — picks top N by points (tie-break: `race_event_uid` ascending), sums points and distance, rounds distance.
- `backend/ranking/engine.py`: `compute_standings_snapshot` — filters to active events, iterates categories and entities, delegates to aggregation, sorts rows, assigns sequential places. `recompute_project_standings` wraps this and attaches the snapshot to the `ProjectDocument`.
- `backend/standings_view.py`: `build_standings_rows_for_category` — enriches `StandingsRow` with display name, YOB, club for the API layer.
- `backend/ui_api/ranking_display.py`: `apply_ranking_exclusions_to_rows` — filters excluded teams, renumbers ranks.
- Entity key logic branches on division: singles use `participant_uid`, couples use `team_uid`.
- Standings snapshot is stored on `ProjectDocument.standings` and recomputed on import/rollback.

### TS port differences

| Aspect | Python | TS Port |
|---|---|---|
| Ruleset identifier | `"v1_legacy_top4"` | `"stundenlauf_v1"` |
| Category model | `RaceSeriesCategory(year, duration, division)` | `RaceCategory { duration, division }` (no year; season is separate) |
| Category key | `"<year>:<duration>:<division>"` | `"<duration>:<division>"` |
| Entity key | `participant_uid` for singles, `team_uid` for couples (branching logic) | `team_id` always (universal team model, no branching) |
| Entity kind | `"participant"` or `"team"` on `StandingsRow` | Not needed — always a team (solo is team of size 1) |
| Distance unit | `float` km, rounded to 3 decimals | `integer` meters; rounding preserved for forward compatibility |
| Standings storage | Stored on `ProjectDocument.standings`, recomputed on mutation | Never stored; computed on demand from `SeasonState` |
| Exclusions storage | `ProjectDocument.ranking_exclusions` tuple | `SeasonState.exclusions` map, projected from `ranking.eligibility_set` events |
| Exclusions application | In `ranking_display.py` (modifies rows in place) | Pure functions in `exclusions.ts` (returns new arrays) |
| Standings enrichment | `standings_view.py` resolves display name, YOB, club from `ProjectDocument` | Separate presentation layer (not part of this feature) |

### Reusable logic (direct port)

- **Aggregation algorithm**: identical top-N selection with same tie-break rule.
- **Sort order**: identical (points desc, distance desc, entity ID asc).
- **Sequential ranking**: identical (no shared ranks).
- **Exclusion filtering**: identical (remove excluded, renumber).
- **Distance rounding**: same `round(sum * factor) / factor` pattern.

### Not ported here (downstream concerns)

- `build_standings_rows_for_category` (display enrichment with names, YOB, club) — becomes a presentation-layer function that joins `StandingsRow` with the person/team registries. Separate from ranking computation.
- `recompute_project_standings` (attaching snapshot to document) — eliminated; standings are computed on demand.
- Identity merge exclusion propagation (`merge_ranking_exclusions_after_identity_merge`) — identity merge is out of scope for v1 (F-TS01).

---

## Risks and Assumptions

- **Assumption:** At most one entry per team per race event. The engine does not deduplicate; if violated, both entries contribute. This is a data integrity invariant enforced at event validation time (F-TS01).
- **Assumption:** Integer meters (`distance_m`) eliminates floating-point aggregation issues that the Python version mitigates with km rounding. The `distance_decimals` parameter is retained for forward compatibility but is effectively a no-op for integer inputs.
- **Risk:** The Python version's `entity_kind` distinction (`"participant"` vs `"team"`) is used in serialized standings snapshots and tests. If the TS port needs to export data compatible with the Python version, a mapping layer may be needed.
  - Mitigation: The TS port is a standalone app; it does not need wire compatibility with the Python version. Fixture-based tests verify logical equivalence, not structural identity.
- **Risk:** Category key format change (`"<year>:<dur>:<div>"` → `"<dur>:<div>"`) means standings from the two versions are not directly comparable by key.
  - Mitigation: Accepted — the TS port is a new system. Cross-version comparison uses semantic equivalence (same duration + division), not string keys.
- **Risk:** Future rulesets may require fundamentally different aggregation strategies (e.g., weighted races, drop-worst instead of pick-best).
  - Mitigation: The `Ruleset` interface and module boundary allow swapping in new implementations. The `computeStandings` function delegates to `aggregateTopN` which can be replaced per-ruleset. The key design point is that `computeStandings` is parameterized, not hard-coded.

## Implementation Steps

1. Define `Ruleset` interface and `RULESET_STUNDENLAUF_V1` constant in `rules.ts`.
2. Define output types (`StandingsSnapshot`, `CategoryStandingsTable`, `StandingsRow`, `RaceContribution`, `TopNAggregation`) in `types.ts`.
3. Implement `aggregateTopN` in `aggregation.ts` with selection, summation, and rounding.
4. Implement helper functions: `getEffectiveRaces`, `entitiesInCategory`, `collectRaceRows` in `engine.ts`.
5. Implement `computeStandings` in `engine.ts`: category iteration, per-team aggregation, sorting, rank assignment.
6. Implement `applyExclusions`, `markExclusions`, `exclusionsForCategory` in `exclusions.ts`.
7. Write unit tests for `aggregateTopN`: ≤N races, >N races, tie-breaking, distance rounding.
8. Write unit tests for `computeStandings`: multi-category, sorting, sequential ranks, empty categories, rolled-back races.
9. Write unit tests for exclusion functions: filtering, renumbering, mark-only mode.
10. Write integration tests with realistic `SeasonState` fixtures: import → standings → exclusion → re-standings.
11. Port key Python ranking test scenarios to verify behavioral parity.

## Test Plan

- **Unit (aggregation.ts):**
  - ≤4 race rows → all selected, none dropped.
  - 5 race rows → top 4 by points selected, lowest dropped.
  - 6 race rows → top 4 selected, 2 dropped.
  - Tie on points → lower `race_event_id` wins selection.
  - Distance rounding: sum of selected distances rounded to 3 decimal places.
  - `n=1`: only best race counts.
  - Empty input → zero totals, no selections.

- **Unit (engine.ts):**
  - Single category, 3 teams, 3 races → correct totals and rank 1/2/3.
  - Points tie → higher distance wins.
  - Points and distance tie → lower `team_id` wins (deterministic).
  - Two categories → two separate tables, independently ranked.
  - Rolled-back race → excluded from computation.
  - Rolled-back import batch → all its races excluded.
  - `entry.corrected` changes points → standings reflect corrected value.
  - `entry.reassigned` moves entry → standings reflect new team assignment.
  - Team with no effective entries → not in standings.
  - Empty season → empty snapshot (no tables).

- **Unit (exclusions.ts):**
  - `applyExclusions`: excluded team removed, ranks renumbered 1…n.
  - `applyExclusions` with no exclusions → unchanged.
  - `markExclusions`: excluded team gets `rank: null, excluded: true`; eligible teams get sequential ranks.
  - Multiple exclusions in one category.

- **Integration:**
  - Build a `SeasonState` from a sequence of events (persons, teams, races), compute standings, verify against expected output.
  - Apply exclusions, verify filtered output.
  - Rollback a race, recompute, verify the rolled-back race's contributions are gone.

- **Cross-version parity:**
  - For a fixed set of race results, verify that the TS engine produces the same rankings, totals, and top-N selections as the Python engine (modulo structural differences like `entity_kind` and distance units).

## Definition of Done

- [ ] Code implemented in TypeScript
- [ ] Tests added/updated and passing (Vitest)
- [ ] Types are strict (no `any` escapes without justification)
- [ ] Docs updated
- [ ] Entry added to `packages/stundenlauf-ts/docs/ACCOMPLISHMENTS.md`
- [ ] Requirement/milestone status updated in `packages/stundenlauf-ts/PROJECT_PLAN.md`

## Links

- Python source reference(s):
  - `backend/ranking/engine.py` — `compute_standings_snapshot`, `recompute_project_standings` (main engine)
  - `backend/ranking/aggregation.py` — `sum_top_n_or_all_points_and_distance`, `TopNAggregation` (top-N selection and summation)
  - `backend/ranking/rules.py` — `Ruleset`, `RULESET_V1_LEGACY_TOP4`, `default_ruleset_v1` (ruleset definition)
  - `backend/ranking/__init__.py` — public API surface
  - `backend/domain/models.py` — `StandingsSnapshot`, `CategoryStandingsTable`, `StandingsRow`, `RaceContribution`, `RaceSeriesCategory`
  - `backend/domain/enums.py` — `RaceDuration`, `Division`, `RaceEventState`
  - `backend/standings_view.py` — `build_standings_rows_for_category` (display enrichment, not ported here)
  - `backend/ui_api/ranking_display.py` — `apply_ranking_exclusions_to_rows`, `ranking_exclusion_set`, `update_ranking_exclusions`
  - `backend/ui_api/queries.py` — `get_standings`, `get_category_current_results_table` (standings query with exclusions)
  - `tests/test_f04_ranking.py` — Python test suite (aggregation, engine, integration)
  - `tests/test_f15_ranking_display.py` — exclusion display tests
