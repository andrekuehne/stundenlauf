import { describe, expect, it } from "vitest";
import { emptySeasonState } from "@/domain/projection.ts";
import type { ParsedWorkbook } from "@/ingestion/types.ts";
import { defaultMatchingConfig } from "@/matching/config.ts";
import { buildImportTrace } from "@/devtools/import-harness-trace.ts";

function makeWorkbook(overrides?: Partial<ParsedWorkbook>): ParsedWorkbook {
  return {
    meta: {
      source_file: "trace-test.xlsx",
      source_sha256: `sha-${crypto.randomUUID().slice(0, 8)}`,
      parser_version: "f-ts02-v1",
      schema_fingerprint: "fp",
      file_mtime: 0,
      imported_at: new Date().toISOString(),
    },
    singles_sections: [],
    couples_sections: [],
    ...overrides,
  };
}

describe("buildImportTrace", () => {
  it("captures progressive pool enrichment across sections", async () => {
    const state = emptySeasonState("s1");
    const parsed = makeWorkbook({
      singles_sections: [
        {
          context: { race_no: 1, duration: "hour", division: "men", event_date: null },
          rows: [
            { startnr: "1", name: "Müller, Max", yob: 1990, club: "LG A", distance_km: 10, points: 8 },
          ],
        },
        {
          context: { race_no: 1, duration: "half_hour", division: "men", event_date: null },
          rows: [
            { startnr: "2", name: "Müller, Max", yob: 1990, club: "LG A", distance_km: 5, points: 4 },
          ],
        },
      ],
    });

    const config = defaultMatchingConfig({
      auto_merge_enabled: true,
      auto_min: 0.5,
      review_min: 0.3,
    });

    const trace = await buildImportTrace(parsed, state, config);
    expect(trace).toHaveLength(2);
    expect(trace[0]!.pool_before.person_count).toBe(0);
    expect(trace[0]!.pool_before.team_count).toBe(0);
    expect(trace[1]!.pool_before.person_count).toBe(1);
    expect(trace[1]!.pool_before.team_count).toBe(1);
  });

  it("maps incoming row and decision details for solo rows", async () => {
    const state = emptySeasonState("s1");
    const parsed = makeWorkbook({
      singles_sections: [
        {
          context: { race_no: 3, duration: "hour", division: "women", event_date: "2026-03-01" },
          rows: [
            { startnr: "7", name: "Beispiel, Erika", yob: 1988, club: "LG Demo", distance_km: 11.2, points: 9 },
          ],
        },
      ],
    });

    const trace = await buildImportTrace(parsed, state, defaultMatchingConfig());
    const section = trace[0]!;
    const row = section.rows[0]!;

    expect(section.division).toBe("women");
    expect(row.startnr).toBe("7");
    expect(row.display_name).toBe("Beispiel, Erika");
    expect(row.row_kind).toBe("solo");
    expect(row.yob_text).toBe("1988");
    expect(row.club_text).toBe("LG Demo");
    expect(row.route).toBe("new_identity");
    expect(row.new_person_ids.length).toBe(1);
    expect(row.new_team_ids.length).toBe(1);
  });
});
