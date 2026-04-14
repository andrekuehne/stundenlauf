/**
 * Integration tests for the full ranking pipeline:
 *   events → project state → compute standings → apply exclusions
 *
 * Tests build realistic SeasonState from event sequences and verify
 * end-to-end behavior including rollback recomputation and cross-version parity.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { projectState, applyEvent } from "@/domain/projection.ts";
import { computeStandings } from "@/ranking/engine.ts";
import { applyExclusions, markExclusions, exclusionsForCategory } from "@/ranking/exclusions.ts";
import { RULESET_STUNDENLAUF_V1 } from "@/ranking/rules.ts";
import type { DomainEvent } from "@/domain/events.ts";
import {
  resetSeqCounter,
  importBatchRecorded,
  personRegistered,
  teamRegistered,
  raceRegistered,
  raceRolledBack,
  rankingEligibilitySet,
  defaultCategory,
  defaultEntry,
} from "../helpers/event-factories.ts";

const SEASON_ID = "integration-test";
const FIXED_TS = "2026-04-13T15:00:00.000Z";

beforeEach(() => {
  resetSeqCounter();
});

describe("integration: realistic season", () => {
  /**
   * Scenario: 3 runners, 5 races (hour:men), top-4 selection, one exclusion.
   *
   * Points layout (designed so each runner has distinct top-4 totals):
   *   Race  | Alice(team-alice) | Bob(team-bob) | Carol(team-carol)
   *   r1    | 10                | 8             | 12
   *   r2    | 12                | 14            | 6
   *   r3    | 8                 | 10            | 14
   *   r4    | 14                | 6             | 10
   *   r5    | 6                 | 12            | 8
   *
   * Top-4 per runner (drop lowest):
   *   Alice: 14+12+10+8 = 44  (drop 6)
   *   Bob:   14+12+10+8 = 44  (drop 6)
   *   Carol: 14+12+10+8 = 44  (drop 6)
   *
   * All tied at 44 points. Distance used for secondary tie-break.
   */
  function buildRealisticEvents(): DomainEvent[] {
    const raceData = [
      {
        raceId: "r1",
        batchId: "b1",
        alice: { pts: 10, dist: 5200 },
        bob: { pts: 8, dist: 4100 },
        carol: { pts: 12, dist: 6300 },
      },
      {
        raceId: "r2",
        batchId: "b2",
        alice: { pts: 12, dist: 6100 },
        bob: { pts: 14, dist: 7200 },
        carol: { pts: 6, dist: 3100 },
      },
      {
        raceId: "r3",
        batchId: "b3",
        alice: { pts: 8, dist: 4200 },
        bob: { pts: 10, dist: 5100 },
        carol: { pts: 14, dist: 7300 },
      },
      {
        raceId: "r4",
        batchId: "b4",
        alice: { pts: 14, dist: 7100 },
        bob: { pts: 6, dist: 3200 },
        carol: { pts: 10, dist: 5300 },
      },
      {
        raceId: "r5",
        batchId: "b5",
        alice: { pts: 6, dist: 3100 },
        bob: { pts: 12, dist: 6200 },
        carol: { pts: 8, dist: 4100 },
      },
    ];

    const events: DomainEvent[] = [
      personRegistered({
        person_id: "p-alice",
        given_name: "Alice",
        family_name: "Schmidt",
        gender: "F",
      }),
      teamRegistered({ team_id: "team-alice", member_person_ids: ["p-alice"], team_kind: "solo" }),
      personRegistered({
        person_id: "p-bob",
        given_name: "Bob",
        family_name: "Müller",
        gender: "M",
      }),
      teamRegistered({ team_id: "team-bob", member_person_ids: ["p-bob"], team_kind: "solo" }),
      personRegistered({
        person_id: "p-carol",
        given_name: "Carol",
        family_name: "Fischer",
        gender: "F",
      }),
      teamRegistered({ team_id: "team-carol", member_person_ids: ["p-carol"], team_kind: "solo" }),
    ];

    for (let i = 0; i < raceData.length; i++) {
      const rd = raceData[i]!;
      events.push(importBatchRecorded({ import_batch_id: rd.batchId }));
      events.push(
        raceRegistered({
          race_event_id: rd.raceId,
          import_batch_id: rd.batchId,
          category: defaultCategory(),
          race_no: i + 1,
          entries: [
            defaultEntry({
              entry_id: `e${i}-alice`,
              team_id: "team-alice",
              points: rd.alice.pts,
              distance_m: rd.alice.dist,
            }),
            defaultEntry({
              entry_id: `e${i}-bob`,
              team_id: "team-bob",
              points: rd.bob.pts,
              distance_m: rd.bob.dist,
            }),
            defaultEntry({
              entry_id: `e${i}-carol`,
              team_id: "team-carol",
              points: rd.carol.pts,
              distance_m: rd.carol.dist,
            }),
          ],
        }),
      );
    }

    return events;
  }

  it("computes correct standings for a 5-race season with top-4 selection", () => {
    const events = buildRealisticEvents();
    const state = projectState(SEASON_ID, events);
    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);

    expect(snap.category_tables).toHaveLength(1);
    const table = snap.category_tables[0]!;
    expect(table.rows).toHaveLength(3);

    // All three have 44 points. Tie-break by distance:
    // Alice top-4 distances: r4(7100) + r2(6100) + r1(5200) + r3(4200) = 22600
    // Bob top-4 distances:   r2(7200) + r5(6200) + r3(5100) + r1(4100) = 22600
    // Carol top-4 distances: r3(7300) + r1(6300) + r4(5300) + r5(4100) = 23000
    //
    // Carol has highest distance → rank 1
    // Alice and Bob tied at 22600 → team_id tie-break: team-alice < team-bob
    for (const row of table.rows) {
      expect(row.total_points).toBe(44);
    }

    expect(table.rows[0]!.team_id).toBe("team-carol");
    expect(table.rows[0]!.total_distance_m).toBe(23000);
    expect(table.rows[0]!.rank).toBe(1);

    expect(table.rows[1]!.team_id).toBe("team-alice");
    expect(table.rows[1]!.total_distance_m).toBe(22600);
    expect(table.rows[1]!.rank).toBe(2);

    expect(table.rows[2]!.team_id).toBe("team-bob");
    expect(table.rows[2]!.total_distance_m).toBe(22600);
    expect(table.rows[2]!.rank).toBe(3);

    // Each runner should have 1 dropped race
    for (const row of table.rows) {
      expect(row.race_contributions).toHaveLength(5);
      const dropped = row.race_contributions.filter((c) => !c.counts_toward_total);
      expect(dropped).toHaveLength(1);
      expect(dropped[0]!.points).toBe(6);
    }
  });

  it("applies exclusions to computed standings", () => {
    const events = buildRealisticEvents();
    const state = projectState(SEASON_ID, events);
    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);
    const table = snap.category_tables[0]!;

    const eligible = applyExclusions(table, new Set(["team-carol"]));
    expect(eligible.rows).toHaveLength(2);
    expect(eligible.rows[0]!.team_id).toBe("team-alice");
    expect(eligible.rows[0]!.rank).toBe(1);
    expect(eligible.rows[1]!.team_id).toBe("team-bob");
    expect(eligible.rows[1]!.rank).toBe(2);
  });

  it("marks exclusions in full standings view", () => {
    const events = buildRealisticEvents();
    const state = projectState(SEASON_ID, events);
    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);
    const table = snap.category_tables[0]!;

    const marked = markExclusions(table, new Set(["team-carol"]));
    expect(marked.rows).toHaveLength(3);

    expect(marked.rows[0]!).toMatchObject({ team_id: "team-carol", excluded: true, rank: null });
    expect(marked.rows[1]!).toMatchObject({ team_id: "team-alice", excluded: false, rank: 1 });
    expect(marked.rows[2]!).toMatchObject({ team_id: "team-bob", excluded: false, rank: 2 });
  });

  it("exclusionsForCategory integrates with event-projected state", () => {
    const events = [
      ...buildRealisticEvents(),
      rankingEligibilitySet({
        category: defaultCategory(),
        team_id: "team-bob",
        eligible: false,
      }),
    ];

    const state = projectState(SEASON_ID, events);
    const excluded = exclusionsForCategory(state, "hour:men");
    expect(excluded).toEqual(new Set(["team-bob"]));

    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);
    const eligible = applyExclusions(snap.category_tables[0]!, excluded);

    expect(eligible.rows).toHaveLength(2);
    expect(eligible.rows.find((r) => r.team_id === "team-bob")).toBeUndefined();
  });

  it("rollback removes race contributions and changes standings", () => {
    const events = buildRealisticEvents();
    let state = projectState(SEASON_ID, events);
    const snapBefore = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);

    // All three runners had 44 points. Rollback race r2 (batch b2):
    //   Alice loses 12 pts race → top-4 of remaining 4 races: 10+8+14+6 = 38
    //   Bob loses 14 pts race → top-4 of remaining 4 races: 8+10+6+12 = 36
    //   Carol loses 6 pts race → top-4 of remaining 4 races: 12+14+10+8 = 44
    const rollbackEvent = raceRolledBack({ race_event_id: "r2", reason: "data error" });
    state = applyEvent(state, rollbackEvent);

    const snapAfter = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);
    const table = snapAfter.category_tables[0]!;

    expect(table.rows[0]!.team_id).toBe("team-carol");
    expect(table.rows[0]!.total_points).toBe(44);

    expect(table.rows[1]!.team_id).toBe("team-alice");
    expect(table.rows[1]!.total_points).toBe(38);

    expect(table.rows[2]!.team_id).toBe("team-bob");
    expect(table.rows[2]!.total_points).toBe(36);

    // Verify no contributions from r2
    for (const row of table.rows) {
      expect(row.race_contributions.find((c) => c.race_event_id === "r2")).toBeUndefined();
    }

    // Verify before had more contributions
    expect(snapBefore.category_tables[0]!.rows[0]!.race_contributions).toHaveLength(5);
    expect(table.rows[0]!.race_contributions).toHaveLength(4);
  });
});

