/**
 * Per-row resolution pipeline: matching an incoming row to an existing
 * team or creating a new identity.
 *
 * Direct port of _resolve_person and _resolve_team_row from
 * backend/matching/workflow.py.
 * Reference: F-TS03 §7 (Resolution Pipeline)
 */

import type { Division, Gender, PersonIdentity, SeasonState, Team } from "@/domain/types.ts";
import { buildPersonBlockIndex, gatherCandidates } from "./candidates.ts";
import type { MatchingConfig } from "./config.ts";
import { identityFingerprint, teamFingerprint } from "./fingerprint.ts";
import {
  canonicalPersonIdentityFromIncoming,
  normalizeClub,
  parsePersonName,
} from "./normalize.ts";
import {
  routeFromScore,
  scorePersonMatch,
  shouldReviewStrongCoupleYobMismatch,
  shouldReviewStrongNameYobMismatch,
} from "./score.ts";
import { personMatchesStrictIncoming } from "./strict-identity.ts";
import { coupleMatchesStrictRow } from "./strict-identity.ts";
import {
  buildCoupleBlockIndex,
  coupleDivisionOk,
  gatherCoupleCandidates,
  resolveTeamMembers,
  scoreCoupleMatch,
  type CoupleBlockEntry,
} from "./teams.ts";
import type {
  MatchingFeatures,
  MatchRoute,
  ResolvedEntry,
} from "./types.ts";

import type { ImportRowCouples } from "@/ingestion/types.ts";

// --- Replay index ---

export interface ReplayHint {
  fingerprint: string;
  team_id: string;
}

/**
 * Build a replay index from existing event log entries.
 * For each entry with resolution method "auto" (confidence 1.0) or "manual",
 * record fingerprint -> team_id.
 */
export function buildReplayIndex(state: SeasonState): Map<string, string> {
  const index = new Map<string, string>();
  for (const raceEvent of state.race_events.values()) {
    if (raceEvent.state !== "active") continue;
    const batch = state.import_batches.get(raceEvent.import_batch_id);
    if (batch && batch.state !== "active") continue;
    for (const entry of raceEvent.entries) {
      const { resolution, incoming } = entry;
      const isReplayable =
        (resolution.method === "auto" && resolution.confidence === 1.0) ||
        resolution.method === "manual";
      if (!isReplayable) continue;
      // Recompute fingerprint from incoming data
      // We store it keyed by display_name|yob|row_kind for later async lookup
      // The actual fingerprint computation happens in the resolve functions
      void incoming;
      // Store team_id keyed by entry for later fingerprint resolution
      index.set(entry.entry_id, entry.team_id);
    }
  }
  return index;
}

/**
 * Build async fingerprint -> team_id index from event log.
 */
export async function buildFingerprintReplayIndex(
  state: SeasonState,
): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  const tasks: Promise<void>[] = [];

  for (const raceEvent of state.race_events.values()) {
    if (raceEvent.state !== "active") continue;
    const batch = state.import_batches.get(raceEvent.import_batch_id);
    if (batch && batch.state !== "active") continue;
    for (const entry of raceEvent.entries) {
      const { resolution, incoming } = entry;
      const isReplayable =
        (resolution.method === "auto" && resolution.confidence === 1.0) ||
        resolution.method === "manual";
      if (!isReplayable) continue;

      const team = state.teams.get(entry.team_id);
      if (!team) continue;

      tasks.push(
        (async () => {
          if (incoming.row_kind === "solo") {
            const parsed = parsePersonName(incoming.display_name);
            const yob = incoming.yob ?? 0;
            const division = raceEvent.category.division;
            const gender = genderForDivision(division);
            const fp = await identityFingerprint(parsed, yob, gender);
            index.set(fp, entry.team_id);
          } else {
            // team row — need to split the composite display_name
            const names = incoming.display_name
              .split(" / ")
              .map((n) => n.trim());
            if (names.length === 2 && names[0] !== undefined && names[1] !== undefined) {
              const parsedA = parsePersonName(names[0]);
              const parsedB = parsePersonName(names[1]);
              const division = raceEvent.category.division;
              const [genderA, genderB] = memberGendersForCouples(division);
              // Derive YOBs from yob_text if available
              const yobParts = incoming.yob_text
                ? incoming.yob_text.split(" / ").map((y) => parseInt(y, 10) || 0)
                : [0, 0];
              const fp = await teamFingerprint(
                parsedA,
                yobParts[0] ?? 0,
                genderA,
                parsedB,
                yobParts[1] ?? 0,
                genderB,
              );
              index.set(fp, entry.team_id);
            }
          }
        })(),
      );
    }
  }

  await Promise.all(tasks);
  return index;
}

