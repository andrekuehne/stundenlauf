import { describe, it, expect, beforeEach } from "vitest";
import { projectState } from "@/domain/projection.ts";
import { computeStandings } from "@/ranking/engine.ts";
import { RULESET_STUNDENLAUF_V1 } from "@/ranking/rules.ts";
import type { DomainEvent } from "@/domain/events.ts";
import {
  resetSeqCounter,
  importBatchRecorded,
  personRegistered,
  teamRegistered,
  raceRegistered,
  raceRolledBack,
  importBatchRolledBack,
  entryCorrected,
  entryReassigned,
  defaultCategory,
  defaultEntry,
} from "../helpers/event-factories.ts";

const SEASON_ID = "test-season";
const FIXED_TS = "2026-04-13T12:00:00.000Z";

function buildState(events: DomainEvent[]) {
  return projectState(SEASON_ID, events);
}

/** Create a batch + race with entries in one go. */
function raceWithEntries(opts: {
  batchId: string;
  raceId: string;
  category?: {
    duration: "half_hour" | "hour";
    division: "men" | "women" | "couples_men" | "couples_women" | "couples_mixed";
  };
  raceNo?: number;
  entries: { entryId: string; teamId: string; points: number; distance_m: number }[];
}) {
  const cat = opts.category ?? defaultCategory();
  return [
    importBatchRecorded({ import_batch_id: opts.batchId }),
    raceRegistered({
      race_event_id: opts.raceId,
      import_batch_id: opts.batchId,
      category: cat,
      race_no: opts.raceNo ?? 1,
      entries: opts.entries.map((e) =>
        defaultEntry({
          entry_id: e.entryId,
          team_id: e.teamId,
          points: e.points,
          distance_m: e.distance_m,
        }),
      ),
    }),
  ];
}

beforeEach(() => {
  resetSeqCounter();
});

