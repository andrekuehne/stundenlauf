/**
 * Test helper factories for creating valid DomainEvent instances.
 *
 * Each factory produces a minimal valid event with sensible defaults.
 * Override any field via the `overrides` parameter.
 */

import type {
  DomainEvent,
  EventMetadata,
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
} from "@/domain/events.ts";
import type { RaceCategory, RaceEntryInput, IncomingRowData, ResolutionInfo } from "@/domain/types.ts";

let seqCounter = 0;

export function resetSeqCounter(): void {
  seqCounter = 0;
}

function nextSeq(): number {
  return seqCounter++;
}

function defaultMetadata(batchId?: string): EventMetadata {
  return {
    app_version: "0.0.0-test",
    ...(batchId != null ? { import_batch_id: batchId } : {}),
  };
}

interface EnvelopeFields {
  event_id?: string;
  seq?: number;
  recorded_at?: string;
  schema_version?: number;
  metadata?: EventMetadata;
}

// --- Payload defaults ---

export function defaultCategory(overrides?: Partial<RaceCategory>): RaceCategory {
  return { duration: "hour", division: "men", ...overrides };
}

export function defaultIncomingRowData(overrides?: Partial<IncomingRowData>): IncomingRowData {
  return {
    display_name: "Müller, Max",
    yob: 1990,
    yob_text: null,
    club: "LG Test",
    row_kind: "solo",
    sheet_name: "Sheet1",
    section_name: "Herren 60min",
    row_index: 0,
    ...overrides,
  };
}

export function defaultResolution(overrides?: Partial<ResolutionInfo>): ResolutionInfo {
  return { method: "new_identity", confidence: null, candidate_count: 0, ...overrides };
}

export function defaultEntry(overrides?: Partial<RaceEntryInput>): RaceEntryInput {
  return {
    entry_id: `entry-${crypto.randomUUID().slice(0, 8)}`,
    startnr: "1",
    team_id: "team-default",
    distance_m: 10000,
    points: 10,
    incoming: defaultIncomingRowData(),
    resolution: defaultResolution(),
    ...overrides,
  };
}

// --- Event factories ---

type ImportBatchRecordedEvent = Extract<DomainEvent, { type: "import_batch.recorded" }>;

export function importBatchRecorded(
  overrides?: Partial<ImportBatchRecordedPayload>,
  envelopeOverrides?: EnvelopeFields,
): ImportBatchRecordedEvent {
  const payload: ImportBatchRecordedPayload = {
    import_batch_id: `batch-${crypto.randomUUID().slice(0, 8)}`,
    source_file: "test.xlsx",
    source_sha256: "abc123",
    parser_version: "1.0.0",
    ...overrides,
  };
  return {
    event_id: envelopeOverrides?.event_id ?? `evt-ibr-${crypto.randomUUID().slice(0, 8)}`,
    seq: envelopeOverrides?.seq ?? nextSeq(),
    recorded_at: envelopeOverrides?.recorded_at ?? new Date().toISOString(),
    type: "import_batch.recorded",
    schema_version: envelopeOverrides?.schema_version ?? 1,
    payload,
    metadata: envelopeOverrides?.metadata ?? defaultMetadata(payload.import_batch_id),
  };
}

type ImportBatchRolledBackEvent = Extract<DomainEvent, { type: "import_batch.rolled_back" }>;

export function importBatchRolledBack(
  overrides?: Partial<ImportBatchRolledBackPayload>,
  envelopeOverrides?: EnvelopeFields,
): ImportBatchRolledBackEvent {
  const payload: ImportBatchRolledBackPayload = {
    import_batch_id: "batch-default",
    reason: "User requested rollback",
    ...overrides,
  };
  return {
    event_id: envelopeOverrides?.event_id ?? `evt-ibrb-${crypto.randomUUID().slice(0, 8)}`,
    seq: envelopeOverrides?.seq ?? nextSeq(),
    recorded_at: envelopeOverrides?.recorded_at ?? new Date().toISOString(),
    type: "import_batch.rolled_back",
    schema_version: envelopeOverrides?.schema_version ?? 1,
    payload,
    metadata: envelopeOverrides?.metadata ?? defaultMetadata(),
  };
}

type PersonRegisteredEvent = Extract<DomainEvent, { type: "person.registered" }>;

