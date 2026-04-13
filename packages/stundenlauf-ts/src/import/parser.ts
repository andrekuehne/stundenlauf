/**
 * Re-export from the ingestion module.
 *
 * The actual parsing implementation lives in src/ingestion/ (F-TS02).
 * This stub remains for backward compatibility with existing import paths.
 */

export { parseWorkbook } from "@/ingestion/parse-workbook";
export type { ParseWorkbookOptions } from "@/ingestion/parse-workbook";
