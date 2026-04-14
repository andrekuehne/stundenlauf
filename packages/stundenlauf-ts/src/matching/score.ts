/**
 * Scoring functions for candidate ranking in fuzzy matching.
 *
 * Direct port of backend/matching/score.py.
 * Reference: F-TS03 §4 (Scoring: Singles)
 */

import type { PersonIdentity } from "@/domain/types.ts";
import type { MatchingConfig } from "./config.ts";
import { normalizeClub, parsePersonName } from "./normalize.ts";
import { sequenceMatcherRatio } from "./ratcliff-obershelp.ts";
import type { MatchingFeatures, MatchRoute, ParsedName } from "./types.ts";

function ratio(a: string, b: string): number {
  if (!a && !b) return 1.0;
  if (!a || !b) return 0.0;
  return sequenceMatcherRatio(a, b);
}

/**
 * Build a ParsedName from a PersonIdentity's stored canonical fields.
 * Equivalent to Python's person_parsed() in score.py.
 */
export function personParsed(person: PersonIdentity): ParsedName {
  const displayName =
    person.display_name.trim() ||
    [person.given_name, person.family_name].filter(Boolean).join(" ").trim() ||
    person.person_id;
  return parsePersonName(displayName);
}

export function nameSimilarity(
  a: ParsedName,
  b: ParsedName,
): [number, MatchingFeatures] {
  const forward =
    ratio(a.given, b.given) * 0.45 +
    ratio(a.family, b.family) * 0.45 +
    ratio(a.display_compact, b.display_compact) * 0.1;
  const swapped =
    ratio(a.given, b.family) * 0.45 +
    ratio(a.family, b.given) * 0.45 +
    ratio(a.display_compact, b.display_compact) * 0.1;

  let tokenOverlap = 0.0;
  if (a.tokens.length > 0 && b.tokens.length > 0) {
    const sa = new Set(a.tokens);
    const sb = new Set(b.tokens);
    const intersection = [...sa].filter((t) => sb.has(t)).length;
    const union = new Set([...sa, ...sb]).size;
    tokenOverlap = intersection / Math.max(1, union);
  }

  const base = Math.max(forward, swapped);
  const features: MatchingFeatures = {
    name_forward: round4(forward),
    name_swapped: round4(swapped),
    token_overlap: round4(tokenOverlap),
    name_base: round4(base),
  };
  return [base, features];
}

export function scorePersonMatch(
  incoming: ParsedName,
  incomingYob: number,
  incomingClubNorm: string,
  candidate: PersonIdentity,
  config: MatchingConfig,
): [number, MatchingFeatures] {
  const cand = personParsed(candidate);
  const [base, feats] = nameSimilarity(incoming, cand);
  let score = base;

  const nameForward = feats.name_forward ?? 0;
  const nameSwapped = feats.name_swapped ?? 0;

  if (Math.max(base, nameForward, nameSwapped) >= 0.99) {
    score += config.title_exact_bonus;
  }

  const forwardSwappedDelta = Math.abs(nameForward - nameSwapped);
  if (nameSwapped > nameForward && forwardSwappedDelta > 0.02) {
    score += config.swapped_boost;
  }

  if (incomingYob > 0 && candidate.yob > 0) {
    if (incomingYob === candidate.yob) {
      score += config.yob_match_bonus;
      feats.yob_agreement = 1.0;
    } else {
      score -= config.yob_mismatch_penalty;
      feats.yob_agreement = 0.0;
    }
  } else {
    feats.yob_agreement = 0.5;
  }

  const candClub = candidate.club_normalized || normalizeClub(candidate.club);
  const clubSim = ratio(incomingClubNorm, candClub);
  score += config.club_weight * clubSim;
  feats.club_similarity = round4(clubSim);

  score = Math.max(0.0, Math.min(1.0, score));
  feats.total = round4(score);
  return [score, feats];
}

export function routeFromScore(
  score: number,
  config: MatchingConfig,
): MatchRoute {
  if (score >= config.auto_min) return "auto";
  if (score >= config.review_min) return "review";
  return "new_identity";
}

export function shouldReviewStrongNameYobMismatch(
  topScore: number,
  feats: MatchingFeatures,
  config: MatchingConfig,
): boolean {
  if (topScore >= config.review_min) return false;
  if (feats.yob_agreement !== 0.0) return false;
  const nameBase = feats.name_base ?? 0.0;
  const tokenOverlap = feats.token_overlap ?? 0.0;
  return nameBase >= 0.98 || tokenOverlap >= 1.0;
}

function strongPersonNameMatch(
  nameBase: number,
  tokenOverlap: number,
): boolean {
  return nameBase >= 0.98 || tokenOverlap >= 1.0;
}

export function shouldReviewStrongCoupleYobMismatch(
  topScore: number,
  feats: MatchingFeatures,
  config: MatchingConfig,
): boolean {
  if (topScore >= config.review_min) return false;
  const ya0 = feats.m0_yob_agreement ?? 0.5;
  const ya1 = feats.m1_yob_agreement ?? 0.5;
  if (ya0 !== 0.0 && ya1 !== 0.0) return false;
  const nb0 = feats.m0_name_base ?? 0.0;
  const nb1 = feats.m1_name_base ?? 0.0;
  const to0 = feats.m0_token_overlap ?? 0.0;
  const to1 = feats.m1_token_overlap ?? 0.0;
  return strongPersonNameMatch(nb0, to0) && strongPersonNameMatch(nb1, to1);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
