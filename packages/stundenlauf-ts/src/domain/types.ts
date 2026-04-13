/**
 * Core domain value types and enums for the Stundenlauf event-sourced model.
 *
 * Reference: F-TS01 §1 (Person and Team Model), §6 (Datasets)
 */

// --- Enums ---

export type Gender = "M" | "F" | "X";
export type RaceDuration = "half_hour" | "hour";
export type Division =
  | "men"
  | "women"
  | "couples_men"
  | "couples_women"
  | "couples_mixed";
export type RaceEventState = "active" | "rolled_back";
export type TeamKind = "solo" | "couple";
export type ImportBatchState = "active" | "rolled_back";
export type ResolutionMethod = "auto" | "manual" | "new_identity";

// --- Value Objects ---

export interface RaceCategory {
  duration: RaceDuration;
  division: Division;
}

export interface PersonIdentity {
  person_id: string;
  given_name: string;
  family_name: string;
  yob: number;
  gender: Gender;
  club: string | null;
  club_normalized: string;
}

export interface Team {
  team_id: string;
  member_person_ids: string[];
  team_kind: TeamKind;
}

export interface IncomingRowData {
  display_name: string;
  yob: number | null;
  yob_text: string | null;
  club: string | null;
  row_kind: "solo" | "team";
  sheet_name: string;
  section_name: string;
  row_index: number;
}

export interface ResolutionInfo {
  method: ResolutionMethod;
  confidence: number | null;
  candidate_count: number;
}

export interface RaceEntryInput {
  entry_id: string;
  startnr: string;
  team_id: string;
  distance_m: number;
  points: number;
  incoming: IncomingRowData;
  resolution: ResolutionInfo;
}

// --- Projected State Types ---

export interface ImportBatch {
  import_batch_id: string;
  source_file: string;
  source_sha256: string;
  parser_version: string;
  state: ImportBatchState;
  rollback?: {
    event_id: string;
    rolled_back_at: string;
    reason: string;
  };
}

export interface RaceEntry {
  entry_id: string;
  startnr: string;
  team_id: string;
  distance_m: number;
  points: number;
  incoming: IncomingRowData;
  resolution: ResolutionInfo;
}

export interface RaceEvent {
  race_event_id: string;
  import_batch_id: string;
  category: RaceCategory;
  race_no: number;
  race_date: string;
  state: RaceEventState;
  imported_at: string;
  entries: RaceEntry[];
  rollback?: {
    event_id: string;
    rolled_back_at: string;
    reason: string;
  };
}

export interface SeasonDescriptor {
  season_id: string;
  label: string;
  created_at: string;
}

export interface SeasonState {
  season_id: string;
  persons: Map<string, PersonIdentity>;
  teams: Map<string, Team>;
  import_batches: Map<string, ImportBatch>;
  race_events: Map<string, RaceEvent>;
  exclusions: Map<string, Set<string>>;
}
