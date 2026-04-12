from __future__ import annotations

import unittest
from io import BytesIO

from pypdf import PdfReader

from backend.domain.enums import Division, Gender, RaceDuration
from backend.domain.models import (
    Couple,
    EntryResult,
    Person,
    ProjectDocument,
    RaceEntry,
    RaceEvent,
    RaceSeriesCategory,
)
from backend.export.gui_dual_pdf_export import InvalidDualPdfDestinationSuffixError, export_gui_laufuebersicht_dual_pdfs
from backend.export.gui_pdf_spec import laufuebersicht_einzel_paare_export_specs
from backend.export.pdftest_cli import main as pdftest_main
from backend.export.projection import build_export_sections
from backend.export.registry import export_standings_pdf_bytes
from backend.export.resolve import ephemeral_document_with_race_filter, resolve_document_for_export
from backend.export.spec import (
    DEFAULT_PDF_ORGANIZER_FOOTER,
    ExportSpec,
    RaceFilterSpec,
    normalize_pdf_layout_preset,
    sort_category_keys_for_export,
    split_category_keys_einzel_paare,
)
from backend.ranking.engine import recompute_project_standings
from backend.standings_display import category_footer_label, export_pdf_category_title
from backend.storage.repository import JsonProjectRepository
from backend.storage.schema_v2 import SCHEMA_VERSION_V2
from backend.ui_api import queries


def _cat() -> RaceSeriesCategory:
    return RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.MEN)


def _ck() -> str:
    return _cat().key


def _cat_couples() -> RaceSeriesCategory:
    return RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.COUPLES_MEN)


def _ck_couples() -> str:
    return _cat_couples().key


def _minimal_doc_one_category() -> ProjectDocument:
    p = Person(uid="p1", name="Müller", yob=1990, gender=Gender.M)
    ev = RaceEvent(
        race_event_uid="r1",
        category=_cat(),
        race_date="2026-01-01",
        entries=(RaceEntry(participant_uid="p1", result=EntryResult(1.0, 1.0)),),
    )
    return recompute_project_standings(ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p,), events=(ev,)))


