/**
 * Phase 3: Run the matching engine on every section in the parsed workbook
 * and build the staging area with orchestrated review entries.
 *
 * Uses progressive state enrichment: new persons/teams from section N are
 * visible to section N+1 to avoid creating duplicate identities within a
 * single file import.
 *
 * Reference: F-TS05 §3 (Match + Stage Phase)
 */

import type {
  PersonRegisteredPayload,
  TeamRegisteredPayload,
} from "@/domain/events.ts";
import type { IncomingRowData, PersonIdentity, SeasonState, Team } from "@/domain/types.ts";
import { canonicalizeClub, canonicalizePersonNames } from "@/domain/person-identity.ts";
import type { MatchingConfig } from "@/matching/config.ts";
import type {
  ResolvedEntry,
  SectionMatchResult,
} from "@/matching/types.ts";
import { processCouplesSection, processSinglesSection } from "@/matching/workflow.ts";
import type { ImportRaceContext } from "@/ingestion/types.ts";
import {
  buildCouplesIncomingRowData,
  buildSinglesIncomingRowData,
  distanceKmToMeters,
} from "./convert.ts";
import { mergeMatchingReport } from "./report.ts";
import { assertPhase } from "./session.ts";
import type {
  ImportSession,
  OrchestratedReviewEntry,
  OrchestratedSection,
  StagedEntry,
} from "./types.ts";

function enrichState(
  state: SeasonState,
  personPayloads: readonly PersonRegisteredPayload[],
  teamPayloads: readonly TeamRegisteredPayload[],
): SeasonState {
  const persons = new Map(state.persons);
  for (const p of personPayloads) {
    const names = canonicalizePersonNames(p);
    const club = canonicalizeClub(p);
    const identity: PersonIdentity = {
      person_id: p.person_id,
      given_name: names.given_name,
      family_name: names.family_name,
      display_name: names.display_name,
      name_normalized: names.name_normalized,
      yob: p.yob,
      gender: p.gender,
      club: club.club,
      club_normalized: club.club_normalized,
    };
    persons.set(p.person_id, identity);
  }

  const teams = new Map(state.teams);
  for (const t of teamPayloads) {
    const team: Team = {
      team_id: t.team_id,
      member_person_ids: [...t.member_person_ids],
      team_kind: t.team_kind,
    };
    teams.set(t.team_id, team);
  }

  return { ...state, persons, teams };
}

function buildStagedEntriesForSingles(
  matchResult: SectionMatchResult,
  section: { context: ImportRaceContext; rows: readonly { startnr: string; distance_km: number; points: number; name: string; yob: number; club: string | null }[] },
  sourceFile: string,
): StagedEntry[] {
  return matchResult.resolved_entries.map((resolved, i) => {
    const row = section.rows[i];
    if (row === undefined) throw new Error(`Row ${i} missing from section`);
    const entryId = crypto.randomUUID();
    return buildStagedEntry(
      entryId,
      row.startnr,
      row.distance_km,
      row.points,
      resolved,
      buildSinglesIncomingRowData(row, section.context, i, sourceFile),
    );
  });
}

function buildStagedEntriesForCouples(
  matchResult: SectionMatchResult,
  section: { context: ImportRaceContext; rows: readonly { startnr: string; distance_km: number; points: number; name_a: string; yob_a: number; club_a: string | null; name_b: string; yob_b: number; club_b: string | null }[] },
  sourceFile: string,
): StagedEntry[] {
  return matchResult.resolved_entries.map((resolved, i) => {
    const row = section.rows[i];
    if (row === undefined) throw new Error(`Row ${i} missing from section`);
    const entryId = crypto.randomUUID();
    return buildStagedEntry(
      entryId,
      row.startnr,
      row.distance_km,
      row.points,
      resolved,
      buildCouplesIncomingRowData(row, section.context, i, sourceFile),
    );
  });
}

