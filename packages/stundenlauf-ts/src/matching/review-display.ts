/**
 * Display-only helpers for import match review (per-field highlights
 * and couple member alignment).
 *
 * Direct port of backend/matching/review_display.py.
 * Reference: F-TS03 §11 (Review Queue)
 */

import type { PersonIdentity } from "@/domain/types.ts";
import type { MatchingConfig } from "./config.ts";
import { defaultMatchingConfig } from "./config.ts";
import {
  normalizeClub,
  normalizeWhitespace,
  parsePersonName,
  splitDisplayNameParts,
} from "./normalize.ts";
import { scorePersonMatch } from "./score.ts";

export { splitDisplayNameParts };

const DISPLAY_CONFIG: MatchingConfig = defaultMatchingConfig();
const COMPOSITE_SEP = " / ";

function parseYobToken(token: string): number {
  const cleaned = token.trim();
  if (!cleaned || cleaned === "-") return 0;
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? 0 : n;
}

function optionalClubFromCell(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/[\p{L}\p{N}]/u.test(trimmed)) return null;
  return trimmed;
}

function splitTeamIncomingLine(
  displayName: string,
  yobField: string | number | null | undefined,
  clubField: string | null | undefined,
  index: number,
): [string, number, string] {
  const nameTokens = displayName
    .split(COMPOSITE_SEP)
    .map((t) => t.trim())
    .filter(Boolean);
  const name = (index < nameTokens.length ? nameTokens[index] : "") ?? "";

  let yob = 0;
  if (typeof yobField === "number") {
    yob = index === 0 ? (yobField > 0 ? yobField : 0) : 0;
  } else if (typeof yobField === "string" && yobField.trim()) {
    const yToks = yobField.split(COMPOSITE_SEP).map((t) => t.trim());
    if (index < yToks.length) {
      yob = parseYobToken(yToks[index] ?? "");
    }
  }

  let club = "";
  if (clubField?.trim()) {
    const cToks = clubField
      .split(COMPOSITE_SEP)
      .map((t) => t.trim())
      .filter(Boolean);
    if (index < cToks.length) {
      club = cToks[index] ?? "";
    }
  }

  return [name, yob, club];
}

export interface FieldSegment {
  text: string;
  diff: boolean;
}

export interface FieldHighlight {
  text: string;
  diff: boolean;
}

export interface PersonLineHighlights {
  name_segments: FieldSegment[];
  yob: FieldHighlight;
  club: FieldHighlight;
}

export function fieldHighlightsForPersonLine(
  incomingName: string,
  incomingYob: number,
  incomingClub: string | null,
  candidateName: string,
  candidateYob: number,
  candidateClub: string | null,
): PersonLineHighlights {
  const [givenDisp, familyDisp] = splitDisplayNameParts(candidateName);
  const parsedInc = parsePersonName(incomingName);
  const parsedCand = parsePersonName(candidateName);
  const givenDiff = parsedInc.given !== parsedCand.given;
  const familyDiff = parsedInc.family !== parsedCand.family;

  let nameSegments: FieldSegment[];
  if (givenDisp && familyDisp) {
    nameSegments = [
      { text: givenDisp, diff: givenDiff },
      { text: " ", diff: false },
      { text: familyDisp, diff: familyDiff },
    ];
  } else {
    const rawSingle = normalizeWhitespace(candidateName) || candidateName.trim();
    const nameDiff = parsedInc.display_compact !== parsedCand.display_compact;
    nameSegments = [{ text: rawSingle || "—", diff: nameDiff }];
  }

  const cy = candidateYob || 0;
  const iy = incomingYob || 0;
  const yobDiff = iy > 0 && cy > 0 && iy !== cy;
  const yobText = cy > 0 ? String(cy) : "-";

  const incEff = optionalClubFromCell(incomingClub);
  const candEff = optionalClubFromCell(candidateClub);
  const incC = normalizeClub(incEff);
  const candC = normalizeClub(candEff);
  const clubDiff = incC !== candC;
  const clubText = candEff == null ? "—" : candEff;

  return {
    name_segments: nameSegments,
    yob: { text: yobText, diff: yobDiff },
    club: { text: clubText, diff: clubDiff },
  };
}

function pairDisplayScore(
  inc0: [string, number, string],
  inc1: [string, number, string],
  m0: PersonIdentity,
  m1: PersonIdentity,
): number {
  const [n0, y0, c0] = inc0;
  const [n1, y1, c1] = inc1;
  const p0 = parsePersonName(n0);
  const p1 = parsePersonName(n1);
  const [s0] = scorePersonMatch(p0, y0, normalizeClub(c0), m0, DISPLAY_CONFIG);
  const [s1] = scorePersonMatch(p1, y1, normalizeClub(c1), m1, DISPLAY_CONFIG);
  return Math.min(s0, s1) * 0.65 + ((s0 + s1) / 2.0) * 0.35;
}

export function alignCoupleMembersForDisplay(
  incomingPreview: {
    display_name?: string;
    yob?: string | number | null;
    club?: string | null;
  },
  memberA: PersonIdentity,
  memberB: PersonIdentity,
): [boolean, [PersonIdentity, PersonIdentity]] {
  const displayName = incomingPreview.display_name ?? "";
  const yobF = incomingPreview.yob;
  const clubF = incomingPreview.club;

  const inc0 = splitTeamIncomingLine(displayName, yobF, clubF, 0);
  const inc1 = splitTeamIncomingLine(displayName, yobF, clubF, 1);

  const scoreDirect = pairDisplayScore(inc0, inc1, memberA, memberB);
  const scoreSwap = pairDisplayScore(inc0, inc1, memberB, memberA);

  if (scoreSwap > scoreDirect) {
    return [true, [memberB, memberA]];
  }
  return [false, [memberA, memberB]];
}

export function buildCoupleLineHighlights(
  incomingPreview: {
    display_name?: string;
    yob?: string | number | null;
    club?: string | null;
  },
  members: [PersonIdentity, PersonIdentity],
): PersonLineHighlights[] {
  const displayName = incomingPreview.display_name ?? "";
  const yobF = incomingPreview.yob;
  const clubF = incomingPreview.club;

  const lines: PersonLineHighlights[] = [];
  for (let idx = 0; idx < 2; idx++) {
    const [incName, incYob, incClub] = splitTeamIncomingLine(
      displayName,
      yobF,
      clubF,
      idx,
    );
    const mem = members[idx];
    if (!mem) continue;
    const memberName = mem.display_name;
    lines.push(
      fieldHighlightsForPersonLine(
        incName,
        incYob,
        incClub || null,
        memberName,
        mem.yob,
        mem.club,
      ),
    );
  }
  return lines;
}
