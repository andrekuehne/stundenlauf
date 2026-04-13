import { describe, expect, it } from "vitest";
import {
  normalizeClub,
  normalizeToken,
  normalizeWhitespace,
  parsePersonName,
  stripDiacritics,
} from "@/matching/normalize.ts";

describe("stripDiacritics", () => {
  it("removes German umlauts", () => {
    expect(stripDiacritics("Müller")).toBe("Muller");
    expect(stripDiacritics("Böhm")).toBe("Bohm");
    expect(stripDiacritics("Straße")).toBe("Straße"); // ß is not a combining mark
  });

  it("removes accented characters", () => {
    expect(stripDiacritics("café")).toBe("cafe");
    expect(stripDiacritics("naïve")).toBe("naive");
  });

  it("leaves ASCII unchanged", () => {
    expect(stripDiacritics("hello")).toBe("hello");
    expect(stripDiacritics("")).toBe("");
  });
});

describe("normalizeWhitespace", () => {
  it("collapses runs and trims", () => {
    expect(normalizeWhitespace("  hello   world  ")).toBe("hello world");
  });
  it("handles empty", () => {
    expect(normalizeWhitespace("")).toBe("");
    expect(normalizeWhitespace("   ")).toBe("");
  });
});

describe("normalizeToken", () => {
  it("strips diacritics, lowercases, removes non-word", () => {
    expect(normalizeToken("Müller")).toBe("muller");
    expect(normalizeToken("O'Brien")).toBe("obrien");
  });
  it("keeps hyphens", () => {
    expect(normalizeToken("Meyer-Schmidt")).toBe("meyer-schmidt");
  });
  it("handles empty", () => {
    expect(normalizeToken("")).toBe("");
  });
});

describe("normalizeClub", () => {
  it("returns empty for null/empty", () => {
    expect(normalizeClub(null)).toBe("");
    expect(normalizeClub("")).toBe("");
    expect(normalizeClub("  ")).toBe("");
  });
  it("normalizes club with diacritics", () => {
    expect(normalizeClub("TSV Süd")).toBe("tsv sud");
  });
  it("replaces special characters except space/hyphen/dot", () => {
    expect(normalizeClub("LG (München)")).toBe("lg munchen");
  });
  it("preserves dots and hyphens", () => {
    expect(normalizeClub("TV 1860 e.V.")).toBe("tv 1860 e.v.");
  });
});

describe("parsePersonName", () => {
  it("handles empty input", () => {
    const result = parsePersonName("");
    expect(result).toEqual({
      given: "",
      family: "",
      tokens: [],
      display_compact: "",
    });
  });

  it("parses space-delimited name", () => {
    const result = parsePersonName("Anna Meyer");
    expect(result.given).toBe("anna");
    expect(result.family).toBe("meyer");
    expect(result.tokens).toEqual(["anna", "meyer"]);
    expect(result.display_compact).toBe("anna meyer");
  });

  it("parses comma-delimited name", () => {
    const result = parsePersonName("Meyer, Anna");
    expect(result.given).toBe("anna");
    expect(result.family).toBe("meyer");
    expect(result.tokens).toEqual(["anna", "meyer"]);
  });

  it("comma and space produce same tokens", () => {
    const a = parsePersonName("Meyer, Anna");
    const b = parsePersonName("Anna Meyer");
    expect(a.tokens).toEqual(b.tokens);
  });

  it("strips Dr. title", () => {
    const a = parsePersonName("Dr. Anna Meyer");
    const b = parsePersonName("Anna Meyer");
    expect(a.tokens).toEqual(b.tokens);
  });

  it("strips Prof. title", () => {
    const a = parsePersonName("Prof. Hans Schmidt");
    const b = parsePersonName("Hans Schmidt");
    expect(a.tokens).toEqual(b.tokens);
  });

  it("strips title from comma-delimited", () => {
    const result = parsePersonName("Meyer, Dr. Anna");
    expect(result.given).toBe("anna");
    expect(result.family).toBe("meyer");
  });

  it("handles single token name", () => {
    const result = parsePersonName("Madonna");
    expect(result.given).toBe("");
    expect(result.family).toBe("madonna");
    expect(result.tokens).toEqual(["madonna"]);
  });

  it("handles German characters", () => {
    const result = parsePersonName("Müller, Jürgen");
    expect(result.family).toBe("muller");
    expect(result.given).toBe("jurgen");
  });

  it("handles multiple given names", () => {
    const result = parsePersonName("Hans Peter Schmidt");
    expect(result.given).toBe("hans peter");
    expect(result.family).toBe("schmidt");
  });

  it("produces sorted unique tokens", () => {
    const result = parsePersonName("Anna Maria Anna Schmidt");
    // "anna" appears twice, should be unique
    expect(result.tokens).toEqual(["anna", "maria", "schmidt"]);
  });

  it("handles whitespace-only input", () => {
    const result = parsePersonName("   ");
    expect(result).toEqual({
      given: "",
      family: "",
      tokens: [],
      display_compact: "",
    });
  });
});
