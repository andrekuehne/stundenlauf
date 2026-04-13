import { describe, expect, it } from "vitest";

import { EXPECTED_HEADER_SINGLES } from "@/ingestion/constants";
import { ExcelParseError } from "@/ingestion/errors";
import { parseSinglesWorkbook, type SinglesParserInput } from "@/ingestion/parse-singles";

import { buildXlsx } from "./xlsx-test-helpers";

function makeInput(rows: unknown[][], fileName = "Ergebnisliste MW Lauf 1.xlsx"): SinglesParserInput {
  return {
    buffer: buildXlsx(rows),
    fileName,
    sha256: "test-sha256",
    fileMtime: 1700000000000,
  };
}

const HEADER = [...EXPECTED_HEADER_SINGLES];

describe("parseSinglesWorkbook", () => {
  it("parses a valid workbook with 2 duration blocks x 2 divisions = 4 sections", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", ""],
      ["Frauen", "", "", "", "", "", "", ""],
      [1, "12", "Meyer, Anna", 1990, "TSV Süd", "5,2", "0,0", "100"],
      ["Männer", "", "", "", "", "", "", ""],
      [1, "3", "Schmidt, Jan", 1988, "SV Nord", "6,1", "0,0", "100"],
      ["h-Lauf", "", "", "", "", "", "", ""],
      ["Frauen", "", "", "", "", "", "", ""],
      [1, "9", "Eva Test", 1991, "TSV", "11,1", "", "30,2"],
      ["Männer", "", "", "", "", "", "", ""],
      [1, "10", "Tom Test", 1989, "TSV", "22,2", "", "55,5"],
    ];

    const result = parseSinglesWorkbook(makeInput(rows));

    expect(result.singles_sections).toHaveLength(4);
    expect(result.couples_sections).toHaveLength(0);

    const s0 = result.singles_sections[0]!;
    expect(s0.context.duration).toBe("half_hour");
    expect(s0.context.division).toBe("women");
    expect(s0.context.race_no).toBe(1);
    expect(s0.context.event_date).toBeNull();
    expect(s0.rows).toHaveLength(1);
    expect(s0.rows[0]!.name).toBe("Meyer, Anna");
    expect(s0.rows[0]!.yob).toBe(1990);
    expect(s0.rows[0]!.club).toBe("TSV Süd");
    expect(s0.rows[0]!.distance_km).toBeCloseTo(5.2);
    expect(s0.rows[0]!.points).toBe(100);
    expect(s0.rows[0]!.startnr).toBe("12");

    const s1 = result.singles_sections[1]!;
    expect(s1.context.duration).toBe("half_hour");
    expect(s1.context.division).toBe("men");
    expect(s1.rows[0]!.name).toBe("Schmidt, Jan");

    const s2 = result.singles_sections[2]!;
    expect(s2.context.duration).toBe("hour");
    expect(s2.context.division).toBe("women");

    const s3 = result.singles_sections[3]!;
    expect(s3.context.duration).toBe("hour");
    expect(s3.context.division).toBe("men");
  });

  it("parses German comma in distance and points correctly", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", ""],
      ["Frauen", "", "", "", "", "", "", ""],
      [1, "7", "Anna Test", 1990, "TSV", "12,5", "", "42,0"],
    ];

    const result = parseSinglesWorkbook(makeInput(rows));
    const row = result.singles_sections[0]!.rows[0]!;
    expect(row.distance_km).toBe(12.5);
    expect(row.points).toBe(42.0);
  });

  it("handles multiple data rows per section", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", ""],
      ["Frauen", "", "", "", "", "", "", ""],
      [1, "12", "Meyer, Anna", 1990, "TSV", "5,2", "0,0", "100"],
      [2, "15", "Koch, Lisa", 1985, "", "4,8", "0,4", "95"],
    ];

    const result = parseSinglesWorkbook(makeInput(rows));
    expect(result.singles_sections).toHaveLength(1);
    expect(result.singles_sections[0]!.rows).toHaveLength(2);
    expect(result.singles_sections[0]!.rows[1]!.name).toBe("Koch, Lisa");
    expect(result.singles_sections[0]!.rows[1]!.club).toBeNull();
  });

  it("silently skips empty name rows", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", ""],
      ["Frauen", "", "", "", "", "", "", ""],
      [1, "12", "Meyer, Anna", 1990, "TSV", "5,2", "0,0", "100"],
      ["", "", "", "", "", "", "", ""],
      [3, "20", "Müller, Eva", 1992, "TSV", "4,0", "1,2", "80"],
    ];

    const result = parseSinglesWorkbook(makeInput(rows));
    expect(result.singles_sections[0]!.rows).toHaveLength(2);
  });

  it("normalizes club cells: empty becomes null", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", ""],
      ["Männer", "", "", "", "", "", "", ""],
      [1, "5", "Test, Person", 1990, "", "5,0", "", "50"],
    ];

    const result = parseSinglesWorkbook(makeInput(rows));
    expect(result.singles_sections[0]!.rows[0]!.club).toBeNull();
  });

  it("normalizes club cells: punctuation-only becomes null", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", ""],
      ["Männer", "", "", "", "", "", "", ""],
      [1, "5", "Test, Person", 1990, "---", "5,0", "", "50"],
    ];

    const result = parseSinglesWorkbook(makeInput(rows));
    expect(result.singles_sections[0]!.rows[0]!.club).toBeNull();
  });

  it("extracts race number from filename", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", ""],
      ["Frauen", "", "", "", "", "", "", ""],
      [1, "7", "Test", 1990, "TSV", "5,0", "", "50"],
    ];

    const result = parseSinglesWorkbook(makeInput(rows, "Ergebnisliste MW Lauf 3.xlsx"));
    expect(result.singles_sections[0]!.context.race_no).toBe(3);
  });

  it("uses raceNoOverride when provided", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", ""],
      ["Frauen", "", "", "", "", "", "", ""],
      [1, "7", "Test", 1990, "TSV", "5,0", "", "50"],
    ];

    const result = parseSinglesWorkbook({
      ...makeInput(rows, "Ergebnisliste MW Lauf 3.xlsx"),
      raceNoOverride: 99,
    });
    expect(result.singles_sections[0]!.context.race_no).toBe(99);
  });

  it("populates metadata correctly", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", ""],
      ["Frauen", "", "", "", "", "", "", ""],
      [1, "7", "Test", 1990, "TSV", "5,0", "", "50"],
    ];

    const result = parseSinglesWorkbook(makeInput(rows));
    expect(result.meta.source_file).toBe("Ergebnisliste MW Lauf 1.xlsx");
    expect(result.meta.source_sha256).toBe("test-sha256");
    expect(result.meta.parser_version).toBe("f-ts02-v1");
    expect(result.meta.file_mtime).toBe(1700000000000);
    expect(result.meta.imported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.meta.schema_fingerprint).toContain("sections=1");
  });

  // --- Error paths ---

  it("throws excel_schema_mismatch for wrong header", () => {
    const rows = [["Wrong", "Header", "Here", "", "", "", "", ""]];
    try {
      parseSinglesWorkbook(makeInput(rows));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExcelParseError);
      const pe = err as ExcelParseError;
      expect(pe.issues[0]!.code).toBe("excel_schema_mismatch");
      expect(pe.issues[0]!.location.row).toBe(1);
      expect(pe.issues[0]!.location.column).toBe("A:H");
    }
  });

  it("throws missing_section_marker for data row before markers", () => {
    const rows = [
      HEADER,
      [1, "12", "Meyer, Anna", 1990, "TSV", "5,2", "0,0", "100"],
    ];
    try {
      parseSinglesWorkbook(makeInput(rows));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExcelParseError);
      const pe = err as ExcelParseError;
      expect(pe.issues[0]!.code).toBe("missing_section_marker");
      expect(pe.issues[0]!.location.row).toBe(2);
    }
  });

  it("throws missing_section_marker when only duration set (no division)", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", ""],
      [1, "12", "Meyer, Anna", 1990, "TSV", "5,2", "0,0", "100"],
    ];
    try {
      parseSinglesWorkbook(makeInput(rows));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExcelParseError);
      const pe = err as ExcelParseError;
      expect(pe.issues[0]!.code).toBe("missing_section_marker");
    }
  });

  it("throws invalid_number for non-numeric YOB", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", ""],
      ["Frauen", "", "", "", "", "", "", ""],
      [1, "7", "Test", "abc", "TSV", "5,0", "", "50"],
    ];
    try {
      parseSinglesWorkbook(makeInput(rows));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExcelParseError);
      const pe = err as ExcelParseError;
      expect(pe.issues[0]!.code).toBe("invalid_number");
      expect(pe.issues[0]!.location.column).toBe("D/F/H");
    }
  });

  it("throws invalid_number for empty YOB", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", ""],
      ["Frauen", "", "", "", "", "", "", ""],
      [1, "7", "Test", "", "TSV", "5,0", "", "50"],
    ];
    try {
      parseSinglesWorkbook(makeInput(rows));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExcelParseError);
      const pe = err as ExcelParseError;
      expect(pe.issues[0]!.code).toBe("invalid_number");
    }
  });

  it("throws invalid_number for non-numeric distance", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", ""],
      ["Frauen", "", "", "", "", "", "", ""],
      [1, "7", "Test", 1990, "TSV", "abc", "", "50"],
    ];
    try {
      parseSinglesWorkbook(makeInput(rows));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExcelParseError);
      const pe = err as ExcelParseError;
      expect(pe.issues[0]!.code).toBe("invalid_number");
    }
  });

  it("throws no_rows when workbook has header but no data sections", () => {
    const rows = [HEADER];
    try {
      parseSinglesWorkbook(makeInput(rows));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExcelParseError);
      const pe = err as ExcelParseError;
      expect(pe.issues[0]!.code).toBe("no_rows");
    }
  });

  it("throws no_rows when only markers exist without data rows", () => {
    const rows = [
      HEADER,
      ["1/2 h-Lauf", "", "", "", "", "", "", ""],
      ["Frauen", "", "", "", "", "", "", ""],
    ];
    try {
      parseSinglesWorkbook(makeInput(rows));
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
      ["1/2 h-Lauf", "", "", "", "", "", "", ""],
      ["Frauen", "", "", "", "", "", "", ""],
      [1, "7", "Test A", 1990, "TSV", "5,0", "", "50"],
      ["h-Lauf", "", "", "", "", "", "", ""],
      [1, "8", "Test B", 1991, "TSV", "6,0", "", "60"],
    ];
    try {
      parseSinglesWorkbook(makeInput(rows));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExcelParseError);
      const pe = err as ExcelParseError;
      expect(pe.issues[0]!.code).toBe("missing_section_marker");
    }
  });
});
