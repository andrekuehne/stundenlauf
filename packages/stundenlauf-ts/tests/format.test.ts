import { describe, it, expect } from "vitest";
import {
  confidenceLabel,
  formatKm,
  reviewConfidenceText,
  reviewOpenCount,
  seasonLabel,
} from "@/format.ts";

describe("formatKm", () => {
  it("formats kilometer values with German decimal comma and three decimals", () => {
    expect(formatKm(12.3452)).toBe("12,345");
  });

  it("formats zero", () => {
    expect(formatKm(0)).toBe("0,000");
  });

  it("returns String(value) for non-finite numbers", () => {
    expect(formatKm(Number.NaN)).toBe("NaN");
  });
});

describe("seasonLabel", () => {
  it("formats the season label", () => {
    expect(seasonLabel(2026)).toBe("Saison: 2026");
  });
});

describe("reviewOpenCount", () => {
  it("formats open review count", () => {
    expect(reviewOpenCount(3)).toBe("Prüfungen offen: 3");
  });

  it("guards against negative values", () => {
    expect(reviewOpenCount(-5)).toBe("Prüfungen offen: 0");
  });
});

describe("confidence helpers", () => {
  it("returns the configured confidence label", () => {
    expect(confidenceLabel("high")).toBe("hoch");
  });

  it("formats text-only confidence message", () => {
    expect(reviewConfidenceText("medium", 74.7)).toBe("Treffersicherheit: mittel (75%).");
  });
});
