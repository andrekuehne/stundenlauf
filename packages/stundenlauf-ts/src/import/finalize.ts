/**
 * Phase 4: Construct the atomic event batch from a fully-resolved
 * ImportSession. The caller is responsible for appending the returned
 * events to the event log via EventStore.appendEvents().
 *
 * Event ordering:
 *   1. import_batch.recorded            (1)
 *   2. person.registered                (0+)
 *   3. team.registered                  (0+)
 *   4. race.registered                  (1 per section)
 *   5. ranking.eligibility_set          (0+ clearing prior exclusions)
 *
 * Reference: F-TS05 §6 (Event Batch Construction)
 */

import type { DomainEvent, EventMetadata, ImportBatchRecordedPayload, RaceRegisteredPayload, RankingEligibilitySetPayload } from "@/domain/events.ts";
import type { RaceCategory, RaceEntryInput } from "@/domain/types.ts";
import { assertPhase } from "./session.ts";
import type { ImportSession, StagedEntry } from "./types.ts";

const APP_VERSION = "stundenlauf-ts-0.1.0";

export interface FinalizeOptions {
  startSeq: number;
}

export function finalizeImport(
  session: ImportSession,
  options: FinalizeOptions,
): DomainEvent[] {
  assertPhase(session, "committing");

  const unresolved = session.section_results.some(
    (s) => !s.all_resolved,
  );
  if (unresolved) {
    throw new Error("Cannot finalize: not all entries are resolved.");
  }

  const batchId = session.import_batch_id;
  const metadata: EventMetadata = {
    app_version: APP_VERSION,
    import_batch_id: batchId,
  };
  const now = new Date().toISOString();
  let seq = options.startSeq;

  const events: DomainEvent[] = [];

  function emit(type: string, payload: unknown): void {
    events.push({
      event_id: crypto.randomUUID(),
      seq: seq++,
      recorded_at: now,
      type,
      schema_version: 1,
      payload,
      metadata,
    } as DomainEvent);
  }

  // 1. import_batch.recorded
  const batchPayload: ImportBatchRecordedPayload = {
    import_batch_id: batchId,
    source_file: session.source_file,
    source_sha256: session.source_sha256,
    parser_version: session.parser_version,
  };
  emit("import_batch.recorded", batchPayload);

  // 2. person.registered (deduplicated by person_id)
  const seenPersonIds = new Set<string>();
  for (const p of session.accumulated_person_payloads) {
    if (seenPersonIds.has(p.person_id)) continue;
    seenPersonIds.add(p.person_id);
    emit("person.registered", p);
  }

  // 3. team.registered (deduplicated by team_id)
  const seenTeamIds = new Set<string>();
  for (const t of session.accumulated_team_payloads) {
    if (seenTeamIds.has(t.team_id)) continue;
    seenTeamIds.add(t.team_id);
    emit("team.registered", t);
  }

  // 4. race.registered (1 per section)
  for (const section of session.section_results) {
    const entries: RaceEntryInput[] = section.staged_entries.map(
      stagedToRaceEntryInput,
    );

    const racePayload: RaceRegisteredPayload = {
      race_event_id: crypto.randomUUID(),
      import_batch_id: batchId,
      category: {
        duration: section.context.duration,
        division: section.context.division,
      },
      race_no: section.context.race_no,
      race_date: section.context.event_date ?? now.slice(0, 10),
      entries,
    };
    emit("race.registered", racePayload);
  }

  // 5. ranking.eligibility_set (clear all prior exclusions)
  for (const [key, teamIds] of session.season_state_at_start.exclusions) {
    const category = parseCategoryKey(key);
    if (!category) continue;
    for (const teamId of teamIds) {
      const payload: RankingEligibilitySetPayload = {
        category,
        team_id: teamId,
        eligible: true,
      };
      emit("ranking.eligibility_set", payload);
    }
  }

  return events;
}

function stagedToRaceEntryInput(staged: StagedEntry): RaceEntryInput {
  if (staged.team_id === null || staged.resolution === null) {
    throw new Error(
      `Entry "${staged.entry_id}" is not fully resolved (team_id or resolution is null).`,
    );
  }
  return {
    entry_id: staged.entry_id,
    startnr: staged.startnr,
    team_id: staged.team_id,
    distance_m: staged.distance_m,
    points: staged.points,
    incoming: staged.incoming,
    resolution: staged.resolution,
  };
}

function parseCategoryKey(key: string): RaceCategory | null {
  const parts = key.split(":");
  if (parts.length !== 2) return null;
  return {
    duration: parts[0] as RaceCategory["duration"],
    division: parts[1] as RaceCategory["division"],
  };
}
