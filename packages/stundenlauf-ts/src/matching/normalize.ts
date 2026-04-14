/**
 * Name parsing and normalization for participant matching.
 *
 * Direct port of backend/matching/normalize.py.
 * Reference: F-TS03 §1 (Name Parsing and Normalization)
 */

import type { ParsedName } from "./types.ts";

export type { ParsedName };

const KNOWN_TITLE_BASES = new Set([
  "dr",
  "prof",
  "dipl",
  "ing",
  "med",
]);

function nameKeyFromParsed(parsed: ParsedName): string {
  return parsed.tokens.length > 0
    ? [...parsed.tokens].sort().join("|")
    : parsed.display_compact;
}

export function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

export function normalizeWhitespace(value: string): string {
  return value.trim().split(/\s+/).join(" ");
}

export function normalizeClub(value: string | null): string {
  if (value == null || value.trim() === "") return "";
  let cleaned = stripDiacritics(value.trim().toLowerCase());
  // Python: re.sub(r"[^\w\s\-.]", " ", cleaned, flags=re.UNICODE)
  // JS \w is ASCII-only; use Unicode-aware character classes
  cleaned = cleaned.replace(/[^\p{L}\p{N}_\s\-.]/gu, " ");
  return cleaned.split(/\s+/).join(" ").trim();
}

export function normalizeToken(value: string): string {
  let cleaned = stripDiacritics(value.trim().toLowerCase());
  // Python: re.sub(r"[^\w\-]", "", cleaned, flags=re.UNICODE)
  cleaned = cleaned.replace(/[^\p{L}\p{N}_-]/gu, "");
  return cleaned;
}

function stripLeadingTitles(tokens: string[]): string[] {
  const out = [...tokens];
  while (out.length > 0) {
    const first = out[0];
    if (first === undefined) break;
    const t = first.toLowerCase().replace(/\.$/, "");
    if (KNOWN_TITLE_BASES.has(t)) {
      out.shift();
      continue;
    }
    break;
  }
  return out;
}

function titleWordBase(word: string): string {
  return word.toLowerCase().replace(/\.$/, "");
}

function isTitleWord(word: string): boolean {
  return KNOWN_TITLE_BASES.has(titleWordBase(word));
}

export function splitDisplayNameParts(raw: string): [string, string] {
  const rawClean = normalizeWhitespace(raw);
  if (!rawClean) return ["", ""];

  if (rawClean.includes(",")) {
    const parts = rawClean.split(",", 2);
    const leftPart = parts[0] ?? "";
    const rightPart = parts[1] ?? "";
    const familyDisplay = leftPart.trim();
    const words = rightPart.trim().split(/\s+/);
    while (words.length > 0) {
      const first = words[0];
      if (first === undefined || !isTitleWord(first)) break;
      words.shift();
    }
    return [words.join(" "), familyDisplay];
  }

  const words = rawClean.split(/\s+/);
  while (words.length > 0) {
    const first = words[0];
    if (first === undefined || !isTitleWord(first)) break;
    words.shift();
  }
  if (words.length === 0) return ["", ""];
  if (words.length === 1) return ["", words[0] ?? ""];
  return [words.slice(0, -1).join(" "), words.at(-1) ?? ""];
}

export function canonicalPersonIdentityFromIncoming(raw: string): {
  given_name: string;
  family_name: string;
  display_name: string;
  name_normalized: string;
} {
  const display = normalizeWhitespace(raw);
  const [given, family] = splitDisplayNameParts(display);
  const parsed = parsePersonName(display);
  return {
    given_name: given,
    family_name: family,
    display_name: display,
    name_normalized: nameKeyFromParsed(parsed),
  };
}

export function parsePersonName(raw: string): ParsedName {
  const rawClean = normalizeWhitespace(raw);
  if (!rawClean) {
    return { given: "", family: "", tokens: [], display_compact: "" };
  }

  let given: string;
  let family: string;

  if (rawClean.includes(",")) {
    const commaIdx = rawClean.indexOf(",");
    const left = rawClean.slice(0, commaIdx);
    const right = rawClean.slice(commaIdx + 1);
    family = normalizeToken(left);
    const rightTokens = right
      .split(/\s+/)
      .filter((p) => p.trim() !== "")
      .map(normalizeToken);
    const stripped = stripLeadingTitles(rightTokens);
    given = stripped.join(" ");
  } else {
    let parts = rawClean
      .split(/\s+/)
      .filter((p) => p.trim() !== "")
      .map(normalizeToken);
    parts = stripLeadingTitles(parts);
    if (parts.length === 0) {
      return { given: "", family: "", tokens: [], display_compact: "" };
    }
    if (parts.length === 1) {
      given = "";
      family = parts[0] ?? "";
    } else {
      family = parts.at(-1) ?? "";
      given = parts.slice(0, -1).join(" ");
    }
  }

  const tokenList = [...given.split(/\s+/), family].filter((t) => t !== "");
  const tokens = [...new Set(tokenList)].sort();
  const displayCompact =
    [given, family].filter((s) => s !== "").join(" ").trim() ||
    rawClean.toLowerCase();
  return { given, family, tokens, display_compact: displayCompact };
}
