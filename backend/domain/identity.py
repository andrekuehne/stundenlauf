from __future__ import annotations

from backend.domain.models import Couple, Person


def normalize_name(value: str) -> str:
    return " ".join(value.strip().lower().split())


def normalize_club(value: str | None) -> str:
    if value is None:
        return ""
    return " ".join(value.strip().lower().split())


def person_key(person: Person) -> str:
    return "|".join(
        [
            normalize_name(person.name),
            str(person.yob),
            person.gender.value,
            normalize_club(person.club),
        ]
    )


def couple_key(couple: Couple) -> str:
    keys = sorted([person_key(couple.member_a), person_key(couple.member_b)])
    return "||".join(keys)
