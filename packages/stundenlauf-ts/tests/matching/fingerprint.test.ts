import { describe, expect, it } from "vitest";
import {
  identityFingerprint,
  nameKey,
  teamFingerprint,
} from "@/matching/fingerprint.ts";
import { parsePersonName } from "@/matching/normalize.ts";

describe("nameKey", () => {
  it("joins sorted tokens with pipe", () => {
    const parsed = parsePersonName("Anna Meyer");
    expect(nameKey(parsed)).toBe("anna|meyer");
  });

  it("is stable for same parse", () => {
    const a = parsePersonName("Hans Müller");
    const b = parsePersonName("Hans Müller");
    expect(nameKey(a)).toBe(nameKey(b));
  });

  it("falls back to display_compact for no tokens", () => {
    expect(nameKey({ given: "", family: "", tokens: [], display_compact: "test" })).toBe("test");
  });

  it("produces sorted tokens regardless of input order", () => {
    const a = parsePersonName("Anna Meyer");
    const b = parsePersonName("Meyer Anna");
    expect(nameKey(a)).toBe(nameKey(b));
  });
});

describe("identityFingerprint", () => {
  it("produces a hex string of 64 chars (SHA-256)", async () => {
    const parsed = parsePersonName("Anna Meyer");
    const fp = await identityFingerprint(parsed, 1990, "F");
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for same inputs", async () => {
    const parsed = parsePersonName("Anna Meyer");
    const fp1 = await identityFingerprint(parsed, 1990, "F");
    const fp2 = await identityFingerprint(parsed, 1990, "F");
    expect(fp1).toBe(fp2);
  });

  it("differs for different YOB", async () => {
    const parsed = parsePersonName("Anna Meyer");
    const fp1 = await identityFingerprint(parsed, 1990, "F");
    const fp2 = await identityFingerprint(parsed, 1991, "F");
    expect(fp1).not.toBe(fp2);
  });

  it("differs for different gender", async () => {
    const parsed = parsePersonName("Anna Meyer");
    const fp1 = await identityFingerprint(parsed, 1990, "F");
    const fp2 = await identityFingerprint(parsed, 1990, "M");
    expect(fp1).not.toBe(fp2);
  });

  it("swapped name tokens produce same fingerprint", async () => {
    const a = parsePersonName("Anna Meyer");
    const b = parsePersonName("Meyer Anna");
    const fpA = await identityFingerprint(a, 1990, "F");
    const fpB = await identityFingerprint(b, 1990, "F");
    expect(fpA).toBe(fpB);
  });
});

describe("teamFingerprint", () => {
  it("is order-insensitive", async () => {
    const a = parsePersonName("Max Mustermann");
    const b = parsePersonName("Eva Beispiel");
    const fp1 = await teamFingerprint(a, 1988, "M", b, 1990, "F");
    const fp2 = await teamFingerprint(b, 1990, "F", a, 1988, "M");
    expect(fp1).toBe(fp2);
  });

  it("produces a 64-char hex string", async () => {
    const a = parsePersonName("Max Mustermann");
    const b = parsePersonName("Eva Beispiel");
    const fp = await teamFingerprint(a, 1988, "M", b, 1990, "F");
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });
});
