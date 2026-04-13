/**
 * Identity fingerprinting for participant/team matching.
 * Deterministic hash keys used for replay lookup.
 *
 * Direct port of backend/matching/decisions.py (nameKey, identity_fingerprint, team_fingerprint).
 * Reference: F-TS03 §2 (Identity Fingerprinting)
 */

import type { Gender } from "@/domain/types.ts";
import type { ParsedName } from "./types.ts";

export function nameKey(parsed: ParsedName): string {
  return parsed.tokens.length > 0
    ? [...parsed.tokens].sort().join("|")
    : parsed.display_compact;
}

async function sha256hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function identityFingerprint(
  parsed: ParsedName,
  yob: number,
  gender: Gender,
): Promise<string> {
  const tokenPart = nameKey(parsed);
  const key = `${tokenPart}|${yob}|${gender}`;
  return sha256hex(key);
}

export async function teamFingerprint(
  parsedA: ParsedName,
  yobA: number,
  genderA: Gender,
  parsedB: ParsedName,
  yobB: number,
  genderB: Gender,
): Promise<string> {
  const m1 = await identityFingerprint(parsedA, yobA, genderA);
  const m2 = await identityFingerprint(parsedB, yobB, genderB);
  const pairKey = [m1, m2].sort().join("|");
  return sha256hex(pairKey);
}
