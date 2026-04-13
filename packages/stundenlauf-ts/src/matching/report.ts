/**
 * Matching report aggregation.
 *
 * Direct port of backend/matching/report.py.
 * Reference: F-TS03 §12 (Import Report)
 */

import type { MatchingReport } from "./types.ts";

export function emptyMatchingReport(): MatchingReport {
  return {
    auto_links: 0,
    review_queue: 0,
    new_identities: 0,
    conflicts: 0,
    replay_overrides: 0,
    candidate_counts: [],
  };
}

export function aggregateMatchingReports(
  reports: Iterable<MatchingReport>,
): MatchingReport {
  const items = [...reports];
  if (items.length === 0) return emptyMatchingReport();

  const counts: number[] = [];
  for (const r of items) {
    counts.push(...r.candidate_counts);
  }

  return {
    auto_links: items.reduce((s, r) => s + r.auto_links, 0),
    review_queue: items.reduce((s, r) => s + r.review_queue, 0),
    new_identities: items.reduce((s, r) => s + r.new_identities, 0),
    conflicts: items.reduce((s, r) => s + r.conflicts, 0),
    replay_overrides: items.reduce((s, r) => s + r.replay_overrides, 0),
    candidate_counts: counts,
  };
}
