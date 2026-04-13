/**
 * Review resolution: accept a candidate (link to existing team) or create
 * a new identity for entries the matching engine routed to "review".
 *
 * Reference: F-TS05 §5 (Review Resolution)
 */

import type {
  PersonRegisteredPayload,
  TeamRegisteredPayload,
} from "@/domain/events.ts";
import { normalizeClub, parsePersonName } from "@/matching/normalize.ts";
import { genderForDivision, memberGendersForCouples } from "@/matching/resolve.ts";
import { assertPhase } from "./session.ts";
import type {
  ImportSession,
  OrchestratedReviewEntry,
  OrchestratedSection,
  ReviewAction,
  StagedEntry,
} from "./types.ts";

export function getReviewQueue(session: ImportSession): OrchestratedReviewEntry[] {
  return session.review_queue.filter((e) => e.status === "pending");
}

export function resolveReviewEntry(
  session: ImportSession,
  entryId: string,
  action: ReviewAction,
): ImportSession {
  assertPhase(session, "reviewing");

  const reviewIdx = session.review_queue.findIndex((e) => e.entry_id === entryId);
  if (reviewIdx === -1) {
    throw new Error(`Review entry "${entryId}" not found.`);
  }

  const reviewEntry = session.review_queue[reviewIdx];
  if (reviewEntry === undefined) {
    throw new Error(`Review entry "${entryId}" not found at index ${reviewIdx}.`);
  }
  if (reviewEntry.status === "resolved") {
    throw new Error(`Review entry "${entryId}" is already resolved.`);
  }

  if (action.type === "link_existing") {
    return applyLinkExisting(session, reviewIdx, reviewEntry, action.team_id);
  }
  return applyCreateNewIdentity(session, reviewIdx, reviewEntry);
}

function applyLinkExisting(
  session: ImportSession,
  reviewIdx: number,
  reviewEntry: OrchestratedReviewEntry,
  teamId: string,
): ImportSession {
  const candidate = reviewEntry.review_item.candidates.find(
    (c) => c.team_id === teamId,
  );

  const updatedStaged: StagedEntry = {
    ...getStagedEntry(session, reviewEntry),
    team_id: teamId,
    resolution: {
      method: "manual",
      confidence: candidate?.score ?? reviewEntry.review_item.confidence,
      candidate_count: reviewEntry.review_item.candidates.length,
    },
  };

  const updatedReview: OrchestratedReviewEntry = {
    ...reviewEntry,
    status: "resolved",
    resolved_team_id: teamId,
    resolved_method: "manual",
  };

  return updateSessionAfterResolve(session, reviewIdx, updatedReview, updatedStaged);
}

function applyCreateNewIdentity(
  session: ImportSession,
  reviewIdx: number,
  reviewEntry: OrchestratedReviewEntry,
): ImportSession {
  const staged = getStagedEntry(session, reviewEntry);
  const section = session.section_results[reviewEntry.section_index];
  if (section === undefined) {
    throw new Error(`Section index ${reviewEntry.section_index} out of range.`);
  }

  const { personPayloads, teamPayload } = createIdentityPayloads(
    staged,
    section,
  );

  const updatedStaged: StagedEntry = {
    ...staged,
    team_id: teamPayload.team_id,
    resolution: {
      method: "new_identity",
      confidence: null,
      candidate_count: 0,
    },
  };

  const updatedReview: OrchestratedReviewEntry = {
    ...reviewEntry,
    status: "resolved",
    resolved_team_id: teamPayload.team_id,
    resolved_method: "new_identity",
  };

  let updated = updateSessionAfterResolve(
    session,
    reviewIdx,
    updatedReview,
    updatedStaged,
  );

  updated = {
    ...updated,
    accumulated_person_payloads: [
      ...updated.accumulated_person_payloads,
      ...personPayloads,
    ],
    accumulated_team_payloads: [
      ...updated.accumulated_team_payloads,
      teamPayload,
    ],
    report: {
      ...updated.report,
      new_identities: updated.report.new_identities + 1,
      review_items: updated.report.review_items - 1,
    },
  };

  return updated;
}

function getStagedEntry(
  session: ImportSession,
  review: OrchestratedReviewEntry,
): StagedEntry {
  const section = session.section_results[review.section_index];
  if (section === undefined) {
    throw new Error(`Section index ${review.section_index} out of range.`);
  }
  const entry = section.staged_entries[review.entry_index];
  if (entry === undefined) {
    throw new Error(`Entry index ${review.entry_index} out of range in section ${review.section_index}.`);
  }
  return entry;
}

