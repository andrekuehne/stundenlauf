/**
 * Event type definitions for the append-only event log.
 *
 * Reference: F-TS01 §2 (Event Types)
 */

import type { RaceCategory, RaceEntryInput } from "./types.ts";

// --- Event Envelope ---

export interface EventMetadata {
  app_version: string;
  import_batch_id?: string;
}

export interface EventEnvelope<T extends string = string, P = unknown> {
  event_id: string;
  seq: number;
  recorded_at: string;
  type: T;
  schema_version: number;
  payload: P;
  metadata: EventMetadata;
}

// --- Payload Types ---

export interface ImportBatchRecordedPayload {
  import_batch_id: string;
  source_file: string;
  source_sha256: string;
  parser_version: string;
}

export interface ImportBatchRolledBackPayload {
  import_batch_id: string;
  reason: string;
}

export interface PersonRegisteredPayload {
  person_id: string;
  given_name: string;
  family_name: string;
  yob: number;
  gender: "M" | "F" | "X";
  club: string | null;
  club_normalized: string;
}

export interface PersonCorrectedPayload {
  person_id: string;
  updated_fields: {
    given_name?: string;
    family_name?: string;
    yob?: number;
    club?: string | null;
    club_normalized?: string;
  };
  rationale: string;
}

export interface TeamRegisteredPayload {
  team_id: string;
  member_person_ids: string[];
  team_kind: "solo" | "couple";
}

export interface RaceRegisteredPayload {
  race_event_id: string;
  import_batch_id: string;
  category: RaceCategory;
  race_no: number;
  race_date: string;
  entries: RaceEntryInput[];
}

export interface RaceRolledBackPayload {
  race_event_id: string;
  reason: string;
}

export interface RaceMetadataCorrectedPayload {
  race_event_id: string;
  updated_fields: {
    race_date?: string;
    race_no?: number;
    category?: RaceCategory;
  };
  rationale: string;
}

export interface EntryReassignedPayload {
  entry_id: string;
  race_event_id: string;
  from_team_id: string;
  to_team_id: string;
  rationale: string;
}

export interface EntryCorrectedPayload {
  entry_id: string;
  race_event_id: string;
  updated_fields: {
    distance_m?: number;
    points?: number;
    startnr?: string;
  };
  rationale: string;
}

export interface RankingEligibilitySetPayload {
  category: RaceCategory;
  team_id: string;
  eligible: boolean;
}

// --- Discriminated Union ---

export type DomainEvent =
  | EventEnvelope<"import_batch.recorded", ImportBatchRecordedPayload>
  | EventEnvelope<"import_batch.rolled_back", ImportBatchRolledBackPayload>
  | EventEnvelope<"person.registered", PersonRegisteredPayload>
  | EventEnvelope<"person.corrected", PersonCorrectedPayload>
  | EventEnvelope<"team.registered", TeamRegisteredPayload>
  | EventEnvelope<"race.registered", RaceRegisteredPayload>
  | EventEnvelope<"race.rolled_back", RaceRolledBackPayload>
  | EventEnvelope<"race.metadata_corrected", RaceMetadataCorrectedPayload>
  | EventEnvelope<"entry.reassigned", EntryReassignedPayload>
  | EventEnvelope<"entry.corrected", EntryCorrectedPayload>
  | EventEnvelope<"ranking.eligibility_set", RankingEligibilitySetPayload>;
