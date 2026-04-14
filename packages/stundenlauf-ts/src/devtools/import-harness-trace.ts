import type {
  PersonRegisteredPayload,
  TeamRegisteredPayload,
} from "@/domain/events.ts";
import type {
  Division,
  PersonIdentity,
  RaceDuration,
  SeasonState,
} from "@/domain/types.ts";
import type {
  ParsedSectionCouples,
  ParsedSectionSingles,
  ParsedWorkbook,
} from "@/ingestion/types.ts";
import { getReviewQueue, resolveReviewEntry } from "@/import/review.ts";
import type { ImportSession } from "@/import/types.ts";
import type { MatchingConfig } from "@/matching/config.ts";
import type { ResolvedEntry, SectionMatchResult } from "@/matching/types.ts";
import { processCouplesSection, processSinglesSection } from "@/matching/workflow.ts";

export interface PoolSnapshot {
  person_count: number;
  team_count: number;
  people: PoolPerson[];
  teams: PoolTeam[];
}

export interface PoolPerson {
  person_id: string;
  display_name: string;
  yob: number;
  gender: string;
  club: string | null;
}

export interface PoolTeam {
  team_id: string;
  team_kind: string;
  member_person_ids: string[];
}

export interface HarnessRowTrace {
  row_index: number;
  startnr: string;
  row_kind: "solo" | "team";
  display_name: string;
  yob_text: string | null;
  club_text: string | null;
  distance_km: number;
  points: number;
  route: "auto" | "review" | "new_identity";
  linked_team_id: string;
  confidence: number;
  candidate_count: number;
  top_candidate_uid: string | null;
  candidate_uids: string[];
  candidate_confidences: number[];
  conflict_flags: string[];
  features: Record<string, number>;
  new_person_ids: string[];
  new_team_ids: string[];
}

export interface HarnessSectionTrace {
  section_index: number;
  duration: RaceDuration;
  division: Division;
  race_no: number;
  event_date: string | null;
  pool_before: PoolSnapshot;
  rows: HarnessRowTrace[];
}

function personDisplayName(person: PersonIdentity): string {
  return `${person.given_name} ${person.family_name}`.trim();
}

function summarizePool(state: SeasonState): PoolSnapshot {
  const people = [...state.persons.values()].map((person) => ({
    person_id: person.person_id,
    display_name: personDisplayName(person),
    yob: person.yob,
    gender: person.gender,
    club: person.club,
  }));
  const teams = [...state.teams.values()].map((team) => ({
    team_id: team.team_id,
    team_kind: team.team_kind,
    member_person_ids: [...team.member_person_ids],
  }));

  people.sort((a, b) => a.display_name.localeCompare(b.display_name));
  teams.sort((a, b) => a.team_id.localeCompare(b.team_id));

  return {
    person_count: people.length,
    team_count: teams.length,
    people,
    teams,
  };
}

function enrichState(
  state: SeasonState,
  personPayloads: readonly PersonRegisteredPayload[],
  teamPayloads: readonly TeamRegisteredPayload[],
): SeasonState {
  const persons = new Map(state.persons);
  for (const payload of personPayloads) {
    persons.set(payload.person_id, {
      person_id: payload.person_id,
      given_name: payload.given_name,
      family_name: payload.family_name,
      yob: payload.yob,
      gender: payload.gender,
      club: payload.club,
      club_normalized: payload.club_normalized,
    });
  }

  const teams = new Map(state.teams);
  for (const payload of teamPayloads) {
    teams.set(payload.team_id, {
      team_id: payload.team_id,
      member_person_ids: [...payload.member_person_ids],
      team_kind: payload.team_kind,
    });
  }

  return {
    ...state,
    persons,
    teams,
  };
}

function mapSinglesRow(
  row: ParsedSectionSingles["rows"][number],
  resolved: ResolvedEntry,
  rowIndex: number,
): HarnessRowTrace {
  return {
    row_index: rowIndex,
    startnr: row.startnr,
    row_kind: "solo",
    display_name: row.name,
    yob_text: String(row.yob),
    club_text: row.club,
    distance_km: row.distance_km,
    points: row.points,
    route: resolved.route,
    linked_team_id: resolved.team_id,
    confidence: resolved.confidence,
    candidate_count: resolved.candidate_count,
    top_candidate_uid: resolved.top_candidate_uid,
    candidate_uids: [...resolved.candidate_uids],
    candidate_confidences: [...resolved.candidate_confidences],
    conflict_flags: [...resolved.conflict_flags],
    features: { ...resolved.features },
    new_person_ids: resolved.new_persons.map((entry) => entry.person_id),
    new_team_ids: resolved.new_teams.map((entry) => entry.team_id),
  };
}

