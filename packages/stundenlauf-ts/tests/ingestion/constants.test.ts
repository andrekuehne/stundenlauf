import { describe, expect, it } from "vitest";

import {
  DIVISION_MARKERS_COUPLES,
  DIVISION_MARKERS_SINGLES,
  DURATION_MARKERS,
  EXPECTED_HEADER_COUPLES,
  EXPECTED_HEADER_SINGLES,
  PARSER_VERSION,
} from "@/ingestion/constants";

describe("EXPECTED_HEADER_SINGLES", () => {
  it("has exactly 8 columns", () => {
    expect(EXPECTED_HEADER_SINGLES).toHaveLength(8);
  });

  it("matches Python header tuple exactly", () => {
    expect(EXPECTED_HEADER_SINGLES).toEqual([
      "Platz",
      "Startnr.",
      "Name",
      "Jahrg.",
      "Verein",
      "Distanz",
      "Rückstand",
      "Punkte",
    ]);
  });
});

describe("EXPECTED_HEADER_COUPLES", () => {
  it("has exactly 11 columns", () => {
    expect(EXPECTED_HEADER_COUPLES).toHaveLength(11);
  });

  it("matches Python header tuple exactly", () => {
    expect(EXPECTED_HEADER_COUPLES).toEqual([
      "Platz",
      "Startnr.",
      "Name",
      "Jahrg.",
      "Verein",
      "Name",
      "Jahrg.",
      "Verein",
      "Distanz",
      "Rückstand",
      "Punkte",
    ]);
  });

  it("contains German characters (Rückstand)", () => {
    expect(EXPECTED_HEADER_COUPLES).toContain("Rückstand");
  });
});

describe("DURATION_MARKERS", () => {
  it("maps 1/2 h-Lauf to half_hour", () => {
    expect(DURATION_MARKERS["1/2 h-Lauf"]).toBe("half_hour");
  });

  it("maps h-Lauf to hour", () => {
    expect(DURATION_MARKERS["h-Lauf"]).toBe("hour");
  });

  it("has exactly 2 entries", () => {
    expect(Object.keys(DURATION_MARKERS)).toHaveLength(2);
  });
});

describe("DIVISION_MARKERS_SINGLES", () => {
  it("maps Frauen to women", () => {
    expect(DIVISION_MARKERS_SINGLES["Frauen"]).toBe("women");
  });

  it("maps Männer to men", () => {
    expect(DIVISION_MARKERS_SINGLES["Männer"]).toBe("men");
  });

  it("has exactly 2 entries", () => {
    expect(Object.keys(DIVISION_MARKERS_SINGLES)).toHaveLength(2);
  });
});

describe("DIVISION_MARKERS_COUPLES", () => {
  it("maps Paare Frauen to couples_women", () => {
    expect(DIVISION_MARKERS_COUPLES["Paare Frauen"]).toBe("couples_women");
  });

  it("maps Paare Männer to couples_men", () => {
    expect(DIVISION_MARKERS_COUPLES["Paare Männer"]).toBe("couples_men");
  });

  it("maps Paare Mix to couples_mixed", () => {
    expect(DIVISION_MARKERS_COUPLES["Paare Mix"]).toBe("couples_mixed");
  });

  it("has exactly 3 entries", () => {
    expect(Object.keys(DIVISION_MARKERS_COUPLES)).toHaveLength(3);
  });
});

describe("PARSER_VERSION", () => {
  it("is f-ts02-v1", () => {
    expect(PARSER_VERSION).toBe("f-ts02-v1");
  });
});
