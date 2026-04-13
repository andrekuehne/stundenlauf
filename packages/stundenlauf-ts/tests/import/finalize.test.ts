import { describe, expect, it } from "vitest";
import { emptySeasonState } from "@/domain/projection.ts";
import type { PersonRegisteredPayload, TeamRegisteredPayload } from "@/domain/events.ts";
import { emptyImportReport } from "@/import/report.ts";
import { finalizeImport } from "@/import/finalize.ts";
import type {
  ImportSession,
  OrchestratedSection,
  StagedEntry,
} from "@/import/types.ts";
import type { ParsedWorkbook } from "@/ingestion/types.ts";

function makeResolvedStaged(overrides?: Partial<StagedEntry>): StagedEntry {
  return {
    entry_id: `entry-${crypto.randomUUID().slice(0, 8)}`,
    startnr: "1",
    team_id: "team-1",
    distance_m: 10000,
    points: 10,
    incoming: {
      display_name: "Müller, Max",
      yob: 1990,
      yob_text: null,
      club: "LG Test",
      row_kind: "solo",
      sheet_name: "test.xlsx",
      section_name: "Herren 60min",
      row_index: 0,
    },
    resolution: {
      method: "auto",
      confidence: 0.95,
      candidate_count: 1,
    },
    review_routing: "auto",
    ...overrides,
  };
}

function makeCommittingSession(
  sections: OrchestratedSection[],
  personPayloads: PersonRegisteredPayload[] = [],
  teamPayloads: TeamRegisteredPayload[] = [],
): ImportSession {
  const parsed: ParsedWorkbook = {
    meta: {
      source_file: "test.xlsx",
      source_sha256: "sha-abc",
      parser_version: "f-ts02-v1",
      schema_fingerprint: "fp",
      file_mtime: 0,
      imported_at: new Date().toISOString(),
    },
    singles_sections: [],
    couples_sections: [],
  };

  return {
    session_id: "session-1",
    import_batch_id: "batch-finalize",
    source_file: "test.xlsx",
    source_sha256: "sha-abc",
    parser_version: "f-ts02-v1",
    phase: "committing",
    parsed,
    season_state_at_start: emptySeasonState("s1"),
    section_results: sections,
    review_queue: [],
    accumulated_person_payloads: personPayloads,
    accumulated_team_payloads: teamPayloads,
    report: emptyImportReport(),
  };
}