// --- Helpers ---

export function genderForDivision(division: Division): Gender {
  if (division === "men") return "M";
  if (division === "women") return "F";
  throw new Error(`No single-runner gender mapping for division ${division}`);
}

export function memberGendersForCouples(
  division: Division,
): [Gender, Gender] {
  if (division === "couples_men") return ["M", "M"];
  if (division === "couples_women") return ["F", "F"];
  if (division === "couples_mixed") return ["M", "F"];
  throw new Error(`Unexpected couples division: ${division}`);
}

// --- Accumulator for stats ---

export interface RunStats {
  auto_links: number;
  review_queue: number;
  new_identities: number;
  conflicts: number;
  replay_overrides: number;
  candidate_counts: number[];
}

export function emptyRunStats(): RunStats {
  return {
    auto_links: 0,
    review_queue: 0,
    new_identities: 0,
    conflicts: 0,
    replay_overrides: 0,
    candidate_counts: [],
  };
}

function computeCandidateConfidences(
  scored: { person_id: string; score: number }[],
  candidateUids: string[],
): number[] {
  const byUid = new Map(scored.map((s) => [s.person_id, s.score]));
  return candidateUids.map((uid) => byUid.get(uid) ?? 0.0);
}

// --- Per-row resolution: singles ---

export async function resolvePerson(opts: {
  rawName: string;
  yob: number;
  clubRaw: string | null;
  gender: Gender;
  candidatePeople: PersonIdentity[];
  replayIndex: Map<string, string>;
  usedCandidateUids: Map<string, string>;
  config: MatchingConfig;
  entryId: string;
  stats: RunStats;
  /** persons map for team lookup */
  persons: ReadonlyMap<string, PersonIdentity>;
  /** teams map for replay validation */
  teams: ReadonlyMap<string, Team>;
}): Promise<ResolvedEntry> {
  const {
    rawName,
    yob,
    clubRaw,
    gender,
    candidatePeople,
    replayIndex,
    usedCandidateUids,
    config,
    entryId,
    stats,
    teams,
  } = opts;

  const parsed = parsePersonName(rawName);
  const clubNorm = normalizeClub(clubRaw);
  const fp = await identityFingerprint(parsed, yob, gender);

  // 1. REPLAY CHECK
  const replayTarget = replayIndex.get(fp);
  if (replayTarget != null) {
    const targetTeam = teams.get(replayTarget);
    if (targetTeam) {
      stats.replay_overrides += 1;
      return {
        team_id: targetTeam.team_id,
        route: "auto",
        confidence: 1.0,
        candidate_count: 1,
        top_candidate_uid: targetTeam.team_id,
        candidate_uids: [targetTeam.team_id],
        candidate_confidences: [1.0],
        features: { replay: 1.0 },
        conflict_flags: [],
        new_persons: [],
        new_teams: [],
      };
    }
  }

  // 2. CANDIDATE SCORING
  const blockIndex = buildPersonBlockIndex(candidatePeople, gender);
  const candidates = gatherCandidates(parsed, yob, gender, blockIndex, config);
  const scored: { person_id: string; score: number; features: MatchingFeatures }[] = [];
  for (const cand of candidates) {
    const [score, feats] = scorePersonMatch(parsed, yob, clubNorm, cand, config);
    scored.push({ person_id: cand.person_id, score, features: feats });
  }
  scored.sort((a, b) => b.score - a.score);
  stats.candidate_counts.push(scored.length);

  let top = scored.length > 0 ? scored[0] : null;
  let topScore = top?.score ?? 0.0;
  let topFeats: MatchingFeatures = top ? { ...top.features } : {};
  let candidateUids = scored.slice(0, 5).map((s) => s.person_id);

  // 3. STRICT MODE OVERLAY
  let strictHits: PersonIdentity[] = [];
  let strictMultiReview = false;
  if (config.strict_normalized_auto_only) {
    strictHits = candidatePeople.filter(
      (p) =>
        p.gender === gender &&
        personMatchesStrictIncoming({
          incoming_parsed: parsed,
          incoming_yob: yob,
          incoming_club_norm: clubNorm,
          gender,
          person: p,
        }),
    );
    if (strictHits.length === 1) {
      const hit = strictHits[0];
      if (hit) {
        top = { person_id: hit.person_id, score: 1.0, features: { strict_identity_auto: 1.0, total: 1.0 } };
        topScore = 1.0;
        topFeats = { strict_identity_auto: 1.0, total: 1.0 };
        const mergedUids = [hit.person_id, ...candidateUids.filter((u) => u !== hit.person_id)];
        candidateUids = mergedUids.slice(0, 5);
      }
    } else if (strictHits.length > 1) {
      strictMultiReview = true;
      const mergedUids = strictHits.map((p) => p.person_id);
      for (const uid of candidateUids) {
        if (!mergedUids.includes(uid)) mergedUids.push(uid);
        if (mergedUids.length >= 5) break;
      }
      candidateUids = mergedUids.slice(0, 5);
      const scoreByUid = new Map(scored.map((s) => [s.person_id, s]));
      let bestP: PersonIdentity | undefined = strictHits[0];
      let bestSc = -1.0;
      let bestFt: MatchingFeatures = {};
      for (const p of strictHits) {
        const s = scoreByUid.get(p.person_id);
        const sc = s?.score ?? 0.0;
        if (sc > bestSc) {
          bestSc = sc;
          bestP = p;
          bestFt = s ? { ...s.features } : { strict_collision: 1.0 };
        }
      }
      if (bestP) {
        top = { person_id: bestP.person_id, score: bestSc >= 0 ? bestSc : 0.0, features: bestFt };
        topScore = top.score;
        topFeats = bestFt;
      }
    }
  }

  // 4. ROUTING
  const route: MatchRoute = top != null ? routeFromScore(topScore, config) : "new_identity";
  let metaRoute: MatchRoute;
  if (top == null) {
    metaRoute = "new_identity";
  } else if (strictMultiReview) {
    metaRoute = "review";
  } else {
    metaRoute = route;
  }

  // Strict: no strict hits but would be auto -> downgrade to review
  if (config.strict_normalized_auto_only && strictHits.length === 0 && top != null && metaRoute === "auto") {
    metaRoute = "review";
  }

  // 5. SAFETY OVERRIDES
  // Strong name + YOB mismatch -> review
  if (top != null && metaRoute === "new_identity" && shouldReviewStrongNameYobMismatch(topScore, topFeats, config)) {
    metaRoute = "review";
  }

  // Same-race candidate reuse -> review
  const conflictFlags: string[] = [];
  if (top != null && metaRoute === "auto") {
    const prevEntry = usedCandidateUids.get(top.person_id);
    if (prevEntry != null) {
      conflictFlags.push(`candidate_reused:${top.person_id}`);
      stats.conflicts += 1;
      metaRoute = "review";
    } else {
      usedCandidateUids.set(top.person_id, entryId);
    }
  }

  const candidateConfidences = computeCandidateConfidences(
    scored.map((s) => ({ person_id: s.person_id, score: s.score })),
    candidateUids,
  );

  // 6. OUTCOME
  if (metaRoute === "new_identity" || top == null) {
    const personId = crypto.randomUUID();
    const teamId = crypto.randomUUID();
    const canonicalName = canonicalPersonIdentityFromIncoming(rawName);
    stats.new_identities += 1;
    return {
      team_id: teamId,
      route: "new_identity",
      confidence: topScore,
      candidate_count: scored.length,
      top_candidate_uid: top?.person_id ?? null,
      candidate_uids: candidateUids,
      candidate_confidences: candidateConfidences,
      features: topFeats,
      conflict_flags: conflictFlags,
      new_persons: [
        {
          person_id: personId,
          given_name: canonicalName.given_name,
          family_name: canonicalName.family_name,
          display_name: canonicalName.display_name,
          name_normalized: canonicalName.name_normalized,
          yob,
          gender,
          club: clubRaw,
          club_normalized: clubNorm,
        },
      ],
      new_teams: [
        {
          team_id: teamId,
          member_person_ids: [personId],
          team_kind: "solo",
        },
      ],
    };
  }

  // Find the team_id for the matched person
  let matchedTeamId: string | null = null;
  for (const team of teams.values()) {
    if (team.team_kind === "solo" && team.member_person_ids.includes(top.person_id)) {
      matchedTeamId = team.team_id;
      break;
    }
  }
  // Fallback: use person_id as team reference if no team found
  if (!matchedTeamId) matchedTeamId = top.person_id;

  if (metaRoute === "auto") stats.auto_links += 1;
  else stats.review_queue += 1;

  return {
    team_id: matchedTeamId,
    route: metaRoute,
    confidence: topScore,
    candidate_count: scored.length,
    top_candidate_uid: top.person_id,
    candidate_uids: candidateUids,
    candidate_confidences: candidateConfidences,
    features: topFeats,
    conflict_flags: conflictFlags,
    new_persons: [],
    new_teams: [],
  };
}

