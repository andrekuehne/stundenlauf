import { describe, it, expect, beforeEach } from "vitest";
import {
  emptySeasonState,
  projectState,
  applyEvent,
  categoryKey,
  isEffectiveRace,
  UnknownEventTypeError,
} from "@/domain/projection.ts";
import type { DomainEvent } from "@/domain/events.ts";
import {
  resetSeqCounter,
  importBatchRecorded,
  importBatchRolledBack,
  personRegistered,
  personCorrected,
  teamRegistered,
  raceRegistered,
  raceRolledBack,
  raceMetadataCorrected,
  entryReassigned,
  entryCorrected,
  rankingEligibilitySet,
  defaultEntry,
  defaultCategory,
} from "../helpers/event-factories.ts";

beforeEach(() => {
  resetSeqCounter();
});

// --- emptySeasonState ---

describe("emptySeasonState", () => {
  it("returns empty state for a given season ID", () => {
    const state = emptySeasonState("test-season");
    expect(state.season_id).toBe("test-season");
    expect(state.persons.size).toBe(0);
    expect(state.teams.size).toBe(0);
    expect(state.import_batches.size).toBe(0);
    expect(state.race_events.size).toBe(0);
    expect(state.exclusions.size).toBe(0);
  });
});

// --- projectState ---

describe("projectState", () => {
  it("returns empty state for an empty event log", () => {
    const state = projectState("test-season", []);
    expect(state.season_id).toBe("test-season");
    expect(state.persons.size).toBe(0);
  });
});

// --- categoryKey ---

describe("categoryKey", () => {
  it("produces duration:division format", () => {
    expect(categoryKey({ duration: "hour", division: "men" })).toBe("hour:men");
    expect(categoryKey({ duration: "half_hour", division: "couples_mixed" })).toBe(
      "half_hour:couples_mixed",
    );
  });
});

// --- Per-handler unit tests ---

describe("applyEvent: import_batch.recorded", () => {
  it("inserts a new active import batch", () => {
    const event = importBatchRecorded({ import_batch_id: "batch-1" });
    const state = applyEvent(emptySeasonState("s1"), event);

    expect(state.import_batches.size).toBe(1);
    const batch = state.import_batches.get("batch-1");
    expect(batch).toBeDefined();
    expect(batch!.state).toBe("active");
    expect(batch!.source_file).toBe("test.xlsx");
    expect(batch!.rollback).toBeUndefined();
  });
});

describe("applyEvent: import_batch.rolled_back", () => {
  it("marks an existing batch as rolled_back", () => {
    const batchEvent = importBatchRecorded({ import_batch_id: "batch-1" });
    const rollbackEvent = importBatchRolledBack({
      import_batch_id: "batch-1",
      reason: "Duplicate",
    });

    let state = applyEvent(emptySeasonState("s1"), batchEvent);
    state = applyEvent(state, rollbackEvent);

    const batch = state.import_batches.get("batch-1");
    expect(batch!.state).toBe("rolled_back");
    expect(batch!.rollback).toBeDefined();
    expect(batch!.rollback!.reason).toBe("Duplicate");
  });

  it("is a no-op for a nonexistent batch", () => {
    const event = importBatchRolledBack({ import_batch_id: "nonexistent" });
    const before = emptySeasonState("s1");
    const after = applyEvent(before, event);
    expect(after.import_batches.size).toBe(0);
  });
});

describe("applyEvent: person.registered", () => {
  it("inserts a new person into the registry", () => {
    const event = personRegistered({
      person_id: "p1",
      given_name: "Anna",
      family_name: "Schmidt",
      yob: 1985,
      gender: "F",
      club: "TV Freiburg",
      club_normalized: "tv freiburg",
    });
    const state = applyEvent(emptySeasonState("s1"), event);

    expect(state.persons.size).toBe(1);
    const person = state.persons.get("p1");
    expect(person!.given_name).toBe("Anna");
    expect(person!.family_name).toBe("Schmidt");
    expect(person!.yob).toBe(1985);
    expect(person!.gender).toBe("F");
    expect(person!.club).toBe("TV Freiburg");
    expect(person!.club_normalized).toBe("tv freiburg");
  });

  it("derives canonical display fields for legacy payloads", () => {
    const event = personRegistered({
      person_id: "p-legacy",
      given_name: "Anna",
      family_name: "Schmidt",
      display_name: undefined,
      name_normalized: undefined,
      yob: 1985,
      gender: "F",
      club: "TV Freiburg",
      club_normalized: "incorrect legacy value",
    });
    const state = applyEvent(emptySeasonState("s1"), event);

    const person = state.persons.get("p-legacy");
    expect(person).toBeDefined();
    expect(person!.display_name).toBe("Anna Schmidt");
    expect(person!.name_normalized).toBe("anna|schmidt");
    expect(person!.club_normalized).toBe("tv freiburg");
  });
});

