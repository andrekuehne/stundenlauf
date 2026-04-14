import { describe, it, expect, beforeEach } from "vitest";
import { validateEvent, requiredTeamKind } from "@/domain/validation.ts";
import { emptySeasonState, applyEvent } from "@/domain/projection.ts";
import type { DomainEvent } from "@/domain/events.ts";
import type { SeasonState } from "@/domain/types.ts";
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

/** Build state from a sequence of events, validating+applying each one. */
function buildState(events: DomainEvent[]): SeasonState {
  let state = emptySeasonState("s1");
  for (const event of events) {
    state = applyEvent(state, event);
  }
  return state;
}

// --- requiredTeamKind ---

describe("requiredTeamKind", () => {
  it("maps solo divisions to solo", () => {
    expect(requiredTeamKind("men")).toBe("solo");
    expect(requiredTeamKind("women")).toBe("solo");
  });

  it("maps couple divisions to couple", () => {
    expect(requiredTeamKind("couples_men")).toBe("couple");
    expect(requiredTeamKind("couples_women")).toBe("couple");
    expect(requiredTeamKind("couples_mixed")).toBe("couple");
  });
});

// --- Envelope-level validation ---

describe("schema_version validation", () => {
  it("rejects unsupported schema_version", () => {
    const event = personRegistered({ person_id: "p1" }, { schema_version: 99 });
    const result = validateEvent(emptySeasonState("s1"), event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("schema_version");
    }
  });
});

// --- import_batch.recorded ---

describe("validate import_batch.recorded", () => {
  it("accepts a valid new batch", () => {
    const event = importBatchRecorded({ import_batch_id: "b1" });
    const result = validateEvent(emptySeasonState("s1"), event);
    expect(result.valid).toBe(true);
  });

  it("rejects duplicate import_batch_id", () => {
    const state = buildState([importBatchRecorded({ import_batch_id: "b1" })]);
    const dup = importBatchRecorded({ import_batch_id: "b1" });
    const result = validateEvent(state, dup);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("Duplicate import_batch_id");
    }
  });
});

// --- import_batch.rolled_back ---

describe("validate import_batch.rolled_back", () => {
  it("accepts rollback of an active batch", () => {
    const state = buildState([importBatchRecorded({ import_batch_id: "b1" })]);
    const event = importBatchRolledBack({ import_batch_id: "b1" });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(true);
  });

  it("rejects rollback of a nonexistent batch", () => {
    const event = importBatchRolledBack({ import_batch_id: "nonexistent" });
    const result = validateEvent(emptySeasonState("s1"), event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("does not exist");
    }
  });

  it("rejects rollback of an already-rolled-back batch", () => {
    const state = buildState([
      importBatchRecorded({ import_batch_id: "b1" }),
      importBatchRolledBack({ import_batch_id: "b1" }),
    ]);
    const event = importBatchRolledBack({ import_batch_id: "b1" });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("already rolled back");
    }
  });
});

// --- person.registered ---

describe("validate person.registered", () => {
  it("accepts a new person", () => {
    const event = personRegistered({ person_id: "p1" });
    const result = validateEvent(emptySeasonState("s1"), event);
    expect(result.valid).toBe(true);
  });

  it("rejects duplicate person_id", () => {
    const state = buildState([personRegistered({ person_id: "p1" })]);
    const dup = personRegistered({ person_id: "p1" });
    const result = validateEvent(state, dup);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("Duplicate person_id");
    }
  });

  it("rejects inconsistent display_name vs split name fields", () => {
    const event = personRegistered({
      person_id: "p1",
      given_name: "Anna",
      family_name: "Schmidt",
      display_name: "Max Müller",
      name_normalized: "anna|schmidt",
    });
    const result = validateEvent(emptySeasonState("s1"), event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("display_name"))).toBe(true);
    }
  });

  it("rejects inconsistent club_normalized", () => {
    const event = personRegistered({
      person_id: "p1",
      club: "TV Freiburg",
      club_normalized: "broken",
    });
    const result = validateEvent(emptySeasonState("s1"), event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("club_normalized"))).toBe(true);
    }
  });
});

