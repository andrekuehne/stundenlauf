/**
 * Entry-point parser that auto-detects singles vs. couples and delegates.
 *
 * Reference: F-TS02 §10 (Singles vs. Couples Detection), §2 (File Input)
 */

import { parseCouplesWorkbook } from "./parse-couples";
import { parseSinglesWorkbook } from "./parse-singles";
import { detectSourceType, fileSha256 } from "./helpers";
import type { ParsedWorkbook } from "./types";

export interface ParseWorkbookOptions {
  raceNoOverride?: number;
  sourceType?: "singles" | "couples";
}

function isFile(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

export async function parseWorkbook(
  file: File | ArrayBuffer,
  fileName: string,
  options?: ParseWorkbookOptions,
): Promise<ParsedWorkbook> {
  let buffer: ArrayBuffer;
  let fileMtime: number;

  if (isFile(file)) {
    buffer = await file.arrayBuffer();
    fileMtime = file.lastModified;
  } else {
    buffer = file;
    fileMtime = 0;
  }

  const sha256 = await fileSha256(buffer);
  const sourceType = options?.sourceType ?? detectSourceType(fileName);

  const input = {
    buffer,
    fileName,
    sha256,
    fileMtime,
    raceNoOverride: options?.raceNoOverride,
  };

  if (sourceType === "couples") {
    return parseCouplesWorkbook(input);
  }
  return parseSinglesWorkbook(input);
}