describe("applyEvent: person.corrected", () => {
  it("updates only specified fields on an existing person", () => {
    const regEvent = personRegistered({
      person_id: "p1",
      given_name: "Max",
      family_name: "Muller",
      yob: 1990,
      gender: "M",
      club: "LG Test",
      club_normalized: "lg test",
    });
    const corrEvent = personCorrected({
      person_id: "p1",
      updated_fields: { family_name: "Müller", club: "SC Freiburg", club_normalized: "sc freiburg" },
    });

    let state = applyEvent(emptySeasonState("s1"), regEvent);
    state = applyEvent(state, corrEvent);

    const person = state.persons.get("p1");
    expect(person!.family_name).toBe("Müller");
    expect(person!.club).toBe("SC Freiburg");
    expect(person!.club_normalized).toBe("sc freiburg");
    expect(person!.given_name).toBe("Max");
    expect(person!.yob).toBe(1990);
  });

  it("is a no-op for a nonexistent person", () => {
    const event = personCorrected({ person_id: "nonexistent" });
    const before = emptySeasonState("s1");
    const after = applyEvent(before, event);
    expect(after.persons.size).toBe(0);
  });
});

describe("applyEvent: team.registered", () => {
  it("inserts a solo team", () => {
    const event = teamRegistered({
      team_id: "t1",
      member_person_ids: ["p1"],
      team_kind: "solo",
    });
    const state = applyEvent(emptySeasonState("s1"), event);

    expect(state.teams.size).toBe(1);
    const team = state.teams.get("t1");
    expect(team!.member_person_ids).toEqual(["p1"]);
    expect(team!.team_kind).toBe("solo");
  });

  it("inserts a couple team", () => {
    const event = teamRegistered({
      team_id: "t2",
      member_person_ids: ["p1", "p2"],
      team_kind: "couple",
    });
    const state = applyEvent(emptySeasonState("s1"), event);

    const team = state.teams.get("t2");
    expect(team!.member_person_ids).toEqual(["p1", "p2"]);
    expect(team!.team_kind).toBe("couple");
  });
});

describe("applyEvent: race.registered", () => {
  it("inserts a race event with entries", () => {
    const entry1 = defaultEntry({ entry_id: "e1", team_id: "t1", distance_m: 12000, points: 12 });
    const entry2 = defaultEntry({ entry_id: "e2", team_id: "t2", distance_m: 10000, points: 10 });
    const event = raceRegistered({
      race_event_id: "r1",
      import_batch_id: "batch-1",
      category: defaultCategory(),
      race_no: 1,
      race_date: "2025-06-01",
      entries: [entry1, entry2],
    });

    const state = applyEvent(emptySeasonState("s1"), event);

    expect(state.race_events.size).toBe(1);
    const race = state.race_events.get("r1");
    expect(race!.state).toBe("active");
    expect(race!.race_no).toBe(1);
    expect(race!.entries).toHaveLength(2);
    expect(race!.entries[0]!.entry_id).toBe("e1");
    expect(race!.entries[1]!.distance_m).toBe(10000);
    expect(race!.imported_at).toBe(event.recorded_at);
  });
});

describe("applyEvent: race.rolled_back", () => {
  it("marks an existing race as rolled_back", () => {
    const regEvent = raceRegistered({ race_event_id: "r1" });
    const rbEvent = raceRolledBack({ race_event_id: "r1", reason: "Bad data" });

    let state = applyEvent(emptySeasonState("s1"), regEvent);
    state = applyEvent(state, rbEvent);

    const race = state.race_events.get("r1");
    expect(race!.state).toBe("rolled_back");
    expect(race!.rollback!.reason).toBe("Bad data");
  });
});

