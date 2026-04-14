/**
 * Event validation against projected state.
 *
 * Reference: F-TS01 §9 (Validation)
 */

import type { Division, SeasonState, TeamKind } from "./types.ts";
import type { DomainEvent, EventEnvelope } from "./events.ts";
import { categoryKey, isEffectiveRace } from "./projection.ts";
import {
  canonicalizePersonNames,
  validatePersonNameConsistency,
} from "./person-identity.ts";
import { normalizeClub } from "@/lib/normalization.ts";

// --- Result type ---

export type ValidationResult = { valid: true } | { valid: false; errors: string[] };

function ok(): ValidationResult {
  return { valid: true };
}

function fail(...errors: string[]): ValidationResult {
  return { valid: false, errors };
}

// --- Public API ---

const SUPPORTED_SCHEMA_VERSION = 1;

export function validateEvent(state: SeasonState, event: DomainEvent): ValidationResult {
  const schemaErrors = validateEnvelope(event);
  if (!schemaErrors.valid) return schemaErrors;

  switch (event.type) {
    case "import_batch.recorded":
      return validateImportBatchRecorded(state, event);
    case "import_batch.rolled_back":
      return validateImportBatchRolledBack(state, event);
    case "person.registered":
      return validatePersonRegistered(state, event);
    case "person.corrected":
      return validatePersonCorrected(state, event);
    case "team.registered":
      return validateTeamRegistered(state, event);
    case "race.registered":
      return validateRaceRegistered(state, event);
    case "race.rolled_back":
      return validateRaceRolledBack(state, event);
    case "race.metadata_corrected":
      return validateRaceMetadataCorrected(state, event);
    case "entry.reassigned":
      return validateEntryReassigned(state, event);
    case "entry.corrected":
      return validateEntryCorrected(state, event);
    case "ranking.eligibility_set":
      return validateRankingEligibilitySet(state, event);
  }
}

// --- Helpers ---

export function requiredTeamKind(division: Division): TeamKind {
  switch (division) {
    case "men":
    case "women":
      return "solo";
    case "couples_men":
    case "couples_women":
    case "couples_mixed":
      return "couple";
  }
}

function validateEnvelope(event: EventEnvelope): ValidationResult {
  if (event.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    return fail(
      `Unsupported schema_version ${event.schema_version} on event type "${event.type}" (supported: ${SUPPORTED_SCHEMA_VERSION})`,
    );
  }
  return ok();
}

function validateBatchIdConsistency(event: EventEnvelope): ValidationResult {
  const metaBatchId = event.metadata.import_batch_id;
  const payloadBatchId = (event.payload as Record<string, unknown>).import_batch_id;
  if (
    metaBatchId != null &&
    payloadBatchId != null &&
    typeof payloadBatchId === "string" &&
    metaBatchId !== payloadBatchId
  ) {
    return fail(
      `metadata.import_batch_id ("${metaBatchId}") does not match payload.import_batch_id ("${payloadBatchId}")`,
    );
  }
  return ok();
}

function collectEffectiveEntryIds(state: SeasonState): Set<string> {
  const ids = new Set<string>();
  for (const [raceId, race] of state.race_events) {
    if (!isEffectiveRace(state, raceId)) continue;
    for (const entry of race.entries) {
      ids.add(entry.entry_id);
    }
  }
  return ids;
}

// --- Per-type validators ---

function validateImportBatchRecorded(
  state: SeasonState,
  event: Extract<DomainEvent, { type: "import_batch.recorded" }>,
): ValidationResult {
  const batchConsistency = validateBatchIdConsistency(event);
  if (!batchConsistency.valid) return batchConsistency;

  const { import_batch_id } = event.payload;
  if (state.import_batches.has(import_batch_id)) {
    return fail(`Duplicate import_batch_id: "${import_batch_id}"`);
  }
  return ok();
}

function validateImportBatchRolledBack(
  state: SeasonState,
  event: Extract<DomainEvent, { type: "import_batch.rolled_back" }>,
): ValidationResult {
  const { import_batch_id } = event.payload;
  const batch = state.import_batches.get(import_batch_id);
  if (!batch) {
    return fail(`Import batch "${import_batch_id}" does not exist`);
  }
  if (batch.state === "rolled_back") {
    return fail(`Import batch "${import_batch_id}" is already rolled back`);
  }
  return ok();
}

