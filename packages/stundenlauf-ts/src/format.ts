/**
 * Formatting utilities for German display values.
 * Ported from frontend/strings.js UIFormat helpers.
 *
 * Reference: F-TS06 §7 (German String Catalog)
 */

export function formatKm(meters: number): string {
  const km = meters / 1000;
  return km.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
