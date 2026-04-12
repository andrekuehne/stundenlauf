from __future__ import annotations

import unittest

from backend.domain.enums import Division, Gender, RaceDuration
from backend.domain.identity import couple_key
from backend.domain.models import Couple, EntryResult, Person, RaceEntry, RaceSeriesCategory
from backend.domain.validation import (
    DivisionEligibility,
    ValidationError,
    validate_entry_category_compatibility,
    validate_person,
)


class TestF01Domain(unittest.TestCase):
    def test_person_requires_name_yob_gender(self) -> None:
        with self.assertRaises(ValidationError):
            validate_person(Person(name="", yob=1980, gender=Gender.M))
        with self.assertRaises(ValidationError):
            validate_person(Person(name="A", yob=0, gender=Gender.M))

    def test_person_allows_optional_club(self) -> None:
        person = Person(name="Anna", yob=1990, gender=Gender.F, club=None)
        validate_person(person)

    def test_couple_identity_is_order_insensitive(self) -> None:
        a = Person(uid="participant_a", name="A", yob=1990, gender=Gender.M)
        b = Person(uid="participant_b", name="B", yob=1991, gender=Gender.F)
        first = Couple(uid="team_1", member_a=a, member_b=b)
        second = Couple(uid="team_2", member_a=b, member_b=a)
        self.assertEqual(couple_key(first), couple_key(second))

    def test_couple_with_one_member_changed_is_different_identity(self) -> None:
        a = Person(uid="participant_a", name="A", yob=1990, gender=Gender.M)
        b = Person(uid="participant_b", name="B", yob=1991, gender=Gender.F)
        c = Person(uid="participant_c", name="C", yob=1992, gender=Gender.F)
        self.assertNotEqual(couple_key(Couple(member_a=a, member_b=b)), couple_key(Couple(member_a=a, member_b=c)))

    def test_startnr_not_part_of_person_or_couple_identity(self) -> None:
        person = Person(uid="participant_1", name="Alex", yob=1988, gender=Gender.M)
        person_by_uid = {person.uid: person}
        entry_a = RaceEntry(startnr="12", participant_uid=person.uid, result=EntryResult(1.0, 2.0))
        entry_b = RaceEntry(startnr="99", participant_uid=person.uid, result=EntryResult(2.0, 4.0))
        eligibility = DivisionEligibility.default()
        validate_entry_category_compatibility(entry_a, Division.MEN, person_by_uid, {}, eligibility)
        validate_entry_category_compatibility(entry_b, Division.MEN, person_by_uid, {}, eligibility)

    def test_category_key_separates_year_duration_division(self) -> None:
        men_hour = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.MEN)
        men_half = RaceSeriesCategory(year=2026, duration=RaceDuration.HALF_HOUR, division=Division.MEN)
        self.assertNotEqual(men_hour.key, men_half.key)

    def test_category_validation_rejects_invalid_division_for_entry_type(self) -> None:
        person = Person(uid="participant_1", name="Alex", yob=1988, gender=Gender.M)
        person_by_uid = {person.uid: person}
        entry = RaceEntry(startnr="7", participant_uid=person.uid, result=EntryResult(3.0, 6.0))
        with self.assertRaises(ValidationError):
            validate_entry_category_compatibility(
                entry, Division.COUPLES_MEN, person_by_uid, {}, DivisionEligibility.default()
            )

    def test_distance_and_points_must_be_numeric_and_non_negative(self) -> None:
        person = Person(uid="participant_1", name="Alex", yob=1988, gender=Gender.M)
        entry = RaceEntry(startnr="7", participant_uid=person.uid, result=EntryResult(-1.0, 6.0))
        with self.assertRaises(ValidationError):
            validate_entry_category_compatibility(
                entry,
                Division.MEN,
                {person.uid: person},
                {},
                DivisionEligibility.default(),
            )

    def test_gender_enum_supports_x_but_rules_can_disable_for_specific_divisions(self) -> None:
        person = Person(uid="participant_x", name="Casey", yob=1995, gender=Gender.X)
        eligibility = DivisionEligibility.default()
        entry = RaceEntry(startnr="42", participant_uid=person.uid, result=EntryResult(5.5, 11.0))
        with self.assertRaises(ValidationError):
            validate_entry_category_compatibility(entry, Division.MEN, {person.uid: person}, {}, eligibility)

    def test_mixed_couple_categorization(self) -> None:
        male = Person(uid="participant_m", name="Max", yob=1992, gender=Gender.M)
        female = Person(uid="participant_f", name="Eva", yob=1993, gender=Gender.F)
        team = Couple(uid="team_mixed", member_a=male, member_b=female)
        entry = RaceEntry(startnr="88", team_uid=team.uid, result=EntryResult(8.0, 16.0))
        validate_entry_category_compatibility(
            entry,
            Division.COUPLES_MIXED,
            {},
            {team.uid: team},
            DivisionEligibility.default(),
        )


if __name__ == "__main__":
    unittest.main()
