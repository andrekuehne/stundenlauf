"""Unit tests for import review display hints (granular diffs + couple alignment)."""

from __future__ import annotations

import unittest

from backend.domain.enums import Gender
from backend.domain.models import Person
from backend.matching.review_display import (
    align_couple_members_for_display,
    build_candidate_review_display,
    field_highlights_for_person_line,
    split_display_name_parts,
)


class TestSplitDisplayNameParts(unittest.TestCase):
    def test_comma_order(self) -> None:
        given, family = split_display_name_parts("Mustermann, Max")
        self.assertEqual(family, "Mustermann")
        self.assertEqual(given, "Max")

    def test_whitespace_order(self) -> None:
        given, family = split_display_name_parts("Max Mustermann")
        self.assertEqual(given, "Max")
        self.assertEqual(family, "Mustermann")

    def test_title_stripped_from_given(self) -> None:
        given, family = split_display_name_parts("Meier, Dr. Anna")
        self.assertEqual(family, "Meier")
        self.assertEqual(given, "Anna")


class TestFieldHighlights(unittest.TestCase):
    def test_only_family_differs(self) -> None:
        h = field_highlights_for_person_line(
            "Max Mustermann",
            1990,
            "TSV",
            "Max Meier",
            1990,
            "TSV",
        )
        segs = h["name_segments"]
        self.assertEqual(len(segs), 3)
        self.assertFalse(segs[0]["diff"])
        self.assertTrue(segs[2]["diff"])

    def test_yob_diff_only_when_both_present(self) -> None:
        h = field_highlights_for_person_line("A B", 0, None, "A B", 1990, None)
        self.assertFalse(h["yob"]["diff"])
        h2 = field_highlights_for_person_line("A B", 1990, None, "A B", 1991, None)
        self.assertTrue(h2["yob"]["diff"])


class TestCoupleAlignment(unittest.TestCase):
    def test_swaps_when_incoming_order_opposite(self) -> None:
        incoming = {
            "kind": "team",
            "display_name": "Alice Smith / Bob Jones",
            "yob": "1990 / 1992",
            "club": "ClubA / ClubB",
        }
        bob = Person(
            name="Bob Jones",
            yob=1992,
            gender=Gender.M,
            club="ClubB",
            canonical_given="bob",
            canonical_family="jones",
            club_normalized="clubb",
        )
        alice = Person(
            name="Alice Smith",
            yob=1990,
            gender=Gender.F,
            club="ClubA",
            canonical_given="alice",
            canonical_family="smith",
            club_normalized="cluba",
        )
        swapped, ordered = align_couple_members_for_display(incoming, bob, alice)
        self.assertTrue(swapped)
        self.assertEqual(ordered[0].name, "Alice Smith")
        self.assertEqual(ordered[1].name, "Bob Jones")


class TestBuildCandidateReviewDisplay(unittest.TestCase):
    def test_team_display_and_highlights(self) -> None:
        entry = {
            "kind": "team",
            "display_name": "Max Mustermann / Anna Schmidt",
            "yob": "1988 / 1990",
            "club": "TSV Nord / TSV Süd",
        }
        cand = {
            "kind": "team",
            "uid": "team_x",
            "display_name": "Max Mustermann / Anna Schmidt",
            "yob": "1988 / 1990",
            "club": "TSV Nord / TSV Süd",
            "member_a": {
                "uid": "p1",
                "name": "Max Mustermann",
                "yob": 1988,
                "gender": "M",
                "club": "TSV Nord",
                "canonical_given": "max",
                "canonical_family": "mustermann",
                "club_normalized": "tsv nord",
            },
            "member_b": {
                "uid": "p2",
                "name": "Anna Schmidt",
                "yob": 1990,
                "gender": "F",
                "club": "TSV Süd",
                "canonical_given": "anna",
                "canonical_family": "schmidt",
                "club_normalized": "tsv sud",
            },
        }
        out = build_candidate_review_display(entry, cand)
        self.assertEqual(out["kind"], "team")
        self.assertFalse(out["member_order_swapped"])
        self.assertEqual(len(out["lines"]), 2)
        for line in out["lines"]:
            for seg in line["name_segments"]:
                self.assertFalse(seg["diff"])
            self.assertFalse(line["yob"]["diff"])
            self.assertFalse(line["club"]["diff"])

    def test_participant_granular(self) -> None:
        entry = {"kind": "participant", "display_name": "Max Mustermann", "yob": 1990, "club": "TSV"}
        cand = {
            "kind": "participant",
            "uid": "p1",
            "display_name": "Max Meier",
            "yob": 1990,
            "club": "TSV",
        }
        out = build_candidate_review_display(entry, cand)
        self.assertEqual(out["kind"], "participant")
        self.assertEqual(len(out["lines"]), 1)
        self.assertTrue(any(seg["diff"] for seg in out["lines"][0]["name_segments"] if seg["text"].strip()))


if __name__ == "__main__":
    unittest.main()