export function personRegistered(
  overrides?: Partial<PersonRegisteredPayload>,
  envelopeOverrides?: EnvelopeFields,
): PersonRegisteredEvent {
  const payload: PersonRegisteredPayload = {
    person_id: `person-${crypto.randomUUID().slice(0, 8)}`,
    given_name: "Max",
    family_name: "Müller",
    yob: 1990,
    gender: "M",
    club: "LG Test",
    club_normalized: "lg test",
    ...overrides,
  };
  return {
    event_id: envelopeOverrides?.event_id ?? `evt-pr-${crypto.randomUUID().slice(0, 8)}`,
    seq: envelopeOverrides?.seq ?? nextSeq(),
    recorded_at: envelopeOverrides?.recorded_at ?? new Date().toISOString(),
    type: "person.registered",
    schema_version: envelopeOverrides?.schema_version ?? 1,
    payload,
    metadata: envelopeOverrides?.metadata ?? defaultMetadata(),
  };
}

type PersonCorrectedEvent = Extract<DomainEvent, { type: "person.corrected" }>;

export function personCorrected(
  overrides?: Partial<PersonCorrectedPayload>,
  envelopeOverrides?: EnvelopeFields,
): PersonCorrectedEvent {
  const payload: PersonCorrectedPayload = {
    person_id: "person-default",
    updated_fields: {},
    rationale: "Test correction",
    ...overrides,
  };
  return {
    event_id: envelopeOverrides?.event_id ?? `evt-pc-${crypto.randomUUID().slice(0, 8)}`,
    seq: envelopeOverrides?.seq ?? nextSeq(),
    recorded_at: envelopeOverrides?.recorded_at ?? new Date().toISOString(),
    type: "person.corrected",
    schema_version: envelopeOverrides?.schema_version ?? 1,
    payload,
    metadata: envelopeOverrides?.metadata ?? defaultMetadata(),
  };
}

type TeamRegisteredEvent = Extract<DomainEvent, { type: "team.registered" }>;

export function teamRegistered(
  overrides?: Partial<TeamRegisteredPayload>,
  envelopeOverrides?: EnvelopeFields,
): TeamRegisteredEvent {
  const payload: TeamRegisteredPayload = {
    team_id: `team-${crypto.randomUUID().slice(0, 8)}`,
    member_person_ids: ["person-default"],
    team_kind: "solo",
    ...overrides,
  };
  return {
    event_id: envelopeOverrides?.event_id ?? `evt-tr-${crypto.randomUUID().slice(0, 8)}`,
    seq: envelopeOverrides?.seq ?? nextSeq(),
    recorded_at: envelopeOverrides?.recorded_at ?? new Date().toISOString(),
    type: "team.registered",
    schema_version: envelopeOverrides?.schema_version ?? 1,
    payload,
    metadata: envelopeOverrides?.metadata ?? defaultMetadata(),
  };
}

type RaceRegisteredEvent = Extract<DomainEvent, { type: "race.registered" }>;

export function raceRegistered(
  overrides?: Partial<RaceRegisteredPayload>,
  envelopeOverrides?: EnvelopeFields,
): RaceRegisteredEvent {
  const payload: RaceRegisteredPayload = {
    race_event_id: `race-${crypto.randomUUID().slice(0, 8)}`,
    import_batch_id: "batch-default",
    category: defaultCategory(),
    race_no: 1,
    race_date: "2025-06-01",
    entries: [],
    ...overrides,
  };
  return {
    event_id: envelopeOverrides?.event_id ?? `evt-rr-${crypto.randomUUID().slice(0, 8)}`,
    seq: envelopeOverrides?.seq ?? nextSeq(),
    recorded_at: envelopeOverrides?.recorded_at ?? new Date().toISOString(),
    type: "race.registered",
    schema_version: envelopeOverrides?.schema_version ?? 1,
    payload,
    metadata: envelopeOverrides?.metadata ?? defaultMetadata(payload.import_batch_id),
  };
}

type RaceRolledBackEvent = Extract<DomainEvent, { type: "race.rolled_back" }>;

