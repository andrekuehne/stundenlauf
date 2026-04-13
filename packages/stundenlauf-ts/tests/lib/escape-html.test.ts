import { describe, it, expect } from "vitest";
import { escapeHtml } from "@/lib/escape-html.ts";

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<div>")).toBe("&lt;div&gt;");
  });

  it("escapes quotes", () => {
    expect(escapeHtml('"hello\'')).toBe("&quot;hello&#39;");
  });

  it("returns plain strings unchanged", () => {
    expect(escapeHtml("Müller")).toBe("Müller");
  });
});
