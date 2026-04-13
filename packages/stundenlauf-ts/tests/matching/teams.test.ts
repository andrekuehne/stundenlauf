import { describe, expect, it } from "vitest";
import { defaultMatchingConfig } from "@/matching/config.ts";
import { parsePersonName } from "@/matching/normalize.ts";
import {
  buildCoupleBlockIndex,
  coupleDivisionOk,
  gatherCoupleCandidates,
  resolveTeamMembers,
  scoreCoupleMatch,
} from "@/matching/teams.ts";
import type { PersonIdentity, Team } from "@/domain/types.ts";

function makePerson(
  overrides: Partial<PersonIdentity> & { person_id: string },
): PersonIdentity {
  return {
    given_name: "",
    family_name: "",
    yob: 0,
    gender: "M",
    club: null,
    club_normalized: "",
    ...overrides,
  };
}

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

const team1: Team = {
  team_id: "t1",
  member_person_ids: ["pa", "pb"],
  team_kind: "couple",
};

const persons = new Map<string, PersonIdentity>([
  ["pa", memberA],
  ["pb", memberB],
]);

describe("resolveTeamMembers", () => {
  it("resolves both members", () => {
    const result = resolveTeamMembers(team1, persons);
    expect(result).not.toBeNull();
    expect(result![0].person_id).toBe("pa");
    expect(result![1].person_id).toBe("pb");
  });

  it("returns null for missing member", () => {
    const result = resolveTeamMembers(team1, new Map());
    expect(result).toBeNull();
  });

  it("returns null for solo team", () => {
    const soloTeam: Team = { team_id: "s1", member_person_ids: ["pa"], team_kind: "solo" };
    const result = resolveTeamMembers(soloTeam, persons);
    expect(result).toBeNull();
  });
});

describe("coupleDivisionOk", () => {
  it("accepts mixed couple for couples_mixed", () => {
    expect(coupleDivisionOk([memberA, memberB], "couples_mixed")).toBe(true);
  });

  it("rejects mixed couple for couples_men", () => {
    expect(coupleDivisionOk([memberA, memberB], "couples_men")).toBe(false);
  });

  it("accepts same-gender couple for couples_men", () => {
    const memberA2 = { ...memberA, person_id: "pa2" };
    const memberB2 = { ...memberA, person_id: "pb2" };
    expect(coupleDivisionOk([memberA2, memberB2], "couples_men")).toBe(true);
  });
});

describe("buildCoupleBlockIndex", () => {
  it("indexes couples by member name prefixes", () => {
    const index = buildCoupleBlockIndex([team1], persons, "couples_mixed");
    expect(index.size).toBeGreaterThan(0);
    // Should have keys from both members
    const allKeys = [...index.keys()];
    const hasMustermannKey = allKeys.some((k) => k.includes("mus"));
    const hasBeispielKey = allKeys.some((k) => k.includes("bei"));
    expect(hasMustermannKey).toBe(true);
    expect(hasBeispielKey).toBe(true);
  });

  it("filters by division", () => {
    const index = buildCoupleBlockIndex([team1], persons, "couples_men");
    expect(index.size).toBe(0);
  });
});

describe("gatherCoupleCandidates", () => {
  it("returns matching candidates", () => {
    const index = buildCoupleBlockIndex([team1], persons, "couples_mixed");
    const parsedA = parsePersonName("Max Mustermann");
    const parsedB = parsePersonName("Eva Beispiel");
    const config = defaultMatchingConfig();
    const candidates = gatherCoupleCandidates(parsedA, 1988, parsedB, 1990, index, config);
    expect(candidates.length).toBe(1);
    expect(candidates[0]!.team.team_id).toBe("t1");
  });
});

describe("scoreCoupleMatch", () => {
  const config = defaultMatchingConfig();

  it("produces high score for identical members", () => {
    const incA = parsePersonName("Max Mustermann");
    const incB = parsePersonName("Eva Beispiel");
    const [score] = scoreCoupleMatch(
      incA, 1988, "", incB, 1990, "",
      [memberA, memberB], config,
    );
    expect(score).toBeGreaterThan(config.review_min);
  });

  it("is order-insensitive (swapping members gives same score)", () => {
    const incA = parsePersonName("Max M");
    const incB = parsePersonName("Eva E");
    const mem0 = makePerson({
      person_id: "m0",
      given_name: "max",
      family_name: "m",
      yob: 1988,
      gender: "M",
    });
    const mem1 = makePerson({
      person_id: "m1",
      given_name: "eva",
      family_name: "e",
      yob: 1990,
      gender: "F",
    });
    const [s1] = scoreCoupleMatch(incA, 1988, "", incB, 1990, "", [mem0, mem1], config);
    const [s2] = scoreCoupleMatch(incA, 1988, "", incB, 1990, "", [mem1, mem0], config);
    expect(s1).toBeCloseTo(s2, 3);
  });

  it("returns member feature keys", () => {
    const incA = parsePersonName("Max Mustermann");
    const incB = parsePersonName("Eva Beispiel");
    const [, feats] = scoreCoupleMatch(
      incA, 1988, "", incB, 1990, "",
      [memberA, memberB], config,
    );
    expect(feats).toHaveProperty("m0_yob_agreement");
    expect(feats).toHaveProperty("m1_yob_agreement");
    expect(feats).toHaveProperty("pair_score");
    expect(feats).toHaveProperty("member_low");
    expect(feats).toHaveProperty("member_high");
  });

  it("applies safety cap when one member is weak", () => {
    const incA = parsePersonName("Max Mustermann");
    const incB = parsePersonName("Completely Different");
    const [score] = scoreCoupleMatch(
      incA, 1988, "", incB, 1990, "",
      [memberA, memberB], config,
    );
    expect(score).toBeLessThanOrEqual(config.pair_unsafe_cap);
  });
});
