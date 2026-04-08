# Feature Plan: Ranking Rules and Standings

## Overview

- Feature name: Ranking rules and standings
- Owner: TBD
- Status: Planned
- Related requirement(s): R5
- Related milestone(s): M3

## Problem Statement

The app must produce cumulative standings from multiple races using configurable and potentially evolving scoring rules.
Results must remain transparent and reproducible across recalculations.

## Scope

### In Scope

- Define and implement an initial v1 ruleset based on the legacy implementation.
- Compute cumulative points and cumulative distance per participant/team.
- Generate deterministic standings per category (30/60 min, men/women/pairs).
- Expose explainability fields so users can understand score composition and rank order.
- Prepare ruleset versioning so future rule changes are possible without breaking reproducibility.
- Recompute standings deterministically when race events are rolled back and corrected versions are re-imported.

### Out of Scope

- Public web publishing of standings.
- Highly custom scripting language for rules in v1.

## Legacy Ruleset (v1 Baseline)

Source of truth for initial behavior: legacy `calculate_totals(df)` implementation in deprecated code.

The initial scoring and ranking rules for v1 are:

1. Identify all per-race points columns (`Punkte *`) and per-race distance columns (`Distanz *`) for each row.
2. For points total (`Punkte gesamt`):
   - If 4 or fewer non-empty race values exist, sum all available values.
   - If more than 4 values exist, sum only the best 4 values.
3. For distance total (`Distanz gesamt`):
   - Apply the same "best 4 or all available" rule as points.
   - Round final total distance to 2 decimal places.
4. Rank ordering:
   - Primary sort key: `Punkte gesamt` descending.
   - Secondary sort key (tie-break): `Distanz gesamt` descending.
5. Placement assignment:
   - After sorting, assign sequential places starting at 1.
   - No shared-place logic in v1 (equal totals still receive consecutive place numbers based on stable ordering).

Notes for implementation:

- "Best 4" means numerically highest values only; missing entries are ignored.
- The same aggregation and ranking logic applies to each category-specific standings table.
- This document only carries over scoring behavior from legacy code; ingestion/matching behavior remains defined in other feature plans.

## Acceptance Criteria

- [ ] Standings recalculate deterministically after each race import and merge.
- [ ] v1 scoring follows the legacy baseline rules described above ("best 4 or all available").
- [ ] Ranking order is deterministic using points first and distance as tie-break.
- [ ] Output includes per-participant/team cumulative totals and enough detail to explain placement.
- [ ] Ruleset version can be persisted and used for reproducible historical recalculation.

## Technical Plan

- Architecture/approach:
  - Implement a deterministic ranking engine that consumes normalized race results from F02/F03 outputs.
  - Keep ranking computation pure (input data + ruleset version => standings).
- Data model/API changes:
  - Add `ruleset_version` to standings computation metadata.
  - Add standings projection fields for:
    - selected race values contributing to totals,
    - dropped race values (when more than 4 exist),
    - `punkte_gesamt`, `distanz_gesamt`, `platz`.
  - Include trace metadata for UI drilldown (`participant_uid`/`team_uid`, contributing `race_event_uid` list).
- Migration/defaulting:
  - Default to `ruleset_version = v1_legacy_top4` for existing datasets.
- Performance/reliability concerns:
  - Stable sort for deterministic placement under equal keys.
  - Explicit null handling for missing per-race values.
  - Recalculation target under KPI: < 2 seconds for typical season size (from project plan).

## Risks and Assumptions

- Assumption: Legacy scoring behavior is accepted as the initial official baseline.
- Assumption: Upstream data is normalized before ranking (name/team matching already resolved).
- Risk: Mid-season rule adjustments cause disputes.
  - Mitigation: immutable calculated snapshots tagged by `ruleset_version`.
- Risk: Differences between legacy spreadsheet behavior and code implementation.
  - Mitigation: golden-master tests against curated legacy outputs.

## Implementation Steps

