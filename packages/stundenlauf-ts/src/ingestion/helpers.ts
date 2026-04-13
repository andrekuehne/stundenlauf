/**
 * Shared helper functions for the Excel parsing pipeline.
 *
 * Reference: F-TS02 §7 (Helper Functions), Python common.py, club.py
 */

export function toText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return `${value as string | number}`.trim();
}

export function parseDecimal(value: unknown): number {
  const text = toText(value).replace(",", ".");
  if (!text) throw new Error("empty");
  const n = parseFloat(text);
  if (isNaN(n)) throw new Error("not a number");
  return n;
}

const HAS_ALNUM = /[\p{L}\p{N}]/u;

export function optionalClubFromCell(value: unknown): string | null {
  const text = toText(value);
  if (!text) return null;
  if (!HAS_ALNUM.test(text)) return null;
  return text;
}

/**
 * Extract race number from the filename using the same regex cascade as Python:
 * 1. "Lauf <digits>" pattern (case-insensitive)
 * 2. A single isolated digit (not adjacent to other digits)
 * 3. Otherwise 0
 */
export function parseRaceNo(fileName: string): number {
  const laufMatch = fileName.match(/Lauf\s+(\d+)/i);
  if (laufMatch?.[1]) return parseInt(laufMatch[1], 10);

  const isolated = fileName.match(/(?<!\d)\d(?!\d)/g);
  if (isolated && isolated.length === 1) {
    const n = parseInt(isolated[0], 10);
    return n >= 1 ? n : 0;
  }
  return 0;
}

export async function fileSha256(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function detectSourceType(
  fileName: string,
): "singles" | "couples" {
  return fileName.toLowerCase().includes("paare") ? "couples" : "singles";
}
