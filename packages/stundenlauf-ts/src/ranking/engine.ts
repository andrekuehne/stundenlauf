/**
 * Ranking engine: compute standings from SeasonState.
 * Implements the stundenlauf_v1 ruleset (top-4 selection, scoring, sorting).
 *
 * Reference: F-TS04 §3–§10 (Effective Entries through Main Engine Function)
 */

import type { SeasonState, RaceEvent } from "@/domain/types.ts";
import { categoryKey, isEffectiveRace } from "@/domain/projection.ts";
import { aggregateTopN } from "./aggregation.ts";
import { RULESET_STUNDENLAUF_V1 } from "./rules.ts";
import type { Ruleset } from "./rules.ts";
import type {
  RaceRow,
  RaceContribution,
  StandingsRow,
  CategoryStandingsTable,
  StandingsSnapshot,
} from "./types.ts";

function getEffectiveRaces(state: SeasonState): RaceEvent[] {
  const result: RaceEvent[] = [];
  for (const [raceEventId, race] of state.race_events) {
    if (isEffectiveRace(state, raceEventId)) {
      result.push(race);
    }
  }
  return result;
}

function discoverCategories(races: readonly RaceEvent[]): string[] {
  const keys = new Set<string>();
  for (const race of races) {
    keys.add(categoryKey(race.category));
  }
  return [...keys].sort();
}

function entitiesInCategory(races: readonly RaceEvent[], catKey: string): string[] {
  const teamIds = new Set<string>();
  for (const race of races) {
    if (categoryKey(race.category) !== catKey) continue;
    for (const entry of race.entries) {
      teamIds.add(entry.team_id);
    }
  }
  return [...teamIds].sort();
}

function collectRaceRows(races: readonly RaceEvent[], catKey: string, teamId: string): RaceRow[] {
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

/**
 * Compute standings for all categories from the current SeasonState.
 *
 * Pure function — no side effects, no I/O. Produces identical output for
 * identical inputs (deterministic).
 */
export function computeStandings(
  state: SeasonState,
  ruleset?: Ruleset,
  calculatedAt?: string,
): StandingsSnapshot {
  const rs = ruleset ?? RULESET_STUNDENLAUF_V1;
  const ts = calculatedAt ?? new Date().toISOString();

  const effectiveRaces = getEffectiveRaces(state);
  const catKeys = discoverCategories(effectiveRaces);

  const tables: CategoryStandingsTable[] = [];

  for (const catKey of catKeys) {
    const teamIds = entitiesInCategory(effectiveRaces, catKey);
    const rows: StandingsRow[] = [];

    for (const teamId of teamIds) {
      const raceRows = collectRaceRows(effectiveRaces, catKey, teamId);
      if (raceRows.length === 0) continue;

      const agg = aggregateTopN(raceRows, rs.top_n, rs.distance_decimals);
      const selectedSet = new Set(agg.selected_race_ids);

      const contributions: RaceContribution[] = raceRows
        .sort((a, b) => (a.race_event_id < b.race_event_id ? -1 : 1))
        .map((r) => ({
          race_event_id: r.race_event_id,
          points: r.points,
          distance_m: r.distance_m,
          counts_toward_total: selectedSet.has(r.race_event_id),
        }));

      rows.push({
        team_id: teamId,
        total_points: agg.total_points,
        total_distance_m: agg.total_distance_m,
        rank: 0,
        race_contributions: contributions,
      });
    }

    rows.sort((a, b) => {
      if (a.total_points !== b.total_points) return b.total_points - a.total_points;
      if (a.total_distance_m !== b.total_distance_m) return b.total_distance_m - a.total_distance_m;
      return a.team_id < b.team_id ? -1 : 1;
    });

    const ranked: StandingsRow[] = rows.map((row, i) => ({ ...row, rank: i + 1 }));

    if (ranked.length > 0) {
      tables.push({ category_key: catKey, rows: ranked });
    }
  }

  return {
    ruleset_version: rs.version_id,
    calculated_at: ts,
    category_tables: tables,
  };
}
