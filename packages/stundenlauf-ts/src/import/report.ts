/**
 * Import report accumulation helpers.
 *
 * Reference: F-TS05 §8 (Import Report)
 */

import type { MatchingReport } from "@/matching/types.ts";
import type { ImportReport } from "./types.ts";

export function emptyImportReport(): ImportReport {
  return {
    auto_links: 0,
    review_items: 0,
    new_identities: 0,
    conflicts: 0,
    replay_overrides: 0,
    rows_imported: 0,
    sections_imported: 0,
    events_emitted: 0,
  };
}

export function mergeMatchingReport(
  target: ImportReport,
  source: MatchingReport,
  rowCount: number,
): ImportReport {
  return {
    ...target,
    auto_links: target.auto_links + source.auto_links,
    review_items: target.review_items + source.review_queue,
    new_identities: target.new_identities + source.new_identities,
    conflicts: target.conflicts + source.conflicts,
    replay_overrides: target.replay_overrides + source.replay_overrides,
    rows_imported: target.rows_imported + rowCount,
    sections_imported: target.sections_imported + 1,
  };
}
