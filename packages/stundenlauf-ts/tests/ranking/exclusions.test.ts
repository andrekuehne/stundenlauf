import { describe, it, expect } from "vitest";
import { exclusionsForCategory, applyExclusions, markExclusions } from "@/ranking/exclusions.ts";
import type { CategoryStandingsTable, StandingsRow } from "@/ranking/types.ts";
import type { SeasonState } from "@/domain/types.ts";
import { emptySeasonState } from "@/domain/projection.ts";

function makeRow(teamId: string, rank: number, points: number): StandingsRow {
  return {
    team_id: teamId,
    total_points: points,
    total_distance_m: points * 500,
    rank,
    race_contributions: [],
  };
}

function makeTable(rows: StandingsRow[]): CategoryStandingsTable {
  return { category_key: "hour:men", rows };
}

describe("exclusionsForCategory", () => {
  it("returns the exclusion set for a known category", () => {
    const state: SeasonState = {
      ...emptySeasonState("test"),
      exclusions: new Map([["hour:men", new Set(["team-x", "team-y"])]]),
    };
    const result = exclusionsForCategory(state, "hour:men");
    expect(result).toEqual(new Set(["team-x", "team-y"]));
  });

  it("returns empty set for unknown category", () => {
    const state = emptySeasonState("test");
    const result = exclusionsForCategory(state, "hour:men");
    expect(result.size).toBe(0);
  });
});

describe("applyExclusions", () => {
  it("removes excluded teams and renumbers ranks", () => {
    const table = makeTable([
      makeRow("team-a", 1, 30),
      makeRow("team-b", 2, 25),
      makeRow("team-c", 3, 20),
      makeRow("team-d", 4, 15),
    ]);

    const result = applyExclusions(table, new Set(["team-b"]));

    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]!.team_id).toBe("team-a");
    expect(result.rows[0]!.rank).toBe(1);
    expect(result.rows[1]!.team_id).toBe("team-c");
    expect(result.rows[1]!.rank).toBe(2);
    expect(result.rows[2]!.team_id).toBe("team-d");
    expect(result.rows[2]!.rank).toBe(3);
  });

  it("returns unchanged table when no exclusions", () => {
    const table = makeTable([makeRow("team-a", 1, 30), makeRow("team-b", 2, 25)]);

    const result = applyExclusions(table, new Set());

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.rank).toBe(1);
    expect(result.rows[1]!.rank).toBe(2);
    expect(result.rows[0]!.team_id).toBe("team-a");
    expect(result.rows[1]!.team_id).toBe("team-b");
  });

  it("handles multiple exclusions", () => {
    const table = makeTable([
      makeRow("team-a", 1, 30),
      makeRow("team-b", 2, 25),
      makeRow("team-c", 3, 20),
      makeRow("team-d", 4, 15),
    ]);

    const result = applyExclusions(table, new Set(["team-a", "team-c"]));

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.team_id).toBe("team-b");
    expect(result.rows[0]!.rank).toBe(1);
    expect(result.rows[1]!.team_id).toBe("team-d");
    expect(result.rows[1]!.rank).toBe(2);
  });

  it("returns empty rows when all teams are excluded", () => {
    const table = makeTable([makeRow("team-a", 1, 30)]);
    const result = applyExclusions(table, new Set(["team-a"]));
    expect(result.rows).toHaveLength(0);
  });

  it("preserves category_key", () => {
    const table: CategoryStandingsTable = {
      category_key: "half_hour:women",
      rows: [makeRow("team-a", 1, 10)],
    };
    const result = applyExclusions(table, new Set());
    expect(result.category_key).toBe("half_hour:women");
  });
});

describe("markExclusions", () => {
  it("marks excluded teams with rank null and excluded true", () => {
    const table = makeTable([
      makeRow("team-a", 1, 30),
      makeRow("team-b", 2, 25),
      makeRow("team-c", 3, 20),
    ]);

    const result = markExclusions(table, new Set(["team-b"]));

    expect(result.rows).toHaveLength(3);

    expect(result.rows[0]!.team_id).toBe("team-a");
    expect(result.rows[0]!.excluded).toBe(false);
    expect(result.rows[0]!.rank).toBe(1);

    expect(result.rows[1]!.team_id).toBe("team-b");
    expect(result.rows[1]!.excluded).toBe(true);
    expect(result.rows[1]!.rank).toBeNull();

    expect(result.rows[2]!.team_id).toBe("team-c");
    expect(result.rows[2]!.excluded).toBe(false);
    expect(result.rows[2]!.rank).toBe(2);
  });

  it("handles no exclusions — all eligible", () => {
    const table = makeTable([makeRow("team-a", 1, 30), makeRow("team-b", 2, 25)]);

    const result = markExclusions(table, new Set());

    expect(result.rows[0]!.excluded).toBe(false);
    expect(result.rows[0]!.rank).toBe(1);
    expect(result.rows[1]!.excluded).toBe(false);
    expect(result.rows[1]!.rank).toBe(2);
  });

  it("handles multiple exclusions with correct renumbering", () => {
    const table = makeTable([
      makeRow("team-a", 1, 40),
      makeRow("team-b", 2, 35),
      makeRow("team-c", 3, 30),
      makeRow("team-d", 4, 25),
      makeRow("team-e", 5, 20),
    ]);

    const result = markExclusions(table, new Set(["team-b", "team-d"]));

    expect(result.rows[0]!).toMatchObject({ team_id: "team-a", rank: 1, excluded: false });
    expect(result.rows[1]!).toMatchObject({ team_id: "team-b", rank: null, excluded: true });
    expect(result.rows[2]!).toMatchObject({ team_id: "team-c", rank: 2, excluded: false });
    expect(result.rows[3]!).toMatchObject({ team_id: "team-d", rank: null, excluded: true });
    expect(result.rows[4]!).toMatchObject({ team_id: "team-e", rank: 3, excluded: false });
  });

  it("preserves category_key", () => {
    const table: CategoryStandingsTable = {
      category_key: "hour:couples_mixed",
      rows: [makeRow("team-a", 1, 10)],
    };
    const result = markExclusions(table, new Set());
    expect(result.category_key).toBe("hour:couples_mixed");
  });
});
