/**
 * Output types for the ranking engine.
 *
 * Reference: F-TS04 §8–§9 (Standings Row, Table, Snapshot)
 */

/** A single race's points/distance for one team — input to aggregation. */
export interface RaceRow {
  readonly race_event_id: string;
  readonly points: number;
  readonly distance_m: number;
}

/** Result of top-N aggregation for one team in one category. */
export interface TopNAggregation {
  readonly total_points: number;
  readonly total_distance_m: number;
  readonly selected_race_ids: readonly string[];
  readonly dropped_race_ids: readonly string[];
}

/** One race's contribution toward a team's standings total. */
export interface RaceContribution {
  readonly race_event_id: string;
  readonly points: number;
  readonly distance_m: number;
  readonly counts_toward_total: boolean;
}

/** One row in a category standings table. */
export interface StandingsRow {
  readonly team_id: string;
  readonly total_points: number;
  readonly total_distance_m: number;
  readonly rank: number;
  readonly race_contributions: readonly RaceContribution[];
}

/** Standings for a single category. */
export interface CategoryStandingsTable {
  readonly category_key: string;
  readonly rows: readonly StandingsRow[];
}

/** Full computed standings snapshot for all categories. */
export interface StandingsSnapshot {
  readonly ruleset_version: string;
  readonly calculated_at: string;
  readonly category_tables: readonly CategoryStandingsTable[];
}

/** A standings row annotated with exclusion status (for admin/detail views). */
export interface StandingsRowWithExclusion {
  readonly team_id: string;
  readonly total_points: number;
  readonly total_distance_m: number;
  readonly rank: number | null;
  readonly race_contributions: readonly RaceContribution[];
  readonly excluded: boolean;
}

/** Standings table with exclusion markers on each row. */
export interface CategoryStandingsTableWithExclusions {
  readonly category_key: string;
  readonly rows: readonly StandingsRowWithExclusion[];
}
