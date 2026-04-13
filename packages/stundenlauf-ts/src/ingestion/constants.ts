/**
 * Fixed constants for Excel layout parsing: expected headers, section markers, and parser version.
 *
 * Reference: F-TS02 §3–§4 (Excel Layout), Python singles.py lines 26–28, couples.py lines 26–44
 */

import type { Division, RaceDuration } from "@/domain/types";

export const PARSER_VERSION = "f-ts02-v1";

export const EXPECTED_HEADER_SINGLES: readonly string[] = [
  "Platz",
  "Startnr.",
  "Name",
  "Jahrg.",
  "Verein",
  "Distanz",
  "Rückstand",
  "Punkte",
] as const;

export const EXPECTED_HEADER_COUPLES: readonly string[] = [
  "Platz",
  "Startnr.",
  "Name",
  "Jahrg.",
  "Verein",
  "Name",
  "Jahrg.",
  "Verein",
  "Distanz",
  "Rückstand",
  "Punkte",
] as const;

export const DURATION_MARKERS: Record<string, RaceDuration> = {
  "1/2 h-Lauf": "half_hour",
  "h-Lauf": "hour",
};

export const DIVISION_MARKERS_SINGLES: Record<string, Division> = {
  Frauen: "women",
  Männer: "men",
};

export const DIVISION_MARKERS_COUPLES: Record<string, Division> = {
  "Paare Frauen": "couples_women",
  "Paare Männer": "couples_men",
  "Paare Mix": "couples_mixed",
};
