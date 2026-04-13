import { describe, expect, it } from "vitest";
import { sequenceMatcherRatio } from "@/matching/ratcliff-obershelp.ts";

describe("sequenceMatcherRatio", () => {
  it("returns 1.0 for identical strings", () => {
    expect(sequenceMatcherRatio("hello", "hello")).toBe(1.0);
  });

  it("returns 1.0 for two empty strings", () => {
    expect(sequenceMatcherRatio("", "")).toBe(1.0);
  });

  it("returns 0.0 when one string is empty", () => {
    expect(sequenceMatcherRatio("hello", "")).toBe(0.0);
    expect(sequenceMatcherRatio("", "hello")).toBe(0.0);
  });

  it("returns 0.0 for completely different strings", () => {
    expect(sequenceMatcherRatio("abc", "xyz")).toBe(0.0);
  });

  // Cross-language parity: values verified against Python difflib.SequenceMatcher
  it("matches Python for 'anna' vs 'anna'", () => {
    expect(sequenceMatcherRatio("anna", "anna")).toBeCloseTo(1.0, 4);
  });

  it("matches Python for 'schmidt' vs 'schmidta'", () => {
    // Python: SequenceMatcher(None, "schmidt", "schmidta").ratio() ≈ 0.9333
    expect(sequenceMatcherRatio("schmidt", "schmidta")).toBeCloseTo(0.9333, 3);
  });

  it("matches Python for 'jonas' vs 'jonaas'", () => {
    // Python: SequenceMatcher(None, "jonas", "jonaas").ratio() ≈ 0.9091
    expect(sequenceMatcherRatio("jonas", "jonaas")).toBeCloseTo(0.9091, 3);
  });

  it("matches Python for 'meyer' vs 'meier'", () => {
    // Python: SequenceMatcher(None, "meyer", "meier").ratio() ≈ 0.8
    expect(sequenceMatcherRatio("meyer", "meier")).toBeCloseTo(0.8, 3);
  });

  it("matches Python for 'anna meyer' vs 'anna meyer'", () => {
    expect(sequenceMatcherRatio("anna meyer", "anna meyer")).toBeCloseTo(
      1.0,
      4,
    );
  });

  it("matches Python for 'anna' vs 'meyer'", () => {
    // Python: SequenceMatcher(None, "anna", "meyer").ratio() = 0.0
    expect(sequenceMatcherRatio("anna", "meyer")).toBeCloseTo(0.0, 4);
  });

  it("matches Python for single character difference", () => {
    // Python: SequenceMatcher(None, "abcdef", "abcxef").ratio() ≈ 0.8333
    expect(sequenceMatcherRatio("abcdef", "abcxef")).toBeCloseTo(0.8333, 3);
  });

  it("matches Python for 'tristan wolter' vs 'tristan wolter'", () => {
    expect(
      sequenceMatcherRatio("tristan wolter", "tristan wolter"),
    ).toBeCloseTo(1.0, 4);
  });

  it("matches Python for 'muller' vs 'mueller'", () => {
    // Python: SequenceMatcher(None, "muller", "mueller").ratio() ≈ 0.9231
    expect(sequenceMatcherRatio("muller", "mueller")).toBeCloseTo(0.9231, 3);
  });
});
