/**
 * Phase 1+2: Parse a workbook file and validate it against the current
 * season state. Returns an ImportSession ready for the matching phase.
 *
 * Reference: F-TS05 §9 (Public API)
 */

import type { SeasonState } from "@/domain/types.ts";
import { parseWorkbook } from "@/ingestion/parse-workbook.ts";
import type { ParseWorkbookOptions } from "@/ingestion/parse-workbook.ts";
import { createSession } from "./session.ts";
import type { ImportSession } from "./types.ts";
import { validateImport } from "./validate.ts";

export async function startImport(
  file: File,
  seasonState: SeasonState,
  options?: ParseWorkbookOptions,
): Promise<ImportSession> {
  const parsed = await parseWorkbook(file, file.name, options);

  const result = validateImport(parsed, seasonState);
  if (!result.valid) {
    throw new Error(result.message);
  }

  return createSession(parsed, seasonState);
}
