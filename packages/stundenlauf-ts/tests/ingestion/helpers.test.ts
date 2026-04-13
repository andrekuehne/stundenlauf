import { describe, expect, it } from "vitest";

import {
  detectSourceType,
  fileSha256,
  optionalClubFromCell,
  parseDecimal,
  parseRaceNo,
  toText,
} from "@/ingestion/helpers";

describe("toText", () => {
  it("returns empty string for null", () => {
    expect(toText(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(toText(undefined)).toBe("");
  });

  it("converts number to string", () => {
    expect(toText(42)).toBe("42");
  });

  it("trims whitespace", () => {
    expect(toText("  hello  ")).toBe("hello");
  });

  it("converts boolean to string", () => {
    expect(toText(true)).toBe("true");
  });

  it("returns empty string for empty string input", () => {
    expect(toText("")).toBe("");
  });
});

describe("parseDecimal", () => {
  it("parses integer", () => {
    expect(parseDecimal("42")).toBe(42);
  });

  it("parses float", () => {
    expect(parseDecimal("3.14")).toBe(3.14);
  });

  it("parses German comma decimal", () => {
    expect(parseDecimal("12,5")).toBe(12.5);
  });

  it("parses numeric input directly", () => {
    expect(parseDecimal(12.5)).toBe(12.5);
  });

  it("throws on empty string", () => {
    expect(() => parseDecimal("")).toThrow("empty");
  });

  it("throws on null", () => {
    expect(() => parseDecimal(null)).toThrow("empty");
  });

  it("throws on non-numeric string", () => {
    expect(() => parseDecimal("abc")).toThrow("not a number");
  });

  it("parses zero", () => {
    expect(parseDecimal("0")).toBe(0);
  });

  it("parses German comma with leading zero", () => {
    expect(parseDecimal("0,0")).toBe(0.0);
  });
});

describe("optionalClubFromCell", () => {
  it("returns null for null", () => {
    expect(optionalClubFromCell(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(optionalClubFromCell("")).toBeNull();
  });

  it("returns null for whitespace only", () => {
    expect(optionalClubFromCell("   ")).toBeNull();
  });

  it("returns null for punctuation-only string", () => {
    expect(optionalClubFromCell("---")).toBeNull();
  });

  it("returns null for dots and dashes", () => {
    expect(optionalClubFromCell("...---")).toBeNull();
  });

  it("returns trimmed club name for valid club", () => {
    expect(optionalClubFromCell("  TSV Süd  ")).toBe("TSV Süd");
  });

  it("returns club with special characters", () => {
    expect(optionalClubFromCell("SV Nördlingen")).toBe("SV Nördlingen");
  });

  it("returns club with numbers", () => {
    expect(optionalClubFromCell("FC 1899")).toBe("FC 1899");
  });

  it("returns null for undefined", () => {
    expect(optionalClubFromCell(undefined)).toBeNull();
  });
});

describe("parseRaceNo", () => {
  it("extracts race number from Lauf pattern", () => {
    expect(parseRaceNo("Ergebnisliste MW Lauf 3.xlsx")).toBe(3);
  });

  it("extracts race number case-insensitive", () => {
    expect(parseRaceNo("ergebnisliste lauf 5.xlsx")).toBe(5);
  });

  it("extracts multi-digit race number from Lauf pattern", () => {
    expect(parseRaceNo("Ergebnisliste MW Lauf 12.xlsx")).toBe(12);
  });

  it("falls back to single isolated digit", () => {
    expect(parseRaceNo("results_5.xlsx")).toBe(5);
  });

  it("returns 0 for no digits", () => {
    expect(parseRaceNo("nodigit.xlsx")).toBe(0);
  });

  it("returns 0 for multiple isolated digits without Lauf pattern", () => {
    expect(parseRaceNo("file_3_and_4.xlsx")).toBe(0);
  });

  it("returns race number from Paarlauf filename", () => {
    expect(parseRaceNo("Ergebnisliste MW_Paare Lauf 2.xlsx")).toBe(2);
  });

  it("returns 0 for no isolated single digit (multi-digit only)", () => {
    expect(parseRaceNo("results_12.xlsx")).toBe(0);
  });
});

describe("fileSha256", () => {
  it("produces hex digest for known input", async () => {
    const encoder = new TextEncoder();
    const buffer = encoder.encode("hello world").buffer as ArrayBuffer;
    const hash = await fileSha256(buffer);
    expect(hash).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
  });

  it("produces different hash for different input", async () => {
    const encoder = new TextEncoder();
    const buf1 = encoder.encode("aaa").buffer as ArrayBuffer;
    const buf2 = encoder.encode("bbb").buffer as ArrayBuffer;
    const hash1 = await fileSha256(buf1);
    const hash2 = await fileSha256(buf2);
    expect(hash1).not.toBe(hash2);
  });

  it("produces 64-character hex string", async () => {
    const buffer = new ArrayBuffer(0);
    const hash = await fileSha256(buffer);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("detectSourceType", () => {
  it("detects couples from Paare in filename", () => {
    expect(detectSourceType("Ergebnisliste MW_Paare Lauf 1.xlsx")).toBe("couples");
  });

  it("detects couples case-insensitive", () => {
    expect(detectSourceType("ergebnisliste paare.xlsx")).toBe("couples");
  });

  it("defaults to singles", () => {
    expect(detectSourceType("Ergebnisliste MW Lauf 1.xlsx")).toBe("singles");
  });

  it("defaults to singles for empty filename", () => {
    expect(detectSourceType("")).toBe("singles");
  });
});
