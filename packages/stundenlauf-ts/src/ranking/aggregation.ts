/**
 * Top-N aggregation for the ranking engine.
 *
 * Port of Python `backend/ranking/aggregation.py` — `sum_top_n_or_all_points_and_distance`.
 *
 * Reference: F-TS04 §6 (Top-N Aggregation)
 */

import type { RaceRow, TopNAggregation } from "./types.ts";

/**
 * Select the best `n` races by points (or all if fewer than `n`), sum their
 * points and distances, and round the distance total.
 *
 * Selection tie-break: when two races have equal points, the one with the
 * lexicographically smaller `race_event_id` is preferred (matches Python).
 *
 * @throws {Error} if `n < 1`
 */
export function aggregateTopN(
  rows: readonly RaceRow[],
  n: number,
  distanceDecimals: number,
): TopNAggregation {
  if (n < 1) {
    throw new Error("n must be >= 1");
  }

  if (rows.length === 0) {
    return {
      total_points: 0,
      total_distance_m: 0,
      selected_race_ids: [],
      dropped_race_ids: [],
    };
  }

  const sorted = [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.race_event_id < b.race_event_id ? -1 : 1;
  });

  const selected = sorted.slice(0, n);
  const dropped = sorted.slice(n);

  const totalPoints = selected.reduce((sum, r) => sum + r.points, 0);
  const totalDistance = selected.reduce((sum, r) => sum + r.distance_m, 0);
  const factor = 10 ** distanceDecimals;
  const roundedDistance = Math.round(totalDistance * factor) / factor;

  return {
    total_points: totalPoints,
    total_distance_m: roundedDistance,
    selected_race_ids: selected.map((r) => r.race_event_id),
    dropped_race_ids: dropped.map((r) => r.race_event_id),
  };
}