class TestExportSpec(unittest.TestCase):
    def test_unknown_column_raises(self) -> None:
        raw = {
            "format": "pdf",
            "categories": [_ck()],
            "columns": ["not_a_real_column"],
        }
        with self.assertRaises(ValueError):
            ExportSpec.from_dict(raw)

    def test_laufuebersicht_requires_placeholder_columns(self) -> None:
        raw = {
            "format": "pdf",
            "categories": [_ck()],
            "columns": ["official_board"],
            "pdf": {"table_layout": "laufuebersicht"},
        }
        with self.assertRaises(ValueError):
            ExportSpec.from_dict(raw)

    def test_laufuebersicht_board_invalid_without_layout(self) -> None:
        raw = {
            "format": "pdf",
            "categories": [_ck()],
            "columns": ["laufuebersicht_board"],
        }
        with self.assertRaises(ValueError):
            ExportSpec.from_dict(raw)

    def test_sort_category_keys_for_export_order(self) -> None:
        keys = [
            "2025:hour:couples_men",
            "2025:half_hour:men",
            "2025:hour:men",
            "2025:half_hour:couples_mixed",
            "2025:half_hour:women",
            "2025:hour:couples_women",
            "2025:half_hour:couples_men",
            "2025:half_hour:couples_women",
            "2025:hour:women",
            "2025:hour:couples_mixed",
        ]
        ordered = sort_category_keys_for_export(keys)
        self.assertEqual(
            ordered,
            (
                "2025:half_hour:women",
                "2025:half_hour:men",
                "2025:hour:women",
                "2025:hour:men",
                "2025:half_hour:couples_women",
                "2025:half_hour:couples_men",
                "2025:half_hour:couples_mixed",
                "2025:hour:couples_women",
                "2025:hour:couples_men",
                "2025:hour:couples_mixed",
            ),
        )

    def test_split_category_keys_einzel_paare(self) -> None:
        keys = [
            "2025:hour:couples_men",
            "2025:half_hour:men",
            "2025:hour:men",
        ]
        einzel, paare = split_category_keys_einzel_paare(keys)
        self.assertEqual(einzel, ("2025:half_hour:men", "2025:hour:men"))
        self.assertEqual(paare, ("2025:hour:couples_men",))

    def test_pdf_organizer_footer_default_and_override(self) -> None:
        d0 = ExportSpec.from_dict({"format": "pdf", "categories": [_ck()], "columns": ["minimal"]})
        self.assertEqual(d0.pdf.organizer_footer, DEFAULT_PDF_ORGANIZER_FOOTER)
        d1 = ExportSpec.from_dict(
            {
                "format": "pdf",
                "categories": [_ck()],
                "columns": ["minimal"],
                "pdf": {"organizer_footer": "  Mein Verein  "},
            }
        )
        self.assertEqual(d1.pdf.organizer_footer, "Mein Verein")

    def test_pdf_page_break_before_each_category_from_dict(self) -> None:
        raw = {
            "format": "pdf",
            "categories": [_ck()],
            "columns": ["official_board"],
            "pdf": {"page_break_before_each_category": True},
        }
        spec = ExportSpec.from_dict(raw)
        self.assertTrue(spec.pdf.page_break_before_each_category)

    def test_pdf_layout_preset_unknown_raises(self) -> None:
        raw = {
            "format": "pdf",
            "categories": [_ck()],
            "columns": ["minimal"],
            "pdf": {"layout_preset": "no_such_preset"},
        }
        with self.assertRaises(ValueError) as ctx:
            ExportSpec.from_dict(raw)
        self.assertIn("layout_preset", str(ctx.exception))

    def test_pdf_layout_preset_merge_and_override(self) -> None:
        raw = {
            "format": "pdf",
            "categories": [_ck()],
            "columns": ["minimal"],
            "pdf": {"layout_preset": "compact", "margin_left_cm": 2.0},
        }
        spec = ExportSpec.from_dict(raw)
        self.assertEqual(spec.pdf.margin_left_cm, 2.0)
        self.assertEqual(spec.pdf.margin_right_cm, 0.45)
        self.assertEqual(spec.pdf.table_font_size, 5)
        self.assertEqual(spec.pdf.orientation, "portrait")
        self.assertEqual(spec.pdf.table_cell_vertical_padding_pt, 0.45)
        self.assertEqual(spec.pdf.table_plain_leading_extra_pt, 1)
        self.assertEqual(spec.pdf.double_rule_weight_pt, 0.45)
        self.assertEqual(spec.pdf.double_rule_gap_pt, 0.5)

    def test_gui_pdf_spec_compact_uses_portrait(self) -> None:
        doc = _minimal_doc_one_category()
        spec_e, _spec_p = laufuebersicht_einzel_paare_export_specs(doc, layout_preset="compact")
        assert spec_e is not None
        self.assertEqual(spec_e.pdf.orientation, "portrait")
        self.assertEqual(spec_e.pdf.table_layout, "laufuebersicht")
        spec_d, _ = laufuebersicht_einzel_paare_export_specs(doc, layout_preset=None)
        assert spec_d is not None
        self.assertEqual(spec_d.pdf.orientation, "landscape")

    def test_gui_pdf_spec_default_preset_matches_none(self) -> None:
        doc = _minimal_doc_one_category()
        spec_a, _ = laufuebersicht_einzel_paare_export_specs(doc, layout_preset=None)
        spec_b, _ = laufuebersicht_einzel_paare_export_specs(doc, layout_preset="default")
        assert spec_a is not None and spec_b is not None
        self.assertEqual(spec_a.pdf.orientation, spec_b.pdf.orientation)
        self.assertEqual(spec_a.pdf.margin_left_cm, spec_b.pdf.margin_left_cm)

    def test_pdf_laufuebersicht_result_font_extra_pt_from_dict(self) -> None:
        raw = {
            "format": "pdf",
            "categories": [_ck()],
            "columns": ["laufuebersicht_board"],
            "pdf": {"table_layout": "laufuebersicht", "laufuebersicht_result_font_extra_pt": 2},
        }
        spec = ExportSpec.from_dict(raw)
        self.assertEqual(spec.pdf.laufuebersicht_result_font_extra_pt, 2)


