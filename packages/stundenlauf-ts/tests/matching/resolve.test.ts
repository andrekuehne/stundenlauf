import { describe, expect, it } from "vitest";
import { defaultMatchingConfig } from "@/matching/config.ts";
import { emptyRunStats, resolvePerson, resolveTeamRow } from "@/matching/resolve.ts";
import type { PersonIdentity, Team } from "@/domain/types.ts";
import type { ImportRowCouples } from "@/ingestion/types.ts";

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

const persons = new Map([["p-anna", anna]]);
const teams = new Map([["t-anna", annaTeam]]);

describe("resolvePerson", () => {
  it("creates new identity when no candidates exist", async () => {
    const config = defaultMatchingConfig();
    const stats = emptyRunStats();
    const result = await resolvePerson({
      rawName: "Hans Mueller",
      yob: 1995,
      clubRaw: null,
      gender: "M",
      candidatePeople: [],
      replayIndex: new Map(),
      usedCandidateUids: new Map(),
      config,
      entryId: "e1",
      stats,
      persons: new Map(),
      teams: new Map(),
    });
    expect(result.route).toBe("new_identity");
    expect(result.new_persons).toHaveLength(1);
    expect(result.new_teams).toHaveLength(1);
    expect(result.new_teams[0]!.team_kind).toBe("solo");
    expect(stats.new_identities).toBe(1);
  });

  it("auto-links to existing person with high score", async () => {
    const config = defaultMatchingConfig();
    const stats = emptyRunStats();
    const result = await resolvePerson({
      rawName: "Anna Schmidt",
      yob: 1988,
      clubRaw: "TSV",
      gender: "F",
      candidatePeople: [anna],
      replayIndex: new Map(),
      usedCandidateUids: new Map(),
      config,
      entryId: "e1",
      stats,
      persons,
      teams,
    });
    expect(result.route).toBe("auto");
    expect(result.team_id).toBe("t-anna");
    expect(result.new_persons).toHaveLength(0);
    expect(stats.auto_links).toBe(1);
  });

  it("routes to review for uncertain match", async () => {
    // Use manual mode (auto_min=1.01) so fuzzy matches go to review instead of auto
    const config = defaultMatchingConfig({ auto_min: 1.01 });
    const stats = emptyRunStats();
    const result = await resolvePerson({
      rawName: "Anna Schmidt",
      yob: 1988,
      clubRaw: "TSV",
      gender: "F",
      candidatePeople: [anna],
      replayIndex: new Map(),
      usedCandidateUids: new Map(),
      config,
      entryId: "e1",
      stats,
      persons,
      teams,
    });
    expect(result.route).toBe("review");
    expect(stats.review_queue).toBe(1);
  });

  it("uses replay when fingerprint matches", async () => {
    const config = defaultMatchingConfig();
    const stats = emptyRunStats();
    // Pre-compute fingerprint for Anna Schmidt, yob=1988, gender=F
    const { identityFingerprint } = await import("@/matching/fingerprint.ts");
    const { parsePersonName } = await import("@/matching/normalize.ts");
    const parsed = parsePersonName("Anna Schmidt");
    const fp = await identityFingerprint(parsed, 1988, "F");

    const replayIndex = new Map([[fp, "t-anna"]]);
    const result = await resolvePerson({
      rawName: "Anna Schmidt",
      yob: 1988,
      clubRaw: "TSV",
      gender: "F",
      candidatePeople: [anna],
      replayIndex,
      usedCandidateUids: new Map(),
      config,
      entryId: "e1",
      stats,
      persons,
      teams,
    });
    expect(result.route).toBe("auto");
    expect(result.confidence).toBe(1.0);
    expect(result.features.replay).toBe(1.0);
    expect(stats.replay_overrides).toBe(1);
  });

  it("detects same-race candidate reuse conflict", async () => {
    const config = defaultMatchingConfig();
    const stats = emptyRunStats();
    const usedUids = new Map([["p-anna", "e-previous"]]);
    const result = await resolvePerson({
      rawName: "Anna Schmidt",
      yob: 1988,
      clubRaw: "TSV",
      gender: "F",
      candidatePeople: [anna],
      replayIndex: new Map(),
      usedCandidateUids: usedUids,
      config,
      entryId: "e2",
      stats,
      persons,
      teams,
    });
    expect(result.route).toBe("review");
    expect(result.conflict_flags.length).toBeGreaterThan(0);
    expect(stats.conflicts).toBe(1);
  });

  it("strong name + YOB mismatch overrides to review", async () => {
    const config = defaultMatchingConfig({ auto_min: 1.0, review_min: 0.72 });
    const stats = emptyRunStats();
    const result = await resolvePerson({
      rawName: "Anna Schmidt",
      yob: 1989,
      clubRaw: null,
      gender: "F",
      candidatePeople: [anna],
      replayIndex: new Map(),
      usedCandidateUids: new Map(),
      config,
      entryId: "e1",
      stats,
      persons,
      teams,
    });
    expect(result.route).toBe("review");
  });

  it("strict mode: exact match auto-links", async () => {
    const config = defaultMatchingConfig({ strict_normalized_auto_only: true });
    const stats = emptyRunStats();
    const result = await resolvePerson({
      rawName: "Anna Schmidt",
      yob: 1988,
      clubRaw: "TSV",
      gender: "F",
      candidatePeople: [anna],
      replayIndex: new Map(),
      usedCandidateUids: new Map(),
      config,
      entryId: "e1",
      stats,
      persons,
      teams,
    });
    expect(result.route).toBe("auto");
    expect(result.features.strict_identity_auto).toBe(1.0);
  });

  it("strict mode: typo forces review", async () => {
    const config = defaultMatchingConfig({ strict_normalized_auto_only: true });
    const stats = emptyRunStats();
    const result = await resolvePerson({
      rawName: "Anna Schmidta",
      yob: 1988,
      clubRaw: "TSV",
      gender: "F",
      candidatePeople: [anna],
      replayIndex: new Map(),
      usedCandidateUids: new Map(),
      config,
      entryId: "e1",
      stats,
      persons,
      teams,
    });
    expect(result.route).toBe("review");
  });
});

