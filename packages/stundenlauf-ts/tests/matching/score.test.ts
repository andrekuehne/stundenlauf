import { describe, expect, it } from "vitest";
import { defaultMatchingConfig } from "@/matching/config.ts";
import { parsePersonName } from "@/matching/normalize.ts";
import {
  nameSimilarity,
  personParsed,
  routeFromScore,
  scorePersonMatch,
  shouldReviewStrongCoupleYobMismatch,
  shouldReviewStrongNameYobMismatch,
} from "@/matching/score.ts";
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

describe("personParsed", () => {
  it("uses given_name/family_name when present", () => {
    const p = makePerson({
      person_id: "x",
      given_name: "max",
      family_name: "mustermann",
    });
    const parsed = personParsed(p);
    expect(parsed.family).toBe("mustermann");
    expect(parsed.given).toBe("max");
  });

  it("falls back to parse when canonical fields empty", () => {
    const p = makePerson({
      person_id: "x",
      given_name: "",
      family_name: "",
    });
    const parsed = personParsed(p);
    expect(parsed).toBeDefined();
  });
});

describe("nameSimilarity", () => {
  it("returns 1.0 for identical names", () => {
    const a = parsePersonName("Anna Meyer");
    const [score] = nameSimilarity(a, a);
    expect(score).toBeCloseTo(1.0, 3);
  });

  it("returns high score for similar names", () => {
    const a = parsePersonName("Anna Meyer");
    const b = parsePersonName("Anna Mayer");
    const [score] = nameSimilarity(a, b);
    expect(score).toBeGreaterThan(0.7);
  });

  it("detects swapped names", () => {
    const a = parsePersonName("Anna Meyer");
    const b = parsePersonName("Meyer Anna");
    const [, feats] = nameSimilarity(a, b);
    expect(feats.name_swapped).toBeGreaterThan(0);
  });

  it("computes token overlap", () => {
    const a = parsePersonName("Anna Meyer");
    const b = parsePersonName("Anna Schmidt");
    const [, feats] = nameSimilarity(a, b);
    expect(feats.token_overlap).toBeCloseTo(0.3333, 3);
  });
});

describe("scorePersonMatch", () => {
  const config = defaultMatchingConfig();

  it("scores high for exact match with same YOB", () => {
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
    expect(score).toBeGreaterThan(config.auto_min);
  });

  it("handles typo and still scores above review_min", () => {
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
    expect(score).toBeGreaterThan(config.review_min);
  });

  it("penalizes YOB mismatch", () => {
    const inc = parsePersonName("Anna Meyer");
    const cand = makePerson({
      person_id: "p1",
      given_name: "anna",
      family_name: "meyer",
      yob: 1999,
      gender: "F",
      club_normalized: "",
    });
    const [score] = scorePersonMatch(inc, 1990, "", cand, config);
    expect(score).toBeLessThan(config.auto_min);
  });

  it("clamps score between 0 and 1", () => {
    const inc = parsePersonName("Anna Meyer");
    const cand = makePerson({
      person_id: "p1",
      given_name: "anna",
      family_name: "meyer",
      yob: 1990,
      gender: "F",
      club_normalized: "lg test",
    });
    const [score] = scorePersonMatch(inc, 1990, "lg test", cand, config);
    expect(score).toBeGreaterThanOrEqual(0.0);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it("adds club similarity bonus", () => {
    // Use a typo name so base score is below 1.0-clamp territory
    const inc = parsePersonName("Jonas Schmidt");
    const candNoClub = makePerson({
      person_id: "p1",
      given_name: "jonaas",
      family_name: "schmidt",
      yob: 0,
      gender: "M",
      club_normalized: "",
    });
    const candWithClub = makePerson({
      person_id: "p2",
      given_name: "jonaas",
      family_name: "schmidt",
      yob: 0,
      gender: "M",
      club: "TSV",
      club_normalized: "tsv",
    });
    const [scoreNoClub] = scorePersonMatch(inc, 0, "tsv", candNoClub, config);
    const [scoreWithClub] = scorePersonMatch(inc, 0, "tsv", candWithClub, config);
    expect(scoreWithClub).toBeGreaterThan(scoreNoClub);
  });
});

describe("routeFromScore", () => {
  const config = defaultMatchingConfig();

  it("routes auto above auto_min", () => {
    expect(routeFromScore(0.95, config)).toBe("auto");
  });

  it("routes review between thresholds", () => {
    expect(routeFromScore(0.80, config)).toBe("review");
  });

  it("routes new_identity below review_min", () => {
    expect(routeFromScore(0.50, config)).toBe("new_identity");
  });

  it("routes auto at exact auto_min boundary", () => {
    expect(routeFromScore(config.auto_min, config)).toBe("auto");
  });

  it("routes review at exact review_min boundary", () => {
    expect(routeFromScore(config.review_min, config)).toBe("review");
  });
});

describe("shouldReviewStrongNameYobMismatch", () => {
  const config = defaultMatchingConfig({ auto_min: 1.0, review_min: 0.72 });

  it("triggers when names identical but YOBs differ", () => {
    const feats = { name_base: 1.0, token_overlap: 1.0, yob_agreement: 0.0 };
    expect(shouldReviewStrongNameYobMismatch(0.55, feats, config)).toBe(true);
  });

  it("does not trigger when score above review_min", () => {
    const feats = { name_base: 1.0, token_overlap: 1.0, yob_agreement: 0.0 };
    expect(shouldReviewStrongNameYobMismatch(0.80, feats, config)).toBe(false);
  });

  it("does not trigger when yob agrees", () => {
    const feats = { name_base: 1.0, token_overlap: 1.0, yob_agreement: 1.0 };
    expect(shouldReviewStrongNameYobMismatch(0.55, feats, config)).toBe(false);
  });

  it("does not trigger when name is weak", () => {
    const feats = { name_base: 0.5, token_overlap: 0.3, yob_agreement: 0.0 };
    expect(shouldReviewStrongNameYobMismatch(0.30, feats, config)).toBe(false);
  });
});

describe("shouldReviewStrongCoupleYobMismatch", () => {
  const config = defaultMatchingConfig({ auto_min: 1.0, review_min: 0.72 });

  it("triggers when both members strong but YOB mismatch", () => {
    const feats = {
      m0_name_base: 1.0,
      m0_token_overlap: 1.0,
      m0_yob_agreement: 1.0,
      m1_name_base: 1.0,
      m1_token_overlap: 1.0,
      m1_yob_agreement: 0.0,
    };
    expect(shouldReviewStrongCoupleYobMismatch(0.55, feats, config)).toBe(true);
  });

  it("does not trigger when score above review_min", () => {
    const feats = {
      m0_name_base: 1.0,
      m0_token_overlap: 1.0,
      m0_yob_agreement: 0.0,
      m1_name_base: 1.0,
      m1_token_overlap: 1.0,
      m1_yob_agreement: 0.0,
    };
    expect(shouldReviewStrongCoupleYobMismatch(0.80, feats, config)).toBe(false);
  });
});
