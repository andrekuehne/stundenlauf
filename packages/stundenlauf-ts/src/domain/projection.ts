/**
 * Event projection: fold an event log into SeasonState.
 *
 * Reference: F-TS01 §8 (Projection Implementation)
 */

import type {
  SeasonState,
  RaceCategory,
  ImportBatch,
  RaceEvent,
  RaceEntry,
  PersonIdentity,
} from "./types.ts";
import type {
  DomainEvent,
  EventEnvelope,
  ImportBatchRecordedPayload,
  ImportBatchRolledBackPayload,
  PersonRegisteredPayload,
  PersonCorrectedPayload,
  TeamRegisteredPayload,
  RaceRegisteredPayload,
  RaceRolledBackPayload,
  RaceMetadataCorrectedPayload,
  EntryReassignedPayload,
  EntryCorrectedPayload,
  RankingEligibilitySetPayload,
} from "./events.ts";

// --- Helpers ---

export class UnknownEventTypeError extends Error {
  constructor(
    public readonly eventType: string,
    public readonly schemaVersion: number,
  ) {
    super(`Unknown event type "${eventType}" (schema_version=${schemaVersion})`);
    this.name = "UnknownEventTypeError";
  }
}

export function categoryKey(cat: RaceCategory): string {
  return `${cat.duration}:${cat.division}`;
}

export function isEffectiveRace(state: SeasonState, raceEventId: string): boolean {
  const race = state.race_events.get(raceEventId);
  if (!race || race.state === "rolled_back") return false;
  const batch = state.import_batches.get(race.import_batch_id);
  if (batch?.state === "rolled_back") return false;
  return true;
}

// --- Core projection ---

export function emptySeasonState(seasonId: string): SeasonState {
  return {
    season_id: seasonId,
    persons: new Map(),
    teams: new Map(),
    import_batches: new Map(),
    race_events: new Map(),
    exclusions: new Map(),
  };
}

export function projectState(seasonId: string, events: readonly DomainEvent[]): SeasonState {
  let state = emptySeasonState(seasonId);
  for (const event of events) {
    state = applyEvent(state, event);
  }
  return state;
}

export function applyEvent(state: SeasonState, event: DomainEvent): SeasonState {
  switch (event.type) {
    case "import_batch.recorded":
      return applyImportBatchRecorded(state, event);
    case "import_batch.rolled_back":
      return applyImportBatchRolledBack(state, event);
    case "person.registered":
      return applyPersonRegistered(state, event);
    case "person.corrected":
      return applyPersonCorrected(state, event);
    case "team.registered":
      return applyTeamRegistered(state, event);
    case "race.registered":
      return applyRaceRegistered(state, event);
    case "race.rolled_back":
      return applyRaceRolledBack(state, event);
    case "race.metadata_corrected":
      return applyRaceMetadataCorrected(state, event);
    case "entry.reassigned":
      return applyEntryReassigned(state, event);
    case "entry.corrected":
      return applyEntryCorrected(state, event);
    case "ranking.eligibility_set":
      return applyEligibilitySet(state, event);
    default: {
      const exhaustive = event as EventEnvelope;
      throw new UnknownEventTypeError(exhaustive.type, exhaustive.schema_version);
    }
  }
}

// --- Per-event apply functions ---

function applyImportBatchRecorded(
  state: SeasonState,
  event: EventEnvelope<"import_batch.recorded", ImportBatchRecordedPayload>,
): SeasonState {
  const { import_batch_id, source_file, source_sha256, parser_version } = event.payload;
  const batch: ImportBatch = {
    import_batch_id,
    source_file,
    source_sha256,
    parser_version,
    state: "active",
  };
  const import_batches = new Map(state.import_batches);
  import_batches.set(import_batch_id, batch);
  return { ...state, import_batches };
}

function applyImportBatchRolledBack(
  state: SeasonState,
  event: EventEnvelope<"import_batch.rolled_back", ImportBatchRolledBackPayload>,
): SeasonState {
  const { import_batch_id, reason } = event.payload;
  const existing = state.import_batches.get(import_batch_id);
  if (!existing) return state;

  const updated: ImportBatch = {
    ...existing,
    state: "rolled_back",
    rollback: {
      event_id: event.event_id,
      rolled_back_at: event.recorded_at,
      reason,
    },
  };
  const import_batches = new Map(state.import_batches);
  import_batches.set(import_batch_id, updated);
  return { ...state, import_batches };
}

function applyPersonRegistered(
  state: SeasonState,
  event: EventEnvelope<"person.registered", PersonRegisteredPayload>,
): SeasonState {
  const p = event.payload;
  const person: PersonIdentity = {
    person_id: p.person_id,
    given_name: p.given_name,
    family_name: p.family_name,
    yob: p.yob,
    gender: p.gender,
    club: p.club,
    club_normalized: p.club_normalized,
  };
  const persons = new Map(state.persons);
  persons.set(p.person_id, person);
  return { ...state, persons };
}

