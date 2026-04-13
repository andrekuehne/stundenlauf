/**
 * Helpers for building synthetic .xlsx workbooks in tests.
 */

import * as XLSX from "xlsx";

/**
 * Build a minimal .xlsx ArrayBuffer from a 2D array of cell values.
 * The first row is treated as the header.
 */
export function buildXlsx(rows: unknown[][], sheetName = "Sheet1"): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  // In Node, XLSX.write with type "buffer" returns a Node Buffer (subclass of Uint8Array)
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
  // Extract a clean ArrayBuffer from the typed array view
  return buf.slice().buffer;
}
