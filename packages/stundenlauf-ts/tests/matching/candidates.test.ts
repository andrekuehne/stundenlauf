import { describe, expect, it } from "vitest";
import {
  buildPersonBlockIndex,
  candidatePersonKeys,
  gatherCandidates,
} from "@/matching/candidates.ts";
import { defaultMatchingConfig } from "@/matching/config.ts";
import { parsePersonName } from "@/matching/normalize.ts";
import type { PersonIdentity } from "@/domain/types.ts";

function makePerson(
  overrides: Partial<PersonIdentity> & { person_id: string },
): PersonIdentity {
  return {
    given_name: "Test",
    family_name: "Person",
    display_name: "",
    name_normalized: "",
    yob: 1990,
    gender: "M",
    club: null,
    club_normalized: "",
    ...overrides,
  };
}

describe("candidatePersonKeys", () => {
  it("generates 4 keys with YOB", () => {
    const parsed = parsePersonName("Anna Meyer");
    const keys = candidatePersonKeys(parsed, 1990);
    expect(keys).toHaveLength(4);
    expect(keys).toContain("fam|mey|1990");
    expect(keys).toContain("giv|ann|1990");
    expect(keys).toContain("fam|mey|no_yob");
    expect(keys).toContain("giv|ann|no_yob");
  });

  it("generates 2 keys without YOB", () => {
    const parsed = parsePersonName("Anna Meyer");
    const keys = candidatePersonKeys(parsed, 0);
    expect(keys).toHaveLength(2);
    expect(keys).toContain("fam|mey|no_yob");
    expect(keys).toContain("giv|ann|no_yob");
  });
});

describe("buildPersonBlockIndex", () => {
  it("filters by gender", () => {
    const people = [
      makePerson({ person_id: "p1", given_name: "anna", family_name: "meyer", gender: "F" }),
      makePerson({ person_id: "p2", given_name: "hans", family_name: "schmidt", gender: "M" }),
    ];
    const index = buildPersonBlockIndex(people, "F");
    const allPersons = new Set(
      [...index.values()].flat().map((p) => p.person_id),
    );
    expect(allPersons).toContain("p1");
    expect(allPersons).not.toContain("p2");
  });

  it("builds correct blocking keys", () => {
    const people = [
      makePerson({ person_id: "p1", given_name: "anna", family_name: "meyer", gender: "F", yob: 1990 }),
    ];
    const index = buildPersonBlockIndex(people, "F");
    expect(index.has("fam|mey|1990")).toBe(true);
    expect(index.has("giv|ann|1990")).toBe(true);
    expect(index.has("fam|mey|no_yob")).toBe(true);
  });
});

describe("gatherCandidates", () => {
  it("returns matching candidates", () => {
    const people = [
      makePerson({ person_id: "p1", given_name: "anna", family_name: "meyer", gender: "F", yob: 1990 }),
      makePerson({ person_id: "p2", given_name: "anna", family_name: "schmidt", gender: "F", yob: 1990 }),
    ];
    const index = buildPersonBlockIndex(people, "F");
    const parsed = parsePersonName("Anna Meyer");
    const config = defaultMatchingConfig();
    const candidates = gatherCandidates(parsed, 1990, "F", index, config);
    const ids = candidates.map((c) => c.person_id);
    expect(ids).toContain("p1");
  });

  it("deduplicates candidates", () => {
    const people = [
      makePerson({ person_id: "p1", given_name: "anna", family_name: "meyer", gender: "F", yob: 1990 }),
    ];
    const index = buildPersonBlockIndex(people, "F");
    const parsed = parsePersonName("Anna Meyer");
    const config = defaultMatchingConfig();
    const candidates = gatherCandidates(parsed, 1990, "F", index, config);
    const ids = candidates.map((c) => c.person_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("respects max_candidates_per_row cap", () => {
    const people = Array.from({ length: 60 }, (_, i) =>
      makePerson({
        person_id: `p${i}`,
        given_name: "anna",
        family_name: `meyer${i}`,
        gender: "F",
        yob: 1990,
      }),
    );
    const index = buildPersonBlockIndex(people, "F");
    const parsed = parsePersonName("Anna Meyer");
    const config = defaultMatchingConfig({ max_candidates_per_row: 10 });
    const candidates = gatherCandidates(parsed, 1990, "F", index, config);
    expect(candidates.length).toBeLessThanOrEqual(10);
  });
});
