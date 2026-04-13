import { describe, expect, it } from "vitest";

import { EXPECTED_HEADER_COUPLES, EXPECTED_HEADER_SINGLES } from "@/ingestion/constants";
import { parseWorkbook } from "@/ingestion/parse-workbook";

import { buildXlsx } from "./xlsx-test-helpers";

const SINGLES_HEADER = [...EXPECTED_HEADER_SINGLES];
const COUPLES_HEADER = [...EXPECTED_HEADER_COUPLES];

function minimalSinglesRows(): unknown[][] {
  return [
    SINGLES_HEADER,
    ["1/2 h-Lauf", "", "", "", "", "", "", ""],
    ["Frauen", "", "", "", "", "", "", ""],
    [1, "7", "Test Runner", 1990, "TSV", "5,0", "", "50"],
  ];
}

function minimalCouplesRows(): unknown[][] {
  return [
    COUPLES_HEADER,
    ["1/2 h-Lauf", "", "", "", "", "", "", "", "", "", ""],
    ["Paare Frauen", "", "", "", "", "", "", "", "", "", ""],
    [1, "10", "Anna A", 1990, "TSV", "Berta B", 1991, "SV", "8,5", "", "80"],
  ];
}

describe("parseWorkbook", () => {
  it("auto-detects singles from filename", async () => {
    const buffer = buildXlsx(minimalSinglesRows());
    const result = await parseWorkbook(buffer, "Ergebnisliste MW Lauf 1.xlsx");

    expect(result.singles_sections).toHaveLength(1);
    expect(result.couples_sections).toHaveLength(0);
    expect(result.singles_sections[0]!.context.race_no).toBe(1);
  });

  it("auto-detects couples from paare in filename", async () => {
    const buffer = buildXlsx(minimalCouplesRows());
    const result = await parseWorkbook(buffer, "Ergebnisliste MW_Paare Lauf 2.xlsx");

    expect(result.couples_sections).toHaveLength(1);
    expect(result.singles_sections).toHaveLength(0);
    expect(result.couples_sections[0]!.context.race_no).toBe(2);
  });

  it("respects explicit sourceType override for couples", async () => {
    const buffer = buildXlsx(minimalCouplesRows());
    const result = await parseWorkbook(buffer, "no-paare-in-name.xlsx", {
      sourceType: "couples",
    });

    expect(result.couples_sections).toHaveLength(1);
  });

  it("respects explicit sourceType override for singles", async () => {
    const buffer = buildXlsx(minimalSinglesRows());
    const result = await parseWorkbook(buffer, "paare-but-actually-singles.xlsx", {
      sourceType: "singles",
    });

    expect(result.singles_sections).toHaveLength(1);
  });

  it("respects raceNoOverride", async () => {
    const buffer = buildXlsx(minimalSinglesRows());
    const result = await parseWorkbook(buffer, "Ergebnisliste MW Lauf 1.xlsx", {
      raceNoOverride: 99,
    });

    expect(result.singles_sections[0]!.context.race_no).toBe(99);
  });

  it("computes SHA-256 from buffer content", async () => {
    const buffer = buildXlsx(minimalSinglesRows());
    const result = await parseWorkbook(buffer, "test.xlsx");

    expect(result.meta.source_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sets file_mtime to 0 for ArrayBuffer input", async () => {
    const buffer = buildXlsx(minimalSinglesRows());
    const result = await parseWorkbook(buffer, "test.xlsx");

    expect(result.meta.file_mtime).toBe(0);
  });

  it("populates imported_at with ISO timestamp", async () => {
    const buffer = buildXlsx(minimalSinglesRows());
    const result = await parseWorkbook(buffer, "test.xlsx");

    expect(result.meta.imported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("populates source_file with the filename", async () => {
    const buffer = buildXlsx(minimalSinglesRows());
    const result = await parseWorkbook(buffer, "my-file.xlsx");

    expect(result.meta.source_file).toBe("my-file.xlsx");
  });

  it("produces different SHA-256 for different content", async () => {
    const buf1 = buildXlsx(minimalSinglesRows());
    const rows2 = minimalSinglesRows();
    rows2[3] = [1, "99", "Different Runner", 1985, "Other", "10,0", "", "100"];
    const buf2 = buildXlsx(rows2);

    const r1 = await parseWorkbook(buf1, "a.xlsx");
    const r2 = await parseWorkbook(buf2, "b.xlsx");

    expect(r1.meta.source_sha256).not.toBe(r2.meta.source_sha256);
  });
});
