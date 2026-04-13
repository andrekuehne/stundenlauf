/**
 * Import orchestration: parse → validate → match → review → emit.
 *
 * Public API barrel for the F-TS05 import orchestration module.
 *
 * Reference: F-TS05 (Import Orchestration Workflow)
 */

export { distanceKmToMeters } from "./convert.ts";
export { finalizeImport } from "./finalize.ts";
export type { FinalizeOptions } from "./finalize.ts";
export { emptyImportReport, mergeMatchingReport } from "./report.ts";
export { getReviewQueue, resolveReviewEntry } from "./review.ts";
export { runMatching } from "./run-matching.ts";
export { canStartImport, createSession } from "./session.ts";
export { startImport } from "./start-import.ts";
export type {
  ImportPhase,
  ImportReport,
  ImportSession,
  OrchestratedReviewEntry,
  OrchestratedSection,
  ReviewAction,
  StagedEntry,
  ValidationResult,
} from "./types.ts";
export {
  validateCategoryRaceNoConflicts,
  validateDuplicateImport,
  validateImport,
  validateNoDuplicateRows,
} from "./validate.ts";
