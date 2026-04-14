import { describe, expect, it } from "vitest";
import type { DomainEvent } from "@/domain/events.ts";
import type { SeasonState } from "@/domain/types.ts";
import { buildAuditRows, buildImportBatchRows } from "@/components/history/adapters.ts";

function stateWithBatch(): SeasonState {
  return {
    season_id: "s1",
    persons: new Map(),
    teams: new Map(),
    import_batches: new Map([
      [
        "b1",
        {
          import_batch_id: "b1",
          source_file: "lauf.xlsx",
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
          entries: [],
        },
      ],
    ]),
    exclusions: new Map(),
  };
}

describe("history adapters", () => {
  it("groups import batches", () => {
    const rows = buildImportBatchRows(stateWithBatch());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source_file).toBe("lauf.xlsx");
  });

  it("filters audit rows", () => {
    const events: DomainEvent[] = [
      {
        event_id: "1",
        seq: 0,
        recorded_at: "2026-04-01T10:00:00.000Z",
        type: "person.corrected",
        schema_version: 1,
        payload: {
          person_id: "p1",
          updated_fields: {},
          rationale: "test",
        },
        metadata: { app_version: "test" },
      },
      {
        event_id: "2",
        seq: 1,
        recorded_at: "2026-04-01T09:00:00.000Z",
        type: "import_batch.recorded",
        schema_version: 1,
        payload: {
          import_batch_id: "b1",
          source_file: "f",
          source_sha256: "x",
          parser_version: "1",
        },
        metadata: { app_version: "test", import_batch_id: "b1" },
      },
    ] as DomainEvent[];
    const rows = buildAuditRows(events);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe("person.corrected");
  });
});