function updateSessionAfterResolve(
  session: ImportSession,
  reviewIdx: number,
  updatedReview: OrchestratedReviewEntry,
  updatedStaged: StagedEntry,
): ImportSession {
  const sectionIdx = updatedReview.section_index;
  const entryIdx = updatedReview.entry_index;

  const currentSection = session.section_results[sectionIdx];
  if (currentSection === undefined) {
    throw new Error(`Section index ${sectionIdx} out of range.`);
  }
  const newEntries = [...currentSection.staged_entries];
  newEntries[entryIdx] = updatedStaged;

  const newSection: OrchestratedSection = {
    ...currentSection,
    staged_entries: newEntries,
    all_resolved: newEntries.every((e) => e.resolution !== null),
  };

  const newSections = [...session.section_results];
  newSections[sectionIdx] = newSection;

  const newQueue = [...session.review_queue];
  newQueue[reviewIdx] = updatedReview;

  const allResolved = newQueue.every((e) => e.status === "resolved");

  return {
    ...session,
    phase: allResolved ? "committing" : "reviewing",
    section_results: newSections,
    review_queue: newQueue,
  };
}

function createIdentityPayloads(
  staged: StagedEntry,
  section: OrchestratedSection,
): {
  personPayloads: PersonRegisteredPayload[];
  teamPayload: TeamRegisteredPayload;
} {
  const isCouple = staged.incoming.row_kind === "team";

  if (isCouple) {
    return createCoupleIdentity(staged, section);
  }
  return createSoloIdentity(staged, section);
}

function createSoloIdentity(
  staged: StagedEntry,
  section: OrchestratedSection,
): {
  personPayloads: PersonRegisteredPayload[];
  teamPayload: TeamRegisteredPayload;
} {
  const parsed = parsePersonName(staged.incoming.display_name);
  const gender = genderForDivision(section.context.division);
  const personId = crypto.randomUUID();
  const teamId = crypto.randomUUID();

  const personPayload: PersonRegisteredPayload = {
    person_id: personId,
    given_name: parsed.given,
    family_name: parsed.family,
    yob: staged.incoming.yob ?? 0,
    gender,
    club: staged.incoming.club,
    club_normalized: normalizeClub(staged.incoming.club),
  };

  const teamPayload: TeamRegisteredPayload = {
    team_id: teamId,
    member_person_ids: [personId],
    team_kind: "solo",
  };

  return { personPayloads: [personPayload], teamPayload };
}

function createCoupleIdentity(
  staged: StagedEntry,
  section: OrchestratedSection,
): {
  personPayloads: PersonRegisteredPayload[];
  teamPayload: TeamRegisteredPayload;
} {
  const names = staged.incoming.display_name.split(" / ").map((n) => n.trim());
  const [genderA, genderB] = memberGendersForCouples(section.context.division);

  const yobs = staged.incoming.yob_text
    ? staged.incoming.yob_text.split(" / ").map((y) => parseInt(y, 10) || 0)
    : [0, 0];

  const clubs = staged.incoming.club
    ? staged.incoming.club.split(" / ").map((c) => c.trim() || null)
    : [null, null];

  const personIdA = crypto.randomUUID();
  const personIdB = crypto.randomUUID();
  const teamId = crypto.randomUUID();

  const parsedA = parsePersonName(names[0] ?? "");
  const parsedB = parsePersonName(names[1] ?? "");

  const personPayloads: PersonRegisteredPayload[] = [
    {
      person_id: personIdA,
      given_name: parsedA.given,
      family_name: parsedA.family,
      yob: yobs[0] ?? 0,
      gender: genderA,
      club: clubs[0] ?? null,
      club_normalized: normalizeClub(clubs[0] ?? null),
    },
    {
      person_id: personIdB,
      given_name: parsedB.given,
      family_name: parsedB.family,
      yob: yobs[1] ?? 0,
      gender: genderB,
      club: clubs[1] ?? null,
      club_normalized: normalizeClub(clubs[1] ?? null),
    },
  ];

  const teamPayload: TeamRegisteredPayload = {
    team_id: teamId,
    member_person_ids: [personIdA, personIdB],
    team_kind: "couple",
  };

  return { personPayloads, teamPayload };
}