1. Define ruleset contract
   - Introduce `Ruleset` abstraction with version id, aggregation policy, sort/tie-break policy.
   - Register `v1_legacy_top4`.
2. Build aggregation primitives
   - Implement reusable helper: "sum top N or all available".
   - Implement selection metadata (which race values counted vs dropped).
   - Apply numeric rounding policy for cumulative distance.
3. Build standings pipeline
   - Compute totals for each entity in each category.
   - Sort by points desc, then distance desc, with stable order.
   - Assign sequential placement.
4. Expose explainability output
   - Include totals, selected races, dropped races, and tie-break-relevant values in result DTO/table.
5. Integrate with recalculation triggers
   - Recompute standings after race import/merge completion.
   - Recompute standings after race rollback and corrected-race reimport completion.
   - Store/retrieve results with `ruleset_version`.
6. Add quality gates
   - Unit tests for aggregation and ordering behavior.
   - Integration replay tests for multi-race seasons.
7. Documentation and progress updates
   - Update docs and add accomplishment entry when implementation is complete.
   - Mark requirement/milestone progress in `PROJECT_PLAN.md` when done.

## Test Plan

### Unit Test Cases (Scoring Logic)

- `top4_all_available_when_count_le_4`
  - Input: 1-4 non-null points/distances.
  - Expectation: total equals sum of all available values.
- `top4_only_best_values_when_count_gt_4`
  - Input: 5+ values with mixed magnitudes.
  - Expectation: total equals sum of largest 4 values.
- `top4_ignores_missing_values`
  - Input: values with null gaps.
  - Expectation: nulls excluded from selection and sum.
- `distance_total_rounded_to_2_decimals`
  - Input: decimal distances that produce >2 decimal output.
  - Expectation: `distanz_gesamt` rounded to 2 decimals.

### Unit Test Cases (Ranking Logic)

- `rank_sorts_by_points_desc_then_distance_desc`
  - Input: rows with deliberate points and distance combinations.
  - Expectation: primary points ordering, secondary distance tie-break ordering.
- `rank_assigns_sequential_places_starting_at_1`
  - Input: sorted/unsorted sample set.
  - Expectation: places are 1..N in output order.
- `rank_is_deterministic_for_equal_sort_keys`
  - Input: rows with equal points and equal distance.
  - Expectation: stable deterministic ordering and repeatable place assignment.

### Integration Test Cases

- `season_replay_matches_legacy_reference_v1`
  - Input: curated historical season data + expected standings snapshot from legacy process.
  - Expectation: computed standings equal reference for totals and ordering.
- `recalculation_after_new_race_updates_standings`
  - Input: initial season standings, then append one race.
  - Expectation: standings recomputed correctly with same ruleset version.
- `recalculation_after_race_rollback_removes_contribution`
  - Input: season standings with race N active, then rollback race N.
  - Expectation: totals/ranks reflect exclusion of that race while preserving deterministic ordering.
- `recalculation_after_corrected_race_reimport_uses_new_event`
  - Input: rollback race N, import corrected race N.
  - Expectation: standings include corrected event values only, and trace metadata references new `race_event_uid`.
- `category_isolation_for_standings`
  - Input: mixed categories (30/60, men/women/pairs).
  - Expectation: each category has independent totals and ranks.

### Manual/Regression Checks

- Compare exported standings with organizer-validated sample sheets.
- Verify explainability fields allow tracing "why this place" for at least 5 random entries.
- Confirm rerun reproducibility with unchanged input and ruleset version.
- Confirm race rollback and corrected reimport sequence remains explainable in standings trace view.

### Rollback Strategy

- Keep previous ruleset implementations and stored snapshots.
- Re-run historical standings by selecting prior `ruleset_version`.

## Definition of Done

- [ ] Code implemented
- [ ] Tests added/updated and passing
- [ ] Docs updated
- [ ] Entry added to `docs/ACCOMPLISHMENTS.md`
- [ ] Requirement/milestone status updated in `PROJECT_PLAN.md`

## Links

- PR(s): TBD
- Related issue(s): TBD
- Release notes: TBD
