import { describe, expect, it } from "vitest";
import { parsePersonName } from "@/matching/normalize.ts";
import {
  coupleMatchesStrictRow,
  personMatchesStrictIncoming,
} from "@/matching/strict-identity.ts";
import type { PersonIdentity } from "@/domain/types.ts";
import type { ImportRowCouples } from "@/ingestion/types.ts";

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

describe("personMatchesStrictIncoming", () => {
  it("matches when all four fields agree", () => {
    const parsed = parsePersonName("Anna Schmidt");
    const p = makePerson({
      person_id: "p1",
      given_name: "anna",
      family_name: "schmidt",
      yob: 1988,
      gender: "F",
      club: "TSV",
      club_normalized: "tsv",
    });
    expect(
      personMatchesStrictIncoming({
        incoming_parsed: parsed,
        incoming_yob: 1988,
        incoming_club_norm: "tsv",
        gender: "F",
        person: p,
      }),
    ).toBe(true);
  });

  it("rejects name mismatch", () => {
    const parsed = parsePersonName("Anna Schmidt");
    const p = makePerson({
      person_id: "p1",
      given_name: "anna",
      family_name: "schmidta",
      yob: 1988,
      gender: "F",
      club: "TSV",
      club_normalized: "tsv",
    });
    expect(
      personMatchesStrictIncoming({
        incoming_parsed: parsed,
        incoming_yob: 1988,
        incoming_club_norm: "tsv",
        gender: "F",
        person: p,
      }),
    ).toBe(false);
  });

  it("rejects YOB mismatch", () => {
    const parsed = parsePersonName("Anna Schmidt");
    const p = makePerson({
      person_id: "p1",
      given_name: "anna",
      family_name: "schmidt",
      yob: 1989,
      gender: "F",
      club: "TSV",
      club_normalized: "tsv",
    });
    expect(
      personMatchesStrictIncoming({
        incoming_parsed: parsed,
        incoming_yob: 1988,
        incoming_club_norm: "tsv",
        gender: "F",
        person: p,
      }),
    ).toBe(false);
  });

  it("rejects 0 vs non-zero YOB", () => {
    const parsed = parsePersonName("Anna Schmidt");
    const p = makePerson({
      person_id: "p1",
      given_name: "anna",
      family_name: "schmidt",
      yob: 1988,
      gender: "F",
      club: "TSV",
      club_normalized: "tsv",
    });
    expect(
      personMatchesStrictIncoming({
        incoming_parsed: parsed,
        incoming_yob: 0,
        incoming_club_norm: "tsv",
        gender: "F",
        person: p,
      }),
    ).toBe(false);
  });

  it("rejects club mismatch", () => {
    const parsed = parsePersonName("Anna Schmidt");
    const p = makePerson({
      person_id: "p1",
      given_name: "anna",
      family_name: "schmidt",
      yob: 1988,
      gender: "F",
      club: "TSV",
      club_normalized: "tsv",
    });
    expect(
      personMatchesStrictIncoming({
        incoming_parsed: parsed,
        incoming_yob: 1988,
        incoming_club_norm: "other",
        gender: "F",
        person: p,
      }),
    ).toBe(false);
  });

  it("rejects gender mismatch", () => {
    const parsed = parsePersonName("Anna Schmidt");
    const p = makePerson({
      person_id: "p1",
      given_name: "anna",
      family_name: "schmidt",
      yob: 1988,
      gender: "F",
      club: "TSV",
      club_normalized: "tsv",
    });
    expect(
      personMatchesStrictIncoming({
        incoming_parsed: parsed,
        incoming_yob: 1988,
        incoming_club_norm: "tsv",
        gender: "M",
        person: p,
      }),
    ).toBe(false);
  });
});

describe("coupleMatchesStrictRow", () => {
  it("matches order-insensitively", () => {
    const row: ImportRowCouples = {
      startnr: "1",
      name_a: "Alex Beispiel",
      yob_a: 1987,
      club_a: "TSV",
      name_b: "Sina Beispiel",
      yob_b: 1992,
      club_b: "TSV",
      distance_km: 10.0,
      points: 20.0,
    };
    // Members stored in reversed order
    const m0 = makePerson({
      person_id: "pa",
      given_name: "sina",
      family_name: "beispiel",
      yob: 1992,
      gender: "F",
      club: "TSV",
      club_normalized: "tsv",
    });
    const m1 = makePerson({
      person_id: "pb",
      given_name: "alex",
      family_name: "beispiel",
      yob: 1987,
      gender: "M",
      club: "TSV",
      club_normalized: "tsv",
    });
    expect(coupleMatchesStrictRow(row, "M", "F", [m0, m1])).toBe(true);
  });

  it("rejects when club differs on one member", () => {
    const row: ImportRowCouples = {
      startnr: "1",
      name_a: "Alex Beispiel",
      yob_a: 1987,
      club_a: "TSV",
      name_b: "Sina Beispiel",
      yob_b: 1992,
      club_b: "TSV",
      distance_km: 10.0,
      points: 20.0,
    };
    const m0 = makePerson({
      person_id: "pa",
      given_name: "alex",
      family_name: "beispiel",
      yob: 1987,
      gender: "M",
      club: "TSV",
      club_normalized: "tsv",
    });
    const m1 = makePerson({
      person_id: "pb",
      given_name: "sina",
      family_name: "beispiel",
      yob: 1992,
      gender: "F",
      club: "TSV",
      club_normalized: "other",
    });
    expect(coupleMatchesStrictRow(row, "M", "F", [m0, m1])).toBe(false);
  });
});
