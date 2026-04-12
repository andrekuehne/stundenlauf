"""Tests for strict normalized identity matching helpers."""

from __future__ import annotations

import typing
import unittest

from backend.domain.enums import Division, Gender, RaceDuration
from backend.domain.models import Couple, Person, ProjectDocument
from backend.ingestion.types import ImportRaceContext, ImportRowCouples, ImportRowSingles, ParsedSectionSingles
from backend.matching.config import MatchingConfig
from backend.matching.decisions import name_key
from backend.matching.normalize import parse_person_name
from backend.matching.strict_identity import (
    couple_matches_strict_row,
    person_matches_strict_incoming,
    strict_yob_equal,
)
from backend.matching.workflow import process_singles_section
from backend.storage.schema_v2 import SCHEMA_VERSION_V2


class TestStrictIdentityHelpers(unittest.TestCase):
    def test_name_key_stable_for_same_parse(self) -> None:
        a = parse_person_name("Hans Müller")
        self.assertEqual(name_key(a), name_key(parse_person_name("Hans Müller")))

    def test_strict_yob_equal(self) -> None:
        self.assertTrue(strict_yob_equal(1990, 1990))
        self.assertTrue(strict_yob_equal(0, 0))
        self.assertFalse(strict_yob_equal(0, 1990))
        self.assertFalse(strict_yob_equal(1990, 0))

    def test_person_matches_strict_incoming_positive(self) -> None:
        parsed = parse_person_name("Anna Schmidt")
        p = Person(
            name="Anna Schmidt",
            yob=1988,
            gender=Gender.F,
            club="TSV",
            canonical_given="Anna",
            canonical_family="Schmidt",
            club_normalized="tsv",
        )
        self.assertTrue(
            person_matches_strict_incoming(
                incoming_parsed=parsed,
                incoming_yob=1988,
                incoming_club_norm="tsv",
                gender=Gender.F,
                person=p,
            )
        )

    def test_person_matches_strict_incoming_name_diff(self) -> None:
        parsed = parse_person_name("Anna Schmidt")
        p = Person(
            name="Anna Schmidta",
            yob=1988,
            gender=Gender.F,
            club="TSV",
            canonical_given="Anna",
            canonical_family="Schmidta",
            club_normalized="tsv",
        )
        self.assertFalse(
            person_matches_strict_incoming(
                incoming_parsed=parsed,
                incoming_yob=1988,
                incoming_club_norm="tsv",
                gender=Gender.F,
                person=p,
            )
        )

    def test_person_matches_strict_incoming_club_diff(self) -> None:
        parsed = parse_person_name("Anna Schmidt")
        p = Person(
            name="Anna Schmidt",
            yob=1988,
            gender=Gender.F,
            club="TSV",
            canonical_given="Anna",
            canonical_family="Schmidt",
            club_normalized="tsv",
        )
        self.assertFalse(
            person_matches_strict_incoming(
                incoming_parsed=parsed,
                incoming_yob=1988,
                incoming_club_norm="other",
                gender=Gender.F,
                person=p,
            )
        )

    def test_couple_matches_strict_row_order_insensitive(self) -> None:
        row = ImportRowCouples(
            startnr="1",
            name_a="Alex Beispiel",
            yob_a=1987,
            club_a="TSV",
            name_b="Sina Beispiel",
            yob_b=1992,
            club_b="TSV",
            distance_km=10.0,
            points=20.0,
        )
        team = Couple(
            member_a=Person(
                name="Sina Beispiel",
                yob=1992,
                gender=Gender.F,
                club="TSV",
                canonical_given="Sina",
                canonical_family="Beispiel",
                club_normalized="tsv",
            ),
            member_b=Person(
                name="Alex Beispiel",
                yob=1987,
                gender=Gender.M,
                club="TSV",
                canonical_given="Alex",
                canonical_family="Beispiel",
                club_normalized="tsv",
            ),
        )
        self.assertTrue(couple_matches_strict_row(row, gender_a=Gender.M, gender_b=Gender.F, couple=team))

    def test_couple_matches_strict_row_negative(self) -> None:
        row = ImportRowCouples(
            startnr="1",
            name_a="Alex Beispiel",
            yob_a=1987,
            club_a="TSV",
            name_b="Sina Beispiel",
            yob_b=1992,
            club_b="TSV",
            distance_km=10.0,
            points=20.0,
        )
        team = Couple(
            member_a=Person(
                name="Alex Beispiel",
                yob=1987,
                gender=Gender.M,
                club="TSV",
                canonical_given="Alex",
                canonical_family="Beispiel",
                club_normalized="tsv",
            ),
            member_b=Person(
                name="Sina Beispiel",
                yob=1992,
                gender=Gender.F,
                club="TSV",
                canonical_given="Sina",
                canonical_family="Beispiel",
                club_normalized="other",
            ),
        )
        self.assertFalse(couple_matches_strict_row(row, gender_a=Gender.M, gender_b=Gender.F, couple=team))


class TestStrictWorkflowIntegration(unittest.TestCase):
    _SOURCE_META: typing.ClassVar[dict[str, str]] = {
        "source_file": "t.xlsx",
        "source_sha256": "sha",
        "imported_at": "2026-01-01T12:00:00+00:00",
        "parser_version": "v1",
        "schema_fingerprint": "fp",
    }

    def _anna(self) -> Person:
        p = parse_person_name("Anna Schmidt")
        return Person(
            name="Anna Schmidt",
            yob=1988,
            gender=Gender.F,
            club="TSV",
            canonical_given=p.given,
            canonical_family=p.family,
            club_normalized="tsv",
        )

    def test_strict_mode_exact_file_auto_links(self) -> None:
        anna = self._anna()
        doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(anna,))
        row = ImportRowSingles(
            startnr="1",
            name="Anna Schmidt",
            yob=1988,
            club="TSV",
            distance_km=10.0,
            points=20.0,
        )
        section = ParsedSectionSingles(
            context=ImportRaceContext(
                series_year=2026,
                race_no=1,
                duration=RaceDuration.HOUR,
                division=Division.WOMEN,
            ),
            rows=(row,),
        )
        cfg = MatchingConfig(strict_normalized_auto_only=True, auto_min=0.88)
        new_doc, _report = process_singles_section(doc, section, self._SOURCE_META, cfg)
        entry = new_doc.events[-1].entries[0]
        self.assertEqual(entry.match_meta.route, "auto")
        self.assertEqual(entry.participant_uid, anna.uid)
        self.assertEqual(entry.match_meta.features.get("strict_identity_auto"), 1.0)

    def test_strict_mode_typo_forces_review_not_auto(self) -> None:
        anna = self._anna()
        doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(anna,))
        row = ImportRowSingles(
            startnr="1",
            name="Anna Schmidta",
            yob=1988,
            club="TSV",
            distance_km=10.0,
            points=20.0,
        )
        section = ParsedSectionSingles(
            context=ImportRaceContext(
                series_year=2026,
                race_no=1,
                duration=RaceDuration.HOUR,
                division=Division.WOMEN,
            ),
            rows=(row,),
        )
        cfg = MatchingConfig(strict_normalized_auto_only=True, auto_min=0.88)
        new_doc, _report = process_singles_section(doc, section, self._SOURCE_META, cfg)
        entry = new_doc.events[-1].entries[0]
        self.assertEqual(entry.match_meta.route, "review")
        self.assertEqual(entry.participant_uid, anna.uid)


if __name__ == "__main__":
    unittest.main()
