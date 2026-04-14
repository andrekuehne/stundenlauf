import { normalizeClub, normalizeWhitespace, parsePersonName } from "@/lib/normalization.ts";

const NAME_KEY_SEPARATOR = "|";

function normalizeNameKey(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  return value.trim();
}

function nameKeyFromParsed(parsed: ReturnType<typeof parsePersonName>): string {
  return parsed.tokens.length > 0
    ? [...parsed.tokens].sort().join(NAME_KEY_SEPARATOR)
    : parsed.display_compact;
}

export function formatPersonDisplayName(givenName: string, familyName: string): string {
  const given = normalizeWhitespace(givenName);
  const family = normalizeWhitespace(familyName);
  return [given, family].filter((part) => part !== "").join(" ").trim();
}

export function normalizedNameKeyFromDisplay(displayName: string): string {
  return nameKeyFromParsed(parsePersonName(displayName));
}

export function canonicalizePersonNames(input: {
  given_name: string;
  family_name: string;
  display_name?: string;
  name_normalized?: string;
}): {
  given_name: string;
  family_name: string;
  display_name: string;
  name_normalized: string;
} {
  const givenName = normalizeWhitespace(input.given_name);
  const familyName = normalizeWhitespace(input.family_name);
  const displayFromParts = formatPersonDisplayName(givenName, familyName);
  const displayName = normalizeWhitespace(input.display_name ?? displayFromParts);
  const derivedKey = normalizedNameKeyFromDisplay(displayFromParts);
  const explicitKey = normalizeNameKey(input.name_normalized);
  return {
    given_name: givenName,
    family_name: familyName,
    display_name: displayName,
    name_normalized: explicitKey ?? derivedKey,
  };
}

export function validatePersonNameConsistency(input: {
  given_name: string;
  family_name: string;
  display_name: string;
  name_normalized: string;
}): string[] {
  const displayFromParts = formatPersonDisplayName(input.given_name, input.family_name);
  const splitKey = normalizedNameKeyFromDisplay(displayFromParts);
  const displayKey = normalizedNameKeyFromDisplay(input.display_name);
  const storedKey = normalizeNameKey(input.name_normalized) ?? "";
  const errors: string[] = [];

  if (splitKey !== displayKey) {
    errors.push(
      "Person name fields are inconsistent: display_name must normalize to the same key as given_name/family_name",
    );
  }
  if (storedKey !== splitKey) {
    errors.push(
      "Person name fields are inconsistent: name_normalized must match normalized key from given_name/family_name",
    );
  }
  return errors;
}

export function canonicalizeClub(input: {
  club: string | null;
  club_normalized?: string;
}): {
  club: string | null;
  club_normalized: string;
} {
  const club = input.club == null ? null : normalizeWhitespace(input.club);
  return {
    club,
    club_normalized: normalizeClub(club),
  };
}

export function validateClubConsistency(input: {
  club: string | null;
  club_normalized: string;
}): string[] {
  const expected = normalizeClub(input.club);
  if (expected !== input.club_normalized) {
    return [
      `Person club fields are inconsistent: club_normalized must equal normalizeClub(club), expected "${expected}"`,
    ];
  }
  return [];
}
