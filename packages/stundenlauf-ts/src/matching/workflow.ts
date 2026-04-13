/**
 * Section-level matching workflow: process all rows in a parsed section,
 * producing resolved entries and a matching report.
 *
 * Direct port of process_singles_section / process_couples_section from
 * backend/matching/workflow.py.
 * Reference: F-TS03 §7 (Resolution Pipeline), §10 (Workflow)
 */

import type { PersonIdentity, SeasonState, Team } from "@/domain/types.ts";
import type { ParsedSectionCouples, ParsedSectionSingles } from "@/ingestion/types.ts";
import type { MatchingConfig } from "./config.ts";
import {
  buildFingerprintReplayIndex,
  emptyRunStats,
  genderForDivision,
  memberGendersForCouples,
  resolvePerson,
  resolveTeamRow,
} from "./resolve.ts";
import type { MatchingReport, ReviewItem, SectionMatchResult } from "./types.ts";

function buildReviewItemForSingles(
  entry: { route: string; confidence: number; features: Record<string, number>; conflict_flags: string[]; top_candidate_uid: string | null; candidate_uids: string[]; candidate_confidences: number[] },
  entryId: string,
  rawName: string,
  yob: number,
  club: string | null,
  gender: "M" | "F" | "X",
  persons: ReadonlyMap<string, PersonIdentity>,
  teams: ReadonlyMap<string, Team>,
): ReviewItem | null {
  if (entry.route !== "review") return null;
  const candidates = entry.candidate_uids.map((uid, i) => {
    // Find person from teams or persons map
    let displayName = uid;
    let candYob = 0;
    let candClub: string | null = null;
    for (const team of teams.values()) {
      if (team.team_kind === "solo" && team.member_person_ids.includes(uid)) {
        const person = persons.get(uid);
        if (person) {
          displayName = [person.given_name, person.family_name].filter(Boolean).join(" ");
          candYob = person.yob;
          candClub = person.club;
        }
        break;
      }
    }
    // Also try direct person lookup (uid might be person_id)
    const person = persons.get(uid);
    if (person) {
      displayName = [person.given_name, person.family_name].filter(Boolean).join(" ");
      candYob = person.yob;
      candClub = person.club;
    }
    return {
      team_id: uid,
      score: entry.candidate_confidences[i] ?? 0,
      features: entry.features,
      display_name: displayName,
      yob: candYob,
      club: candClub,
    };
  });
  return {
    entry_id: entryId,
    incoming_display_name: rawName.trim(),
    incoming_yob: yob,
    incoming_club: club,
    incoming_kind: "solo",
    route: "review",
    confidence: entry.confidence,
    candidates,
    conflict_flags: entry.conflict_flags,
    gender,
  };
}

export async function processSinglesSection(
  state: SeasonState,
  section: ParsedSectionSingles,
  config: MatchingConfig,
): Promise<SectionMatchResult> {
  const replayIndex = await buildFingerprintReplayIndex(state);
  const stats = emptyRunStats();
  const usedCandidateUids = new Map<string, string>();

  const gender = genderForDivision(section.context.division);

  // Duplicate row detection
  const incomingKeys = new Map<string, number>();
  for (const row of section.rows) {
    const rowKey = [
      row.name.trim().toLowerCase(),
      String(row.yob || 0),
      (row.club || "").trim().toLowerCase(),
      row.startnr.trim(),
    ].join("|");
    incomingKeys.set(rowKey, (incomingKeys.get(rowKey) ?? 0) + 1);
  }
  for (const [, count] of incomingKeys) {
    if (count > 1) {
      throw new Error(
        "Importkonflikt: Doppelte Teilnehmerzeile im selben Lauf (Name/Jahrgang/Verein/Startnr).",
      );
    }
  }

  const candidatePeople = [...state.persons.values()];
  const resolvedEntries: SectionMatchResult["resolved_entries"] = [];
  const reviewItems: ReviewItem[] = [];
  const newPersonPayloads: SectionMatchResult["new_person_payloads"] = [];
  const newTeamPayloads: SectionMatchResult["new_team_payloads"] = [];

  for (const row of section.rows) {
    const entryId = crypto.randomUUID();
    const result = await resolvePerson({
      rawName: row.name,
      yob: row.yob,
      clubRaw: row.club,
      gender,
      candidatePeople,
      replayIndex,
      usedCandidateUids,
      config,
      entryId,
      stats,
      persons: state.persons,
      teams: state.teams,
    });

    resolvedEntries.push(result);
    newPersonPayloads.push(...result.new_persons);
    newTeamPayloads.push(...result.new_teams);

    const reviewItem = buildReviewItemForSingles(
      result, entryId, row.name, row.yob, row.club, gender,
      state.persons, state.teams,
    );
    if (reviewItem) reviewItems.push(reviewItem);
  }

  const report: MatchingReport = {
    auto_links: stats.auto_links,
    review_queue: stats.review_queue,
    new_identities: stats.new_identities,
    conflicts: stats.conflicts,
    replay_overrides: stats.replay_overrides,
    candidate_counts: stats.candidate_counts,
  };

  return {
    resolved_entries: resolvedEntries,
    review_items: reviewItems,
    new_person_payloads: newPersonPayloads,
    new_team_payloads: newTeamPayloads,
    report,
  };
}

export async function processCouplesSection(
  state: SeasonState,
  section: ParsedSectionCouples,
  config: MatchingConfig,
): Promise<SectionMatchResult> {
  const replayIndex = await buildFingerprintReplayIndex(state);
  const stats = emptyRunStats();
  const usedTeamUids = new Map<string, string>();

  const [genderA, genderB] = memberGendersForCouples(section.context.division);

  const resolvedEntries: SectionMatchResult["resolved_entries"] = [];
  const reviewItems: ReviewItem[] = [];
  const newPersonPayloads: SectionMatchResult["new_person_payloads"] = [];
  const newTeamPayloads: SectionMatchResult["new_team_payloads"] = [];

  for (const row of section.rows) {
    const entryId = crypto.randomUUID();
    const result = await resolveTeamRow({
      row,
      division: section.context.division,
      genderA,
      genderB,
      persons: state.persons,
      teams: state.teams,
      replayIndex,
      usedTeamUids,
      config,
      entryId,
      stats,
    });

    resolvedEntries.push(result);
    newPersonPayloads.push(...result.new_persons);
    newTeamPayloads.push(...result.new_teams);

    if (result.route === "review") {
      reviewItems.push({
        entry_id: entryId,
        incoming_display_name: `${row.name_a.trim()} / ${row.name_b.trim()}`,
        incoming_yob: 0,
        incoming_club: [row.club_a, row.club_b].filter(Boolean).join(" / ") || null,
        incoming_kind: "team",
        route: "review",
        confidence: result.confidence,
        candidates: result.candidate_uids.map((uid, i) => ({
          team_id: uid,
          score: result.candidate_confidences[i] ?? 0,
          features: result.features,
          display_name: uid,
          yob: 0,
          club: null,
        })),
        conflict_flags: result.conflict_flags,
        gender: genderA,
      });
    }
  }

  const report: MatchingReport = {
    auto_links: stats.auto_links,
    review_queue: stats.review_queue,
    new_identities: stats.new_identities,
    conflicts: stats.conflicts,
    replay_overrides: stats.replay_overrides,
    candidate_counts: stats.candidate_counts,
  };

  return {
    resolved_entries: resolvedEntries,
    review_items: reviewItems,
    new_person_payloads: newPersonPayloads,
    new_team_payloads: newTeamPayloads,
    report,
  };
}
