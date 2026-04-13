import { describe, expect, it } from "vitest";

import { EXPECTED_HEADER_COUPLES } from "@/ingestion/constants";
import { ExcelParseError } from "@/ingestion/errors";
import { parseCouplesWorkbook, type CouplesParserInput } from "@/ingestion/parse-couples";

import { buildXlsx } from "./xlsx-test-helpers";

function makeInput(
  rows: unknown[][],
  fileName = "Ergebnisliste MW_Paare Lauf 1.xlsx",
): CouplesParserInput {
  return {
    buffer: buildXlsx(rows),
    fileName,
    sha256: "test-sha256-couples",
    fileMtime: 1700000000000,
  };
}

const HEADER = [...EXPECTED_HEADER_COUPLES];

function couplesRow(
  rank: number,
  startnr: string,
  nameA: string,
  yobA: number | string,
  clubA: string,
  nameB: string,
  yobB: number | string,
  clubB: string,
  distance: string,
  points: string,
): unknown[] {
  return [rank, startnr, nameA, yobA, clubA, nameB, yobB, clubB, distance, "", points];
}

describe("parseCouplesWorkbook", () => {
  it("parses a valid workbook with 3 divisions per duration block", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", "", "", "", ""],
      ["Paare Frauen", "", "", "", "", "", "", "", "", "", ""],
      couplesRow(1, "10", "Anna A", 1990, "TSV", "Berta B", 1991, "SV", "8,5", "80"),
      ["Paare Männer", "", "", "", "", "", "", "", "", "", ""],
      couplesRow(1, "20", "Max M", 1988, "TSV", "Otto O", 1987, "SV", "9,0", "90"),
      ["Paare Mix", "", "", "", "", "", "", "", "", "", ""],
      couplesRow(1, "30", "Eva E", 1992, "TSV", "Tom T", 1990, "SV", "7,5", "70"),
    ];

    const result = parseCouplesWorkbook(makeInput(rows));
    expect(result.couples_sections).toHaveLength(3);
    expect(result.singles_sections).toHaveLength(0);

    const s0 = result.couples_sections[0]!;
    expect(s0.context.duration).toBe("half_hour");
    expect(s0.context.division).toBe("couples_women");
    expect(s0.context.race_no).toBe(1);
    expect(s0.rows).toHaveLength(1);
    expect(s0.rows[0]!.name_a).toBe("Anna A");
    expect(s0.rows[0]!.name_b).toBe("Berta B");
    expect(s0.rows[0]!.yob_a).toBe(1990);
    expect(s0.rows[0]!.yob_b).toBe(1991);
    expect(s0.rows[0]!.club_a).toBe("TSV");
    expect(s0.rows[0]!.club_b).toBe("SV");
    expect(s0.rows[0]!.distance_km).toBeCloseTo(8.5);
    expect(s0.rows[0]!.points).toBe(80);
    expect(s0.rows[0]!.startnr).toBe("10");

    expect(result.couples_sections[1]!.context.division).toBe("couples_men");
    expect(result.couples_sections[2]!.context.division).toBe("couples_mixed");
  });

  it("uses sentinel 1900 for empty YOB", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", "", "", "", ""],
      ["Paare Frauen", "", "", "", "", "", "", "", "", "", ""],
      couplesRow(1, "10", "Anna A", "", "TSV", "Berta B", "", "SV", "8,5", "80"),
    ];

    const result = parseCouplesWorkbook(makeInput(rows));
    expect(result.couples_sections[0]!.rows[0]!.yob_a).toBe(1900);
    expect(result.couples_sections[0]!.rows[0]!.yob_b).toBe(1900);
  });

  it("parses German comma in distance and points", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", "", "", "", ""],
      ["Paare Mix", "", "", "", "", "", "", "", "", "", ""],
      couplesRow(1, "5", "A", 1990, "X", "B", 1991, "Y", "12,5", "42,0"),
    ];

    const result = parseCouplesWorkbook(makeInput(rows));
    expect(result.couples_sections[0]!.rows[0]!.distance_km).toBe(12.5);
    expect(result.couples_sections[0]!.rows[0]!.points).toBe(42.0);
  });

  it("normalizes empty club to null", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", "", "", "", ""],
      ["Paare Frauen", "", "", "", "", "", "", "", "", "", ""],
      couplesRow(1, "10", "Anna A", 1990, "", "Berta B", 1991, "", "8,5", "80"),
    ];

    const result = parseCouplesWorkbook(makeInput(rows));
    expect(result.couples_sections[0]!.rows[0]!.club_a).toBeNull();
    expect(result.couples_sections[0]!.rows[0]!.club_b).toBeNull();
  });

  it("skips rows where both names are empty", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", "", "", "", ""],
      ["Paare Frauen", "", "", "", "", "", "", "", "", "", ""],
      couplesRow(1, "10", "Anna A", 1990, "TSV", "Berta B", 1991, "SV", "8,5", "80"),
      ["", "", "", "", "", "", "", "", "", "", ""],
      couplesRow(2, "11", "Clara C", 1985, "TSV", "Dora D", 1986, "SV", "7,0", "70"),
    ];

    const result = parseCouplesWorkbook(makeInput(rows));
    expect(result.couples_sections[0]!.rows).toHaveLength(2);
  });

  it("extracts race number from filename", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", "", "", "", ""],
      ["Paare Frauen", "", "", "", "", "", "", "", "", "", ""],
      couplesRow(1, "10", "A", 1990, "X", "B", 1991, "Y", "5,0", "50"),
    ];

    const result = parseCouplesWorkbook(makeInput(rows, "Ergebnisliste MW_Paare Lauf 3.xlsx"));
    expect(result.couples_sections[0]!.context.race_no).toBe(3);
  });

  it("uses raceNoOverride when provided", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", "", "", "", ""],
      ["Paare Frauen", "", "", "", "", "", "", "", "", "", ""],
      couplesRow(1, "10", "A", 1990, "X", "B", 1991, "Y", "5,0", "50"),
    ];

    const result = parseCouplesWorkbook({
      ...makeInput(rows),
      raceNoOverride: 42,
    });
    expect(result.couples_sections[0]!.context.race_no).toBe(42);
  });

  it("populates metadata correctly", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", "", "", "", ""],
      ["Paare Frauen", "", "", "", "", "", "", "", "", "", ""],
      couplesRow(1, "10", "A", 1990, "X", "B", 1991, "Y", "5,0", "50"),
    ];

    const result = parseCouplesWorkbook(makeInput(rows));
    expect(result.meta.source_sha256).toBe("test-sha256-couples");
    expect(result.meta.parser_version).toBe("f-ts02-v1");
    expect(result.meta.imported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.meta.schema_fingerprint).toContain("sections=1");
  });

  // --- Error paths ---

  it("throws excel_schema_mismatch for wrong header", () => {
    const rows = [["Wrong", "Header"]];
    try {
      parseCouplesWorkbook(makeInput(rows));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExcelParseError);
      const pe = err as ExcelParseError;
      expect(pe.issues[0]!.code).toBe("excel_schema_mismatch");
      expect(pe.issues[0]!.location.row).toBe(1);
      expect(pe.issues[0]!.location.column).toBe("A:K");
    }
  });

  it("throws invalid_couple_members when only one name is present", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", "", "", "", ""],
      ["Paare Frauen", "", "", "", "", "", "", "", "", "", ""],
      [1, "10", "Anna A", 1990, "TSV", "", 1991, "SV", "8,5", "", "80"],
    ];
    try {
      parseCouplesWorkbook(makeInput(rows));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExcelParseError);
      const pe = err as ExcelParseError;
      expect(pe.issues[0]!.code).toBe("invalid_couple_members");
      expect(pe.issues[0]!.location.column).toBe("C/F");
    }
  });

  it("throws invalid_couple_members when only second name present", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", "", "", "", ""],
      ["Paare Frauen", "", "", "", "", "", "", "", "", "", ""],
      [1, "10", "", 1990, "TSV", "Berta B", 1991, "SV", "8,5", "", "80"],
    ];
    try {
      parseCouplesWorkbook(makeInput(rows));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExcelParseError);
      const pe = err as ExcelParseError;
      expect(pe.issues[0]!.code).toBe("invalid_couple_members");
    }
  });

  it("throws missing_section_marker for data row before markers", () => {
    const rows = [
      HEADER,
      couplesRow(1, "10", "Anna A", 1990, "TSV", "Berta B", 1991, "SV", "8,5", "80"),
    ];
    try {
      parseCouplesWorkbook(makeInput(rows));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExcelParseError);
      const pe = err as ExcelParseError;
      expect(pe.issues[0]!.code).toBe("missing_section_marker");
    }
  });

  it("throws invalid_number for non-numeric distance", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", "", "", "", ""],
      ["Paare Frauen", "", "", "", "", "", "", "", "", "", ""],
      [1, "10", "Anna A", 1990, "TSV", "Berta B", 1991, "SV", "abc", "", "80"],
    ];
    try {
      parseCouplesWorkbook(makeInput(rows));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExcelParseError);
      const pe = err as ExcelParseError;
      expect(pe.issues[0]!.code).toBe("invalid_number");
      expect(pe.issues[0]!.location.column).toBe("D/G/I/K");
    }
  });

  it("throws invalid_number for non-numeric YOB (non-empty)", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", "", "", "", ""],
      ["Paare Frauen", "", "", "", "", "", "", "", "", "", ""],
      [1, "10", "Anna A", "abc", "TSV", "Berta B", 1991, "SV", "8,5", "", "80"],
    ];
    try {
      parseCouplesWorkbook(makeInput(rows));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExcelParseError);
      const pe = err as ExcelParseError;
      expect(pe.issues[0]!.code).toBe("invalid_number");
    }
  });

  it("throws no_rows when workbook has no data sections", () => {
    const rows = [HEADER];
    try {
      parseCouplesWorkbook(makeInput(rows));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExcelParseError);
      const pe = err as ExcelParseError;
      expect(pe.issues[0]!.code).toBe("no_rows");
    }
  });

  it("throws no_rows when only markers exist without data", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", "", "", "", ""],
      ["Paare Frauen", "", "", "", "", "", "", "", "", "", ""],
    ];
    try {
      parseCouplesWorkbook(makeInput(rows));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExcelParseError);
      const pe = err as ExcelParseError;
      expect(pe.issues[0]!.code).toBe("no_rows");
    }
  });

  it("duration marker resets division", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", "", "", "", ""],
      ["Paare Mix", "", "", "", "", "", "", "", "", "", ""],
      couplesRow(1, "5", "A", 1990, "X", "B", 1991, "Y", "5,0", "50"),
      ["h-Lauf", "", "", "", "", "", "", "", "", "", ""],
      couplesRow(1, "6", "C", 1990, "X", "D", 1991, "Y", "5,0", "50"),
    ];
    try {
      parseCouplesWorkbook(makeInput(rows));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExcelParseError);
      const pe = err as ExcelParseError;
      expect(pe.issues[0]!.code).toBe("missing_section_marker");
    }
  });
});