export function raceRolledBack(
  overrides?: Partial<RaceRolledBackPayload>,
  envelopeOverrides?: EnvelopeFields,
): RaceRolledBackEvent {
  const payload: RaceRolledBackPayload = {
    race_event_id: "race-default",
    reason: "User requested rollback",
    ...overrides,
  };
  return {
    event_id: envelopeOverrides?.event_id ?? `evt-rrb-${crypto.randomUUID().slice(0, 8)}`,
    seq: envelopeOverrides?.seq ?? nextSeq(),
    recorded_at: envelopeOverrides?.recorded_at ?? new Date().toISOString(),
    type: "race.rolled_back",
    schema_version: envelopeOverrides?.schema_version ?? 1,
    payload,
    metadata: envelopeOverrides?.metadata ?? defaultMetadata(),
  };
}

type RaceMetadataCorrectedEvent = Extract<DomainEvent, { type: "race.metadata_corrected" }>;

export function raceMetadataCorrected(
  overrides?: Partial<RaceMetadataCorrectedPayload>,
  envelopeOverrides?: EnvelopeFields,
): RaceMetadataCorrectedEvent {
  const payload: RaceMetadataCorrectedPayload = {
    race_event_id: "race-default",
    updated_fields: {},
    rationale: "Test correction",
    ...overrides,
  };
  return {
    event_id: envelopeOverrides?.event_id ?? `evt-rmc-${crypto.randomUUID().slice(0, 8)}`,
    seq: envelopeOverrides?.seq ?? nextSeq(),
    recorded_at: envelopeOverrides?.recorded_at ?? new Date().toISOString(),
    type: "race.metadata_corrected",
    schema_version: envelopeOverrides?.schema_version ?? 1,
    payload,
    metadata: envelopeOverrides?.metadata ?? defaultMetadata(),
  };
}

type EntryReassignedEvent = Extract<DomainEvent, { type: "entry.reassigned" }>;

export function entryReassigned(
  overrides?: Partial<EntryReassignedPayload>,
  envelopeOverrides?: EnvelopeFields,
): EntryReassignedEvent {
  const payload: EntryReassignedPayload = {
    entry_id: "entry-default",
    race_event_id: "race-default",
    from_team_id: "team-a",
    to_team_id: "team-b",
    rationale: "Wrong match",
    ...overrides,
  };
  return {
    event_id: envelopeOverrides?.event_id ?? `evt-er-${crypto.randomUUID().slice(0, 8)}`,
    seq: envelopeOverrides?.seq ?? nextSeq(),
    recorded_at: envelopeOverrides?.recorded_at ?? new Date().toISOString(),
    type: "entry.reassigned",
    schema_version: envelopeOverrides?.schema_version ?? 1,
    payload,
    metadata: envelopeOverrides?.metadata ?? defaultMetadata(),
  };
}

type EntryCorrectedEvent = Extract<DomainEvent, { type: "entry.corrected" }>;

export function entryCorrected(
  overrides?: Partial<EntryCorrectedPayload>,
  envelopeOverrides?: EnvelopeFields,
): EntryCorrectedEvent {
  const payload: EntryCorrectedPayload = {
    entry_id: "entry-default",
    race_event_id: "race-default",
    updated_fields: {},
    rationale: "Test correction",
    ...overrides,
  };
  return {
    event_id: envelopeOverrides?.event_id ?? `evt-ec-${crypto.randomUUID().slice(0, 8)}`,
    seq: envelopeOverrides?.seq ?? nextSeq(),
    recorded_at: envelopeOverrides?.recorded_at ?? new Date().toISOString(),
    type: "entry.corrected",
    schema_version: envelopeOverrides?.schema_version ?? 1,
    payload,
    metadata: envelopeOverrides?.metadata ?? defaultMetadata(),
  };
}

type RankingEligibilitySetEvent = Extract<DomainEvent, { type: "ranking.eligibility_set" }>;

export function rankingEligibilitySet(
  overrides?: Partial<RankingEligibilitySetPayload>,
  envelopeOverrides?: EnvelopeFields,
): RankingEligibilitySetEvent {
  const payload: RankingEligibilitySetPayload = {
    category: defaultCategory(),
    team_id: "team-default",
    eligible: false,
    ...overrides,
  };
  return {
    event_id: envelopeOverrides?.event_id ?? `evt-res-${crypto.randomUUID().slice(0, 8)}`,
    seq: envelopeOverrides?.seq ?? nextSeq(),
    recorded_at: envelopeOverrides?.recorded_at ?? new Date().toISOString(),
    type: "ranking.eligibility_set",
    schema_version: envelopeOverrides?.schema_version ?? 1,
    payload,
    metadata: envelopeOverrides?.metadata ?? defaultMetadata(),
  };
}
