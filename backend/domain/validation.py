from __future__ import annotations

from dataclasses import dataclass

from backend.domain.enums import Division, Gender
from backend.domain.models import Couple, EntryResult, Person, RaceEntry, RaceEvent


class ValidationError(ValueError):
    """Raised when domain data does not satisfy invariants."""


@dataclass(frozen=True)
class DivisionEligibility:
    individual_allowed_genders: dict[Division, set[Gender]]

    @staticmethod
    def default() -> DivisionEligibility:
        return DivisionEligibility(
            individual_allowed_genders={
                Division.MEN: {Gender.M},
                Division.WOMEN: {Gender.F},
            }
        )


def validate_person(person: Person) -> None:
    if not person.name.strip():
        raise ValidationError("Person.name is required.")
    if person.yob <= 0:
        raise ValidationError("Person.yob must be a positive integer.")


def validate_couple(couple: Couple) -> None:
    validate_person(couple.member_a)
    validate_person(couple.member_b)
    if couple.member_a.uid == couple.member_b.uid:
        raise ValidationError("Couple must contain two different members.")


def validate_result(result: EntryResult) -> None:
    if result.distance_km < 0:
        raise ValidationError("EntryResult.distance_km must be non-negative.")
    if result.points < 0:
        raise ValidationError("EntryResult.points must be non-negative.")


def validate_entry_category_compatibility(
    entry: RaceEntry,
    division: Division,
    person_by_uid: dict[str, Person],
    couple_by_uid: dict[str, Couple],
    eligibility: DivisionEligibility,
) -> None:
    validate_result(entry.result)

    is_individual_division = division in {Division.MEN, Division.WOMEN}
    is_couple_division = division in {Division.COUPLES_MEN, Division.COUPLES_WOMEN, Division.COUPLES_MIXED}

    if is_individual_division:
        if entry.participant_uid is None or entry.team_uid is not None:
            raise ValidationError("Individual division entries must reference participant_uid only.")
        person = person_by_uid.get(entry.participant_uid)
        if person is None:
            raise ValidationError("Entry references unknown participant_uid.")
        allowed = eligibility.individual_allowed_genders.get(division, set())
        if person.gender not in allowed:
            raise ValidationError(f"Gender {person.gender.value} is not eligible for division {division.value}.")
    elif is_couple_division:
        if entry.team_uid is None or entry.participant_uid is not None:
            raise ValidationError("Couple division entries must reference team_uid only.")
        couple = couple_by_uid.get(entry.team_uid)
        if couple is None:
            raise ValidationError("Entry references unknown team_uid.")
        genders = {couple.member_a.gender, couple.member_b.gender}
        if division == Division.COUPLES_MEN and genders != {Gender.M}:
            raise ValidationError("couples_men division requires M+M.")
        if division == Division.COUPLES_WOMEN and genders != {Gender.F}:
            raise ValidationError("couples_women division requires F+F.")
        if division == Division.COUPLES_MIXED and genders != {Gender.M, Gender.F}:
            raise ValidationError("couples_mixed division requires M+F.")
    else:
        raise ValidationError(f"Unsupported division: {division.value}")


def validate_race_event(
    event: RaceEvent,
    person_by_uid: dict[str, Person],
    couple_by_uid: dict[str, Couple],
    eligibility: DivisionEligibility,
) -> None:
    for entry in event.entries:
        validate_entry_category_compatibility(
            entry=entry,
            division=event.category.division,
            person_by_uid=person_by_uid,
            couple_by_uid=couple_by_uid,
            eligibility=eligibility,
        )