// --- Per-row resolution: couples ---

export async function resolveTeamRow(opts: {
  row: ImportRowCouples;
  division: Division;
  genderA: Gender;
  genderB: Gender;
  persons: ReadonlyMap<string, PersonIdentity>;
  teams: ReadonlyMap<string, Team>;
  replayIndex: Map<string, string>;
  usedTeamUids: Map<string, string>;
  config: MatchingConfig;
  entryId: string;
  stats: RunStats;
}): Promise<ResolvedEntry> {
  const {
    row,
    division,
    genderA,
    genderB,
    persons,
    teams,
    replayIndex,
    usedTeamUids,
    config,
    entryId,
    stats,
  } = opts;

  const parsedA = parsePersonName(row.name_a);
  const parsedB = parsePersonName(row.name_b);
  const clubNormA = normalizeClub(row.club_a);
  const clubNormB = normalizeClub(row.club_b);
  const fp = await teamFingerprint(parsedA, row.yob_a, genderA, parsedB, row.yob_b, genderB);

  // 1. REPLAY CHECK
  const replayTarget = replayIndex.get(fp);
  if (replayTarget != null) {
    const targetTeam = teams.get(replayTarget);
    if (targetTeam) {
      stats.replay_overrides += 1;
      return {
        team_id: targetTeam.team_id,
        route: "auto",
        confidence: 1.0,
        candidate_count: 1,
        top_candidate_uid: targetTeam.team_id,
        candidate_uids: [targetTeam.team_id],
        candidate_confidences: [1.0],
        features: { replay: 1.0 },
        conflict_flags: [],
        new_persons: [],
        new_teams: [],
      };
    }
  }

  // 2. CANDIDATE SCORING
  const coupleTeams = [...teams.values()].filter((t) => t.team_kind === "couple");
  const coupleIndex = buildCoupleBlockIndex(coupleTeams, persons, division);
  const candidates = gatherCoupleCandidates(parsedA, row.yob_a, parsedB, row.yob_b, coupleIndex, config);

  const scored: { team_id: string; members: [PersonIdentity, PersonIdentity]; score: number; features: MatchingFeatures }[] = [];
  for (const cand of candidates) {
    const [score, feats] = scoreCoupleMatch(
      parsedA, row.yob_a, clubNormA,
      parsedB, row.yob_b, clubNormB,
      cand.members, config,
    );
    scored.push({ team_id: cand.team.team_id, members: cand.members, score, features: feats });
  }
  scored.sort((a, b) => b.score - a.score);
  stats.candidate_counts.push(scored.length);

  let top = scored.length > 0 ? scored[0] : null;
  let topScore = top?.score ?? 0.0;
  let topFeats: MatchingFeatures = top ? { ...top.features } : {};
  let candidateUids = scored.slice(0, 5).map((s) => s.team_id);

  // 3. STRICT MODE OVERLAY
  let strictTeamHits: CoupleBlockEntry[] = [];
  let strictTeamMultiReview = false;
  if (config.strict_normalized_auto_only) {
    strictTeamHits = [];
    for (const team of coupleTeams) {
      const members = resolveTeamMembers(team, persons);
      if (!members) continue;
      if (!coupleDivisionOk(members, division)) continue;
      if (coupleMatchesStrictRow(row, genderA, genderB, members)) {
        strictTeamHits.push({ team, members });
      }
    }

    if (strictTeamHits.length === 1) {
      const hit = strictTeamHits[0];
      if (hit) {
        top = { team_id: hit.team.team_id, members: hit.members, score: 1.0, features: { strict_identity_auto: 1.0, pair_score: 1.0 } };
        topScore = 1.0;
        topFeats = { strict_identity_auto: 1.0, pair_score: 1.0 };
        const mergedUids = [hit.team.team_id, ...candidateUids.filter((u) => u !== hit.team.team_id)];
        candidateUids = mergedUids.slice(0, 5);
      }
    } else if (strictTeamHits.length > 1) {
      strictTeamMultiReview = true;
      const mergedUids = strictTeamHits.map((h) => h.team.team_id);
      for (const uid of candidateUids) {
        if (!mergedUids.includes(uid)) mergedUids.push(uid);
        if (mergedUids.length >= 5) break;
      }
      candidateUids = mergedUids.slice(0, 5);
      const scoreByUid = new Map(scored.map((s) => [s.team_id, s]));
      let bestC: CoupleBlockEntry | undefined = strictTeamHits[0];
      let bestSc = -1.0;
      let bestFt: MatchingFeatures = {};
      for (const h of strictTeamHits) {
        const s = scoreByUid.get(h.team.team_id);
        const sc = s?.score ?? 0.0;
        if (sc > bestSc) {
          bestSc = sc;
          bestC = h;
          bestFt = s ? { ...s.features } : { strict_collision: 1.0 };
        }
      }
      if (bestC) {
        top = { team_id: bestC.team.team_id, members: bestC.members, score: bestSc >= 0 ? bestSc : 0.0, features: bestFt };
        topScore = top.score;
        topFeats = bestFt;
      }
    }
  }

  // 4. ROUTING
  const route: MatchRoute = top != null ? routeFromScore(topScore, config) : "new_identity";
  let metaRoute: MatchRoute;
  if (top == null) {
    metaRoute = "new_identity";
  } else if (strictTeamMultiReview) {
    metaRoute = "review";
  } else {
    metaRoute = route;
  }

  if (config.strict_normalized_auto_only && strictTeamHits.length === 0 && top != null && metaRoute === "auto") {
    metaRoute = "review";
  }

  // 5. SAFETY OVERRIDES
  if (top != null && metaRoute === "new_identity" && shouldReviewStrongCoupleYobMismatch(topScore, topFeats, config)) {
    metaRoute = "review";
  }

  const conflictFlags: string[] = [];
  if (top != null && metaRoute === "auto") {
    const prevEntry = usedTeamUids.get(top.team_id);
    if (prevEntry != null) {
      conflictFlags.push(`team_reused:${top.team_id}`);
      stats.conflicts += 1;
      metaRoute = "review";
    } else {
      usedTeamUids.set(top.team_id, entryId);
    }
  }

  const candidateConfidences = computeCandidateConfidences(
    scored.map((s) => ({ person_id: s.team_id, score: s.score })),
    candidateUids,
  );

  // 6. OUTCOME
  if (metaRoute === "new_identity" || top == null) {
    const personIdA = crypto.randomUUID();
    const personIdB = crypto.randomUUID();
    const teamId = crypto.randomUUID();
    const canonicalNameA = canonicalPersonIdentityFromIncoming(row.name_a);
    const canonicalNameB = canonicalPersonIdentityFromIncoming(row.name_b);
    stats.new_identities += 1;
    return {
      team_id: teamId,
      route: "new_identity",
      confidence: topScore,
      candidate_count: scored.length,
      top_candidate_uid: top?.team_id ?? null,
      candidate_uids: candidateUids,
      candidate_confidences: candidateConfidences,
      features: topFeats,
      conflict_flags: conflictFlags,
      new_persons: [
        {
          person_id: personIdA,
          given_name: canonicalNameA.given_name,
          family_name: canonicalNameA.family_name,
          display_name: canonicalNameA.display_name,
          name_normalized: canonicalNameA.name_normalized,
          yob: row.yob_a,
          gender: genderA,
          club: row.club_a,
          club_normalized: clubNormA,
        },
        {
          person_id: personIdB,
          given_name: canonicalNameB.given_name,
          family_name: canonicalNameB.family_name,
          display_name: canonicalNameB.display_name,
          name_normalized: canonicalNameB.name_normalized,
          yob: row.yob_b,
          gender: genderB,
          club: row.club_b,
          club_normalized: clubNormB,
        },
      ],
      new_teams: [
        {
          team_id: teamId,
          member_person_ids: [personIdA, personIdB],
          team_kind: "couple",
        },
      ],
    };
  }

  if (metaRoute === "auto") stats.auto_links += 1;
  else stats.review_queue += 1;

  return {
    team_id: top.team_id,
    route: metaRoute,
    confidence: topScore,
    candidate_count: scored.length,
    top_candidate_uid: top.team_id,
    candidate_uids: candidateUids,
    candidate_confidences: candidateConfidences,
    features: topFeats,
    conflict_flags: conflictFlags,
    new_persons: [],
    new_teams: [],
  };
}
