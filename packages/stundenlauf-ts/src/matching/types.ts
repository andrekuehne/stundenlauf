/**
 * Shared types for the fuzzy matching engine.
 *
 * Reference: F-TS03 (Fuzzy Matching Engine)
 */

import type {
  PersonRegisteredPayload,
  TeamRegisteredPayload,
} from "@/domain/events.ts";
import type { Gender, PersonIdentity } from "@/domain/types.ts";

// --- Name parsing ---

export interface ParsedName {
  given: string;
  family: string;
  tokens: string[];
  display_compact: string;
}

// --- Matching outcome types ---

export type MatchRoute = "auto" | "review" | "new_identity";

export interface MatchingFeatures {
  [key: string]: number;
}

export interface ScoredCandidate {
  person: PersonIdentity;
  score: number;
  features: MatchingFeatures;
}

export interface ScoredCoupleCandidate {
  team_id: string;
  members: [PersonIdentity, PersonIdentity];
  score: number;
  features: MatchingFeatures;
}

export interface ResolvedEntry {
  team_id: string;
  route: MatchRoute;
  confidence: number;
  candidate_count: number;
  top_candidate_uid: string | null;
  candidate_uids: string[];
  candidate_confidences: number[];
  features: MatchingFeatures;
  conflict_flags: string[];
  new_persons: PersonRegisteredPayload[];
  new_teams: TeamRegisteredPayload[];
}

export interface ReviewItem {
  entry_id: string;
  incoming_display_name: string;
  incoming_yob: number;
  incoming_club: string | null;
  incoming_kind: "solo" | "team";
  route: MatchRoute;
  confidence: number;
  candidates: ReviewCandidate[];
  conflict_flags: string[];
  gender: Gender;
}

export interface ReviewCandidate {
  team_id: string;
  score: number;
  features: MatchingFeatures;
  display_name: string;
  yob: number;
  club: string | null;
}

// --- Workflow result ---

export interface SectionMatchResult {
  resolved_entries: ResolvedEntry[];
  review_items: ReviewItem[];
  new_person_payloads: PersonRegisteredPayload[];
  new_team_payloads: TeamRegisteredPayload[];
  report: MatchingReport;
}

export interface MatchingReport {
  auto_links: number;
  review_queue: number;
  new_identities: number;
  conflicts: number;
  replay_overrides: number;
  candidate_counts: number[];
}
