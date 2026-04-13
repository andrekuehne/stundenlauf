/**
 * Singles (Einzellauf) Excel parser.
 *
 * Reference: F-TS02 §3 (Excel Layout: Singles), Python singles.py
 */

import * as XLSX from "xlsx";

import type { Division, RaceDuration } from "@/domain/types";
import {
  DIVISION_MARKERS_SINGLES,
  DURATION_MARKERS,
  EXPECTED_HEADER_SINGLES,
  PARSER_VERSION,
} from "./constants";
import { ExcelParseError, makeIssue } from "./errors";
import { optionalClubFromCell, parseDecimal, parseRaceNo, toText } from "./helpers";
import type {
  ImportRaceContext,
  ImportRowSingles,
  ImportWorkbookMeta,
  ParsedSectionSingles,
  ParsedWorkbook,
} from "./types";

export interface SinglesParserInput {
  buffer: ArrayBuffer;
  fileName: string;
  sha256: string;
  fileMtime: number;
  raceNoOverride?: number;
}

export function parseSinglesWorkbook(input: SinglesParserInput): ParsedWorkbook {
  const wb = XLSX.read(new Uint8Array(input.buffer), { type: "array" });
  const sheetName = wb.SheetNames[0] ?? "Sheet1";
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new ExcelParseError([
      makeIssue("no_rows", "Keine Ergebniszeilen im Einzellauf gefunden.", sheetName, 1, "A"),
    ]);
  }
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    blankrows: true,
  });

  if (rows.length === 0) {
    throw new ExcelParseError([
      makeIssue("no_rows", "Keine Ergebniszeilen im Einzellauf gefunden.", sheetName, 1, "A"),
    ]);
  }

  const headerRow = rows[0] ?? [];
  const header = Array.from({ length: EXPECTED_HEADER_SINGLES.length }, (_, i) =>
    toText(headerRow[i]),
  );

  if (!arraysEqual(header, EXPECTED_HEADER_SINGLES)) {
    throw new ExcelParseError([
      makeIssue(
        "excel_schema_mismatch",
        "Excel-Format stimmt nicht: Kopfzeile für Einzellauf ist unerwartet.",
        sheetName,
        1,
        "A:H",
      ),
    ]);
  }

  const resolvedRaceNo =
    input.raceNoOverride != null ? input.raceNoOverride : parseRaceNo(input.fileName);

  const sections: ParsedSectionSingles[] = [];
  let currentDuration: RaceDuration | null = null;
  let currentDivision: Division | null = null;
  let rowsBuffer: ImportRowSingles[] = [];

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

    const divisionMatch = DIVISION_MARKERS_SINGLES[marker];
    if (divisionMatch !== undefined) {
      flush();
      currentDivision = divisionMatch;
      continue;
    }

    const name = toText(row[2]);
    if (!name) continue;

    if (currentDuration == null || currentDivision == null) {
      throw new ExcelParseError([
        makeIssue(
          "missing_section_marker",
          "Abschnittsmarker fehlt vor Ergebniszeile.",
          sheetName,
          excelRow,
          "A",
        ),
      ]);
    }

    try {
      const parsed: ImportRowSingles = {
        startnr: toText(row[1]),
        name,
        yob: parseStrictInt(toText(row[3])),
        club: optionalClubFromCell(row[4]),
        distance_km: parseDecimal(row[5]),
        points: parseDecimal(row[7]),
      };
      rowsBuffer.push(parsed);
    } catch {
      throw new ExcelParseError([
        makeIssue(
          "invalid_number",
          "Ungültiger Zahlenwert in Einzellauf-Zeile.",
          sheetName,
          excelRow,
          "D/F/H",
        ),
      ]);
    }
  }

  flush();

  if (sections.length === 0) {
    throw new ExcelParseError([
      makeIssue("no_rows", "Keine Ergebniszeilen im Einzellauf gefunden.", sheetName, 1, "A"),
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

  return { meta, singles_sections: sections, couples_sections: [] };
}

function parseStrictInt(text: string): number {
  if (!text) throw new Error("empty");
  const n = parseInt(text, 10);
  if (isNaN(n)) throw new Error("not a number");
  return n;
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}
