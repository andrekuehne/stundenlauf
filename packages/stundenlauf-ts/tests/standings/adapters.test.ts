import { describe, expect, it } from "vitest";
import type { SeasonState } from "@/domain/types.ts";
import {
  buildCategoryOptions,
  buildImportedRunsRows,
  buildRaceOverviewModel,
  buildStandingsRows,
} from "@/components/standings/adapters.ts";

function sampleState(): SeasonState {
  return {
    season_id: "s1",
    persons: new Map([
      [
        "p1",
        {
          person_id: "p1",
          given_name: "Max",
          family_name: "Müller",
          display_name: "Max Müller",
          name_normalized: "max|muller",
          yob: 1990,
          gender: "M",
          club: "LG A",
          club_normalized: "lg a",
        },
      ],
      [
        "p2",
        {
          person_id: "p2",
          given_name: "Tom",
          family_name: "Schmidt",
          display_name: "Tom Schmidt",
          name_normalized: "tom|schmidt",
          yob: 1991,
          gender: "M",
          club: "LG B",
          club_normalized: "lg b",
        },
      ],
    ]),
    teams: new Map([
      ["t1", { team_id: "t1", member_person_ids: ["p1"], team_kind: "solo" }],
      ["t2", { team_id: "t2", member_person_ids: ["p2"], team_kind: "solo" }],
    ]),
    import_batches: new Map([
      [
        "b1",
        {
          import_batch_id: "b1",
          source_file: "race.xlsx",
          source_sha256: "sha",
          parser_version: "1",
          state: "active",
        },
      ],
    ]),
    race_events: new Map([
      [
        "r1",
        {
          race_event_id: "r1",
          import_batch_id: "b1",
          category: { duration: "hour", division: "men" },
          race_no: 1,
          race_date: "2026-04-01",
          state: "active",
          imported_at: "2026-04-01T00:00:00.000Z",
          entries: [
            {
              entry_id: "e1",
              startnr: "1",
              team_id: "t1",
              distance_m: 11000,
              points: 12,
              incoming: {
                display_name: "Max Müller",
                yob: 1990,
                yob_text: null,
                club: "LG A",
                row_kind: "solo",
                sheet_name: "sheet",
                section_name: "sec",
                row_index: 0,
              },
              resolution: { method: "manual", confidence: 0.9, candidate_count: 1 },
            },
            {
              entry_id: "e2",
              startnr: "2",
              team_id: "t2",
              distance_m: 10000,
              points: 10,
              incoming: {
                display_name: "Tom Schmidt",
                yob: 1991,
                yob_text: null,
                club: "LG B",
                row_kind: "solo",
                sheet_name: "sheet",
                section_name: "sec",
                row_index: 1,
              },
              resolution: { method: "manual", confidence: 0.8, candidate_count: 1 },
            },
          ],
        },
      ],
    ]),
    exclusions: new Map([["hour:men", new Set(["t2"])]]),
  };
}

describe("standings adapters", () => {
  it("builds category options and imported runs", () => {
    const state = sampleState();
    expect(buildCategoryOptions(state)).toHaveLength(1);
    expect(buildImportedRunsRows(state)).toHaveLength(1);
  });

  it("marks excluded teams in standings rows", () => {
    const rows = buildStandingsRows(sampleState(), "hour:men");
    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.excluded)).toBe(true);
  });

  it("builds race overview columns and values", () => {
    const overview = buildRaceOverviewModel(sampleState(), "hour:men");
    expect(overview.raceColumns).toEqual(["r1"]);
    expect(overview.rows).toHaveLength(2);
  });
});