describe("computeStandings", () => {
  it("produces correct totals and ranks for 3 teams across 3 races", () => {
    const events: DomainEvent[] = [
      // Team registrations
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "team-a", member_person_ids: ["p1"], team_kind: "solo" }),
      personRegistered({ person_id: "p2" }),
      teamRegistered({ team_id: "team-b", member_person_ids: ["p2"], team_kind: "solo" }),
      personRegistered({ person_id: "p3" }),
      teamRegistered({ team_id: "team-c", member_person_ids: ["p3"], team_kind: "solo" }),

      // Race 1
      ...raceWithEntries({
        batchId: "b1",
        raceId: "race-1",
        entries: [
          { entryId: "e1a", teamId: "team-a", points: 10, distance_m: 5000 },
          { entryId: "e1b", teamId: "team-b", points: 8, distance_m: 4000 },
          { entryId: "e1c", teamId: "team-c", points: 6, distance_m: 3000 },
        ],
      }),

      // Race 2
      ...raceWithEntries({
        batchId: "b2",
        raceId: "race-2",
        raceNo: 2,
        entries: [
          { entryId: "e2a", teamId: "team-a", points: 12, distance_m: 6000 },
          { entryId: "e2b", teamId: "team-b", points: 10, distance_m: 5000 },
          { entryId: "e2c", teamId: "team-c", points: 8, distance_m: 4000 },
        ],
      }),

      // Race 3
      ...raceWithEntries({
        batchId: "b3",
        raceId: "race-3",
        raceNo: 3,
        entries: [
          { entryId: "e3a", teamId: "team-a", points: 8, distance_m: 4000 },
          { entryId: "e3b", teamId: "team-b", points: 12, distance_m: 6000 },
          { entryId: "e3c", teamId: "team-c", points: 10, distance_m: 5000 },
        ],
      }),
    ];

    const state = buildState(events);
    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);

    expect(snap.ruleset_version).toBe("stundenlauf_v1");
    expect(snap.calculated_at).toBe(FIXED_TS);
    expect(snap.category_tables).toHaveLength(1);

    const table = snap.category_tables[0]!;
    expect(table.category_key).toBe("hour:men");
    expect(table.rows).toHaveLength(3);

    // team-a: 10+12+8 = 30 pts, 15000m
    expect(table.rows[0]!.team_id).toBe("team-a");
    expect(table.rows[0]!.total_points).toBe(30);
    expect(table.rows[0]!.total_distance_m).toBe(15000);
    expect(table.rows[0]!.rank).toBe(1);

    // team-b: 8+10+12 = 30 pts, 15000m — same as team-a, tie-break by team_id
    expect(table.rows[1]!.team_id).toBe("team-b");
    expect(table.rows[1]!.total_points).toBe(30);
    expect(table.rows[1]!.rank).toBe(2);

    // team-c: 6+8+10 = 24 pts, 12000m
    expect(table.rows[2]!.team_id).toBe("team-c");
    expect(table.rows[2]!.total_points).toBe(24);
    expect(table.rows[2]!.total_distance_m).toBe(12000);
    expect(table.rows[2]!.rank).toBe(3);
  });

  it("breaks points tie by distance (higher distance wins)", () => {
    const events: DomainEvent[] = [
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "team-a", member_person_ids: ["p1"], team_kind: "solo" }),
      personRegistered({ person_id: "p2" }),
      teamRegistered({ team_id: "team-b", member_person_ids: ["p2"], team_kind: "solo" }),

      ...raceWithEntries({
        batchId: "b1",
        raceId: "race-1",
        entries: [
          { entryId: "e1a", teamId: "team-a", points: 10, distance_m: 5000 },
          { entryId: "e1b", teamId: "team-b", points: 10, distance_m: 6000 },
        ],
      }),
    ];

    const state = buildState(events);
    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);
    const rows = snap.category_tables[0]!.rows;

    expect(rows[0]!.team_id).toBe("team-b");
    expect(rows[0]!.rank).toBe(1);
    expect(rows[1]!.team_id).toBe("team-a");
    expect(rows[1]!.rank).toBe(2);
  });

  it("breaks full tie (same points + distance) by team_id ascending", () => {
    const events: DomainEvent[] = [
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "team-b", member_person_ids: ["p1"], team_kind: "solo" }),
      personRegistered({ person_id: "p2" }),
      teamRegistered({ team_id: "team-a", member_person_ids: ["p2"], team_kind: "solo" }),

      ...raceWithEntries({
        batchId: "b1",
        raceId: "race-1",
        entries: [
          { entryId: "e1a", teamId: "team-b", points: 10, distance_m: 5000 },
          { entryId: "e1b", teamId: "team-a", points: 10, distance_m: 5000 },
        ],
      }),
    ];

    const state = buildState(events);
    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);
    const rows = snap.category_tables[0]!.rows;

    expect(rows[0]!.team_id).toBe("team-a");
    expect(rows[0]!.rank).toBe(1);
    expect(rows[1]!.team_id).toBe("team-b");
    expect(rows[1]!.rank).toBe(2);
  });

  it("produces separate tables for two categories", () => {
    const events: DomainEvent[] = [
      personRegistered({ person_id: "p1", gender: "M" }),
      teamRegistered({ team_id: "team-m", member_person_ids: ["p1"], team_kind: "solo" }),
      personRegistered({ person_id: "p2", gender: "F" }),
      teamRegistered({ team_id: "team-w", member_person_ids: ["p2"], team_kind: "solo" }),

      ...raceWithEntries({
        batchId: "b1",
        raceId: "race-men-1",
        category: { duration: "hour", division: "men" },
        entries: [{ entryId: "e1", teamId: "team-m", points: 10, distance_m: 5000 }],
      }),

      ...raceWithEntries({
        batchId: "b2",
        raceId: "race-women-1",
        category: { duration: "hour", division: "women" },
        entries: [{ entryId: "e2", teamId: "team-w", points: 12, distance_m: 6000 }],
      }),
    ];

    const state = buildState(events);
    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);

    expect(snap.category_tables).toHaveLength(2);
    const keys = snap.category_tables.map((t) => t.category_key);
    expect(keys).toContain("hour:men");
    expect(keys).toContain("hour:women");

    const menTable = snap.category_tables.find((t) => t.category_key === "hour:men")!;
    expect(menTable.rows).toHaveLength(1);
    expect(menTable.rows[0]!.team_id).toBe("team-m");

    const womenTable = snap.category_tables.find((t) => t.category_key === "hour:women")!;
    expect(womenTable.rows).toHaveLength(1);
    expect(womenTable.rows[0]!.team_id).toBe("team-w");
  });

  it("selects top 4 when a team has >4 races", () => {
    const events: DomainEvent[] = [
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "team-a", member_person_ids: ["p1"], team_kind: "solo" }),
    ];

    const points = [10, 8, 12, 6, 14];
    for (let i = 0; i < 5; i++) {
      events.push(
        ...raceWithEntries({
          batchId: `b${i}`,
          raceId: `race-${i}`,
          raceNo: i + 1,
          entries: [
            {
              entryId: `e${i}`,
              teamId: "team-a",
              points: points[i]!,
              distance_m: points[i]! * 500,
            },
          ],
        }),
      );
    }

    const state = buildState(events);
    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);
    const row = snap.category_tables[0]!.rows[0]!;

    // Top 4: 14 + 12 + 10 + 8 = 44
    expect(row.total_points).toBe(44);
    expect(row.race_contributions).toHaveLength(5);

    const dropped = row.race_contributions.filter((c) => !c.counts_toward_total);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.points).toBe(6);

    const counted = row.race_contributions.filter((c) => c.counts_toward_total);
    expect(counted).toHaveLength(4);
  });

  it("excludes rolled-back races from standings", () => {
    const events: DomainEvent[] = [
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "team-a", member_person_ids: ["p1"], team_kind: "solo" }),

      ...raceWithEntries({
        batchId: "b1",
        raceId: "race-1",
        entries: [{ entryId: "e1", teamId: "team-a", points: 10, distance_m: 5000 }],
      }),

      ...raceWithEntries({
        batchId: "b2",
        raceId: "race-2",
        raceNo: 2,
        entries: [{ entryId: "e2", teamId: "team-a", points: 8, distance_m: 4000 }],
      }),

      raceRolledBack({ race_event_id: "race-2", reason: "data error" }),
    ];

    const state = buildState(events);
    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);
    const row = snap.category_tables[0]!.rows[0]!;

    expect(row.total_points).toBe(10);
    expect(row.total_distance_m).toBe(5000);
    expect(row.race_contributions).toHaveLength(1);
  });

  it("excludes all races from a rolled-back import batch", () => {
    const events: DomainEvent[] = [
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "team-a", member_person_ids: ["p1"], team_kind: "solo" }),

      ...raceWithEntries({
        batchId: "b1",
        raceId: "race-1",
        entries: [{ entryId: "e1", teamId: "team-a", points: 10, distance_m: 5000 }],
      }),

      ...raceWithEntries({
        batchId: "b2",
        raceId: "race-2",
        raceNo: 2,
        entries: [{ entryId: "e2", teamId: "team-a", points: 8, distance_m: 4000 }],
      }),

      importBatchRolledBack({ import_batch_id: "b2", reason: "wrong file" }),
    ];

    const state = buildState(events);
    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);

    expect(snap.category_tables).toHaveLength(1);
    const row = snap.category_tables[0]!.rows[0]!;
    expect(row.total_points).toBe(10);
    expect(row.race_contributions).toHaveLength(1);
  });

  it("reflects entry.corrected changes in standings", () => {
    const events: DomainEvent[] = [
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "team-a", member_person_ids: ["p1"], team_kind: "solo" }),

      ...raceWithEntries({
        batchId: "b1",
        raceId: "race-1",
        entries: [{ entryId: "e1", teamId: "team-a", points: 10, distance_m: 5000 }],
      }),

      entryCorrected({
        entry_id: "e1",
        race_event_id: "race-1",
        updated_fields: { points: 15, distance_m: 7500 },
        rationale: "timing error",
      }),
    ];

    const state = buildState(events);
    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);
    const row = snap.category_tables[0]!.rows[0]!;

    expect(row.total_points).toBe(15);
    expect(row.total_distance_m).toBe(7500);
  });

  it("reflects entry.reassigned in standings (entry moves to new team)", () => {
    const events: DomainEvent[] = [
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "team-a", member_person_ids: ["p1"], team_kind: "solo" }),
      personRegistered({ person_id: "p2" }),
      teamRegistered({ team_id: "team-b", member_person_ids: ["p2"], team_kind: "solo" }),

      ...raceWithEntries({
        batchId: "b1",
        raceId: "race-1",
        entries: [
          { entryId: "e1", teamId: "team-a", points: 10, distance_m: 5000 },
          { entryId: "e2", teamId: "team-b", points: 8, distance_m: 4000 },
        ],
      }),

      entryReassigned({
        entry_id: "e1",
        race_event_id: "race-1",
        from_team_id: "team-a",
        to_team_id: "team-b",
        rationale: "wrong match",
      }),
    ];

    const state = buildState(events);
    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);
    const rows = snap.category_tables[0]!.rows;

    // team-b now has both entries: 10 + 8 = 18
    const teamB = rows.find((r) => r.team_id === "team-b");
    expect(teamB).toBeDefined();
    expect(teamB!.total_points).toBe(18);
    expect(teamB!.race_contributions).toHaveLength(2);

    // team-a has no entries left, should not appear
    expect(rows.find((r) => r.team_id === "team-a")).toBeUndefined();
  });

  it("produces empty snapshot for empty season", () => {
    const state = buildState([]);
    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);

    expect(snap.category_tables).toHaveLength(0);
    expect(snap.ruleset_version).toBe("stundenlauf_v1");
  });

  it("omits teams with 0 effective entries", () => {
    const events: DomainEvent[] = [
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "team-a", member_person_ids: ["p1"], team_kind: "solo" }),

      ...raceWithEntries({
        batchId: "b1",
        raceId: "race-1",
        entries: [{ entryId: "e1", teamId: "team-a", points: 10, distance_m: 5000 }],
      }),

      raceRolledBack({ race_event_id: "race-1", reason: "all data bad" }),
    ];

    const state = buildState(events);
    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);

    expect(snap.category_tables).toHaveLength(0);
  });

  it("is deterministic — same state produces identical output", () => {
    const events: DomainEvent[] = [
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "team-a", member_person_ids: ["p1"], team_kind: "solo" }),
      personRegistered({ person_id: "p2" }),
      teamRegistered({ team_id: "team-b", member_person_ids: ["p2"], team_kind: "solo" }),

      ...raceWithEntries({
        batchId: "b1",
        raceId: "race-1",
        entries: [
          { entryId: "e1", teamId: "team-a", points: 10, distance_m: 5000 },
          { entryId: "e2", teamId: "team-b", points: 10, distance_m: 5000 },
        ],
      }),
    ];

    const state = buildState(events);
    const snap1 = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);
    const snap2 = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);

    expect(snap1).toEqual(snap2);
  });

  it("race contributions are sorted by race_event_id ascending", () => {
    const events: DomainEvent[] = [
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "team-a", member_person_ids: ["p1"], team_kind: "solo" }),

      ...raceWithEntries({
        batchId: "b1",
        raceId: "race-c",
        entries: [{ entryId: "e1", teamId: "team-a", points: 10, distance_m: 5000 }],
      }),
      ...raceWithEntries({
        batchId: "b2",
        raceId: "race-a",
        raceNo: 2,
        entries: [{ entryId: "e2", teamId: "team-a", points: 8, distance_m: 4000 }],
      }),
      ...raceWithEntries({
        batchId: "b3",
        raceId: "race-b",
        raceNo: 3,
        entries: [{ entryId: "e3", teamId: "team-a", points: 12, distance_m: 6000 }],
      }),
    ];

    const state = buildState(events);
    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);
    const contribs = snap.category_tables[0]!.rows[0]!.race_contributions;

    expect(contribs.map((c) => c.race_event_id)).toEqual(["race-a", "race-b", "race-c"]);
  });

  it("uses default ruleset when none provided", () => {
    const events: DomainEvent[] = [
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "team-a", member_person_ids: ["p1"], team_kind: "solo" }),
      ...raceWithEntries({
        batchId: "b1",
        raceId: "race-1",
        entries: [{ entryId: "e1", teamId: "team-a", points: 10, distance_m: 5000 }],
      }),
    ];

    const state = buildState(events);
    const snap = computeStandings(state);

    expect(snap.ruleset_version).toBe("stundenlauf_v1");
    expect(snap.category_tables).toHaveLength(1);
  });

  it("category tables are sorted by category key", () => {
    const events: DomainEvent[] = [
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "t1", member_person_ids: ["p1"], team_kind: "solo" }),
      personRegistered({ person_id: "p2" }),
      teamRegistered({ team_id: "t2", member_person_ids: ["p2"], team_kind: "solo" }),

      ...raceWithEntries({
        batchId: "b1",
        raceId: "r-women",
        category: { duration: "hour", division: "women" },
        entries: [{ entryId: "e1", teamId: "t1", points: 10, distance_m: 5000 }],
      }),
      ...raceWithEntries({
        batchId: "b2",
        raceId: "r-hh-men",
        category: { duration: "half_hour", division: "men" },
        entries: [{ entryId: "e2", teamId: "t2", points: 8, distance_m: 4000 }],
      }),
      ...raceWithEntries({
        batchId: "b3",
        raceId: "r-men",
        category: { duration: "hour", division: "men" },
        entries: [{ entryId: "e3", teamId: "t2", points: 12, distance_m: 6000 }],
      }),
    ];

    const state = buildState(events);
    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);

    const keys = snap.category_tables.map((t) => t.category_key);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });
});