function validatePersonRegistered(
  state: SeasonState,
  event: Extract<DomainEvent, { type: "person.registered" }>,
): ValidationResult {
  const batchConsistency = validateBatchIdConsistency(event);
  if (!batchConsistency.valid) return batchConsistency;

  const { person_id } = event.payload;
  if (state.persons.has(person_id)) {
    return fail(`Duplicate person_id: "${person_id}"`);
  }
  const canonicalNames = canonicalizePersonNames(event.payload);
  const club = event.payload.club == null ? null : event.payload.club.trim();
  const clubNormalized = (event.payload.club_normalized ?? "").trim();
  const nameErrors = validatePersonNameConsistency(canonicalNames);
  const expectedClubNormalized = normalizeClub(club);
  const clubErrors =
    expectedClubNormalized === clubNormalized
      ? []
      : [
          `Person club fields are inconsistent: club_normalized must equal normalizeClub(club), expected "${expectedClubNormalized}"`,
        ];
  if (nameErrors.length > 0 || clubErrors.length > 0) {
    return fail(...nameErrors, ...clubErrors);
  }
  return ok();
}

function validatePersonCorrected(
  state: SeasonState,
  event: Extract<DomainEvent, { type: "person.corrected" }>,
): ValidationResult {
  const { person_id, updated_fields } = event.payload;
  const existing = state.persons.get(person_id);
  if (!existing) {
    return fail(`Person "${person_id}" does not exist`);
  }
  const canonicalNames = canonicalizePersonNames({
    given_name: updated_fields.given_name ?? existing.given_name,
    family_name: updated_fields.family_name ?? existing.family_name,
    display_name: updated_fields.display_name ?? existing.display_name,
    name_normalized: updated_fields.name_normalized ?? existing.name_normalized,
  });
  const mergedClub = updated_fields.club !== undefined ? updated_fields.club : existing.club;
  const mergedClubNormalized =
    updated_fields.club_normalized !== undefined
      ? updated_fields.club_normalized
      : existing.club_normalized;
  const nameErrors = validatePersonNameConsistency(canonicalNames);
  const expectedClubNormalized = normalizeClub(mergedClub == null ? null : mergedClub.trim());
  const clubErrors =
    expectedClubNormalized === mergedClubNormalized.trim()
      ? []
      : [
          `Person club fields are inconsistent: club_normalized must equal normalizeClub(club), expected "${expectedClubNormalized}"`,
        ];
  if (nameErrors.length > 0 || clubErrors.length > 0) {
    return fail(...nameErrors, ...clubErrors);
  }
  return ok();
}

function validateTeamRegistered(
  state: SeasonState,
  event: Extract<DomainEvent, { type: "team.registered" }>,
): ValidationResult {
  const batchConsistency = validateBatchIdConsistency(event);
  if (!batchConsistency.valid) return batchConsistency;

  const { team_id, member_person_ids, team_kind } = event.payload;
  const errors: string[] = [];

  if (state.teams.has(team_id)) {
    errors.push(`Duplicate team_id: "${team_id}"`);
  }

  for (const pid of member_person_ids) {
    if (!state.persons.has(pid)) {
      errors.push(`Person "${pid}" referenced by team "${team_id}" is not registered`);
    }
  }

  const expectedCount = team_kind === "solo" ? 1 : 2;
  if (member_person_ids.length !== expectedCount) {
    errors.push(
      `Team kind "${team_kind}" requires ${expectedCount} member(s) but got ${member_person_ids.length}`,
    );
  }

  return errors.length > 0 ? fail(...errors) : ok();
}

function validateRaceRegistered(
  state: SeasonState,
  event: Extract<DomainEvent, { type: "race.registered" }>,
): ValidationResult {
  const batchConsistency = validateBatchIdConsistency(event);
  if (!batchConsistency.valid) return batchConsistency;

  const { race_event_id, category, race_no, entries } = event.payload;
  const errors: string[] = [];

  if (state.race_events.has(race_event_id)) {
    errors.push(`Duplicate race_event_id: "${race_event_id}"`);
  }

  const catKey = categoryKey(category);
  for (const [existingId, existing] of state.race_events) {
    if (
      isEffectiveRace(state, existingId) &&
      categoryKey(existing.category) === catKey &&
      existing.race_no === race_no
    ) {
      errors.push(
        `An effective race already exists for category ${catKey} race_no ${race_no}: "${existingId}"`,
      );
      break;
    }
  }

  const existingEntryIds = collectEffectiveEntryIds(state);
  const batchEntryIds = new Set<string>();

  for (const entry of entries) {
    if (!state.teams.has(entry.team_id)) {
      errors.push(
        `Entry "${entry.entry_id}" references unregistered team "${entry.team_id}"`,
      );
    }
    if (existingEntryIds.has(entry.entry_id) || batchEntryIds.has(entry.entry_id)) {
      errors.push(`Duplicate entry_id: "${entry.entry_id}"`);
    }
    batchEntryIds.add(entry.entry_id);
  }

  return errors.length > 0 ? fail(...errors) : ok();
}

function validateRaceRolledBack(
  state: SeasonState,
  event: Extract<DomainEvent, { type: "race.rolled_back" }>,
): ValidationResult {
  const { race_event_id } = event.payload;
  const race = state.race_events.get(race_event_id);
  if (!race) {
    return fail(`Race "${race_event_id}" does not exist`);
  }
  if (!isEffectiveRace(state, race_event_id)) {
    return fail(`Race "${race_event_id}" is not effective (already rolled back or batch rolled back)`);
  }
  return ok();
}

