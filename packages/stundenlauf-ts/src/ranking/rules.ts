/**
 * Ruleset abstraction for configurable ranking behavior.
 *
 * Reference: F-TS04 §1 (Ruleset Abstraction)
 */

export interface Ruleset {
  readonly version_id: string;
  readonly top_n: number;
  readonly distance_decimals: number;
  readonly primary_sort: "points_desc";
  readonly tie_break: "distance_desc";
}

export const RULESET_STUNDENLAUF_V1: Ruleset = {
  version_id: "stundenlauf_v1",
  top_n: 4,
  distance_decimals: 3,
  primary_sort: "points_desc",
  tie_break: "distance_desc",
};
