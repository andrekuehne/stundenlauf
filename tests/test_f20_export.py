from __future__ import annotations

import unittest
from io import BytesIO

from pypdf import PdfReader

from backend.domain.enums import Division, Gender, RaceDuration
from backend.domain.models import (
    EntryResult,
    Person,
    ProjectDocument,
    RaceEntry,
    RaceEvent,
    RaceSeriesCategory,
)
from backend.export.projection import build_export_sections
from backend.export.registry import export_standings_pdf_bytes
from backend.export.resolve import ephemeral_document_with_race_filter, resolve_document_for_export
from backend.export.spec import ExportSpec, RaceFilterSpec
from backend.ranking.engine import recompute_project_standings
from backend.storage.schema_v2 import SCHEMA_VERSION_V2
from backend.ui_api import queries


def _cat() -> RaceSeriesCategory:
    return RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.MEN)


def _ck() -> str:
    return _cat().key


class TestExportSpec(unittest.TestCase):
    def test_unknown_column_raises(self) -> None:
        raw = {
            "format": "pdf",
            "categories": [_ck()],
            "columns": ["not_a_real_column"],
        }
        with self.assertRaises(ValueError):
            ExportSpec.from_dict(raw)


class TestExportProjection(unittest.TestCase):
    def test_minimal_section_shape(self) -> None:
        c = _cat()
        p = Person(uid="p1", name="Anna Müller", yob=1990, gender=Gender.M, club="TSV")
        ev = RaceEvent(
            race_event_uid="r1",
            category=c,
            race_date="2026-01-01",
            race_no=1,
            entries=(RaceEntry(participant_uid="p1", result=EntryResult(distance_km=5.5, points=10.0)),),
        )
        doc = recompute_project_standings(
            ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p,), events=(ev,))
        )
        spec = ExportSpec.from_dict(
            {
                "format": "pdf",
                "categories": [_ck()],
                "columns": ["minimal"],
                "rows": {"eligibility": "eligible_only"},
            }
        )
        sections = build_export_sections(doc, spec)
        self.assertEqual(len(sections), 1)
        sec = sections[0]
        self.assertEqual([c.id for c in sec.columns], ["platz", "display_name", "punkte_gesamt", "distanz_gesamt"])
        self.assertEqual(sec.rows[0][1], "Anna Müller")

    def test_points_per_race_columns(self) -> None:
        c = _cat()
        p = Person(uid="p1", name="A", yob=1990, gender=Gender.M)
        ev1 = RaceEvent(
            race_event_uid="r_a",
            category=c,
            race_date="2026-01-01",
            race_no=1,
            entries=(RaceEntry(participant_uid="p1", result=EntryResult(distance_km=1.0, points=3.0)),),
        )
        ev2 = RaceEvent(
            race_event_uid="r_b",
            category=c,
            race_date="2026-02-01",
            race_no=2,
            entries=(RaceEntry(participant_uid="p1", result=EntryResult(distance_km=2.0, points=7.0)),),
        )
        doc = recompute_project_standings(
            ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p,), events=(ev1, ev2))
        )
        spec = ExportSpec.from_dict(
            {
                "format": "pdf",
                "categories": [_ck()],
                "columns": ["platz", "display_name", "points_per_race"],
            }
        )
        sections = build_export_sections(doc, spec)
        hdrs = [c.header for c in sections[0].columns]
        self.assertIn("1. Lauf", hdrs)
        self.assertIn("2. Lauf", hdrs)
        self.assertEqual(sections[0].rows[0][-2:], ("3", "7"))


class TestF15ExportParity(unittest.TestCase):
    def test_eligible_entity_uids_match_get_standings(self) -> None:
        c = _cat()
        p1 = Person(uid="p1", name="Eins", yob=1990, gender=Gender.M)
        p2 = Person(uid="p2", name="Zwei", yob=1991, gender=Gender.M)
        ev = RaceEvent(
            race_event_uid="r1",
            category=c,
            race_date="2026-01-01",
            entries=(
                RaceEntry(participant_uid="p1", result=EntryResult(distance_km=5.0, points=10.0)),
                RaceEntry(participant_uid="p2", result=EntryResult(distance_km=4.0, points=5.0)),
            ),
        )
        doc = recompute_project_standings(
            ProjectDocument(
                schema_version=SCHEMA_VERSION_V2,
                people=(p1, p2),
                events=(ev,),
                ranking_exclusions=((_ck(), frozenset({"p2"})),),
            )
        )
        api_rows = queries.get_standings(doc, {"category_key": _ck()})["rows"]
        spec = ExportSpec.from_dict(
            {
                "format": "csv",
                "categories": [_ck()],
                "columns": ["entity_uid", "platz"],
                "rows": {"eligibility": "eligible_only"},
            }
        )
        sections = build_export_sections(resolve_document_for_export(spec, doc), spec)
        export_uids = [r[0] for r in sections[0].rows]
        api_uids = [r["entity_uid"] for r in api_rows]
        self.assertEqual(export_uids, api_uids)
        self.assertEqual(export_uids, ["p1"])


