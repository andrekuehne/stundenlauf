import { describe, expect, it } from "vitest";
import { defaultMatchingConfig } from "@/matching/config.ts";
import { processCouplesSection, processSinglesSection } from "@/matching/workflow.ts";
import type { PersonIdentity, SeasonState, Team } from "@/domain/types.ts";
import type { ParsedSectionCouples, ParsedSectionSingles } from "@/ingestion/types.ts";

function emptyState(overrides?: Partial<SeasonState>): SeasonState {
  return {
    season_id: "test-season",
    persons: new Map(),
    teams: new Map(),
    import_batches: new Map(),
    race_events: new Map(),
    exclusions: new Map(),
    ...overrides,
  };
}

function makePerson(
  overrides: Partial<PersonIdentity> & { person_id: string },
): PersonIdentity {
  return {
    given_name: "",
    family_name: "",
    display_name: "",
    name_normalized: "",
    yob: 0,
    gender: "M",
    club: null,
    club_normalized: "",
    ...overrides,
  };
}

describe("processSinglesSection", () => {
  it("creates new identities for all rows in empty state", async () => {
    const state = emptyState();
    const section: ParsedSectionSingles = {
      context: { race_no: 1, duration: "hour", division: "men", event_date: null },
      rows: [
        { startnr: "1", name: "Hans Mueller", yob: 1990, club: null, distance_km: 10, points: 1 },
        { startnr: "2", name: "Peter Schmidt", yob: 1985, club: "TSV", distance_km: 12, points: 2 },
      ],
    };
    const config = defaultMatchingConfig();
    const result = await processSinglesSection(state, section, config);
    expect(result.resolved_entries).toHaveLength(2);
    expect(result.report.new_identities).toBe(2);
    expect(result.new_person_payloads).toHaveLength(2);
    expect(result.new_team_payloads).toHaveLength(2);
    expect(result.review_items).toHaveLength(0);
  });

  it("auto-links to existing persons", async () => {
    const anna = makePerson({
      person_id: "p-anna",
      given_name: "anna",
      family_name: "schmidt",
      yob: 1988,
      gender: "F",
      club: "TSV",
      club_normalized: "tsv",
    });
    const annaTeam: Team = {
      team_id: "t-anna",
      member_person_ids: ["p-anna"],
      team_kind: "solo",
    };
    const state = emptyState({
      persons: new Map([["p-anna", anna]]),
      teams: new Map([["t-anna", annaTeam]]),
    });
    const section: ParsedSectionSingles = {
      context: { race_no: 1, duration: "hour", division: "women", event_date: null },
      rows: [
        { startnr: "1", name: "Anna Schmidt", yob: 1988, club: "TSV", distance_km: 10, points: 1 },
      ],
    };
    const config = defaultMatchingConfig();
    const result = await processSinglesSection(state, section, config);
    expect(result.resolved_entries[0]!.route).toBe("auto");
    expect(result.resolved_entries[0]!.team_id).toBe("t-anna");
    expect(result.report.auto_links).toBe(1);
  });

  it("throws on duplicate rows", async () => {
    const state = emptyState();
    const section: ParsedSectionSingles = {
      context: { race_no: 1, duration: "hour", division: "men", event_date: null },
      rows: [
        { startnr: "1", name: "Hans Mueller", yob: 1990, club: null, distance_km: 10, points: 1 },
        { startnr: "1", name: "Hans Mueller", yob: 1990, club: null, distance_km: 10, points: 1 },
      ],
    };
    const config = defaultMatchingConfig();
    await expect(processSinglesSection(state, section, config)).rejects.toThrow(
      /Doppelte Teilnehmerzeile/,
    );
  });

  it("strict mode: auto-links exact match", async () => {
    const anna = makePerson({
      person_id: "p-anna",
      given_name: "anna",
      family_name: "schmidt",
      yob: 1988,
      gender: "F",
      club: "TSV",
      club_normalized: "tsv",
    });
    const annaTeam: Team = {
      team_id: "t-anna",
      member_person_ids: ["p-anna"],
      team_kind: "solo",
    };
    const state = emptyState({
      persons: new Map([["p-anna", anna]]),
      teams: new Map([["t-anna", annaTeam]]),
    });
    const section: ParsedSectionSingles = {
      context: { race_no: 1, duration: "hour", division: "women", event_date: null },
      rows: [
        { startnr: "1", name: "Anna Schmidt", yob: 1988, club: "TSV", distance_km: 10, points: 1 },
      ],
    };
    const config = defaultMatchingConfig({ strict_normalized_auto_only: true });
    const result = await processSinglesSection(state, section, config);
    expect(result.resolved_entries[0]!.route).toBe("auto");
    expect(result.resolved_entries[0]!.features.strict_identity_auto).toBe(1.0);
  });

  it("strict mode: typo forces review", async () => {
    const anna = makePerson({
      person_id: "p-anna",
      given_name: "anna",
      family_name: "schmidt",
      yob: 1988,
      gender: "F",
      club: "TSV",
      club_normalized: "tsv",
    });
    const annaTeam: Team = {
      team_id: "t-anna",
      member_person_ids: ["p-anna"],
      team_kind: "solo",
    };
    const state = emptyState({
      persons: new Map([["p-anna", anna]]),
      teams: new Map([["t-anna", annaTeam]]),
    });
    const section: ParsedSectionSingles = {
      context: { race_no: 1, duration: "hour", division: "women", event_date: null },
      rows: [
        { startnr: "1", name: "Anna Schmidta", yob: 1988, club: "TSV", distance_km: 10, points: 1 },
      ],
    };
    const config = defaultMatchingConfig({ strict_normalized_auto_only: true, auto_min: 0.88 });
    const result = await processSinglesSection(state, section, config);
    expect(result.resolved_entries[0]!.route).toBe("review");
  });

  it("manuell mode: nothing auto-links", async () => {
    const anna = makePerson({
      person_id: "p-anna",
      given_name: "anna",
      family_name: "schmidt",
      yob: 1988,
      gender: "F",
      club: "TSV",
      club_normalized: "tsv",
    });
    const annaTeam: Team = {
      team_id: "t-anna",
      member_person_ids: ["p-anna"],
      team_kind: "solo",
    };
    const state = emptyState({
      persons: new Map([["p-anna", anna]]),
      teams: new Map([["t-anna", annaTeam]]),
    });
    const section: ParsedSectionSingles = {
      context: { race_no: 1, duration: "hour", division: "women", event_date: null },
      rows: [
        { startnr: "1", name: "Anna Schmidt", yob: 1988, club: "TSV", distance_km: 10, points: 1 },
      ],
    };
    // Manuell mode: auto_min = 1.01 (nothing auto-links by score)
    const config = defaultMatchingConfig({ auto_min: 1.01 });
    const result = await processSinglesSection(state, section, config);
    expect(result.resolved_entries[0]!.route).toBe("review");
  });
});