describe("finalizeImport", () => {
  it("produces events in the correct order", () => {
    const personPayload: PersonRegisteredPayload = {
      person_id: "p1",
      given_name: "Max",
      family_name: "Müller",
      yob: 1990,
      gender: "M",
      club: "LG Test",
      club_normalized: "lg test",
    };
    const teamPayload: TeamRegisteredPayload = {
      team_id: "team-1",
      member_person_ids: ["p1"],
      team_kind: "solo",
    };

    const section: OrchestratedSection = {
      context: { race_no: 1, duration: "hour", division: "men", event_date: "2025-06-01" },
      staged_entries: [makeResolvedStaged()],
      all_resolved: true,
    };

    const session = makeCommittingSession([section], [personPayload], [teamPayload]);
    const events = finalizeImport(session, { startSeq: 0 });

    const types = events.map((e) => e.type);
    expect(types).toEqual([
      "import_batch.recorded",
      "person.registered",
      "team.registered",
      "race.registered",
    ]);
  });

  it("assigns sequential seq numbers starting from startSeq", () => {
    const section: OrchestratedSection = {
      context: { race_no: 1, duration: "hour", division: "men", event_date: "2025-06-01" },
      staged_entries: [makeResolvedStaged()],
      all_resolved: true,
    };

    const session = makeCommittingSession([section]);
    const events = finalizeImport(session, { startSeq: 5 });

    for (let i = 0; i < events.length; i++) {
      expect(events[i]!.seq).toBe(5 + i);
    }
  });

  it("sets metadata.import_batch_id on all events", () => {
    const section: OrchestratedSection = {
      context: { race_no: 1, duration: "hour", division: "men", event_date: "2025-06-01" },
      staged_entries: [makeResolvedStaged()],
      all_resolved: true,
    };

    const session = makeCommittingSession([section]);
    const events = finalizeImport(session, { startSeq: 0 });

    for (const event of events) {
      expect(event.metadata.import_batch_id).toBe("batch-finalize");
    }
  });

  it("deduplicates person payloads by person_id", () => {
    const personPayload: PersonRegisteredPayload = {
      person_id: "p1",
      given_name: "Max",
      family_name: "Müller",
      yob: 1990,
      gender: "M",
      club: "LG Test",
      club_normalized: "lg test",
    };

    const section: OrchestratedSection = {
      context: { race_no: 1, duration: "hour", division: "men", event_date: "2025-06-01" },
      staged_entries: [makeResolvedStaged()],
      all_resolved: true,
    };

    const session = makeCommittingSession(
      [section],
      [personPayload, personPayload],
      [],
    );
    const events = finalizeImport(session, { startSeq: 0 });

    const personEvents = events.filter((e) => e.type === "person.registered");
    expect(personEvents).toHaveLength(1);
  });

  it("deduplicates team payloads by team_id", () => {
    const teamPayload: TeamRegisteredPayload = {
      team_id: "team-1",
      member_person_ids: ["p1"],
      team_kind: "solo",
    };

    const section: OrchestratedSection = {
      context: { race_no: 1, duration: "hour", division: "men", event_date: "2025-06-01" },
      staged_entries: [makeResolvedStaged()],
      all_resolved: true,
    };

    const session = makeCommittingSession(
      [section],
      [],
      [teamPayload, teamPayload],
    );
    const events = finalizeImport(session, { startSeq: 0 });

    const teamEvents = events.filter((e) => e.type === "team.registered");
    expect(teamEvents).toHaveLength(1);
  });

  it("creates one race.registered per section", () => {
    const section1: OrchestratedSection = {
      context: { race_no: 1, duration: "hour", division: "men", event_date: "2025-06-01" },
      staged_entries: [makeResolvedStaged()],
      all_resolved: true,
    };
    const section2: OrchestratedSection = {
      context: { race_no: 1, duration: "hour", division: "women", event_date: "2025-06-01" },
      staged_entries: [
        makeResolvedStaged({
          team_id: "team-2",
          incoming: {
            display_name: "Schmidt, Anna",
            yob: 1992,
            yob_text: null,
            club: null,
            row_kind: "solo",
            sheet_name: "test.xlsx",
            section_name: "Frauen 60min",
            row_index: 0,
          },
        }),
      ],
      all_resolved: true,
    };

    const session = makeCommittingSession([section1, section2]);
    const events = finalizeImport(session, { startSeq: 0 });

    const raceEvents = events.filter((e) => e.type === "race.registered");
    expect(raceEvents).toHaveLength(2);
  });

  it("emits ranking.eligibility_set events for existing exclusions", () => {
    const section: OrchestratedSection = {
      context: { race_no: 1, duration: "hour", division: "men", event_date: "2025-06-01" },
      staged_entries: [makeResolvedStaged()],
      all_resolved: true,
    };

    const session = makeCommittingSession([section]);
    const stateWithExclusions = {
      ...session.season_state_at_start,
      exclusions: new Map([["hour:men", new Set(["team-x", "team-y"])]]),
    };
    const sessionWithExclusions = {
      ...session,
      season_state_at_start: stateWithExclusions,
    };

    const events = finalizeImport(sessionWithExclusions, { startSeq: 0 });
    const eligEvents = events.filter(
      (e) => e.type === "ranking.eligibility_set",
    );

    expect(eligEvents).toHaveLength(2);
    for (const evt of eligEvents) {
      const payload = evt.payload as { eligible: boolean };
      expect(payload.eligible).toBe(true);
    }
  });

  it("emits no eligibility events when there are no exclusions", () => {
    const section: OrchestratedSection = {
      context: { race_no: 1, duration: "hour", division: "men", event_date: "2025-06-01" },
      staged_entries: [makeResolvedStaged()],
      all_resolved: true,
    };

    const session = makeCommittingSession([section]);
    const events = finalizeImport(session, { startSeq: 0 });
    const eligEvents = events.filter(
      (e) => e.type === "ranking.eligibility_set",
    );

    expect(eligEvents).toHaveLength(0);
  });

  it("throws when session is not in committing phase", () => {
    const section: OrchestratedSection = {
      context: { race_no: 1, duration: "hour", division: "men", event_date: "2025-06-01" },
      staged_entries: [makeResolvedStaged()],
      all_resolved: true,
    };
    const session = makeCommittingSession([section]);
    const wrongPhase = { ...session, phase: "reviewing" as const };

    expect(() => finalizeImport(wrongPhase, { startSeq: 0 })).toThrow("phase");
  });

  it("throws when entries are not fully resolved", () => {
    const unresolvedStaged = makeResolvedStaged({
      team_id: null,
      resolution: null,
      review_routing: "review",
    });
    const section: OrchestratedSection = {
      context: { race_no: 1, duration: "hour", division: "men", event_date: "2025-06-01" },
      staged_entries: [unresolvedStaged],
      all_resolved: false,
    };

    const session = makeCommittingSession([section]);
    expect(() => finalizeImport(session, { startSeq: 0 })).toThrow(
      "not all entries are resolved",
    );
  });
});