function validateRaceMetadataCorrected(
  state: SeasonState,
  event: Extract<DomainEvent, { type: "race.metadata_corrected" }>,
): ValidationResult {
  const { race_event_id, updated_fields } = event.payload;
  const race = state.race_events.get(race_event_id);
  if (!race) {
    return fail(`Race "${race_event_id}" does not exist`);
  }
  if (!isEffectiveRace(state, race_event_id)) {
    return fail(`Race "${race_event_id}" is not effective`);
  }

  const errors: string[] = [];

  const resultingCategory = updated_fields.category ?? race.category;
  const resultingRaceNo = updated_fields.race_no ?? race.race_no;
  const resultingCatKey = categoryKey(resultingCategory);

  for (const [existingId, existing] of state.race_events) {
    if (existingId === race_event_id) continue;
    if (
      isEffectiveRace(state, existingId) &&
      categoryKey(existing.category) === resultingCatKey &&
      existing.race_no === resultingRaceNo
    ) {
      errors.push(
        `Resulting category ${resultingCatKey} race_no ${resultingRaceNo} would collide with race "${existingId}"`,
      );
      break;
    }
  }

  if (updated_fields.category != null) {
    const required = requiredTeamKind(resultingCategory.division);
    for (const entry of race.entries) {
      const team = state.teams.get(entry.team_id);
      if (team && team.team_kind !== required) {
        errors.push(
          `Entry "${entry.entry_id}" has team kind "${team.team_kind}" but category requires "${required}"`,
        );
      }
    }
  }

  return errors.length > 0 ? fail(...errors) : ok();
}

function validateEntryReassigned(
  state: SeasonState,
  event: Extract<DomainEvent, { type: "entry.reassigned" }>,
): ValidationResult {
  const { entry_id, race_event_id, from_team_id, to_team_id } = event.payload;
  const race = state.race_events.get(race_event_id);
  if (!race) {
    return fail(`Race "${race_event_id}" does not exist`);
  }
  if (!isEffectiveRace(state, race_event_id)) {
    return fail(`Race "${race_event_id}" is not effective`);
  }

  const errors: string[] = [];
  const entry = race.entries.find((e) => e.entry_id === entry_id);
  if (!entry) {
    return fail(`Entry "${entry_id}" does not exist in race "${race_event_id}"`);
  }

  if (entry.team_id !== from_team_id) {
    errors.push(
      `Entry "${entry_id}" is currently assigned to "${entry.team_id}", not "${from_team_id}"`,
    );
  }

  const toTeam = state.teams.get(to_team_id);
  if (!toTeam) {
    errors.push(`Target team "${to_team_id}" is not registered`);
  } else {
    const required = requiredTeamKind(race.category.division);
    if (toTeam.team_kind !== required) {
      errors.push(
        `Target team "${to_team_id}" is "${toTeam.team_kind}" but category requires "${required}"`,
      );
    }
  }

  const duplicateTeamEntry = race.entries.find(
    (e) => e.entry_id !== entry_id && e.team_id === to_team_id,
  );
  if (duplicateTeamEntry) {
    errors.push(
      `Team "${to_team_id}" already has an entry in race "${race_event_id}" (entry "${duplicateTeamEntry.entry_id}")`,
    );
  }

  return errors.length > 0 ? fail(...errors) : ok();
}

function validateEntryCorrected(
  state: SeasonState,
  event: Extract<DomainEvent, { type: "entry.corrected" }>,
): ValidationResult {
  const { entry_id, race_event_id } = event.payload;
  const race = state.race_events.get(race_event_id);
  if (!race) {
    return fail(`Race "${race_event_id}" does not exist`);
  }
  if (!isEffectiveRace(state, race_event_id)) {
    return fail(`Race "${race_event_id}" is not effective`);
  }
  const entry = race.entries.find((e) => e.entry_id === entry_id);
  if (!entry) {
    return fail(`Entry "${entry_id}" does not exist in race "${race_event_id}"`);
  }
  return ok();
}

function validateRankingEligibilitySet(
  state: SeasonState,
  event: Extract<DomainEvent, { type: "ranking.eligibility_set" }>,
): ValidationResult {
  const { category, team_id } = event.payload;
  const catKey = categoryKey(category);

  for (const [raceId, race] of state.race_events) {
    if (!isEffectiveRace(state, raceId)) continue;
    if (categoryKey(race.category) !== catKey) continue;
    if (race.entries.some((e) => e.team_id === team_id)) {
      return ok();
    }
  }

  return fail(
    `Team "${team_id}" has no entries in category "${catKey}"`,
  );
}