describe("processCouplesSection", () => {
  it("creates new identities for couples in empty state", async () => {
    const state = emptyState();
    const section: ParsedSectionCouples = {
      context: { race_no: 1, duration: "hour", division: "couples_mixed", event_date: null },
      rows: [
        {
          startnr: "1",
          name_a: "Max Mueller",
          yob_a: 1988,
          club_a: null,
          name_b: "Eva Schmidt",
          yob_b: 1990,
          club_b: null,
          distance_km: 20,
          points: 2,
        },
      ],
    };
    const config = defaultMatchingConfig();
    const result = await processCouplesSection(state, section, config);
    expect(result.resolved_entries).toHaveLength(1);
    expect(result.report.new_identities).toBe(1);
    expect(result.new_person_payloads).toHaveLength(2);
    expect(result.new_team_payloads).toHaveLength(1);
    expect(result.new_team_payloads[0]!.team_kind).toBe("couple");
  });

  it("auto-links to existing couple", async () => {
    const ma = makePerson({
      person_id: "pa",
      given_name: "max",
      family_name: "mustermann",
      yob: 1988,
      gender: "M",
    });
    const mb = makePerson({
      person_id: "pb",
      given_name: "eva",
      family_name: "beispiel",
      yob: 1990,
      gender: "F",
    });
    const coupleTeam: Team = {
      team_id: "t-couple",
      member_person_ids: ["pa", "pb"],
      team_kind: "couple",
    };
    const state = emptyState({
      persons: new Map([["pa", ma], ["pb", mb]]),
      teams: new Map([["t-couple", coupleTeam]]),
    });
    const section: ParsedSectionCouples = {
      context: { race_no: 2, duration: "hour", division: "couples_mixed", event_date: null },
      rows: [
        {
          startnr: "1",
          name_a: "Max Mustermann",
          yob_a: 1988,
          club_a: null,
          name_b: "Eva Beispiel",
          yob_b: 1990,
          club_b: null,
          distance_km: 20,
          points: 2,
        },
      ],
    };
    const config = defaultMatchingConfig();
    const result = await processCouplesSection(state, section, config);
    expect(result.resolved_entries[0]!.route).toBe("auto");
    expect(result.resolved_entries[0]!.team_id).toBe("t-couple");
    expect(result.report.auto_links).toBe(1);
  });
});
