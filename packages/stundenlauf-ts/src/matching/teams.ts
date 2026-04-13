/**
 * Couple/team blocking index and scoring.
 *
 * Direct port of backend/matching/teams.py.
 * Reference: F-TS03 §5 (Scoring: Couples)
 */

import type { Division, PersonIdentity, Team } from "@/domain/types.ts";
import { candidatePersonKeys } from "./candidates.ts";
import type { MatchingConfig } from "./config.ts";
import { personParsed, scorePersonMatch } from "./score.ts";
import type { MatchingFeatures, ParsedName } from "./types.ts";

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Resolve a couple team's two members from the persons lookup.
 * Returns null if either member is missing.
 */
export function resolveTeamMembers(
  team: Team,
  persons: ReadonlyMap<string, PersonIdentity>,
): [PersonIdentity, PersonIdentity] | null {
  if (team.member_person_ids.length !== 2) return null;
  const idA = team.member_person_ids[0];
  const idB = team.member_person_ids[1];
  if (idA === undefined || idB === undefined) return null;
  const a = persons.get(idA);
  const b = persons.get(idB);
  if (!a || !b) return null;
  return [a, b];
}

export function coupleDivisionOk(
  members: [PersonIdentity, PersonIdentity],
  division: Division,
): boolean {
  const genders = new Set([members[0].gender, members[1].gender]);
  if (division === "couples_men") return genders.size === 1 && genders.has("M");
  if (division === "couples_women") return genders.size === 1 && genders.has("F");
  if (division === "couples_mixed") return genders.has("M") && genders.has("F");
  return false;
}

export interface CoupleBlockEntry {
  team: Team;
  members: [PersonIdentity, PersonIdentity];
}

export function buildCoupleBlockIndex(
  teams: Iterable<Team>,
  persons: ReadonlyMap<string, PersonIdentity>,
  division: Division,
): Map<string, CoupleBlockEntry[]> {
  const index = new Map<string, CoupleBlockEntry[]>();
  for (const team of teams) {
    if (team.team_kind !== "couple") continue;
    const members = resolveTeamMembers(team, persons);
    if (!members) continue;
    if (!coupleDivisionOk(members, division)) continue;

    const entry: CoupleBlockEntry = { team, members };
    for (const member of members) {
      const parsed = personParsed(member);
      const fam = parsed.family || (parsed.tokens.length > 0 ? parsed.tokens[parsed.tokens.length - 1] : "");
      const giv = (parsed.given ? parsed.given.split(/\s+/)[0] : "") || (parsed.tokens.length > 0 ? parsed.tokens[0] : "");
      const yob = member.yob;

      const keys: string[] = [];
      if (fam && yob > 0) keys.push(`fam|${fam.slice(0, 3)}|${yob}`);
      if (giv && yob > 0) keys.push(`giv|${giv.slice(0, 3)}|${yob}`);
      if (fam) keys.push(`fam|${fam.slice(0, 3)}|no_yob`);
      if (giv) keys.push(`giv|${giv.slice(0, 3)}|no_yob`);

      for (const key of keys) {
        let list = index.get(key);
        if (!list) {
          list = [];
          index.set(key, list);
        }
        list.push(entry);
      }
    }
  }
  return index;
}

export function gatherCoupleCandidates(
  parsedA: ParsedName,
  yobA: number,
  parsedB: ParsedName,
  yobB: number,
  index: Map<string, CoupleBlockEntry[]>,
  config: MatchingConfig,
): CoupleBlockEntry[] {
  const keysA = candidatePersonKeys(parsedA, yobA);
  const keysB = candidatePersonKeys(parsedB, yobB);
  // Deduplicate and preserve order
  const allKeys: string[] = [];
  const keySet = new Set<string>();
  for (const k of [...keysA, ...keysB]) {
    if (!keySet.has(k)) {
      keySet.add(k);
      allKeys.push(k);
    }
  }

  const seen = new Set<string>();
  const out: CoupleBlockEntry[] = [];
  for (const key of allKeys) {
    for (const entry of index.get(key) ?? []) {
      if (seen.has(entry.team.team_id)) continue;
      seen.add(entry.team.team_id);
      out.push(entry);
      if (out.length >= config.max_candidates_per_row) return out;
    }
  }
  return out;
}

export function scoreCoupleMatch(
  incA: ParsedName,
  yobA: number,
  clubA: string,
  incB: ParsedName,
  yobB: number,
  clubB: string,
  members: [PersonIdentity, PersonIdentity],
  config: MatchingConfig,
): [number, MatchingFeatures] {
  const alignments: {
    pairScore: number;
    s0: number;
    s1: number;
    f0: MatchingFeatures;
    f1: MatchingFeatures;
  }[] = [];

  for (const perm of [
    [0, 1],
    [1, 0],
  ] as const) {
    const [s0, f0] = scorePersonMatch(incA, yobA, clubA, members[perm[0]], config);
    const [s1, f1] = scorePersonMatch(incB, yobB, clubB, members[perm[1]], config);
    const pairScore = Math.min(s0, s1) * 0.65 + ((s0 + s1) / 2.0) * 0.35;
    alignments.push({ pairScore, s0, s1, f0, f1 });
  }

  let best = alignments[0];
  if (!best) throw new Error("No alignments computed");
  for (const a of alignments) {
    if (a.pairScore > best.pairScore) best = a;
  }

  let pairScore = best.pairScore;
  const { s0, s1, f0, f1 } = best;

  if (Math.min(s0, s1) < config.member_mismatch_floor) {
    pairScore = Math.min(pairScore, config.pair_unsafe_cap);
  }

  const feats: MatchingFeatures = {
    pair_score: round4(pairScore),
    member_low: round4(Math.min(s0, s1)),
    member_high: round4(Math.max(s0, s1)),
    m0_name_base: round4(f0.name_base ?? 0.0),
    m0_token_overlap: round4(f0.token_overlap ?? 0.0),
    m0_yob_agreement: f0.yob_agreement ?? 0.5,
    m1_name_base: round4(f1.name_base ?? 0.0),
    m1_token_overlap: round4(f1.token_overlap ?? 0.0),
    m1_yob_agreement: f1.yob_agreement ?? 0.5,
  };
  return [pairScore, feats];
}
