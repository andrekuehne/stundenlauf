/**
 * Couples (Paarlauf) Excel parser.
 *
 * Reference: F-TS02 §4 (Excel Layout: Couples), Python couples.py
 */

import * as XLSX from "xlsx";

import type { Division, RaceDuration } from "@/domain/types";
import {
  DIVISION_MARKERS_COUPLES,
  DURATION_MARKERS,
  EXPECTED_HEADER_COUPLES,
  PARSER_VERSION,
} from "./constants";
import { ExcelParseError, makeIssue } from "./errors";
import { optionalClubFromCell, parseDecimal, parseRaceNo, toText } from "./helpers";
import type {
  ImportRaceContext,
  ImportRowCouples,
  ImportWorkbookMeta,
  ParsedSectionCouples,
  ParsedWorkbook,
} from "./types";

export interface CouplesParserInput {
  buffer: ArrayBuffer;
  fileName: string;
  sha256: string;
  fileMtime: number;
  raceNoOverride?: number;
}

export function parseCouplesWorkbook(input: CouplesParserInput): ParsedWorkbook {
  const wb = XLSX.read(new Uint8Array(input.buffer), { type: "array" });
  const sheetName = wb.SheetNames[0] ?? "Sheet1";
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new ExcelParseError([
      makeIssue("no_rows", "Keine Ergebniszeilen im Paarlauf gefunden.", sheetName, 1, "A"),
    ]);
  }
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    blankrows: true,
  });

  if (rows.length === 0) {
    throw new ExcelParseError([
      makeIssue("no_rows", "Keine Ergebniszeilen im Paarlauf gefunden.", sheetName, 1, "A"),
    ]);
  }

  const headerRow = rows[0] ?? [];
  const header = Array.from({ length: EXPECTED_HEADER_COUPLES.length }, (_, i) =>
    toText(headerRow[i]),
  );

  if (!arraysEqual(header, EXPECTED_HEADER_COUPLES)) {
    throw new ExcelParseError([
      makeIssue(
        "excel_schema_mismatch",
        "Excel-Format stimmt nicht: Kopfzeile für Paarlauf ist unerwartet.",
        sheetName,
        1,
        "A:K",
      ),
    ]);
  }

  const resolvedRaceNo =
    input.raceNoOverride != null ? input.raceNoOverride : parseRaceNo(input.fileName);

  const sections: ParsedSectionCouples[] = [];
  let currentDuration: RaceDuration | null = null;
  let currentDivision: Division | null = null;
  let rowsBuffer: ImportRowCouples[] = [];

  function flush(): void {
    if (currentDuration == null || currentDivision == null || rowsBuffer.length === 0) return;
    sections.push({
      context: {
        race_no: resolvedRaceNo,
        duration: currentDuration,
        division: currentDivision,
        event_date: null,
      } satisfies ImportRaceContext,
      rows: rowsBuffer,
    });
    rowsBuffer = [];
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const excelRow = i + 1;
    const marker = toText(row[0]);

    const durationMatch = DURATION_MARKERS[marker];
    if (durationMatch !== undefined) {
      flush();
      currentDuration = durationMatch;
      currentDivision = null;
      continue;
    }

    const divisionMatch = DIVISION_MARKERS_COUPLES[marker];
    if (divisionMatch !== undefined) {
      flush();
      currentDivision = divisionMatch;
      continue;
    }

    const nameA = toText(row[2]);
    const nameB = toText(row[5]);

    if (!nameA && !nameB) continue;

    if (!nameA || !nameB) {
      throw new ExcelParseError([
        makeIssue(
          "invalid_couple_members",
          "Paarlauf-Zeile muss genau zwei Namen enthalten.",
          sheetName,
          excelRow,
          "C/F",
        ),
      ]);
    }

    if (currentDuration == null || currentDivision == null) {
      throw new ExcelParseError([
        makeIssue(
          "missing_section_marker",
          "Abschnittsmarker fehlt vor Paarlauf-Ergebniszeile.",
          sheetName,
          excelRow,
          "A",
        ),
      ]);
    }

    try {
      const parsed: ImportRowCouples = {
        startnr: toText(row[1]),
        name_a: nameA,
        yob_a: parseCouplesYob(row[3]),
        club_a: optionalClubFromCell(row[4]),
        name_b: nameB,
        yob_b: parseCouplesYob(row[6]),
        club_b: optionalClubFromCell(row[7]),
        distance_km: parseDecimal(row[8]),
        points: parseDecimal(row[10]),
      };
      rowsBuffer.push(parsed);
    } catch {
      throw new ExcelParseError([
        makeIssue(
          "invalid_number",
          "Ungültiger Zahlenwert in Paarlauf-Zeile.",
          sheetName,
          excelRow,
          "D/G/I/K",
        ),
      ]);
    }
  }

  flush();

  if (sections.length === 0) {
    throw new ExcelParseError([
      makeIssue("no_rows", "Keine Ergebniszeilen im Paarlauf gefunden.", sheetName, 1, "A"),
    ]);
  }

  const fingerprint = `${sheetName}|${header.join("|")}|sections=${sections.length}`;
  const meta: ImportWorkbookMeta = {
    source_file: input.fileName,
    source_sha256: input.sha256,
    file_mtime: input.fileMtime,
    imported_at: new Date().toISOString(),
    parser_version: PARSER_VERSION,
    schema_fingerprint: fingerprint,
  };

  return { meta, singles_sections: [], couples_sections: sections };
}

/** Couples YOB: empty cell -> 1900 sentinel; non-empty non-numeric -> throws */
function parseCouplesYob(value: unknown): number {
  const text = toText(value);
  if (!text) return 1900;
  const n = parseInt(text, 10);
  if (isNaN(n)) throw new Error("not a number");
  return n;
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}