describe("resolveTeamRow", () => {
  const memberA = makePerson({
    person_id: "pa",
    given_name: "max",
    family_name: "mustermann",
    yob: 1988,
    gender: "M",
  });
  const memberB = makePerson({
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
  const personsMap = new Map([
    ["pa", memberA],
    ["pb", memberB],
  ]);
  const teamsMap = new Map([["t-couple", coupleTeam]]);

  it("creates new identity when no candidates", async () => {
    const config = defaultMatchingConfig();
    const stats = emptyRunStats();
    const row: ImportRowCouples = {
      startnr: "1",
      name_a: "Hans Mueller",
      yob_a: 1995,
      club_a: null,
      name_b: "Greta Schmidt",
      yob_b: 1997,
      club_b: null,
      distance_km: 10,
      points: 1,
    };
    const result = await resolveTeamRow({
      row,
      division: "couples_mixed",
      genderA: "M",
      genderB: "F",
      persons: new Map(),
      teams: new Map(),
      replayIndex: new Map(),
      usedTeamUids: new Map(),
      config,
      entryId: "e1",
      stats,
    });
    expect(result.route).toBe("new_identity");
    expect(result.new_persons).toHaveLength(2);
    expect(result.new_teams).toHaveLength(1);
    expect(result.new_teams[0]!.team_kind).toBe("couple");
    expect(stats.new_identities).toBe(1);
  });

  it("auto-links to existing couple with high score", async () => {
    const config = defaultMatchingConfig();
    const stats = emptyRunStats();
    const row: ImportRowCouples = {
      startnr: "1",
      name_a: "Max Mustermann",
      yob_a: 1988,
      club_a: null,
      name_b: "Eva Beispiel",
      yob_b: 1990,
      club_b: null,
      distance_km: 10,
      points: 1,
    };
    const result = await resolveTeamRow({
      row,
      division: "couples_mixed",
      genderA: "M",
      genderB: "F",
      persons: personsMap,
      teams: teamsMap,
      replayIndex: new Map(),
      usedTeamUids: new Map(),
      config,
      entryId: "e1",
      stats,
    });
    expect(result.route).toBe("auto");
    expect(result.team_id).toBe("t-couple");
    expect(stats.auto_links).toBe(1);
  });
});