function buildStagedEntry(
  entryId: string,
  startnr: string,
  distanceKm: number,
  points: number,
  resolved: ResolvedEntry,
  incoming: IncomingRowData,
): StagedEntry {
  const isResolved = resolved.route !== "review";
  return {
    entry_id: entryId,
    startnr,
    team_id: isResolved ? resolved.team_id : null,
    distance_m: distanceKmToMeters(distanceKm),
    points,
    incoming,
    resolution: isResolved
      ? {
          method: resolved.route === "auto" ? "auto" : "new_identity",
          confidence: resolved.confidence,
          candidate_count: resolved.candidate_count,
        }
      : null,
    review_routing: resolved.route,
  };
}

function buildOrchestratedReviewEntries(
  matchResult: SectionMatchResult,
  stagedEntries: StagedEntry[],
  sectionIndex: number,
): OrchestratedReviewEntry[] {
  const entries: OrchestratedReviewEntry[] = [];
  let reviewItemIdx = 0;

  for (let i = 0; i < stagedEntries.length; i++) {
    const staged = stagedEntries[i];
    if (staged === undefined) continue;
    if (staged.review_routing === "review") {
      const reviewItem = matchResult.review_items[reviewItemIdx++];
      if (reviewItem) {
        entries.push({
          section_index: sectionIndex,
          entry_index: i,
          entry_id: staged.entry_id,
          status: "pending",
          review_item: { ...reviewItem, entry_id: staged.entry_id },
        });
      }
    }
  }
  return entries;
}

export async function runMatching(
  session: ImportSession,
  config: MatchingConfig,
): Promise<ImportSession> {
  assertPhase(session, "matching");

  let workingState = session.season_state_at_start;
  const sections: OrchestratedSection[] = [];
  const allReviewEntries: OrchestratedReviewEntry[] = [];
  const allPersonPayloads: PersonRegisteredPayload[] = [];
  const allTeamPayloads: TeamRegisteredPayload[] = [];
  let report = session.report;
  let sectionIndex = 0;

  for (const singlesSection of session.parsed.singles_sections) {
    const matchResult = await processSinglesSection(workingState, singlesSection, config);
    const stagedEntries = buildStagedEntriesForSingles(
      matchResult,
      singlesSection,
      session.source_file,
    );

    const reviewEntries = buildOrchestratedReviewEntries(
      matchResult,
      stagedEntries,
      sectionIndex,
    );

    sections.push({
      context: singlesSection.context,
      staged_entries: stagedEntries,
      all_resolved: reviewEntries.length === 0,
    });

    allReviewEntries.push(...reviewEntries);
    allPersonPayloads.push(...matchResult.new_person_payloads);
    allTeamPayloads.push(...matchResult.new_team_payloads);
    report = mergeMatchingReport(report, matchResult.report, singlesSection.rows.length);

    workingState = enrichState(
      workingState,
      matchResult.new_person_payloads,
      matchResult.new_team_payloads,
    );
    sectionIndex++;
  }

  for (const couplesSection of session.parsed.couples_sections) {
    const matchResult = await processCouplesSection(workingState, couplesSection, config);
    const stagedEntries = buildStagedEntriesForCouples(
      matchResult,
      couplesSection,
      session.source_file,
    );

    const reviewEntries = buildOrchestratedReviewEntries(
      matchResult,
      stagedEntries,
      sectionIndex,
    );

    sections.push({
      context: couplesSection.context,
      staged_entries: stagedEntries,
      all_resolved: reviewEntries.length === 0,
    });

    allReviewEntries.push(...reviewEntries);
    allPersonPayloads.push(...matchResult.new_person_payloads);
    allTeamPayloads.push(...matchResult.new_team_payloads);
    report = mergeMatchingReport(report, matchResult.report, couplesSection.rows.length);

    workingState = enrichState(
      workingState,
      matchResult.new_person_payloads,
      matchResult.new_team_payloads,
    );
    sectionIndex++;
  }

  const hasReviews = allReviewEntries.length > 0;

  return {
    ...session,
    phase: hasReviews ? "reviewing" : "committing",
    section_results: sections,
    review_queue: allReviewEntries,
    accumulated_person_payloads: allPersonPayloads,
    accumulated_team_payloads: allTeamPayloads,
    report,
  };
}
