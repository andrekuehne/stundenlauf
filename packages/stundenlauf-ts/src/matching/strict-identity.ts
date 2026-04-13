/**
 * Strict normalized identity equality for optional auto-link-only mode.
 *
 * Direct port of backend/matching/strict_identity.py.
 * Reference: F-TS03 §6 (Strict Identity Mode)
 */

import type { Gender, PersonIdentity } from "@/domain/types.ts";
import type { ImportRowCouples } from "@/ingestion/types.ts";
import { nameKey } from "./fingerprint.ts";
import { normalizeClub, parsePersonName } from "./normalize.ts";
import { personParsed } from "./score.ts";
import type { ParsedName } from "./types.ts";

function personClubNorm(person: PersonIdentity): string {
  return (person.club_normalized || normalizeClub(person.club) || "").trim();
}

function storedPersonNameKey(person: PersonIdentity): string {
  const parsed = personParsed(person);
  return nameKey(parsed);
}

function strictYobEqual(incomingYob: number, personYob: number): boolean {
  return incomingYob === personYob;
}

export function personMatchesStrictIncoming(opts: {
  incoming_parsed: ParsedName;
  incoming_yob: number;
  incoming_club_norm: string;
  gender: Gender;
  person: PersonIdentity;
}): boolean {
  const { incoming_parsed, incoming_yob, incoming_club_norm, gender, person } =
    opts;
  if (person.gender !== gender) return false;
  if (!strictYobEqual(incoming_yob, person.yob)) return false;
  if (nameKey(incoming_parsed) !== storedPersonNameKey(person)) return false;
  const incClub = (incoming_club_norm || "").trim();
  return incClub === personClubNorm(person);
}

function memberStrictTuple(
  person: PersonIdentity,
): [string, number, string, string] {
  return [
    storedPersonNameKey(person),
    person.yob,
    personClubNorm(person),
    person.gender,
  ];
}

export function coupleMatchesStrictRow(
  row: ImportRowCouples,
  genderA: Gender,
  genderB: Gender,
  members: [PersonIdentity, PersonIdentity],
): boolean {
  const pa = parsePersonName(row.name_a);
  const pb = parsePersonName(row.name_b);
  const ca = (normalizeClub(row.club_a) || "").trim();
  const cb = (normalizeClub(row.club_b) || "").trim();

  const incoming: [string, number, string, string][] = [
    [nameKey(pa), row.yob_a, ca, genderA],
    [nameKey(pb), row.yob_b, cb, genderB],
  ];
  incoming.sort((a, b) => a.join("|").localeCompare(b.join("|")));

  const stored: [string, number, string, string][] = [
    memberStrictTuple(members[0]),
    memberStrictTuple(members[1]),
  ];
  stored.sort((a, b) => a.join("|").localeCompare(b.join("|")));

  const inc0 = incoming[0];
  const inc1 = incoming[1];
  const sto0 = stored[0];
  const sto1 = stored[1];
  if (!inc0 || !inc1 || !sto0 || !sto1) return false;
  return inc0.join("|") === sto0.join("|") && inc1.join("|") === sto1.join("|");
}
