/**
 * Data conversion helpers for the import orchestration layer.
 *
 * - distance_km (float) → distance_m (integer)
 * - Parser row types → IncomingRowData for event payloads
 *
 * Reference: F-TS05 §6 (Event Batch Construction)
 */

import type { IncomingRowData } from "@/domain/types.ts";
import type {
  ImportRaceContext,
  ImportRowCouples,
  ImportRowSingles,
} from "@/ingestion/types.ts";

export function distanceKmToMeters(km: number): number {
  return Math.round(km * 1000);
}

const DIVISION_LABELS: Record<string, string> = {
  men: "Herren",
  women: "Frauen",
  couples_men: "Paare Männer",
  couples_women: "Paare Frauen",
  couples_mixed: "Paare Mix",
};

const DURATION_LABELS: Record<string, string> = {
  half_hour: "30min",
  hour: "60min",
};

export function sectionNameFromContext(ctx: ImportRaceContext): string {
  const div = DIVISION_LABELS[ctx.division] ?? ctx.division;
  const dur = DURATION_LABELS[ctx.duration] ?? ctx.duration;
  return `${div} ${dur}`;
}

export function buildSinglesIncomingRowData(
  row: ImportRowSingles,
  ctx: ImportRaceContext,
  rowIndex: number,
  sourceFile: string,
): IncomingRowData {
  return {
    display_name: row.name,
    yob: row.yob,
    yob_text: null,
    club: row.club,
    row_kind: "solo",
    sheet_name: sourceFile,
    section_name: sectionNameFromContext(ctx),
    row_index: rowIndex,
  };
}

export function buildCouplesIncomingRowData(
  row: ImportRowCouples,
  ctx: ImportRaceContext,
  rowIndex: number,
  sourceFile: string,
): IncomingRowData {
  const clubs = [row.club_a, row.club_b].filter(Boolean);
  return {
    display_name: `${row.name_a} / ${row.name_b}`,
    yob: null,
    yob_text: `${row.yob_a} / ${row.yob_b}`,
    club: clubs.length > 0 ? clubs.join(" / ") : null,
    row_kind: "team",
    sheet_name: sourceFile,
    section_name: sectionNameFromContext(ctx),
    row_index: rowIndex,
  };
}
