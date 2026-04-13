/**
 * Types for the import orchestration workflow.
 *
 * Reference: F-TS05 (Import Orchestration Workflow)
 */

import type { PersonRegisteredPayload, TeamRegisteredPayload } from "@/domain/events.ts";
import type { IncomingRowData, ResolutionInfo, SeasonState } from "@/domain/types.ts";
import type { ImportRaceContext, ParsedWorkbook } from "@/ingestion/types.ts";
import type { MatchRoute, ReviewItem } from "@/matching/types.ts";

// --- Phase ---

export type ImportPhase =
  | "parsing"
  | "validating"
  | "matching"
  | "reviewing"
  | "committing"
  | "done"
  | "failed";

// --- Staged entry ---

export interface StagedEntry {
  entry_id: string;
  startnr: string;
  team_id: string | null;
  distance_m: number;
  points: number;
  incoming: IncomingRowData;
  resolution: ResolutionInfo | null;
  review_routing: MatchRoute;
}

// --- Section result ---

export interface OrchestratedSection {
  context: ImportRaceContext;
  staged_entries: StagedEntry[];
  all_resolved: boolean;
}

// --- Review ---

export interface OrchestratedReviewEntry {
  section_index: number;
  entry_index: number;
  entry_id: string;
  status: "pending" | "resolved";
  review_item: ReviewItem;
  resolved_team_id?: string;
  resolved_method?: "manual" | "new_identity";
}

export type ReviewAction =
  | { type: "link_existing"; team_id: string }
  | { type: "create_new_identity" };

// --- Report ---

export interface ImportReport {
  auto_links: number;
  review_items: number;
  new_identities: number;
  conflicts: number;
  replay_overrides: number;
  rows_imported: number;
  sections_imported: number;
  events_emitted: number;
}

// --- Session ---

export interface ImportSession {
  session_id: string;
  import_batch_id: string;
  source_file: string;
  source_sha256: string;
  parser_version: string;
  phase: ImportPhase;

  parsed: ParsedWorkbook;
  season_state_at_start: SeasonState;

  section_results: OrchestratedSection[];
  review_queue: OrchestratedReviewEntry[];

  accumulated_person_payloads: PersonRegisteredPayload[];
  accumulated_team_payloads: TeamRegisteredPayload[];

  report: ImportReport;
}

// --- Validation ---

export type ValidationResult =
  | { valid: true }
  | { valid: false; code: string; message: string };