// --- person.corrected ---

describe("validate person.corrected", () => {
  it("accepts correction of an existing person", () => {
    const state = buildState([personRegistered({ person_id: "p1" })]);
    const event = personCorrected({ person_id: "p1", updated_fields: { given_name: "Max" } });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(true);
  });

  it("rejects correction of a nonexistent person", () => {
    const event = personCorrected({ person_id: "nonexistent" });
    const result = validateEvent(emptySeasonState("s1"), event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("does not exist");
    }
  });

  it("rejects club=null with non-empty club_normalized", () => {
    const state = buildState([personRegistered({ person_id: "p1" })]);
    const event = personCorrected({
      person_id: "p1",
      updated_fields: { club: null, club_normalized: "oops" },
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("club_normalized");
    }
  });

  it("rejects correction causing name/display mismatch", () => {
    const state = buildState([personRegistered({ person_id: "p1" })]);
    const event = personCorrected({
      person_id: "p1",
      updated_fields: { display_name: "Inconsistent Name", name_normalized: "max|muller" },
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("display_name"))).toBe(true);
    }
  });
});

// --- team.registered ---

describe("validate team.registered", () => {
  it("accepts a valid solo team", () => {
    const state = buildState([personRegistered({ person_id: "p1" })]);
    const event = teamRegistered({
      team_id: "t1",
      member_person_ids: ["p1"],
      team_kind: "solo",
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(true);
  });

  it("accepts a valid couple team", () => {
    const state = buildState([
      personRegistered({ person_id: "p1" }),
      personRegistered({ person_id: "p2" }),
    ]);
    const event = teamRegistered({
      team_id: "t1",
      member_person_ids: ["p1", "p2"],
      team_kind: "couple",
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(true);
  });

  it("rejects duplicate team_id", () => {
    const state = buildState([
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "t1", member_person_ids: ["p1"], team_kind: "solo" }),
    ]);
    const dup = teamRegistered({ team_id: "t1", member_person_ids: ["p1"], team_kind: "solo" });
    const result = validateEvent(state, dup);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("Duplicate team_id"))).toBe(true);
    }
  });

  it("rejects team referencing unregistered persons", () => {
    const event = teamRegistered({
      team_id: "t1",
      member_person_ids: ["unknown-person"],
      team_kind: "solo",
    });
    const result = validateEvent(emptySeasonState("s1"), event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("not registered"))).toBe(true);
    }
  });

  it("rejects solo team with 2 members", () => {
    const state = buildState([
      personRegistered({ person_id: "p1" }),
      personRegistered({ person_id: "p2" }),
    ]);
    const event = teamRegistered({
      team_id: "t1",
      member_person_ids: ["p1", "p2"],
      team_kind: "solo",
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("requires 1 member"))).toBe(true);
    }
  });

  it("rejects couple team with 1 member", () => {
    const state = buildState([personRegistered({ person_id: "p1" })]);
    const event = teamRegistered({
      team_id: "t1",
      member_person_ids: ["p1"],
      team_kind: "couple",
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("requires 2 member"))).toBe(true);
    }
  });
});

// --- race.registered ---

