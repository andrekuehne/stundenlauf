/**
 * Barrel exports for the fuzzy matching engine.
 *
 * Reference: F-TS03 (Fuzzy Matching Engine)
 */

export type {
  MatchRoute,
  MatchingFeatures,
  MatchingReport,
  ParsedName,
  ResolvedEntry,
  ReviewCandidate,
  ReviewItem,
  ScoredCandidate,
  ScoredCoupleCandidate,
  SectionMatchResult,
} from "./types.ts";

export type { MatchingConfig } from "./config.ts";
export { defaultMatchingConfig, effectiveAutoMin } from "./config.ts";

export {
  canonicalPersonIdentityFromIncoming,
  normalizeClub,
  normalizeToken,
  normalizeWhitespace,
  parsePersonName,
  splitDisplayNameParts,
  stripDiacritics,
} from "./normalize.ts";

export { sequenceMatcherRatio } from "./ratcliff-obershelp.ts";

export {
  identityFingerprint,
  nameKey,
  teamFingerprint,
} from "./fingerprint.ts";

export {
  nameSimilarity,
  personParsed,
  routeFromScore,
  scorePersonMatch,
  shouldReviewStrongCoupleYobMismatch,
  shouldReviewStrongNameYobMismatch,
} from "./score.ts";

export {
  buildPersonBlockIndex,
  candidatePersonKeys,
  gatherCandidates,
} from "./candidates.ts";

export {
  buildCoupleBlockIndex,
  coupleDivisionOk,
  gatherCoupleCandidates,
  resolveTeamMembers,
  scoreCoupleMatch,
} from "./teams.ts";
export type { CoupleBlockEntry } from "./teams.ts";

export {
  coupleMatchesStrictRow,
  personMatchesStrictIncoming,
} from "./strict-identity.ts";

export {
  buildFingerprintReplayIndex,
  emptyRunStats,
  genderForDivision,
  memberGendersForCouples,
  resolvePerson,
  resolveTeamRow,
} from "./resolve.ts";
export type { ReplayHint, RunStats } from "./resolve.ts";

export {
  processCouplesSection,
  processSinglesSection,
} from "./workflow.ts";

export {
  aggregateMatchingReports,
  emptyMatchingReport,
} from "./report.ts";

export {
  alignCoupleMembersForDisplay,
  buildCoupleLineHighlights,
  fieldHighlightsForPersonLine,
} from "./review-display.ts";
export type {
  FieldHighlight,
  FieldSegment,
  PersonLineHighlights,
} from "./review-display.ts";
