from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

# Extensible title list (lowercase, punctuation normalized by caller)
KNOWN_TITLES: frozenset[str] = frozenset(
    {
        "dr",
        "dr.",
        "prof",
        "prof.",
        "dipl",
        "dipl.",
        "ing",
        "ing.",
        "med",
        "med.",
    }
)


def strip_diacritics(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def normalize_whitespace(value: str) -> str:
    return " ".join(value.strip().split())


def normalize_club(value: str | None) -> str:
    if value is None:
        return ""
    cleaned = strip_diacritics(value.strip().lower())
    cleaned = re.sub(r"[^\w\s\-.]", " ", cleaned, flags=re.UNICODE)
    return " ".join(cleaned.split())


def normalize_token(value: str) -> str:
    cleaned = strip_diacritics(value.strip().lower())
    cleaned = re.sub(r"[^\w\-]", "", cleaned, flags=re.UNICODE)
    return cleaned


@dataclass(frozen=True)
class ParsedName:
    """Canonical name parts for matching."""

    given: str
    family: str
    tokens: tuple[str, ...]
    display_compact: str


def _strip_leading_titles(tokens: list[str]) -> list[str]:
    out = list(tokens)
    title_bases = {x.rstrip(".") for x in KNOWN_TITLES}
    while out:
        t = out[0].lower().rstrip(".")
        if t in title_bases:
            out.pop(0)
            continue
        break
    return out


def parse_person_name(raw: str) -> ParsedName:
    """Split a display name into given/family with title stripping and delimiter handling."""
    raw_clean = normalize_whitespace(raw)
    if not raw_clean:
        return ParsedName(given="", family="", tokens=tuple(), display_compact="")

    if "," in raw_clean:
        left, right = raw_clean.split(",", 1)
        family = normalize_token(left)
        rest = _strip_leading_titles([normalize_token(p) for p in right.split() if p.strip()])
        given = " ".join(rest)
    else:
        parts = [normalize_token(p) for p in raw_clean.split() if p.strip()]
        parts = _strip_leading_titles(parts)
        if not parts:
            return ParsedName(given="", family="", tokens=tuple(), display_compact="")
        if len(parts) == 1:
            given, family = "", parts[0]
        else:
            family = parts[-1]
            given = " ".join(parts[:-1])

    token_list = [t for t in (*given.split(), family) if t]
    tokens = tuple(sorted(set(token_list)))
    display_compact = " ".join(segment for segment in [given, family] if segment).strip()
    return ParsedName(given=given, family=family, tokens=tokens, display_compact=display_compact or raw_clean.lower())