class TestRaceFilterExport(unittest.TestCase):
    def test_subset_filter_recomputes_standings(self) -> None:
        c = _cat()
        p1 = Person(uid="p_a", name="A", yob=1990, gender=Gender.M)
        p2 = Person(uid="p_b", name="B", yob=1991, gender=Gender.M)
        # Full season: both score 100 pts; p_a leads on total distance. r2 only: p_b leads.
        ev1 = RaceEvent(
            race_event_uid="r_one",
            category=c,
            race_date="2026-01-01",
            race_no=1,
            entries=(
                RaceEntry(participant_uid="p_a", result=EntryResult(distance_km=50.0, points=100.0)),
                RaceEntry(participant_uid="p_b", result=EntryResult(distance_km=0.0, points=0.0)),
            ),
        )
        ev2 = RaceEvent(
            race_event_uid="r_two",
            category=c,
            race_date="2026-02-01",
            race_no=2,
            entries=(
                RaceEntry(participant_uid="p_a", result=EntryResult(distance_km=0.0, points=0.0)),
                RaceEntry(participant_uid="p_b", result=EntryResult(distance_km=40.0, points=100.0)),
            ),
        )
        doc = recompute_project_standings(
            ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p1, p2), events=(ev1, ev2))
        )
        full_snap = doc.standings
        assert full_snap is not None
        top_full = full_snap.category_tables[0].rows[0].entity_uid

        spec = ExportSpec.from_dict(
            {
                "format": "pdf",
                "categories": [_ck()],
                "columns": ["minimal"],
                "race_filter": {"mode": "race_event_uids", "race_event_uids": ["r_two"]},
                "standings": {"source": "embedded", "recompute": False},
            }
        )
        resolved = resolve_document_for_export(spec, doc)
        sub_snap = resolved.standings
        assert sub_snap is not None
        top_sub = sub_snap.category_tables[0].rows[0].entity_uid
        self.assertEqual(top_full, "p_a")
        self.assertEqual(top_sub, "p_b")


class TestEphemeralRaceFilter(unittest.TestCase):
    def test_all_active_returns_same_instance(self) -> None:
        c = _cat()
        ev = RaceEvent(race_event_uid="r1", category=c, race_date="2026-01-01", entries=())
        doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, events=(ev,))
        rf = RaceFilterSpec(mode="all_active")
        self.assertIs(ephemeral_document_with_race_filter(doc, rf), doc)


class TestPdfSmoke(unittest.TestCase):
    def test_pdf_bytes_contain_name_and_ruleset(self) -> None:
        c = _cat()
        p = Person(uid="p1", name="Müller", yob=1990, gender=Gender.M)
        ev = RaceEvent(
            race_event_uid="r1",
            category=c,
            race_date="2026-01-01",
            entries=(RaceEntry(participant_uid="p1", result=EntryResult(1.0, 1.0)),),
        )
        doc = recompute_project_standings(
            ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p,), events=(ev,))
        )
        spec = ExportSpec.from_dict(
            {
                "format": "pdf",
                "categories": [_ck()],
                "columns": ["official_board"],
                "pdf": {"title": "Test Export", "show_ruleset_footer": True},
            }
        )
        pdf_bytes = export_standings_pdf_bytes(doc, spec)
        reader = PdfReader(BytesIO(pdf_bytes))
        text = "".join(page.extract_text() or "" for page in reader.pages)
        self.assertIn("Müller", text)
        rs = doc.standings.ruleset_version if doc.standings else ""
        if rs:
            self.assertIn(rs, text)


if __name__ == "__main__":
    unittest.main()