class TestGuiDualPdfExport(unittest.TestCase):
    def test_rejects_bad_destination_suffix(self) -> None:
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "session_project.json"
            JsonProjectRepository(project_path).save(_minimal_doc_one_category())
            with self.assertRaises(InvalidDualPdfDestinationSuffixError):
                export_gui_laufuebersicht_dual_pdfs(project_path, Path(temp_dir) / "out.txt")

    def test_writes_einzel_matches_bytes_and_path(self) -> None:
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "session_project.json"
            JsonProjectRepository(project_path).save(_minimal_doc_one_category())
            out_base = Path(temp_dir) / "report"
            written, total = export_gui_laufuebersicht_dual_pdfs(project_path, out_base)
            self.assertEqual(len(written), 1)
            self.assertEqual(written[0], Path(temp_dir) / "report_einzel.pdf")
            self.assertEqual(total, written[0].stat().st_size)
            self.assertEqual(written[0].read_bytes()[:4], b"%PDF")

    def test_pdf_suffix_stripped_for_stem(self) -> None:
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "session_project.json"
            JsonProjectRepository(project_path).save(_minimal_doc_one_category())
            written, _ = export_gui_laufuebersicht_dual_pdfs(project_path, Path(temp_dir) / "x.pdf")
            self.assertEqual(written[0].name, "x_einzel.pdf")


class TestNormalizePdfLayoutPreset(unittest.TestCase):
    def test_empty_and_default(self) -> None:
        self.assertIsNone(normalize_pdf_layout_preset(None))
        self.assertIsNone(normalize_pdf_layout_preset(""))
        self.assertIsNone(normalize_pdf_layout_preset("  "))
        self.assertIsNone(normalize_pdf_layout_preset("default"))
        self.assertIsNone(normalize_pdf_layout_preset("standard"))

    def test_id_case_insensitive(self) -> None:
        self.assertEqual(normalize_pdf_layout_preset("compact"), "compact")
        self.assertEqual(normalize_pdf_layout_preset("COMPACT"), "compact")

    def test_label_substring(self) -> None:
        self.assertEqual(normalize_pdf_layout_preset("kompakt"), "compact")

    def test_unknown_raises(self) -> None:
        with self.assertRaises(ValueError) as ctx:
            normalize_pdf_layout_preset("not_a_real_preset")
        self.assertIn("not_a_real_preset", str(ctx.exception))


class TestPdfTestCli(unittest.TestCase):
    def test_writes_einzel_pdf_for_minimal_project(self) -> None:
        import tempfile
        from pathlib import Path

        from backend.domain.enums import Division, Gender, RaceDuration
        from backend.domain.models import EntryResult, Person, ProjectDocument, RaceEntry, RaceEvent, RaceSeriesCategory
        from backend.ranking.engine import recompute_project_standings
        from backend.storage.schema_v2 import SCHEMA_VERSION_V2

        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "session_project.json"
            category = RaceSeriesCategory(year=2026, duration=RaceDuration.HALF_HOUR, division=Division.MEN)
            participant = Person(uid="participant_2026", name="Starter 2026", yob=1990, gender=Gender.M, club="TSV")
            event = RaceEvent(
                race_event_uid="race_event_2026_1",
                category=category,
                race_date="2026-01-05",
                race_no=1,
                source_file="fixture_2026.xlsx",
                source_sha256="sha_2026",
                imported_at="2026-01-05T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp_2026",
                entries=(
                    RaceEntry(
                        entry_uid="entry_2026_1",
                        participant_uid=participant.uid,
                        startnr="1",
                        result=EntryResult(distance_km=10.0, points=20.0),
                    ),
                ),
            )
            doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(participant,), events=(event,))
            JsonProjectRepository(project_path).save(recompute_project_standings(doc))
            out_base = Path(temp_dir) / "out"
            pdftest_main(["default", "-i", str(project_path), "-o", str(out_base)])
            out_einzel = Path(temp_dir) / "out_einzel.pdf"
            self.assertTrue(out_einzel.exists())
            self.assertEqual(out_einzel.read_bytes()[:4], b"%PDF")