function applyPersonCorrected(
  state: SeasonState,
  event: EventEnvelope<"person.corrected", PersonCorrectedPayload>,
): SeasonState {
  const { person_id, updated_fields } = event.payload;
  const existing = state.persons.get(person_id);
  if (!existing) return state;

  const updated: PersonIdentity = { ...existing, ...updated_fields };
  const persons = new Map(state.persons);
  persons.set(person_id, updated);
  return { ...state, persons };
}

function applyTeamRegistered(
  state: SeasonState,
  event: EventEnvelope<"team.registered", TeamRegisteredPayload>,
): SeasonState {
  const { team_id, member_person_ids, team_kind } = event.payload;
  const teams = new Map(state.teams);
  teams.set(team_id, { team_id, member_person_ids: [...member_person_ids], team_kind });
  return { ...state, teams };
}

function applyRaceRegistered(
  state: SeasonState,
  event: EventEnvelope<"race.registered", RaceRegisteredPayload>,
): SeasonState {
  const p = event.payload;
  const entries: RaceEntry[] = p.entries.map((e) => ({
    entry_id: e.entry_id,
    startnr: e.startnr,
    team_id: e.team_id,
    distance_m: e.distance_m,
    points: e.points,
    incoming: { ...e.incoming },
    resolution: { ...e.resolution },
  }));

  const race: RaceEvent = {
    race_event_id: p.race_event_id,
    import_batch_id: p.import_batch_id,
    category: { ...p.category },
    race_no: p.race_no,
    race_date: p.race_date,
    state: "active",
    imported_at: event.recorded_at,
    entries,
  };

  const race_events = new Map(state.race_events);
  race_events.set(p.race_event_id, race);
  return { ...state, race_events };
}

function applyRaceRolledBack(
  state: SeasonState,
  event: EventEnvelope<"race.rolled_back", RaceRolledBackPayload>,
): SeasonState {
  const { race_event_id, reason } = event.payload;
  const existing = state.race_events.get(race_event_id);
  if (!existing) return state;

  const updated: RaceEvent = {
    ...existing,
    state: "rolled_back",
    rollback: {
      event_id: event.event_id,
      rolled_back_at: event.recorded_at,
      reason,
    },
  };
  const race_events = new Map(state.race_events);
  race_events.set(race_event_id, updated);
  return { ...state, race_events };
}

function applyRaceMetadataCorrected(
  state: SeasonState,
  event: EventEnvelope<"race.metadata_corrected", RaceMetadataCorrectedPayload>,
): SeasonState {
  const { race_event_id, updated_fields } = event.payload;
  const existing = state.race_events.get(race_event_id);
  if (!existing) return state;

  const updated: RaceEvent = {
    ...existing,
    ...(updated_fields.race_date != null ? { race_date: updated_fields.race_date } : {}),
    ...(updated_fields.race_no != null ? { race_no: updated_fields.race_no } : {}),
    ...(updated_fields.category != null ? { category: { ...updated_fields.category } } : {}),
  };
  const race_events = new Map(state.race_events);
  race_events.set(race_event_id, updated);
  return { ...state, race_events };
}

function applyEntryReassigned(
  state: SeasonState,
  event: EventEnvelope<"entry.reassigned", EntryReassignedPayload>,
): SeasonState {
  const { entry_id, race_event_id, to_team_id } = event.payload;
  const race = state.race_events.get(race_event_id);
  if (!race) return state;

  const entries = race.entries.map((e) =>
    e.entry_id === entry_id ? { ...e, team_id: to_team_id } : e,
  );

  const race_events = new Map(state.race_events);
  race_events.set(race_event_id, { ...race, entries });
  return { ...state, race_events };
}

function applyEntryCorrected(
  state: SeasonState,
  event: EventEnvelope<"entry.corrected", EntryCorrectedPayload>,
): SeasonState {
  const { entry_id, race_event_id, updated_fields } = event.payload;
  const race = state.race_events.get(race_event_id);
  if (!race) return state;

  const entries = race.entries.map((e) =>
    e.entry_id === entry_id ? { ...e, ...updated_fields } : e,
  );

  const race_events = new Map(state.race_events);
  race_events.set(race_event_id, { ...race, entries });
  return { ...state, race_events };
}

function applyEligibilitySet(
  state: SeasonState,
  event: EventEnvelope<"ranking.eligibility_set", RankingEligibilitySetPayload>,
): SeasonState {
  const { category, team_id, eligible } = event.payload;
  const key = categoryKey(category);
  const exclusions = new Map(state.exclusions);
  const catSet = new Set(exclusions.get(key));

  if (eligible) {
    catSet.delete(team_id);
  } else {
    catSet.add(team_id);
  }

  if (catSet.size === 0) {
    exclusions.delete(key);
  } else {
    exclusions.set(key, catSet);
  }

  return { ...state, exclusions };
}
