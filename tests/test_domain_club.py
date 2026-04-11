from __future__ import annotations

import unittest

from backend.domain.club import optional_club_composite_from_field, optional_club_from_cell
from backend.domain.enums import Gender
from backend.domain.identity import person_with_updated_identity
from backend.domain.models import Person


class TestOptionalClubFromCell(unittest.TestCase):
    def test_empty_and_whitespace_are_none(self) -> None:
        self.assertIsNone(optional_club_from_cell(None))
        self.assertIsNone(optional_club_from_cell(""))
        self.assertIsNone(optional_club_from_cell("   "))

    def test_punctuation_only_are_none(self) -> None:
        self.assertIsNone(optional_club_from_cell("-"))
        self.assertIsNone(optional_club_from_cell("'-"))
        self.assertIsNone(optional_club_from_cell("\u2013"))  # en dash
        self.assertIsNone(optional_club_from_cell("..."))
        self.assertIsNone(optional_club_from_cell("___"))
        self.assertIsNone(optional_club_from_cell(" - / . "))

    def test_real_clubs_kept_stripped(self) -> None:
        self.assertEqual(optional_club_from_cell("TSV"), "TSV")
        self.assertEqual(optional_club_from_cell("  TSV  "), "TSV")
        self.assertEqual(optional_club_from_cell("1. FC"), "1. FC")

    def test_mixed_punctuation_with_letters_kept(self) -> None:
        self.assertEqual(optional_club_from_cell("TSV (Nord)"), "TSV (Nord)")

    def test_composite_normalizes_each_segment(self) -> None:
        self.assertIsNone(optional_club_composite_from_field("- / -"))
        self.assertEqual(optional_club_composite_from_field("TSV / '-"), "TSV / ")
        self.assertEqual(optional_club_composite_from_field("A / B"), "A / B")


class TestPersonWithUpdatedIdentityClub(unittest.TestCase):
    def test_junk_club_becomes_none_and_empty_normalized(self) -> None:
        p = Person(name="A", yob=1990, gender=Gender.M, club="X", club_normalized="x")
        out = person_with_updated_identity(person=p, name="A", yob=1990, club="'-")
        self.assertIsNone(out.club)
        self.assertEqual(out.club_normalized, "")
