import { describe, expect, it } from "vitest";
import {
  aggregateMatchingReports,
  emptyMatchingReport,
} from "@/matching/report.ts";
import type { MatchingReport } from "@/matching/types.ts";

describe("emptyMatchingReport", () => {
  it("returns zeroed report", () => {
    const r = emptyMatchingReport();
    expect(r.auto_links).toBe(0);
    expect(r.review_queue).toBe(0);
    expect(r.new_identities).toBe(0);
    expect(r.conflicts).toBe(0);
    expect(r.replay_overrides).toBe(0);
    expect(r.candidate_counts).toEqual([]);
  });
});

describe("aggregateMatchingReports", () => {
  it("sums all fields", () => {
    const a: MatchingReport = {
      auto_links: 3,
      review_queue: 1,
      new_identities: 2,
      conflicts: 0,
      replay_overrides: 1,
      candidate_counts: [5, 3],
    };
    const b: MatchingReport = {
      auto_links: 2,
      review_queue: 0,
      new_identities: 1,
      conflicts: 1,
      replay_overrides: 0,
      candidate_counts: [4],
    };
    const result = aggregateMatchingReports([a, b]);
    expect(result.auto_links).toBe(5);
    expect(result.review_queue).toBe(1);
    expect(result.new_identities).toBe(3);
    expect(result.conflicts).toBe(1);
    expect(result.replay_overrides).toBe(1);
    expect(result.candidate_counts).toEqual([5, 3, 4]);
  });

  it("returns empty for no reports", () => {
    const result = aggregateMatchingReports([]);
    expect(result.auto_links).toBe(0);
    expect(result.candidate_counts).toEqual([]);
  });
});
