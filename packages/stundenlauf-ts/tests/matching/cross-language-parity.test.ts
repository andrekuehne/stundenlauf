/**
 * Cross-language parity tests: verify that the TypeScript matching engine
 * produces identical results to the Python version for the same inputs.
 *
 * Reference values generated from the Python backend.
 */
import { describe, expect, it } from "vitest";
import { sequenceMatcherRatio } from "@/matching/ratcliff-obershelp.ts";
import { parsePersonName } from "@/matching/normalize.ts";
import { identityFingerprint, nameKey } from "@/matching/fingerprint.ts";
import { scorePersonMatch } from "@/matching/score.ts";
import { defaultMatchingConfig } from "@/matching/config.ts";
import type { PersonIdentity } from "@/domain/types.ts";

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

describe("Ratcliff/Obershelp parity with Python difflib.SequenceMatcher", () => {
  const cases: [string, string, number][] = [
    ["schmidt", "schmidta", 0.9333333333333333],
    ["jonas", "jonaas", 0.9090909090909091],
    ["meyer", "meier", 0.8],
    ["muller", "mueller", 0.9230769230769231],
    ["tristan", "tristaan", 0.9333333333333333],
    ["anna meyer", "ana mayer", 0.8421052631578947],
  ];

  for (const [a, b, expected] of cases) {
    it(`ratio(${JSON.stringify(a)}, ${JSON.stringify(b)}) = ${expected}`, () => {
      expect(sequenceMatcherRatio(a, b)).toBeCloseTo(expected, 6);
    });
  }
});

describe("parsePersonName parity with Python", () => {
  it("Dr. Anna Meyer", () => {
    const p = parsePersonName("Dr. Anna Meyer");
    expect(p.given).toBe("anna");
    expect(p.family).toBe("meyer");
    expect(p.tokens).toEqual(["anna", "meyer"]);
  });

  it("Meyer, Anna", () => {
    const p = parsePersonName("Meyer, Anna");
    expect(p.given).toBe("anna");
    expect(p.family).toBe("meyer");
    expect(p.tokens).toEqual(["anna", "meyer"]);
  });

  it("Hans Peter Schmidt", () => {
    const p = parsePersonName("Hans Peter Schmidt");
    expect(p.given).toBe("hans peter");
    expect(p.family).toBe("schmidt");
    expect(p.tokens).toEqual(["hans", "peter", "schmidt"]);
  });

  it("Müller, Jürgen", () => {
    const p = parsePersonName("Müller, Jürgen");
    expect(p.given).toBe("jurgen");
    expect(p.family).toBe("muller");
    expect(p.tokens).toEqual(["jurgen", "muller"]);
  });
});

describe("identityFingerprint parity with Python", () => {
  it("Anna Meyer, 1990, F", async () => {
    const parsed = parsePersonName("Anna Meyer");
    const fp = await identityFingerprint(parsed, 1990, "F");
    expect(fp).toBe(
      "b1c51382fd7d0119de60dab5bfcb05ccfe6953963b552590106a2337efd82735",
    );
  });

  it("Hans Schmidt, 1985, M", async () => {
    const parsed = parsePersonName("Hans Schmidt");
    const fp = await identityFingerprint(parsed, 1985, "M");
    expect(fp).toBe(
      "b575986d30d56a019050811478f8f639af7b6da117a7c1023f8e7dd1e7302ab0",
    );
  });
});

describe("nameKey parity with Python", () => {
  it("sorted tokens joined by pipe", () => {
    const parsed = parsePersonName("Anna Meyer");
    expect(nameKey(parsed)).toBe("anna|meyer");
  });

  it("multi-token name", () => {
    const parsed = parsePersonName("Hans Peter Schmidt");
    expect(nameKey(parsed)).toBe("hans|peter|schmidt");
  });
});

describe("scorePersonMatch parity with Python", () => {
  const config = defaultMatchingConfig();

  it("Jonas Schmidt vs Jonaas Schmidt (typo, same YOB, same club)", () => {
    const inc = parsePersonName("Jonas Schmidt");
    const cand = makePerson({
      person_id: "p1",
      given_name: "jonaas",
      family_name: "schmidt",
      yob: 1991,
      gender: "M",
      club: "TSV",
      club_normalized: "tsv",
    });
    const [score] = scorePersonMatch(inc, 1991, "tsv", cand, config);
    // Python: 1.0 (clamped — the exact match bonus + yob + club pushes it to max)
    expect(score).toBeCloseTo(1.0, 3);
  });

  it("Anna Meyer vs Anna Meyer (exact, same YOB)", () => {
    const inc = parsePersonName("Anna Meyer");
    const cand = makePerson({
      person_id: "p1",
      given_name: "anna",
      family_name: "meyer",
      yob: 1990,
      gender: "F",
      club_normalized: "",
    });
    const [score] = scorePersonMatch(inc, 1990, "", cand, config);
    // Python: 1.0
    expect(score).toBeCloseTo(1.0, 3);
  });
});
