/**
 * Intermediate types for the Excel parsing pipeline.
 *
 * These represent the structured output of parsing an organizer's .xlsx file,
 * before any matching or event emission occurs.
 *
 * Reference: F-TS02 §8 (Output Types)
 */

import type { Division, RaceDuration } from "@/domain/types";

export interface ImportWorkbookMeta {
  source_file: string;
  source_sha256: string;
  parser_version: string;
  schema_fingerprint: string;
  file_mtime: number;
  imported_at: string;
}

export interface ImportRaceContext {
  race_no: number;
  duration: RaceDuration;
  division: Division;
  event_date: string | null;
}

export interface ImportRowSingles {
  startnr: string;
  name: string;
  yob: number;
  club: string | null;
  distance_km: number;
  points: number;
}

export interface ImportRowCouples {
  startnr: string;
  name_a: string;
  yob_a: number;
  club_a: string | null;
  name_b: string;
  yob_b: number;
  club_b: string | null;
  distance_km: number;
  points: number;
}

export interface ParsedSection<R> {
  context: ImportRaceContext;
  rows: readonly R[];
}

export type ParsedSectionSingles = ParsedSection<ImportRowSingles>;
export type ParsedSectionCouples = ParsedSection<ImportRowCouples>;

export interface ParsedWorkbook {
  meta: ImportWorkbookMeta;
  singles_sections: readonly ParsedSectionSingles[];
  couples_sections: readonly ParsedSectionCouples[];
}
