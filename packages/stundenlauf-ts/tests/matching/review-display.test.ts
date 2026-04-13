import { describe, expect, it } from "vitest";
import {
  alignCoupleMembersForDisplay,
  fieldHighlightsForPersonLine,
  splitDisplayNameParts,
} from "@/matching/review-display.ts";
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

describe("splitDisplayNameParts", () => {
  it("splits space-delimited into given, family", () => {
    const [given, family] = splitDisplayNameParts("Anna Meyer");
    expect(given).toBe("Anna");
    expect(family).toBe("Meyer");
  });

  it("splits comma-delimited into given, family", () => {
    const [given, family] = splitDisplayNameParts("Meyer, Anna");
    expect(given).toBe("Anna");
    expect(family).toBe("Meyer");
  });

  it("strips titles", () => {
    const [given, family] = splitDisplayNameParts("Dr. Anna Meyer");
    expect(given).toBe("Anna");
    expect(family).toBe("Meyer");
  });

  it("handles single name", () => {
    const [given, family] = splitDisplayNameParts("Madonna");
    expect(given).toBe("");
    expect(family).toBe("Madonna");
  });

  it("handles empty", () => {
    const [given, family] = splitDisplayNameParts("");
    expect(given).toBe("");
    expect(family).toBe("");
  });
});

describe("fieldHighlightsForPersonLine", () => {
  it("no diffs for identical data", () => {
    const result = fieldHighlightsForPersonLine(
      "Anna Meyer", 1990, "TSV",
      "Anna Meyer", 1990, "TSV",
    );
    expect(result.yob.diff).toBe(false);
    expect(result.club.diff).toBe(false);
  });

  it("detects YOB diff when both present and different", () => {
    const result = fieldHighlightsForPersonLine(
      "Anna Meyer", 1990, null,
      "Anna Meyer", 1991, null,
    );
    expect(result.yob.diff).toBe(true);
  });

  it("no YOB diff when incoming YOB is 0", () => {
    const result = fieldHighlightsForPersonLine(
      "Anna Meyer", 0, null,
      "Anna Meyer", 1991, null,
    );
    expect(result.yob.diff).toBe(false);
  });

  it("detects club diff", () => {
    const result = fieldHighlightsForPersonLine(
      "Anna Meyer", 1990, "TSV",
      "Anna Meyer", 1990, "LG Nord",
    );
    expect(result.club.diff).toBe(true);
  });

  it("shows dash for missing YOB", () => {
    const result = fieldHighlightsForPersonLine(
      "Anna Meyer", 0, null,
      "Anna Meyer", 0, null,
    );
    expect(result.yob.text).toBe("-");
  });
});

describe("alignCoupleMembersForDisplay", () => {
  it("keeps order when direct alignment is better", () => {
    const ma = makePerson({
      person_id: "pa",
      given_name: "Max",
      family_name: "Mustermann",
      yob: 1988,
      gender: "M",
    });
    const mb = makePerson({
      person_id: "pb",
      given_name: "Eva",
      family_name: "Beispiel",
      yob: 1990,
      gender: "F",
    });
    const [swapped, [first, second]] = alignCoupleMembersForDisplay(
      { display_name: "Max Mustermann / Eva Beispiel" },
      ma,
      mb,
    );
    expect(swapped).toBe(false);
    expect(first.person_id).toBe("pa");
    expect(second.person_id).toBe("pb");
  });

  it("swaps order when swap alignment is better", () => {
    const ma = makePerson({
      person_id: "pa",
      given_name: "Eva",
      family_name: "Beispiel",
      yob: 1990,
      gender: "F",
    });
    const mb = makePerson({
      person_id: "pb",
      given_name: "Max",
      family_name: "Mustermann",
      yob: 1988,
      gender: "M",
    });
    const [swapped, [first]] = alignCoupleMembersForDisplay(
      { display_name: "Max Mustermann / Eva Beispiel" },
      ma,
      mb,
    );
    expect(swapped).toBe(true);
    expect(first.person_id).toBe("pb");
  });
});