describe("validate race.registered", () => {
  function stateWithTeam(): SeasonState {
    return buildState([
      importBatchRecorded({ import_batch_id: "b1" }),
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "t1", member_person_ids: ["p1"], team_kind: "solo" }),
    ]);
  }

  it("accepts a valid race", () => {
    const state = stateWithTeam();
    const event = raceRegistered({
      race_event_id: "r1",
      import_batch_id: "b1",
      category: defaultCategory(),
      race_no: 1,
      entries: [defaultEntry({ entry_id: "e1", team_id: "t1" })],
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(true);
  });

  it("rejects duplicate race_event_id", () => {
    let state = stateWithTeam();
    const first = raceRegistered({ race_event_id: "r1", import_batch_id: "b1", entries: [] });
    state = applyEvent(state, first);
    const dup = raceRegistered({ race_event_id: "r1", import_batch_id: "b1", entries: [] });
    const result = validateEvent(state, dup);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("Duplicate race_event_id"))).toBe(true);
    }
  });

  it("rejects duplicate category+race_no on effective races", () => {
    let state = stateWithTeam();
    const first = raceRegistered({
      race_event_id: "r1",
      import_batch_id: "b1",
      category: defaultCategory({ duration: "hour", division: "men" }),
      race_no: 1,
      entries: [],
    });
    state = applyEvent(state, first);
    const second = raceRegistered({
      race_event_id: "r2",
      import_batch_id: "b1",
      category: defaultCategory({ duration: "hour", division: "men" }),
      race_no: 1,
      entries: [],
    });
    const result = validateEvent(state, second);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("effective race already exists"))).toBe(true);
    }
  });

  it("allows same category+race_no if previous race is rolled back", () => {
    let state = stateWithTeam();
    const first = raceRegistered({
      race_event_id: "r1",
      import_batch_id: "b1",
      category: defaultCategory(),
      race_no: 1,
      entries: [],
    });
    state = applyEvent(state, first);
    state = applyEvent(state, raceRolledBack({ race_event_id: "r1" }));

    const second = raceRegistered({
      race_event_id: "r2",
      import_batch_id: "b1",
      category: defaultCategory(),
      race_no: 1,
      entries: [],
    });
    const result = validateEvent(state, second);
    expect(result.valid).toBe(true);
  });

  it("rejects entries referencing unregistered teams", () => {
    const state = stateWithTeam();
    const event = raceRegistered({
      race_event_id: "r1",
      import_batch_id: "b1",
      entries: [defaultEntry({ entry_id: "e1", team_id: "nonexistent-team" })],
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("unregistered team"))).toBe(true);
    }
  });

  it("rejects duplicate entry_id within a race", () => {
    const state = stateWithTeam();
    const event = raceRegistered({
      race_event_id: "r1",
      import_batch_id: "b1",
      entries: [
        defaultEntry({ entry_id: "e1", team_id: "t1" }),
        defaultEntry({ entry_id: "e1", team_id: "t1" }),
      ],
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("Duplicate entry_id"))).toBe(true);
    }
  });
});

// --- race.rolled_back ---

describe("validate race.rolled_back", () => {
  it("accepts rollback of an effective race", () => {
    const state = buildState([
      importBatchRecorded({ import_batch_id: "b1" }),
      raceRegistered({ race_event_id: "r1", import_batch_id: "b1", entries: [] }),
    ]);
    const event = raceRolledBack({ race_event_id: "r1" });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(true);
  });

  it("rejects rollback of a nonexistent race", () => {
    const event = raceRolledBack({ race_event_id: "nonexistent" });
    const result = validateEvent(emptySeasonState("s1"), event);
    expect(result.valid).toBe(false);
  });

  it("rejects rollback of an already-rolled-back race", () => {
    const state = buildState([
      importBatchRecorded({ import_batch_id: "b1" }),
      raceRegistered({ race_event_id: "r1", import_batch_id: "b1", entries: [] }),
      raceRolledBack({ race_event_id: "r1" }),
    ]);
    const event = raceRolledBack({ race_event_id: "r1" });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(false);
  });
});

// --- race.metadata_corrected ---