class TestCategoryFooterLabel(unittest.TestCase):
    def test_category_footer_label_uses_spelled_divisions(self) -> None:
        self.assertEqual(
            category_footer_label(RaceDuration.HALF_HOUR, Division.WOMEN),
            "Halbstundenlauf - Frauen",
        )


class TestExportPdfCategoryTitle(unittest.TestCase):
    def test_export_pdf_category_title_format(self) -> None:
        self.assertEqual(
            export_pdf_category_title(2026, RaceDuration.HALF_HOUR, Division.WOMEN),
            "Saison 2026 \u2014 Halbstundenlauf Frauen",
        )
        self.assertEqual(
            export_pdf_category_title(2025, RaceDuration.HOUR, Division.MEN),
            "Saison 2025 \u2014 Stundenlauf M\u00e4nner",
        )


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
        doc = recompute_project_standings(ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p,), events=(ev,)))
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
        self.assertEqual(sec.title, "Saison 2026 \u2014 Stundenlauf M\u00e4nner")
        self.assertEqual(sec.season_year, 2026)
        self.assertEqual([c.id for c in sec.columns], ["platz", "display_name", "punkte_gesamt", "distanz_gesamt"])
        self.assertEqual(sec.rows[0][1], "Anna Müller")
        self.assertEqual(sec.rows[0][3], "5,500")

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

    def test_laufuebersicht_participant_two_races(self) -> None:
        c = _cat()
        p = Person(uid="p1", name="Anna Müller", yob=1990, gender=Gender.M, club="TSV")
        ev1 = RaceEvent(
            race_event_uid="r_a",
            category=c,
            race_date="2026-01-01",
            race_no=1,
            entries=(RaceEntry(participant_uid="p1", result=EntryResult(distance_km=8.234, points=47.0)),),
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
                "columns": ["laufuebersicht_board"],
                "pdf": {"table_layout": "laufuebersicht"},
            }
        )
        sections = build_export_sections(doc, spec)
        sec = sections[0]
        self.assertEqual(sec.title, "1. Stundenlauf - M\u00e4nner")
        self.assertEqual(sec.season_year, 2026)
        assert sec.header_rows is not None
        self.assertEqual(len(sec.header_rows), 3)
        self.assertEqual(sec.header_rows[0][:3], ("Platz", "Name", "Verein"))
        self.assertIn("1. Lauf", sec.header_rows[0])
        self.assertIn("Gesamt", sec.header_rows[0])
        self.assertEqual(sec.header_rows[1][3:5], ("Laufstr.", "Wertung"))
        self.assertEqual(sec.header_rows[2][3:5], ("(km)", "(Punkte)"))
        self.assertEqual(sec.rows[0][1], "Anna Müller (1990)")
        self.assertEqual(sec.rows[0][3], "8,234")
        self.assertEqual(sec.rows[0][4], "47")
        self.assertEqual(sec.rows[0][5], "2,000")
        self.assertEqual(sec.rows[0][6], "7")
        self.assertEqual(sec.csv_rows, sec.rows)
        assert sec.body_row_band_group is not None
        self.assertEqual(sec.body_row_band_group, (0,))

    def test_laufuebersicht_missing_race_shows_em_dash(self) -> None:
        c = _cat()
        p = Person(uid="p1", name="Nur Lauf 1", yob=1990, gender=Gender.M, club="TSV")
        ev1 = RaceEvent(
            race_event_uid="r_a",
            category=c,
            race_date="2026-01-01",
            race_no=1,
            entries=(RaceEntry(participant_uid="p1", result=EntryResult(distance_km=8.0, points=40.0)),),
        )
        ev2 = RaceEvent(
            race_event_uid="r_b",
            category=c,
            race_date="2026-02-01",
            race_no=2,
            entries=(),
        )
        doc = recompute_project_standings(
            ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p,), events=(ev1, ev2))
        )
        spec = ExportSpec.from_dict(
            {
                "format": "pdf",
                "categories": [_ck()],
                "columns": ["laufuebersicht_board"],
                "pdf": {"table_layout": "laufuebersicht"},
            }
        )
        sections = build_export_sections(doc, spec)
        sec = sections[0]
        self.assertEqual(sec.rows[0][5], "\u2014")
        self.assertEqual(sec.rows[0][6], "\u2014")
        race_km = [c for c in sec.columns if c.id.startswith("race_km:")]
        race_pkt = [c for c in sec.columns if c.id.startswith("race_pkt:")]
        self.assertEqual(len(race_km), 2)
        self.assertEqual(len(race_pkt), 2)
        self.assertEqual([c.align for c in race_km], ["center", "center"])
        self.assertEqual([c.align for c in race_pkt], ["center", "center"])

    def test_laufuebersicht_empty_club_shows_em_dash(self) -> None:
        c = _cat()
        p = Person(uid="p1", name="Ohne Verein", yob=1990, gender=Gender.M, club=None)
        ev = RaceEvent(
            race_event_uid="r1",
            category=c,
            race_date="2026-01-01",
            race_no=1,
            entries=(RaceEntry(participant_uid="p1", result=EntryResult(distance_km=5.0, points=10.0)),),
        )
        doc = recompute_project_standings(ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p,), events=(ev,)))
        spec = ExportSpec.from_dict(
            {
                "format": "pdf",
                "categories": [_ck()],
                "columns": ["laufuebersicht_board"],
                "pdf": {"table_layout": "laufuebersicht"},
            }
        )
        sections = build_export_sections(doc, spec)
        sec = sections[0]
        self.assertEqual(sec.rows[0][2], "\u2014")
        self.assertEqual(sec.columns[2].id, "club")
        self.assertEqual(sec.columns[2].align, "left")

    def test_laufuebersicht_podium_flags_top_three(self) -> None:
        c = _cat()
        p1 = Person(uid="p1", name="Erste", yob=1990, gender=Gender.M)
        p2 = Person(uid="p2", name="Zweite", yob=1991, gender=Gender.M)
        p3 = Person(uid="p3", name="Dritte", yob=1992, gender=Gender.M)
        p4 = Person(uid="p4", name="Vierte", yob=1993, gender=Gender.M)
        ev = RaceEvent(
            race_event_uid="r1",
            category=c,
            race_date="2026-01-01",
            race_no=1,
            entries=(
                RaceEntry(participant_uid="p1", result=EntryResult(distance_km=10.0, points=40.0)),
                RaceEntry(participant_uid="p2", result=EntryResult(distance_km=9.0, points=30.0)),
                RaceEntry(participant_uid="p3", result=EntryResult(distance_km=8.0, points=20.0)),
                RaceEntry(participant_uid="p4", result=EntryResult(distance_km=7.0, points=10.0)),
            ),
        )
        doc = recompute_project_standings(
            ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p1, p2, p3, p4), events=(ev,))
        )
        spec = ExportSpec.from_dict(
            {
                "format": "pdf",
                "categories": [_ck()],
                "columns": ["laufuebersicht_board"],
                "pdf": {"table_layout": "laufuebersicht"},
            }
        )
        sections = build_export_sections(doc, spec)
        sec = sections[0]
        assert sec.body_row_podium is not None
        self.assertEqual(sec.body_row_podium, (True, True, True, False))

    def test_laufuebersicht_team_two_body_rows_and_spans(self) -> None:
        c = _cat_couples()
        pa = Person(uid="pa", name="Alpha", yob=1988, gender=Gender.M, club="Club A")
        pb = Person(uid="pb", name="Beta", yob=1989, gender=Gender.M, club="Club B")
        team = Couple(uid="t1", member_a=pa, member_b=pb)
        ev = RaceEvent(
            race_event_uid="r1",
            category=c,
            race_date="2026-01-01",
            race_no=1,
            entries=(RaceEntry(team_uid="t1", result=EntryResult(distance_km=5.5, points=10.0)),),
        )
        doc = recompute_project_standings(
            ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(pa, pb), couples=(team,), events=(ev,))
        )
        spec = ExportSpec.from_dict(
            {
                "format": "pdf",
                "categories": [_ck_couples()],
                "columns": ["laufuebersicht_board"],
                "pdf": {"table_layout": "laufuebersicht"},
            }
        )
        sections = build_export_sections(doc, spec)
        sec = sections[0]
        self.assertEqual(len(sec.rows), 2)
        self.assertEqual(sec.rows[0][0], "1")
        self.assertEqual(sec.rows[1][0], "")
        self.assertEqual(sec.rows[0][1], "Alpha (1988)")
        self.assertEqual(sec.rows[1][1], "Beta (1989)")
        assert sec.table_spans is not None
        self.assertGreater(len(sec.table_spans), 0)
        assert sec.csv_rows is not None
        self.assertEqual(sec.csv_rows[1][0], "1")
        self.assertEqual(sec.csv_rows[1][3], sec.csv_rows[0][3])
        assert sec.body_row_band_group is not None
        self.assertEqual(sec.body_row_band_group, (0, 0))
        assert sec.body_row_podium is not None
        self.assertEqual(sec.body_row_podium, (True, True))


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
    def test_pdf_bytes_contain_name_and_category_footer(self) -> None:
        c = _cat()
        p = Person(uid="p1", name="Müller", yob=1990, gender=Gender.M)
        ev = RaceEvent(
            race_event_uid="r1",
            category=c,
            race_date="2026-01-01",
            entries=(RaceEntry(participant_uid="p1", result=EntryResult(1.0, 1.0)),),
        )
        doc = recompute_project_standings(ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p,), events=(ev,)))
        spec = ExportSpec.from_dict(
            {
                "format": "pdf",
                "categories": [_ck()],
                "columns": ["official_board"],
                "pdf": {"title": "Test Export"},
            }
        )
        pdf_bytes = export_standings_pdf_bytes(doc, spec)
        reader = PdfReader(BytesIO(pdf_bytes))
        text = "".join(page.extract_text() or "" for page in reader.pages)
        self.assertIn("Müller", text)
        self.assertIn(DEFAULT_PDF_ORGANIZER_FOOTER, text)
        self.assertIn("Saison 2026", text)
        self.assertIn("Stundenlauf", text)
        self.assertIn("M\u00e4nner", text)
        self.assertIn("Export:", text)

    def test_pdf_footer_respects_custom_organizer(self) -> None:
        c = _cat()
        p = Person(uid="p1", name="Müller", yob=1990, gender=Gender.M)
        ev = RaceEvent(
            race_event_uid="r1",
            category=c,
            race_date="2026-01-01",
            entries=(RaceEntry(participant_uid="p1", result=EntryResult(1.0, 1.0)),),
        )
        doc = recompute_project_standings(ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p,), events=(ev,)))
        spec = ExportSpec.from_dict(
            {
                "format": "pdf",
                "categories": [_ck()],
                "columns": ["official_board"],
                "pdf": {"title": "T", "organizer_footer": "ACME Sport"},
            }
        )
        text = "".join(
            page.extract_text() or "" for page in PdfReader(BytesIO(export_standings_pdf_bytes(doc, spec))).pages
        )
        self.assertIn("ACME Sport", text)
        self.assertNotIn("Greifswald", text)

    def test_laufuebersicht_pdf_contains_headers_and_name(self) -> None:
        c = _cat()
        p = Person(uid="p1", name="Müller", yob=1990, gender=Gender.M, club="TSV")
        ev = RaceEvent(
            race_event_uid="r1",
            category=c,
            race_date="2026-01-01",
            race_no=1,
            entries=(RaceEntry(participant_uid="p1", result=EntryResult(1.0, 1.0)),),
        )
        doc = recompute_project_standings(ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p,), events=(ev,)))
        spec = ExportSpec.from_dict(
            {
                "format": "pdf",
                "categories": [_ck()],
                "columns": ["laufuebersicht_board"],
                "pdf": {"table_layout": "laufuebersicht", "title": "Laufübersicht Test"},
            }
        )
        pdf_bytes = export_standings_pdf_bytes(doc, spec)
        reader = PdfReader(BytesIO(pdf_bytes))
        text = "".join(page.extract_text() or "" for page in reader.pages)
        self.assertIn("Müller", text)
        self.assertIn("1. Lauf", text)
        self.assertIn("Laufstr.", text)
        self.assertIn("Wertung", text)
        self.assertIn("(km)", text)
        self.assertIn("(Punkte)", text)
        self.assertIn("Lauf\u00fcbersicht Test", text)

    def test_laufuebersicht_pdf_default_title_uses_season_and_readable_category(self) -> None:
        c = _cat()
        p = Person(uid="p1", name="Müller", yob=1990, gender=Gender.M, club="TSV")
        ev = RaceEvent(
            race_event_uid="r1",
            category=c,
            race_date="2026-01-01",
            race_no=1,
            entries=(RaceEntry(participant_uid="p1", result=EntryResult(1.0, 1.0)),),
        )
        doc = recompute_project_standings(ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p,), events=(ev,)))
        spec = ExportSpec.from_dict(
            {
                "format": "pdf",
                "categories": [_ck()],
                "columns": ["laufuebersicht_board"],
                "pdf": {"table_layout": "laufuebersicht"},
            }
        )
        pdf_bytes = export_standings_pdf_bytes(doc, spec)
        text = "".join(page.extract_text() or "" for page in PdfReader(BytesIO(pdf_bytes)).pages)
        self.assertIn("2026", text)
        self.assertIn("Pokalwertung", text)
        self.assertIn("1. Stundenlauf - M\u00e4nner", text)
        self.assertIn("Saison 2026", text)
        self.assertIn("Stundenlauf", text)
        self.assertIn("M\u00e4nner", text)

    def test_laufuebersicht_pdf_section_number_respects_start(self) -> None:
        c = _cat_couples()
        team = Couple(
            uid="t1",
            member_a=Person(name="A", yob=1980, gender=Gender.M, club="TSV"),
            member_b=Person(name="B", yob=1981, gender=Gender.F, club="TSV"),
        )
        ev = RaceEvent(
            race_event_uid="r1",
            category=c,
            race_date="2026-01-01",
            race_no=1,
            entries=(RaceEntry(team_uid="t1", result=EntryResult(1.0, 1.0)),),
        )
        doc = recompute_project_standings(
            ProjectDocument(schema_version=SCHEMA_VERSION_V2, couples=(team,), events=(ev,))
        )
        spec = ExportSpec.from_dict(
            {
                "format": "pdf",
                "categories": [_ck_couples()],
                "columns": ["laufuebersicht_board"],
                "pdf": {"table_layout": "laufuebersicht", "laufuebersicht_section_number_start": 4},
            }
        )
        pdf_bytes = export_standings_pdf_bytes(doc, spec)
        text = "".join(page.extract_text() or "" for page in PdfReader(BytesIO(pdf_bytes)).pages)
        self.assertIn("4. Stundenlauf - Paare M\u00e4nner", text)
        self.assertNotIn("1. Stundenlauf - Paare", text)


if __name__ == "__main__":
    unittest.main()