describe("cross-version parity", () => {
  /**
   * Verify that the TS engine produces the same aggregation results as the
   * Python engine for a known fixture. Values computed from the Python
   * aggregation function with identical inputs.
   *
   * Python: sum_top_n_or_all_points_and_distance(
   *   (("race_1", 15.0, 7.5), ("race_2", 12.0, 6.0), ("race_3", 10.0, 5.0),
   *    ("race_4", 8.0, 4.0), ("race_5", 5.0, 2.5)),
   *   n=4, distance_decimals=3
   * )
   * → punkte_gesamt=45.0, distanz_gesamt=22.5,
   *   selected=("race_1","race_2","race_3","race_4"), dropped=("race_5",)
   *
   * In the TS port, distances are in meters (multiply km by 1000):
   *   7500, 6000, 5000, 4000, 2500 → selected total = 22500
   */
  it("matches Python aggregation output for a 5-race fixture", () => {
    const events: DomainEvent[] = [
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "t1", member_person_ids: ["p1"], team_kind: "solo" }),
    ];

    const races = [
      { id: "race_1", pts: 15, dist: 7500 },
      { id: "race_2", pts: 12, dist: 6000 },
      { id: "race_3", pts: 10, dist: 5000 },
      { id: "race_4", pts: 8, dist: 4000 },
      { id: "race_5", pts: 5, dist: 2500 },
    ];

    for (let i = 0; i < races.length; i++) {
      const r = races[i]!;
      const batchId = `batch_${i}`;
      events.push(importBatchRecorded({ import_batch_id: batchId }));
      events.push(
        raceRegistered({
          race_event_id: r.id,
          import_batch_id: batchId,
          category: defaultCategory(),
          race_no: i + 1,
          entries: [
            defaultEntry({ entry_id: `e_${i}`, team_id: "t1", points: r.pts, distance_m: r.dist }),
          ],
        }),
      );
    }

    const state = projectState(SEASON_ID, events);
    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);

    expect(snap.category_tables).toHaveLength(1);
    const row = snap.category_tables[0]!.rows[0]!;

    // Python: 45.0 points, 22.5 km = 22500 m
    expect(row.total_points).toBe(45);
    expect(row.total_distance_m).toBe(22500);

    // Same top-4 selection
    const counted = row.race_contributions.filter((c) => c.counts_toward_total);
    expect(counted.map((c) => c.race_event_id).sort()).toEqual([
      "race_1",
      "race_2",
      "race_3",
      "race_4",
    ]);

    const dropped = row.race_contributions.filter((c) => !c.counts_toward_total);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.race_event_id).toBe("race_5");
  });

  it("matches Python sort order: points desc, distance desc, entity_id asc", () => {
    const events: DomainEvent[] = [
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "team-z", member_person_ids: ["p1"], team_kind: "solo" }),
      personRegistered({ person_id: "p2" }),
      teamRegistered({ team_id: "team-a", member_person_ids: ["p2"], team_kind: "solo" }),
      personRegistered({ person_id: "p3" }),
      teamRegistered({ team_id: "team-m", member_person_ids: ["p3"], team_kind: "solo" }),

      importBatchRecorded({ import_batch_id: "b1" }),
      raceRegistered({
        race_event_id: "race-1",
        import_batch_id: "b1",
        category: defaultCategory(),
        race_no: 1,
        entries: [
          defaultEntry({ entry_id: "e1", team_id: "team-z", points: 10, distance_m: 5000 }),
          defaultEntry({ entry_id: "e2", team_id: "team-a", points: 10, distance_m: 5000 }),
          defaultEntry({ entry_id: "e3", team_id: "team-m", points: 10, distance_m: 5000 }),
        ],
      }),
    ];

    const state = projectState(SEASON_ID, events);
    const snap = computeStandings(state, RULESET_STUNDENLAUF_V1, FIXED_TS);
    const ids = snap.category_tables[0]!.rows.map((r) => r.team_id);

    // All same points + distance → alphabetical team_id
    expect(ids).toEqual(["team-a", "team-m", "team-z"]);
  });
});
