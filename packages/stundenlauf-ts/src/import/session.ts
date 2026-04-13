/**
 * Import session lifecycle helpers.
 *
 * Reference: F-TS05 §7 (Import Blocking), §2 (Import Session)
 */

import type { SeasonState } from "@/domain/types.ts";
import type { ParsedWorkbook } from "@/ingestion/types.ts";
import { emptyImportReport } from "./report.ts";
import type { ImportPhase, ImportSession } from "./types.ts";

export function canStartImport(session: ImportSession | null): boolean {
  if (session === null) return true;
  return session.phase === "done" || session.phase === "failed";
}

export function createSession(
  parsed: ParsedWorkbook,
  seasonState: SeasonState,
): ImportSession {
  return {
    session_id: crypto.randomUUID(),
    import_batch_id: crypto.randomUUID(),
    source_file: parsed.meta.source_file,
    source_sha256: parsed.meta.source_sha256,
    parser_version: parsed.meta.parser_version,
    phase: "matching",
    parsed,
    season_state_at_start: seasonState,
    section_results: [],
    review_queue: [],
    accumulated_person_payloads: [],
    accumulated_team_payloads: [],
    report: emptyImportReport(),
  };
}

export function assertPhase(session: ImportSession, expected: ImportPhase): void {
  if (session.phase !== expected) {
    throw new Error(
      `Import session is in phase "${session.phase}", expected "${expected}".`,
    );
  }
}

export function withPhase(session: ImportSession, phase: ImportPhase): ImportSession {
  return { ...session, phase };
}