describe("applyEvent: race.metadata_corrected", () => {
  it("updates only specified race metadata fields", () => {
    const regEvent = raceRegistered({
      race_event_id: "r1",
      race_date: "2025-06-01",
      race_no: 1,
      category: defaultCategory({ division: "men" }),
    });
    const corrEvent = raceMetadataCorrected({
      race_event_id: "r1",
      updated_fields: { race_date: "2025-06-15", race_no: 2 },
    });

    let state = applyEvent(emptySeasonState("s1"), regEvent);
    state = applyEvent(state, corrEvent);

    const race = state.race_events.get("r1");
    expect(race!.race_date).toBe("2025-06-15");
    expect(race!.race_no).toBe(2);
    expect(race!.category.division).toBe("men");
  });

  it("updates category when specified", () => {
    const regEvent = raceRegistered({
      race_event_id: "r1",
      category: defaultCategory({ duration: "hour", division: "men" }),
    });
    const corrEvent = raceMetadataCorrected({
      race_event_id: "r1",
      updated_fields: { category: { duration: "half_hour", division: "women" } },
    });

    let state = applyEvent(emptySeasonState("s1"), regEvent);
    state = applyEvent(state, corrEvent);

    const race = state.race_events.get("r1");
    expect(race!.category).toEqual({ duration: "half_hour", division: "women" });
  });
});

describe("applyEvent: entry.reassigned", () => {
  it("changes the team_id on the target entry", () => {
    const entry = defaultEntry({ entry_id: "e1", team_id: "team-a" });
    const regEvent = raceRegistered({ race_event_id: "r1", entries: [entry] });
    const reassignEvent = entryReassigned({
      entry_id: "e1",
      race_event_id: "r1",
      from_team_id: "team-a",
      to_team_id: "team-b",
    });

    let state = applyEvent(emptySeasonState("s1"), regEvent);
    state = applyEvent(state, reassignEvent);

    const race = state.race_events.get("r1");
    expect(race!.entries[0]!.team_id).toBe("team-b");
  });

  it("does not affect other entries in the same race", () => {
    const e1 = defaultEntry({ entry_id: "e1", team_id: "team-a" });
    const e2 = defaultEntry({ entry_id: "e2", team_id: "team-c" });
    const regEvent = raceRegistered({ race_event_id: "r1", entries: [e1, e2] });
    const reassignEvent = entryReassigned({
      entry_id: "e1",
      race_event_id: "r1",
      from_team_id: "team-a",
      to_team_id: "team-b",
    });

    let state = applyEvent(emptySeasonState("s1"), regEvent);
    state = applyEvent(state, reassignEvent);

    const race = state.race_events.get("r1");
    expect(race!.entries[1]!.team_id).toBe("team-c");
  });
});

describe("applyEvent: entry.corrected", () => {
  it("updates distance_m and points on target entry", () => {
    const entry = defaultEntry({ entry_id: "e1", distance_m: 10000, points: 10 });
    const regEvent = raceRegistered({ race_event_id: "r1", entries: [entry] });
    const corrEvent = entryCorrected({
      entry_id: "e1",
      race_event_id: "r1",
      updated_fields: { distance_m: 12000, points: 12 },
    });

    let state = applyEvent(emptySeasonState("s1"), regEvent);
    state = applyEvent(state, corrEvent);

    const race = state.race_events.get("r1");
    expect(race!.entries[0]!.distance_m).toBe(12000);
    expect(race!.entries[0]!.points).toBe(12);
  });

  it("updates startnr only", () => {
    const entry = defaultEntry({ entry_id: "e1", startnr: "1" });
    const regEvent = raceRegistered({ race_event_id: "r1", entries: [entry] });
    const corrEvent = entryCorrected({
      entry_id: "e1",
      race_event_id: "r1",
      updated_fields: { startnr: "42" },
    });

    let state = applyEvent(emptySeasonState("s1"), regEvent);
    state = applyEvent(state, corrEvent);

    const race = state.race_events.get("r1");
    expect(race!.entries[0]!.startnr).toBe("42");
    expect(race!.entries[0]!.distance_m).toBe(entry.distance_m);
  });
});

