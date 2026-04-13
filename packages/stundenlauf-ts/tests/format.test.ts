import { describe, it, expect } from "vitest";
import { formatKm } from "@/format.ts";

describe("formatKm", () => {
  it("formats meters as German km with two decimals", () => {
    expect(formatKm(12345)).toBe("12,35");
  });

  it("formats zero", () => {
    expect(formatKm(0)).toBe("0,00");
  });
});
