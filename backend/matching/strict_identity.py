"""Strict normalized identity equality for optional auto-link-only mode."""

from __future__ import annotations

from backend.domain.enums import Gender
from backend.domain.models import Couple, Person
from backend.ingestion.types import ImportRowCouples
from backend.matching.decisions import name_key
from backend.matching.normalize import ParsedName, normalize_club, parse_person_name


def person_club_norm(person: Person) -> str:
    return (person.club_normalized or normalize_club(person.club) or "").strip()


def stored_person_name_key(person: Person) -> str:
    """Same name pipeline as incoming rows: parse display `person.name`."""
    return name_key(parse_person_name(person.name.strip()))


def strict_yob_equal(incoming_yob: int, person_yob: int) -> bool:
    """YOB must match exactly (0 vs non-zero does not match)."""
    return int(incoming_yob) == int(person_yob)


def person_matches_strict_incoming(
    *,
    incoming_parsed: ParsedName,
    incoming_yob: int,
    incoming_club_norm: str,
    gender: Gender,
    person: Person,
) -> bool:
    if person.gender != gender:
        return False
    if not strict_yob_equal(incoming_yob, person.yob):
        return False
    if name_key(incoming_parsed) != stored_person_name_key(person):
        return False
    inc_club = (incoming_club_norm or "").strip()
    return inc_club == person_club_norm(person)


def _member_strict_tuple(person: Person) -> tuple[str, int, str, str]:
    """name_key, yob, club_norm, gender.value for multiset compare."""
    return (stored_person_name_key(person), int(person.yob), person_club_norm(person), person.gender.value)


def couple_matches_strict_row(
    row: ImportRowCouples,
    *,
    gender_a: Gender,
    gender_b: Gender,
    couple: Couple,
) -> bool:
    """Order-insensitive equality of both members' normalized identity."""
    pa = parse_person_name(row.name_a)
    pb = parse_person_name(row.name_b)
    ca = normalize_club(row.club_a) or ""
    cb = normalize_club(row.club_b) or ""
    ga = gender_a.value
    gb = gender_b.value
    incoming = sorted(
        [
            (name_key(pa), int(row.yob_a), ca.strip(), ga),
            (name_key(pb), int(row.yob_b), cb.strip(), gb),
        ]
    )
    stored = sorted([_member_strict_tuple(couple.member_a), _member_strict_tuple(couple.member_b)])
    return incoming == stored
