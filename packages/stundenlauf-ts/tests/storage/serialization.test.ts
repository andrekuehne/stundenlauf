import { describe, it, expect, beforeEach } from "vitest";
import { serializeEventLog, deserializeEventLog } from "@/storage/serialization.ts";
import { projectState } from "@/domain/projection.ts";
import type { DomainEvent } from "@/domain/events.ts";
import {
  resetSeqCounter,
  importBatchRecorded,
  personRegistered,
  teamRegistered,
  raceRegistered,
  rankingEligibilitySet,
  defaultEntry,
  defaultCategory,
} from "../helpers/event-factories.ts";

beforeEach(() => {
  resetSeqCounter();
});

function buildTypicalEventLog(): DomainEvent[] {
  const batchId = "batch-round-trip";
  return [
    importBatchRecorded({ import_batch_id: batchId }),
    personRegistered({ person_id: "p1", given_name: "Max", family_name: "Müller", yob: 1990, gender: "M", club: "LG Test", club_normalized: "lg test" }),
    personRegistered({ person_id: "p2", given_name: "Anna", family_name: "Schmidt", yob: 1985, gender: "F", club: null, club_normalized: "" }),
    teamRegistered({ team_id: "t1", member_person_ids: ["p1"], team_kind: "solo" }),
    teamRegistered({ team_id: "t2", member_person_ids: ["p2"], team_kind: "solo" }),
    raceRegistered({
      race_event_id: "r1",
      import_batch_id: batchId,
      category: defaultCategory({ duration: "hour", division: "men" }),
      race_no: 1,
      race_date: "2025-06-01",
      entries: [
        defaultEntry({ entry_id: "e1", team_id: "t1", distance_m: 12000, points: 12 }),
        defaultEntry({ entry_id: "e2", team_id: "t2", distance_m: 10000, points: 10 }),
      ],
    }),
    rankingEligibilitySet({
      category: defaultCategory({ duration: "hour", division: "men" }),
      team_id: "t1",
      eligible: false,
    }),
  ];
}

describe("serializeEventLog", () => {
  it("produces valid JSON with the expected format fields", () => {
    const events = buildTypicalEventLog();
    const json = serializeEventLog("season-1", "Stundenlauf 2025", events);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed.format).toBe("stundenlauf-ts-eventlog");
    expect(parsed.format_version).toBe(1);
    expect(parsed.season_id).toBe("season-1");
    expect(parsed.label).toBe("Stundenlauf 2025");
    expect(Array.isArray(parsed.events)).toBe(true);
    expect((parsed.events as unknown[]).length).toBe(events.length);
  });
});

describe("deserializeEventLog", () => {
  it("round-trips correctly", () => {
    const events = buildTypicalEventLog();
    const json = serializeEventLog("season-1", "Stundenlauf 2025", events);
    const archive = deserializeEventLog(json);

    expect(archive.format).toBe("stundenlauf-ts-eventlog");
    expect(archive.format_version).toBe(1);
    expect(archive.season_id).toBe("season-1");
    expect(archive.label).toBe("Stundenlauf 2025");
    expect(archive.events).toHaveLength(events.length);

    for (let i = 0; i < events.length; i++) {
      expect(archive.events[i]!.event_id).toBe(events[i]!.event_id);
      expect(archive.events[i]!.type).toBe(events[i]!.type);
      expect(archive.events[i]!.seq).toBe(events[i]!.seq);
    }
  });

  it("produces identical projected state after round-trip", () => {
    const events = buildTypicalEventLog();
    const originalState = projectState("season-1", events);

    const json = serializeEventLog("season-1", "Stundenlauf 2025", events);
    const archive = deserializeEventLog(json);
    const restoredState = projectState("season-1", archive.events);

    expect(restoredState.persons.size).toBe(originalState.persons.size);
    expect(restoredState.teams.size).toBe(originalState.teams.size);
    expect(restoredState.race_events.size).toBe(originalState.race_events.size);
    expect(restoredState.import_batches.size).toBe(originalState.import_batches.size);

    for (const [id, person] of originalState.persons) {
      expect(restoredState.persons.get(id)).toEqual(person);
    }
    for (const [id, team] of originalState.teams) {
      expect(restoredState.teams.get(id)).toEqual(team);
    }
    for (const [id, race] of originalState.race_events) {
      expect(restoredState.race_events.get(id)).toEqual(race);
    }
    for (const [key, excluded] of originalState.exclusions) {
      expect(restoredState.exclusions.get(key)).toEqual(excluded);
    }
  });

  it("preserves German unicode characters", () => {
    const events: DomainEvent[] = [
      personRegistered({
        person_id: "p-umlaut",
        given_name: "Jürgen",
        family_name: "Großmann",
        yob: 1970,
        gender: "M",
        club: "Süddeutsche Läufer",
        club_normalized: "süddeutsche läufer",
      }),
    ];
    const json = serializeEventLog("s1", "Test", events);
    const archive = deserializeEventLog(json);
    const person = archive.events[0]!.payload as { given_name: string; family_name: string; club: string };
    expect(person.given_name).toBe("Jürgen");
    expect(person.family_name).toBe("Großmann");
    expect(person.club).toBe("Süddeutsche Läufer");
  });

  it("keeps replay compatibility with legacy person events", () => {
    const legacyEvent = {
      event_id: "evt-legacy-person",
      seq: 0,
      recorded_at: "2026-01-01T00:00:00.000Z",
      type: "person.registered",
      schema_version: 1,
      payload: {
        person_id: "p-legacy",
        given_name: "Anna",
        family_name: "Schmidt",
        yob: 1985,
        gender: "F",
        club: "TV Freiburg",
        club_normalized: "legacy",
      },
      metadata: { app_version: "0.0.0-test" },
    } satisfies DomainEvent;

    const json = serializeEventLog("s1", "Legacy", [legacyEvent]);
    const archive = deserializeEventLog(json);
    const state = projectState("s1", archive.events);
    const person = state.persons.get("p-legacy");

    expect(person).toBeDefined();
    expect(person!.display_name).toBe("Anna Schmidt");
    expect(person!.name_normalized).toBe("anna|schmidt");
    expect(person!.club_normalized).toBe("tv freiburg");
  });
});

describe("deserializeEventLog error cases", () => {
  it("rejects invalid JSON", () => {
    expect(() => deserializeEventLog("not json")).toThrow("Invalid JSON");
  });

  it("rejects non-object JSON", () => {
    expect(() => deserializeEventLog('"just a string"')).toThrow("expected a JSON object");
  });

  it("rejects wrong format identifier", () => {
    const json = JSON.stringify({ format: "wrong-format", format_version: 1, season_id: "s1", label: "x", events: [] });
    expect(() => deserializeEventLog(json)).toThrow("Invalid archive format");
  });

  it("rejects unsupported format_version", () => {
    const json = JSON.stringify({ format: "stundenlauf-ts-eventlog", format_version: 99, season_id: "s1", label: "x", events: [] });
    expect(() => deserializeEventLog(json)).toThrow("Unsupported format_version");
  });

  it("rejects missing season_id", () => {
    const json = JSON.stringify({ format: "stundenlauf-ts-eventlog", format_version: 1, label: "x", events: [] });
    expect(() => deserializeEventLog(json)).toThrow("season_id");
  });

  it("rejects missing events array", () => {
    const json = JSON.stringify({ format: "stundenlauf-ts-eventlog", format_version: 1, season_id: "s1", label: "x" });
    expect(() => deserializeEventLog(json)).toThrow("events must be an array");
  });
});