describe("validate race.metadata_corrected", () => {
  function stateWithRace(): SeasonState {
    return buildState([
      importBatchRecorded({ import_batch_id: "b1" }),
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "t1", member_person_ids: ["p1"], team_kind: "solo" }),
      raceRegistered({
        race_event_id: "r1",
        import_batch_id: "b1",
        category: defaultCategory({ duration: "hour", division: "men" }),
        race_no: 1,
        entries: [defaultEntry({ entry_id: "e1", team_id: "t1" })],
      }),
    ]);
  }

  it("accepts valid metadata correction", () => {
    const state = stateWithRace();
    const event = raceMetadataCorrected({
      race_event_id: "r1",
      updated_fields: { race_date: "2025-07-01" },
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(true);
  });

  it("rejects correction that causes category+race_no collision", () => {
    let state = stateWithRace();
    const second = raceRegistered({
      race_event_id: "r2",
      import_batch_id: "b1",
      category: defaultCategory({ duration: "half_hour", division: "men" }),
      race_no: 3,
      entries: [],
    });
    state = applyEvent(state, second);

    const event = raceMetadataCorrected({
      race_event_id: "r2",
      updated_fields: { category: defaultCategory({ duration: "hour", division: "men" }), race_no: 1 },
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("collide"))).toBe(true);
    }
  });

  it("rejects category change that violates team shape", () => {
    const state = stateWithRace();
    const event = raceMetadataCorrected({
      race_event_id: "r1",
      updated_fields: { category: defaultCategory({ division: "couples_mixed" }) },
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("team kind"))).toBe(true);
    }
  });
});

// --- entry.reassigned ---

describe("validate entry.reassigned", () => {
  function stateWithTwoTeams(): SeasonState {
    return buildState([
      importBatchRecorded({ import_batch_id: "b1" }),
      personRegistered({ person_id: "p1" }),
      personRegistered({ person_id: "p2" }),
      teamRegistered({ team_id: "t1", member_person_ids: ["p1"], team_kind: "solo" }),
      teamRegistered({ team_id: "t2", member_person_ids: ["p2"], team_kind: "solo" }),
      raceRegistered({
        race_event_id: "r1",
        import_batch_id: "b1",
        category: defaultCategory({ division: "men" }),
        race_no: 1,
        entries: [defaultEntry({ entry_id: "e1", team_id: "t1" })],
      }),
    ]);
  }

  it("accepts a valid reassignment", () => {
    const state = stateWithTwoTeams();
    const event = entryReassigned({
      entry_id: "e1",
      race_event_id: "r1",
      from_team_id: "t1",
      to_team_id: "t2",
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(true);
  });

  it("rejects reassignment with wrong from_team_id", () => {
    const state = stateWithTwoTeams();
    const event = entryReassigned({
      entry_id: "e1",
      race_event_id: "r1",
      from_team_id: "t2",
      to_team_id: "t1",
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("currently assigned"))).toBe(true);
    }
  });

  it("rejects reassignment to unregistered team", () => {
    const state = stateWithTwoTeams();
    const event = entryReassigned({
      entry_id: "e1",
      race_event_id: "r1",
      from_team_id: "t1",
      to_team_id: "nonexistent",
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("not registered"))).toBe(true);
    }
  });

  it("rejects reassignment that violates team shape", () => {
    const state = buildState([
      importBatchRecorded({ import_batch_id: "b1" }),
      personRegistered({ person_id: "p1" }),
      personRegistered({ person_id: "p2" }),
      personRegistered({ person_id: "p3" }),
      teamRegistered({ team_id: "t1", member_person_ids: ["p1"], team_kind: "solo" }),
      teamRegistered({ team_id: "tc", member_person_ids: ["p2", "p3"], team_kind: "couple" }),
      raceRegistered({
        race_event_id: "r1",
        import_batch_id: "b1",
        category: defaultCategory({ division: "men" }),
        race_no: 1,
        entries: [defaultEntry({ entry_id: "e1", team_id: "t1" })],
      }),
    ]);
    const event = entryReassigned({
      entry_id: "e1",
      race_event_id: "r1",
      from_team_id: "t1",
      to_team_id: "tc",
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("requires"))).toBe(true);
    }
  });

  it("rejects reassignment that creates duplicate team participation", () => {
    const state = buildState([
      importBatchRecorded({ import_batch_id: "b1" }),
      personRegistered({ person_id: "p1" }),
      personRegistered({ person_id: "p2" }),
      teamRegistered({ team_id: "t1", member_person_ids: ["p1"], team_kind: "solo" }),
      teamRegistered({ team_id: "t2", member_person_ids: ["p2"], team_kind: "solo" }),
      raceRegistered({
        race_event_id: "r1",
        import_batch_id: "b1",
        category: defaultCategory({ division: "men" }),
        race_no: 1,
        entries: [
          defaultEntry({ entry_id: "e1", team_id: "t1" }),
          defaultEntry({ entry_id: "e2", team_id: "t2" }),
        ],
      }),
    ]);
    const event = entryReassigned({
      entry_id: "e1",
      race_event_id: "r1",
      from_team_id: "t1",
      to_team_id: "t2",
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("already has an entry"))).toBe(true);
    }
  });
});

