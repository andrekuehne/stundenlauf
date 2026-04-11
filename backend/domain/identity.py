"""Domain identity helpers: couple keys and canonical participant fields."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime

from backend.domain.club import optional_club_from_cell
from backend.domain.models import Couple, Person
from backend.matching.normalize import normalize_club, parse_person_name


def couple_key(couple: Couple) -> str:
    """Stable key for a pair of members, independent of member_a/member_b order."""
    return "|".join(sorted((couple.member_a.uid, couple.member_b.uid)))


def yob_bounds() -> tuple[int, int]:
    y = datetime.now(UTC).year
    return 1900, y + 1


def person_with_updated_identity(*, person: Person, name: str, yob: int, club: str | None) -> Person:
    """Rebuild derived name/club fields; preserves uid and gender."""
    trimmed = name.strip()
    parsed = parse_person_name(trimmed)
    club_value = optional_club_from_cell(club)
    club_norm = normalize_club(club_value)
    return replace(
        person,
        name=trimmed,
        yob=yob,
        club=club_value,
        canonical_given=parsed.given,
        canonical_family=parsed.family,
        club_normalized=club_norm,
    )
