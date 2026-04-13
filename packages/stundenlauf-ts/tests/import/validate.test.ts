import { describe, expect, it } from "vitest";
import { emptySeasonState, projectState } from "@/domain/projection.ts";
import {
  importBatchRecorded,
  importBatchRolledBack,
  raceRegistered,
  resetSeqCounter,
} from "../helpers/event-factories.ts";
import {
  validateCategoryRaceNoConflicts,
  validateDuplicateImport,
  validateImport,
  validateNoDuplicateRows,
} from "@/import/validate.ts";
import type { ParsedWorkbook } from "@/ingestion/types.ts";

function minimalParsedWorkbook(
  overrides?: Partial<ParsedWorkbook>,
): ParsedWorkbook {
  return {
    meta: {
      source_file: "test.xlsx",
      source_sha256: "sha-new-file",
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

describe("validateDuplicateImport", () => {
  it("rejects when an active batch has matching SHA-256", () => {
    resetSeqCounter();
    const batchEvent = importBatchRecorded({ source_sha256: "sha-abc" });
    const state = projectState("s1", [batchEvent]);

    const result = validateDuplicateImport("sha-abc", state);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("duplicate_import");
    }
  });

  it("allows import when matching SHA-256 batch is rolled back", () => {
    resetSeqCounter();
    const batchId = "batch-rb";
    const batchEvent = importBatchRecorded({
      import_batch_id: batchId,
      source_sha256: "sha-abc",
    });
    const rollbackEvent = importBatchRolledBack({
      import_batch_id: batchId,
    });
    const state = projectState("s1", [batchEvent, rollbackEvent]);

    const result = validateDuplicateImport("sha-abc", state);
    expect(result.valid).toBe(true);
  });

  it("allows import when no batch matches the SHA-256", () => {
    const state = emptySeasonState("s1");
    const result = validateDuplicateImport("sha-unique", state);
    expect(result.valid).toBe(true);
  });
});

describe("validateCategoryRaceNoConflicts", () => {
  it("rejects when parsed section conflicts with existing effective race", () => {
    resetSeqCounter();
    const batchId = "batch-1";
    const batchEvent = importBatchRecorded({ import_batch_id: batchId });
    const raceEvent = raceRegistered({
      import_batch_id: batchId,
      category: { duration: "hour", division: "men" },
      race_no: 1,
    });
    const state = projectState("s1", [batchEvent, raceEvent]);

    const parsed = minimalParsedWorkbook({
      singles_sections: [
        {
          context: {
            race_no: 1,
            duration: "hour",
            division: "men",
            event_date: null,
          },
          rows: [],
        },
      ],
    });

    const result = validateCategoryRaceNoConflicts(parsed, state);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("category_race_no_conflict");
    }
  });

  it("allows when no conflict exists", () => {
    resetSeqCounter();
    const batchId = "batch-1";
    const batchEvent = importBatchRecorded({ import_batch_id: batchId });
    const raceEvent = raceRegistered({
      import_batch_id: batchId,
      category: { duration: "hour", division: "men" },
      race_no: 1,
    });
    const state = projectState("s1", [batchEvent, raceEvent]);

    const parsed = minimalParsedWorkbook({
      singles_sections: [
        {
          context: {
            race_no: 2,
            duration: "hour",
            division: "men",
            event_date: null,
          },
          rows: [],
        },
      ],
    });

    const result = validateCategoryRaceNoConflicts(parsed, state);
    expect(result.valid).toBe(true);
  });

  it("allows when conflicting race is rolled back", () => {
    resetSeqCounter();
    const batchId = "batch-rb";
    const batchEvent = importBatchRecorded({ import_batch_id: batchId });
    const raceEvent = raceRegistered({
      import_batch_id: batchId,
      category: { duration: "hour", division: "men" },
      race_no: 1,
    });
    const rollback = importBatchRolledBack({ import_batch_id: batchId });
    const state = projectState("s1", [batchEvent, raceEvent, rollback]);

    const parsed = minimalParsedWorkbook({
      singles_sections: [
        {
          context: {
            race_no: 1,
            duration: "hour",
            division: "men",
            event_date: null,
          },
          rows: [],
        },
      ],
    });

    const result = validateCategoryRaceNoConflicts(parsed, state);
    expect(result.valid).toBe(true);
  });
});

describe("validateNoDuplicateRows", () => {
  it("rejects duplicate singles rows within a section", () => {
    const parsed = minimalParsedWorkbook({
      singles_sections: [
        {
          context: {
            race_no: 1,
            duration: "hour",
            division: "men",
            event_date: null,
          },
          rows: [
            { startnr: "1", name: "Müller, Max", yob: 1990, club: "LG A", distance_km: 10, points: 10 },
            { startnr: "1", name: "Müller, Max", yob: 1990, club: "LG A", distance_km: 12, points: 12 },
          ],
        },
      ],
    });

    const result = validateNoDuplicateRows(parsed);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("duplicate_row");
    }
  });

  it("rejects duplicate couples rows within a section", () => {
    const parsed = minimalParsedWorkbook({
      couples_sections: [
        {
          context: {
            race_no: 1,
            duration: "hour",
            division: "couples_mixed",
            event_date: null,
          },
          rows: [
            { startnr: "1", name_a: "A", yob_a: 1990, club_a: "C", name_b: "B", yob_b: 1985, club_b: "C", distance_km: 10, points: 10 },
            { startnr: "1", name_a: "A", yob_a: 1990, club_a: "C", name_b: "B", yob_b: 1985, club_b: "C", distance_km: 12, points: 12 },
          ],
        },
      ],
    });

    const result = validateNoDuplicateRows(parsed);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("duplicate_row");
    }
  });

  it("allows unique rows", () => {
    const parsed = minimalParsedWorkbook({
      singles_sections: [
        {
          context: {
            race_no: 1,
            duration: "hour",
            division: "men",
            event_date: null,
          },
          rows: [
            { startnr: "1", name: "Müller, Max", yob: 1990, club: "LG A", distance_km: 10, points: 10 },
            { startnr: "2", name: "Schmidt, Hans", yob: 1985, club: "LG B", distance_km: 12, points: 12 },
          ],
        },
      ],
    });

    const result = validateNoDuplicateRows(parsed);
    expect(result.valid).toBe(true);
  });
});

describe("validateImport (composite)", () => {
  it("runs all validations and returns first failure", () => {
    resetSeqCounter();
    const batchEvent = importBatchRecorded({ source_sha256: "sha-dup" });
    const state = projectState("s1", [batchEvent]);

    const parsed = minimalParsedWorkbook({
      meta: {
        source_file: "test.xlsx",
        source_sha256: "sha-dup",
        parser_version: "v1",
        schema_fingerprint: "fp",
        file_mtime: 0,
        imported_at: new Date().toISOString(),
      },
    });

    const result = validateImport(parsed, state);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("duplicate_import");
    }
  });

  it("passes when everything is valid", () => {
    const state = emptySeasonState("s1");
    const parsed = minimalParsedWorkbook();
    const result = validateImport(parsed, state);
    expect(result.valid).toBe(true);
  });
});