describe("applyEvent: ranking.eligibility_set", () => {
  it("marks a team as excluded (außer Wertung)", () => {
    const event = rankingEligibilitySet({
      category: defaultCategory({ duration: "hour", division: "men" }),
      team_id: "t1",
      eligible: false,
    });
    const state = applyEvent(emptySeasonState("s1"), event);

    const key = categoryKey({ duration: "hour", division: "men" });
    expect(state.exclusions.has(key)).toBe(true);
    expect(state.exclusions.get(key)!.has("t1")).toBe(true);
  });

  it("re-includes a previously excluded team", () => {
    const excludeEvent = rankingEligibilitySet({
      category: defaultCategory(),
      team_id: "t1",
      eligible: false,
    });
    const includeEvent = rankingEligibilitySet({
      category: defaultCategory(),
      team_id: "t1",
      eligible: true,
    });

    let state = applyEvent(emptySeasonState("s1"), excludeEvent);
    state = applyEvent(state, includeEvent);

    const key = categoryKey(defaultCategory());
    expect(state.exclusions.has(key)).toBe(false);
  });

  it("tracks multiple teams per category", () => {
    const e1 = rankingEligibilitySet({ category: defaultCategory(), team_id: "t1", eligible: false });
    const e2 = rankingEligibilitySet({ category: defaultCategory(), team_id: "t2", eligible: false });

    let state = applyEvent(emptySeasonState("s1"), e1);
    state = applyEvent(state, e2);

    const key = categoryKey(defaultCategory());
    expect(state.exclusions.get(key)!.size).toBe(2);
  });
});

// --- Unknown event type ---

describe("applyEvent: unknown event type", () => {
  it("throws UnknownEventTypeError for unrecognized event types", () => {
    const event = {
      event_id: "evt-unknown",
      seq: 0,
      recorded_at: new Date().toISOString(),
      type: "future.event",
      schema_version: 1,
      payload: {},
      metadata: { app_version: "0.0.0" },
    } as unknown as DomainEvent;

    expect(() => applyEvent(emptySeasonState("s1"), event)).toThrow(UnknownEventTypeError);
  });

  it("includes event type and schema version in error", () => {
    const event = {
      event_id: "evt-unknown",
      seq: 0,
      recorded_at: new Date().toISOString(),
      type: "future.event",
      schema_version: 99,
      payload: {},
      metadata: { app_version: "0.0.0" },
    } as unknown as DomainEvent;

    try {
      applyEvent(emptySeasonState("s1"), event);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownEventTypeError);
      expect((err as UnknownEventTypeError).eventType).toBe("future.event");
      expect((err as UnknownEventTypeError).schemaVersion).toBe(99);
    }
  });
});

// --- isEffectiveRace ---

describe("isEffectiveRace", () => {
  it("returns true for an active race in an active batch", () => {
    const events: DomainEvent[] = [
      importBatchRecorded({ import_batch_id: "b1" }),
      raceRegistered({ race_event_id: "r1", import_batch_id: "b1" }),
    ];
    const state = projectState("s1", events);
    expect(isEffectiveRace(state, "r1")).toBe(true);
  });

  it("returns false for a race-level rollback", () => {
    const events: DomainEvent[] = [
      importBatchRecorded({ import_batch_id: "b1" }),
      raceRegistered({ race_event_id: "r1", import_batch_id: "b1" }),
      raceRolledBack({ race_event_id: "r1" }),
    ];
    const state = projectState("s1", events);
    expect(isEffectiveRace(state, "r1")).toBe(false);
  });

  it("returns false for a batch-level rollback", () => {
    const events: DomainEvent[] = [
      importBatchRecorded({ import_batch_id: "b1" }),
      raceRegistered({ race_event_id: "r1", import_batch_id: "b1" }),
      importBatchRolledBack({ import_batch_id: "b1" }),
    ];
    const state = projectState("s1", events);
    expect(isEffectiveRace(state, "r1")).toBe(false);
  });

  it("returns false for a nonexistent race", () => {
    const state = emptySeasonState("s1");
    expect(isEffectiveRace(state, "nonexistent")).toBe(false);
  });
});

// --- Multi-event integration ---