function mapCouplesRow(
  row: ParsedSectionCouples["rows"][number],
  resolved: ResolvedEntry,
  rowIndex: number,
): HarnessRowTrace {
  return {
    row_index: rowIndex,
    startnr: row.startnr,
    row_kind: "team",
    display_name: `${row.name_a} / ${row.name_b}`,
    yob_text: `${row.yob_a} / ${row.yob_b}`,
    club_text: [row.club_a, row.club_b].filter(Boolean).join(" / ") || null,
    distance_km: row.distance_km,
    points: row.points,
    route: resolved.route,
    linked_team_id: resolved.team_id,
    confidence: resolved.confidence,
    candidate_count: resolved.candidate_count,
    top_candidate_uid: resolved.top_candidate_uid,
    candidate_uids: [...resolved.candidate_uids],
    candidate_confidences: [...resolved.candidate_confidences],
    conflict_flags: [...resolved.conflict_flags],
    features: { ...resolved.features },
    new_person_ids: resolved.new_persons.map((entry) => entry.person_id),
    new_team_ids: resolved.new_teams.map((entry) => entry.team_id),
  };
}

function mapSinglesSection(
  section: ParsedSectionSingles,
  matchResult: SectionMatchResult,
  sectionIndex: number,
  poolBefore: PoolSnapshot,
): HarnessSectionTrace {
  return {
    section_index: sectionIndex,
    duration: section.context.duration,
    division: section.context.division,
    race_no: section.context.race_no,
    event_date: section.context.event_date,
    pool_before: poolBefore,
    rows: section.rows.map((row, rowIndex) => {
      const resolved = matchResult.resolved_entries[rowIndex];
      if (resolved === undefined) {
        throw new Error(`Missing resolved entry at singles row index ${rowIndex}.`);
      }
      return mapSinglesRow(row, resolved, rowIndex);
    }),
  };
}

function mapCouplesSection(
  section: ParsedSectionCouples,
  matchResult: SectionMatchResult,
  sectionIndex: number,
  poolBefore: PoolSnapshot,
): HarnessSectionTrace {
  return {
    section_index: sectionIndex,
    duration: section.context.duration,
    division: section.context.division,
    race_no: section.context.race_no,
    event_date: section.context.event_date,
    pool_before: poolBefore,
    rows: section.rows.map((row, rowIndex) => {
      const resolved = matchResult.resolved_entries[rowIndex];
      if (resolved === undefined) {
        throw new Error(`Missing resolved entry at couples row index ${rowIndex}.`);
      }
      return mapCouplesRow(row, resolved, rowIndex);
    }),
  };
}

export async function buildImportTrace(
  parsed: ParsedWorkbook,
  startState: SeasonState,
  config: MatchingConfig,
): Promise<HarnessSectionTrace[]> {
  let workingState = startState;
  let sectionIndex = 0;
  const traces: HarnessSectionTrace[] = [];

  for (const singlesSection of parsed.singles_sections) {
    const poolBefore = summarizePool(workingState);
    const matchResult = await processSinglesSection(
      workingState,
      singlesSection,
      config,
    );
    traces.push(
      mapSinglesSection(singlesSection, matchResult, sectionIndex, poolBefore),
    );
    workingState = enrichState(
      workingState,
      matchResult.new_person_payloads,
      matchResult.new_team_payloads,
    );
    sectionIndex++;
  }

  for (const couplesSection of parsed.couples_sections) {
    const poolBefore = summarizePool(workingState);
    const matchResult = await processCouplesSection(
      workingState,
      couplesSection,
      config,
    );
    traces.push(
      mapCouplesSection(couplesSection, matchResult, sectionIndex, poolBefore),
    );
    workingState = enrichState(
      workingState,
      matchResult.new_person_payloads,
      matchResult.new_team_payloads,
    );
    sectionIndex++;
  }

  return traces;
}

export function autoResolveReviewQueue(session: ImportSession): ImportSession {
  let current = session;
  while (current.phase === "reviewing") {
    const pending = getReviewQueue(current);
    if (pending.length === 0) return current;
    const next = pending[0];
    if (next === undefined) return current;
    const topCandidate = next.review_item.candidates[0];
    current = resolveReviewEntry(current, next.entry_id, topCandidate
      ? { type: "link_existing", team_id: topCandidate.team_id }
      : { type: "create_new_identity" });
  }
  return current;
}
