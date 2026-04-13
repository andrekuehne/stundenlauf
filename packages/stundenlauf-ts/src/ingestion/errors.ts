/**
 * Validation error types for the Excel parsing pipeline.
 *
 * Reference: F-TS02 §9 (Validation Error Types)
 */

export interface IssueLocation {
  sheet: string;
  row: number;
  column: string;
}

export type ValidationIssueCode =
  | "excel_schema_mismatch"
  | "missing_section_marker"
  | "invalid_number"
  | "invalid_couple_members"
  | "no_rows";

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  code: ValidationIssueCode;
  message_de: string;
  location: IssueLocation;
  severity: IssueSeverity;
}

export class ExcelParseError extends Error {
  constructor(public readonly issues: readonly ValidationIssue[]) {
    super(issues[0]?.message_de ?? "Import validation failed.");
    this.name = "ExcelParseError";
  }
}

export function makeIssue(
  code: ValidationIssueCode,
  message_de: string,
  sheet: string,
  row: number,
  column: string,
): ValidationIssue {
  return {
    code,
    message_de,
    location: { sheet, row, column },
    severity: "error",
  };
}