describe("full import workflow integration", () => {
  it("produces correct state from a typical import sequence", () => {
    const batchId = "batch-import-1";
    const personA = { person_id: "pa", given_name: "Max", family_name: "Müller", yob: 1990, gender: "M" as const, club: "LG Test", club_normalized: "lg test" };
    const personB = { person_id: "pb", given_name: "Anna", family_name: "Schmidt", yob: 1985, gender: "F" as const, club: null, club_normalized: "" };
    const teamA = { team_id: "ta", member_person_ids: ["pa"], team_kind: "solo" as const };
    const teamB = { team_id: "tb", member_person_ids: ["pb"], team_kind: "solo" as const };

    const entry1 = defaultEntry({ entry_id: "e1", team_id: "ta", startnr: "1", distance_m: 12000, points: 12 });
    const entry2 = defaultEntry({ entry_id: "e2", team_id: "tb", startnr: "2", distance_m: 10000, points: 10 });

    const events: DomainEvent[] = [
      importBatchRecorded({ import_batch_id: batchId }),
      personRegistered(personA),
      personRegistered(personB),
      teamRegistered(teamA),
      teamRegistered(teamB),
      raceRegistered({
        race_event_id: "r1",
        import_batch_id: batchId,
        category: { duration: "hour", division: "men" },
        race_no: 1,
        race_date: "2025-06-01",
        entries: [entry1, entry2],
      }),
    ];

    const state = projectState("s1", events);

    expect(state.persons.size).toBe(2);
    expect(state.teams.size).toBe(2);
    expect(state.import_batches.size).toBe(1);
    expect(state.race_events.size).toBe(1);
    expect(state.exclusions.size).toBe(0);

    const race = state.race_events.get("r1")!;
    expect(race.state).toBe("active");
    expect(race.entries).toHaveLength(2);
    expect(race.category).toEqual({ duration: "hour", division: "men" });
    expect(isEffectiveRace(state, "r1")).toBe(true);

    expect(state.persons.get("pa")!.given_name).toBe("Max");
    expect(state.persons.get("pb")!.club).toBeNull();
    expect(state.teams.get("ta")!.team_kind).toBe("solo");
    expect(state.teams.get("tb")!.member_person_ids).toEqual(["pb"]);
  });
});

// --- Correction precedence ---

describe("correction precedence", () => {
  it("applies multiple corrections to the same entry in sequence", () => {
    const entry = defaultEntry({ entry_id: "e1", team_id: "ta", distance_m: 10000, points: 10, startnr: "1" });
    const events: DomainEvent[] = [
      importBatchRecorded({ import_batch_id: "b1" }),
      raceRegistered({ race_event_id: "r1", import_batch_id: "b1", entries: [entry] }),
      entryCorrected({ entry_id: "e1", race_event_id: "r1", updated_fields: { distance_m: 11000 } }),
      entryCorrected({ entry_id: "e1", race_event_id: "r1", updated_fields: { points: 15 } }),
      entryReassigned({ entry_id: "e1", race_event_id: "r1", from_team_id: "ta", to_team_id: "tb" }),
      entryCorrected({ entry_id: "e1", race_event_id: "r1", updated_fields: { startnr: "99" } }),
    ];

    const state = projectState("s1", events);
    const finalEntry = state.race_events.get("r1")!.entries[0]!;

    expect(finalEntry.distance_m).toBe(11000);
    expect(finalEntry.points).toBe(15);
    expect(finalEntry.team_id).toBe("tb");
    expect(finalEntry.startnr).toBe("99");
  });

  it("applies multiple corrections to a person in sequence", () => {
    const events: DomainEvent[] = [
      personRegistered({ person_id: "p1", given_name: "Max", family_name: "Muller", yob: 1990, gender: "M", club: "LG A", club_normalized: "lg a" }),
      personCorrected({ person_id: "p1", updated_fields: { family_name: "Müller" } }),
      personCorrected({ person_id: "p1", updated_fields: { club: "SC B", club_normalized: "sc b" } }),
    ];

    const state = projectState("s1", events);
    const person = state.persons.get("p1")!;

    expect(person.family_name).toBe("Müller");
    expect(person.club).toBe("SC B");
    expect(person.club_normalized).toBe("sc b");
    expect(person.given_name).toBe("Max");
  });
});

// --- Immutability ---

describe("immutability", () => {
  it("does not mutate the previous state object", () => {
    const before = emptySeasonState("s1");
    const event = personRegistered({ person_id: "p1" });
    const after = applyEvent(before, event);

    expect(before.persons.size).toBe(0);
    expect(after.persons.size).toBe(1);
    expect(before.persons).not.toBe(after.persons);
  });
});
