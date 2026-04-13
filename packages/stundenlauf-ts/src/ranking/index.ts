/**
 * Public API for the ranking engine.
 *
 * Reference: F-TS04 §12 (Module Structure)
 */

// Types
export type {
  RaceRow,
  TopNAggregation,
  RaceContribution,
  StandingsRow,
  CategoryStandingsTable,
  StandingsSnapshot,
  StandingsRowWithExclusion,
  CategoryStandingsTableWithExclusions,
} from "./types.ts";

// Ruleset
export type { Ruleset } from "./rules.ts";
export { RULESET_STUNDENLAUF_V1 } from "./rules.ts";

// Aggregation
export { aggregateTopN } from "./aggregation.ts";

// Engine
export { computeStandings } from "./engine.ts";

// Exclusions
export { exclusionsForCategory, applyExclusions, markExclusions } from "./exclusions.ts";
