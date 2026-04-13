/**
 * Optional integration checks against real .xlsx files under tests/data/xlsx/ (recursive).
 *
 * Classification by basename (local only; *.xlsx is gitignored at repo root):
 * - Couples: “paare” in filename (same as production detectSourceType)
 * - Singles: not couples, and basename matches MW organizer naming (e.g. MW_1, “MW Lauf”)
 *
 * `parseWorkbook` receives the relative path from tests/data/xlsx/ so Lauf-Nr. can be read
 * from nested paths if the filename contains it.
 *
 * When no matching files exist, the describes below are skipped so CI stays green.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseWorkbook } from "@/ingestion/parse-workbook";

import {
  LOCAL_XLSX_FIXTURE_ROOT,
  fixtureBasename,
  isCouplesFixtureBasename,
  isSinglesFixtureBasename,
  listLocalXlsxRelativePaths,
} from "./local-xlsx-fixture-discovery";

function bufferFromPath(filePath: string): ArrayBuffer {
  return new Uint8Array(readFileSync(filePath)).buffer;
}

const allRel = listLocalXlsxRelativePaths();
const singlesExamples = allRel.filter((rel) => isSinglesFixtureBasename(fixtureBasename(rel)));
const couplesExamples = allRel.filter((rel) => isCouplesFixtureBasename(fixtureBasename(rel)));

describe.skipIf(singlesExamples.length === 0)("local singles workbooks (tests/data/xlsx)", () => {
  it.each(singlesExamples)("parses %s → Einzellauf only", async (relPath) => {
    const filePath = join(LOCAL_XLSX_FIXTURE_ROOT, relPath);
    const buffer = bufferFromPath(filePath);
    const result = await parseWorkbook(buffer, relPath);

    expect(result.meta.source_file).toBe(relPath);
    expect(result.couples_sections).toHaveLength(0);
    expect(result.singles_sections.length).toBeGreaterThan(0);

    let rowCount = 0;
    for (const section of result.singles_sections) {
      expect(section.rows.length).toBeGreaterThan(0);
      for (const row of section.rows) {
        expect(row.startnr.length).toBeGreaterThan(0);
        expect(row.name.length).toBeGreaterThan(0);
      }
      rowCount += section.rows.length;
    }
    expect(rowCount).toBeGreaterThan(0);
  });
});

describe.skipIf(couplesExamples.length === 0)("local couples workbooks (tests/data/xlsx)", () => {
  it.each(couplesExamples)("parses %s → Paare only", async (relPath) => {
    const filePath = join(LOCAL_XLSX_FIXTURE_ROOT, relPath);
    const buffer = bufferFromPath(filePath);
    const result = await parseWorkbook(buffer, relPath);

    expect(result.meta.source_file).toBe(relPath);
    expect(result.singles_sections).toHaveLength(0);
    expect(result.couples_sections.length).toBeGreaterThan(0);

    let rowCount = 0;
    for (const section of result.couples_sections) {
      expect(section.rows.length).toBeGreaterThan(0);
      for (const row of section.rows) {
        expect(row.startnr.length).toBeGreaterThan(0);
        expect(row.name_a.length).toBeGreaterThan(0);
        expect(row.name_b.length).toBeGreaterThan(0);
      }
      rowCount += section.rows.length;
    }
    expect(rowCount).toBeGreaterThan(0);
  });
});

describe("local xlsx fixture discovery rules", () => {
  it("treats MW_Paare as couples only (not singles)", () => {
    expect(isSinglesFixtureBasename("Ergebnisliste MW_Paare Lauf 1.xlsx")).toBe(false);
    expect(isCouplesFixtureBasename("Ergebnisliste MW_Paare Lauf 1.xlsx")).toBe(true);
  });

  it("treats Ergebnisliste MW_1 style names as singles fixtures", () => {
    expect(isSinglesFixtureBasename("Ergebnisliste MW_1.xlsx")).toBe(true);
    expect(isCouplesFixtureBasename("Ergebnisliste MW_1.xlsx")).toBe(false);
  });
});
