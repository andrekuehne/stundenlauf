/**
 * Local-only Excel fixtures under tests/data/xlsx/ (recursive, any subfolder).
 * *.xlsx is gitignored at repo root; this module is used by optional Vitest suites
 * and by scripts/dump-local-excel-fixtures.ts.
 */

import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to tests/data/xlsx (resolved from this file’s location). */
export const LOCAL_XLSX_FIXTURE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "xlsx",
);

/**
 * Paths relative to LOCAL_XLSX_FIXTURE_ROOT, posix slashes, sorted (de locale).
 */
export function listLocalXlsxRelativePaths(): string[] {
  if (!existsSync(LOCAL_XLSX_FIXTURE_ROOT)) return [];
  const entries = readdirSync(LOCAL_XLSX_FIXTURE_ROOT, { recursive: true }) as string[];
  return entries
    .filter((rel) => rel.toLowerCase().endsWith(".xlsx"))
    .map((rel) => rel.replace(/\\/g, "/"))
    .sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }));
}

export function fixtureBasename(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i === -1 ? relPath : relPath.slice(i + 1);
}

/** Same rule as production `detectSourceType`: “paare” in name ⇒ couples. */
export function isCouplesFixtureBasename(fileName: string): boolean {
  return fileName.toLowerCase().includes("paare");
}

/**
 * Singles-style fixture: not couples, and basename looks like an MW Einzellauf export
 * (e.g. Ergebnisliste MW_1.xlsx, Ergebnisliste MW Lauf 3.xlsx).
 */
export function isSinglesFixtureBasename(fileName: string): boolean {
  if (isCouplesFixtureBasename(fileName)) return false;
  return /MW[_\s]/.test(fileName);
}
