/**
 * Formatting utilities for German display values.
 * Ported from frontend/strings.js UIFormat helpers.
 *
 * Reference: F-TS06 §7 (German String Catalog)
 */

import { STR } from "@/strings.ts";

export type ConfidenceLevel = keyof typeof STR.confidence;

/**
 * Format a kilometer value with German decimal comma and fixed precision.
 * Contract for UI tables/export labels: kilometers in, "12,340" out.
 */
export function formatKm(kilometers: number): string {
  if (!Number.isFinite(kilometers)) {
    return String(kilometers);
  }
  return kilometers.toLocaleString("de-DE", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

export function seasonLabel(year: number | string): string {
  return `Saison: ${year}`;
}

export function reviewOpenCount(count: number): string {
  return `Prüfungen offen: ${Math.max(0, Math.trunc(count))}`;
}

export function confidenceLabel(level: ConfidenceLevel): string {
  return STR.confidence[level];
}

export function reviewConfidenceText(level: ConfidenceLevel, percent: number): string {
  const safePercent = Number.isFinite(percent) ? Math.round(percent) : 0;
  return `Treffersicherheit: ${confidenceLabel(level)} (${safePercent}%).`;
}
