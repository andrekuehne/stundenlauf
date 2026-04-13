/**
 * Blocking index for efficient candidate retrieval in fuzzy matching.
 *
 * Direct port of backend/matching/candidates.py.
 * Reference: F-TS03 §3 (Blocking Index)
 */

import type { Gender, PersonIdentity } from "@/domain/types.ts";
import type { MatchingConfig } from "./config.ts";
import { personParsed } from "./score.ts";
import type { ParsedName } from "./types.ts";

function prefix(token: string, length = 3): string {
  if (!token) return "";
  return token.slice(0, length);
}

export function buildPersonBlockIndex(
  people: Iterable<PersonIdentity>,
  gender: Gender,
): Map<string, PersonIdentity[]> {
  const index = new Map<string, PersonIdentity[]>();
  for (const p of people) {
    if (p.gender !== gender) continue;
    const parsed = personParsed(p);
    const fam =
      parsed.family || (parsed.tokens.length > 0 ? parsed.tokens[parsed.tokens.length - 1] : "");
    const giv =
      (parsed.given ? parsed.given.split(/\s+/)[0] : "") ||
      (parsed.tokens.length > 0 ? parsed.tokens[0] : "");
    const yob = p.yob;

    const keys: string[] = [];
    if (fam && yob > 0) keys.push(`fam|${prefix(fam)}|${yob}`);
    if (giv && yob > 0) keys.push(`giv|${prefix(giv)}|${yob}`);
    if (fam) keys.push(`fam|${prefix(fam)}|no_yob`);
    if (giv) keys.push(`giv|${prefix(giv)}|no_yob`);

    for (const key of keys) {
      let list = index.get(key);
      if (!list) {
        list = [];
        index.set(key, list);
      }
      list.push(p);
    }
  }
  return index;
}

export function candidatePersonKeys(
  incoming: ParsedName,
  yob: number,
): string[] {
  const fam =
    incoming.family || (incoming.tokens.length > 0 ? incoming.tokens[incoming.tokens.length - 1] : "");
  const giv =
    (incoming.given ? incoming.given.split(/\s+/)[0] : "") ||
    (incoming.tokens.length > 0 ? incoming.tokens[0] : "");

  const keys: string[] = [];
  if (fam && yob > 0) keys.push(`fam|${prefix(fam)}|${yob}`);
  if (giv && yob > 0) keys.push(`giv|${prefix(giv)}|${yob}`);
  if (fam) keys.push(`fam|${prefix(fam)}|no_yob`);
  if (giv) keys.push(`giv|${prefix(giv)}|no_yob`);
  return keys;
}

export function gatherCandidates(
  incoming: ParsedName,
  yob: number,
  gender: Gender,
  index: Map<string, PersonIdentity[]>,
  config: MatchingConfig,
): PersonIdentity[] {
  // gender parameter is for API consistency; the index is pre-filtered by gender
  void gender;
  const keys = candidatePersonKeys(incoming, yob);
  const seen = new Set<string>();
  const out: PersonIdentity[] = [];
  for (const key of keys) {
    for (const person of index.get(key) ?? []) {
      if (seen.has(person.person_id)) continue;
      seen.add(person.person_id);
      out.push(person);
      if (out.length >= config.max_candidates_per_row) return out;
    }
  }
  return out;
}
