import { describe, it, expect } from "vitest";
import { aggregateTopN } from "@/ranking/aggregation.ts";
import type { RaceRow } from "@/ranking/types.ts";

function row(id: string, points: number, distance_m: number): RaceRow {
  return { race_event_id: id, points, distance_m };
}

describe("aggregateTopN", () => {
  describe("selection count", () => {
    it("selects all when rows <= n", () => {
      const rows = [row("r1", 10, 5000), row("r2", 8, 4000), row("r3", 6, 3000)];
      const agg = aggregateTopN(rows, 4, 3);
      expect(agg.selected_race_ids).toHaveLength(3);
      expect(agg.dropped_race_ids).toHaveLength(0);
      expect(agg.total_points).toBe(24);
      expect(agg.total_distance_m).toBe(12000);
    });

    it("selects exactly n=4 when rows = 4", () => {
      const rows = [
        row("r1", 10, 5000),
        row("r2", 8, 4000),
        row("r3", 6, 3000),
        row("r4", 4, 2000),
      ];
      const agg = aggregateTopN(rows, 4, 3);
      expect(agg.selected_race_ids).toHaveLength(4);
      expect(agg.dropped_race_ids).toHaveLength(0);
      expect(agg.total_points).toBe(28);
    });

    it("drops the lowest when 5 rows, n=4", () => {
      const rows = [
        row("r1", 10, 5000),
        row("r2", 8, 4000),
        row("r3", 6, 3000),
        row("r4", 4, 2000),
        row("r5", 2, 1000),
      ];
      const agg = aggregateTopN(rows, 4, 3);
      expect(agg.selected_race_ids).toEqual(["r1", "r2", "r3", "r4"]);
      expect(agg.dropped_race_ids).toEqual(["r5"]);
      expect(agg.total_points).toBe(28);
      expect(agg.total_distance_m).toBe(14000);
    });

    it("drops 2 when 6 rows, n=4", () => {
      const rows = [
        row("r1", 12, 6000),
        row("r2", 10, 5000),
        row("r3", 8, 4000),
        row("r4", 6, 3000),
        row("r5", 4, 2000),
        row("r6", 2, 1000),
      ];
      const agg = aggregateTopN(rows, 4, 3);
      expect(agg.selected_race_ids).toEqual(["r1", "r2", "r3", "r4"]);
      expect(agg.dropped_race_ids).toEqual(["r5", "r6"]);
      expect(agg.total_points).toBe(36);
    });
  });

  describe("tie-breaking on points", () => {
    it("prefers lower race_event_id when points are equal", () => {
      const rows = [
        row("r3", 10, 3000),
        row("r1", 10, 5000),
        row("r2", 10, 4000),
        row("r4", 10, 2000),
        row("r5", 10, 1000),
      ];
      const agg = aggregateTopN(rows, 4, 3);
      expect(agg.selected_race_ids).toEqual(["r1", "r2", "r3", "r4"]);
      expect(agg.dropped_race_ids).toEqual(["r5"]);
    });

    it("mixed points and ties: highest points first, then lower id", () => {
      const rows = [row("r_b", 8, 3000), row("r_a", 8, 4000), row("r_c", 10, 5000)];
      const agg = aggregateTopN(rows, 2, 3);
      expect(agg.selected_race_ids).toEqual(["r_c", "r_a"]);
      expect(agg.dropped_race_ids).toEqual(["r_b"]);
    });
  });

  describe("distance rounding", () => {
    it("rounds to 3 decimal places", () => {
      const rows = [row("r1", 10, 1111), row("r2", 8, 2222), row("r3", 6, 3333)];
      const agg = aggregateTopN(rows, 4, 3);
      expect(agg.total_distance_m).toBe(6666);
    });

    it("rounds correctly with fractional meter inputs (forward compat)", () => {
      const rows = [
        { race_event_id: "r1", points: 10, distance_m: 1000.1234 },
        { race_event_id: "r2", points: 8, distance_m: 2000.5678 },
      ];
      const agg = aggregateTopN(rows, 4, 3);
      expect(agg.total_distance_m).toBe(3000.691);
    });

    it("handles 0 decimal places", () => {
      const rows = [
        { race_event_id: "r1", points: 10, distance_m: 1234.567 },
        { race_event_id: "r2", points: 8, distance_m: 2345.678 },
      ];
      const agg = aggregateTopN(rows, 4, 0);
      expect(agg.total_distance_m).toBe(3580);
    });
  });

  describe("n=1", () => {
    it("selects only the best race", () => {
      const rows = [row("r1", 5, 2000), row("r2", 10, 5000), row("r3", 7, 3000)];
      const agg = aggregateTopN(rows, 1, 3);
      expect(agg.selected_race_ids).toEqual(["r2"]);
      expect(agg.dropped_race_ids).toEqual(["r3", "r1"]);
      expect(agg.total_points).toBe(10);
      expect(agg.total_distance_m).toBe(5000);
    });
  });

  describe("empty input", () => {
    it("returns zero totals and empty arrays", () => {
      const agg = aggregateTopN([], 4, 3);
      expect(agg.total_points).toBe(0);
      expect(agg.total_distance_m).toBe(0);
      expect(agg.selected_race_ids).toEqual([]);
      expect(agg.dropped_race_ids).toEqual([]);
    });
  });

  describe("n < 1", () => {
    it("throws an error", () => {
      expect(() => aggregateTopN([row("r1", 10, 5000)], 0, 3)).toThrow("n must be >= 1");
      expect(() => aggregateTopN([], -1, 3)).toThrow("n must be >= 1");
    });
  });

  describe("single row", () => {
    it("selects the sole race", () => {
      const agg = aggregateTopN([row("r1", 15, 8000)], 4, 3);
      expect(agg.selected_race_ids).toEqual(["r1"]);
      expect(agg.dropped_race_ids).toEqual([]);
      expect(agg.total_points).toBe(15);
      expect(agg.total_distance_m).toBe(8000);
    });
  });
});
