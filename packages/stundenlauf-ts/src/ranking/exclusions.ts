/**
 * Ranking exclusion presentation logic ("außer Wertung").
 *
 * Exclusions are projected into SeasonState from `ranking.eligibility_set` events.
 * The ranking engine itself computes standings for ALL teams. These functions
 * apply exclusion logic as a presentation-layer concern after computation.
 *
 * Reference: F-TS04 §11 (Ranking Exclusions)
 */

import type { SeasonState } from "@/domain/types.ts";
import type {
  CategoryStandingsTable,
  StandingsRow,
  StandingsRowWithExclusion,
  CategoryStandingsTableWithExclusions,
} from "./types.ts";

/**
 * Resolve the set of excluded team IDs for a category from SeasonState.
 */
export function exclusionsForCategory(state: SeasonState, categoryKey: string): Set<string> {
  return state.exclusions.get(categoryKey) ?? new Set();
}

/**
 * Eligible-only view: remove excluded teams and renumber ranks sequentially.
 */
export function applyExclusions(
  table: CategoryStandingsTable,
  excludedTeamIds: Set<string>,
): CategoryStandingsTable {
  const eligible: StandingsRow[] = [];
  for (const row of table.rows) {
    if (excludedTeamIds.has(row.team_id)) continue;
    eligible.push({ ...row, rank: eligible.length + 1 });
  }
  return { ...table, rows: eligible };
}

/**
 * Full view with exclusion markers: excluded teams get `rank: null` and
 * `excluded: true`; eligible teams get sequential ranks.
 */
export function markExclusions(
  table: CategoryStandingsTable,
  excludedTeamIds: Set<string>,
): CategoryStandingsTableWithExclusions {
  let eligibleRank = 0;
  const rows: StandingsRowWithExclusion[] = table.rows.map((row) => {
    const excluded = excludedTeamIds.has(row.team_id);
    return {
      ...row,
      excluded,
      rank: excluded ? null : ++eligibleRank,
    };
  });
  return { category_key: table.category_key, rows };
}