// --- entry.corrected ---

describe("validate entry.corrected", () => {
  it("accepts correction of an existing entry in an effective race", () => {
    const state = buildState([
      importBatchRecorded({ import_batch_id: "b1" }),
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "t1", member_person_ids: ["p1"], team_kind: "solo" }),
      raceRegistered({
        race_event_id: "r1",
        import_batch_id: "b1",
        entries: [defaultEntry({ entry_id: "e1", team_id: "t1" })],
      }),
    ]);
    const event = entryCorrected({
      entry_id: "e1",
      race_event_id: "r1",
      updated_fields: { distance_m: 15000 },
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(true);
  });

  it("rejects correction of a nonexistent entry", () => {
    const state = buildState([
      importBatchRecorded({ import_batch_id: "b1" }),
      raceRegistered({ race_event_id: "r1", import_batch_id: "b1", entries: [] }),
    ]);
    const event = entryCorrected({
      entry_id: "nonexistent",
      race_event_id: "r1",
      updated_fields: { distance_m: 15000 },
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(false);
  });

  it("rejects correction on a rolled-back race", () => {
    const state = buildState([
      importBatchRecorded({ import_batch_id: "b1" }),
      raceRegistered({
        race_event_id: "r1",
        import_batch_id: "b1",
        entries: [defaultEntry({ entry_id: "e1", team_id: "t1" })],
      }),
      raceRolledBack({ race_event_id: "r1" }),
    ]);
    const event = entryCorrected({
      entry_id: "e1",
      race_event_id: "r1",
      updated_fields: { distance_m: 15000 },
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(false);
  });
});

// --- ranking.eligibility_set ---

describe("validate ranking.eligibility_set", () => {
  it("accepts setting eligibility for a team with entries in the category", () => {
    const state = buildState([
      importBatchRecorded({ import_batch_id: "b1" }),
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "t1", member_person_ids: ["p1"], team_kind: "solo" }),
      raceRegistered({
        race_event_id: "r1",
        import_batch_id: "b1",
        category: defaultCategory({ duration: "hour", division: "men" }),
        race_no: 1,
        entries: [defaultEntry({ entry_id: "e1", team_id: "t1" })],
      }),
    ]);
    const event = rankingEligibilitySet({
      category: defaultCategory({ duration: "hour", division: "men" }),
      team_id: "t1",
      eligible: false,
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(true);
  });

  it("rejects eligibility set for a team with no entries in the category", () => {
    const state = buildState([
      personRegistered({ person_id: "p1" }),
      teamRegistered({ team_id: "t1", member_person_ids: ["p1"], team_kind: "solo" }),
    ]);
    const event = rankingEligibilitySet({
      category: defaultCategory({ duration: "hour", division: "men" }),
      team_id: "t1",
      eligible: false,
    });
    const result = validateEvent(state, event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("no entries");
    }
  });
});

// --- Cross-field consistency ---

describe("metadata.import_batch_id consistency", () => {
  it("rejects when metadata and payload batch IDs disagree", () => {
    const event = importBatchRecorded(
      { import_batch_id: "b1" },
      { metadata: { app_version: "0.0.0", import_batch_id: "b-different" } },
    );
    const result = validateEvent(emptySeasonState("s1"), event);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("does not match");
    }
  });
});
