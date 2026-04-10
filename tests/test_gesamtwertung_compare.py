from __future__ import annotations

import unittest
from pathlib import Path

from backend.domain.enums import Gender
from backend.domain.models import (
    CategoryStandingsTable,
    Person,
    StandingsRow,
    StandingsSnapshot,
)
from backend.ranking.rules import RULESET_V1_LEGACY_TOP4
from backend.tools.gesamtwertung_compare import (
    aggregate_row_like_standings,
    compare_gesamtwertung_to_standings,
    merge_duplicate_gt_rows,
    GesamtwertungRow,
    load_all_einzel_gesamtwertung_sections,
    normalize_person_name,
    parse_gesamtwertung_section,
    sheet_label_for_category_key,
)


class TestAggregateLikeStandings(unittest.TestCase):
    def test_top4_drops_lowest(self) -> None:
        # Same per-lauf values as Britta Rossow in 2023 Gesamtwertung (km, Punkte).
        pairs = (
            (4.794, 37.0),
            (4.867, 39.0),
            (4.805, 38.0),
            (4.628, 37.0),
            (4.66, 34.0),
        )
        pk, dk = aggregate_row_like_standings(pairs)
        self.assertEqual(pk, 151.0)
        self.assertAlmostEqual(dk, 19.094, places=3)


class TestMergeDuplicateGt(unittest.TestCase):
    def test_sums_points_and_distance(self) -> None:
        rows = [
            GesamtwertungRow(17, "Bianca Bohmeier", 1997, 38.0, 5.31),
            GesamtwertungRow(23, "Bianca Bohmeier", 1997, 36.0, 4.38),
        ]
        merged = merge_duplicate_gt_rows(rows)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0].punkte_gesamt, 74.0)
        self.assertAlmostEqual(merged[0].distanz_gesamt, 9.69, places=2)
        self.assertEqual(merged[0].platz, 17)


class TestCompare(unittest.TestCase):
    def test_matches_by_name_yob(self) -> None:
        gt = [GesamtwertungRow(1, "Britta Rossow", 1961, 151.0, 19.09)]
        snap = StandingsSnapshot(
            ruleset_version=RULESET_V1_LEGACY_TOP4,
            calculated_at="2026-01-01T00:00:00+00:00",
            category_tables=(
                CategoryStandingsTable(
                    category_key="2023:half_hour:women",
                    rows=(
                        StandingsRow(
                            entity_kind="participant",
                            entity_uid="p1",
                            punkte_gesamt=151.0,
                            distanz_gesamt=19.09,
                            platz=1,
                        ),
                    ),
                ),
            ),
        )
        people = {"p1": Person(uid="p1", name="Britta Rossow", yob=1961, gender=Gender.F)}
        from backend.tools.gesamtwertung_compare import standings_rows_for_category

        sr = standings_rows_for_category(snap, "2023:half_hour:women")
        cmp = compare_gesamtwertung_to_standings(gt, sr, people)
        self.assertTrue(cmp[0]["matched"])
        self.assertEqual(cmp[0]["punkte_delta"], 0.0)


class TestNormalizeName(unittest.TestCase):
    def test_casefold(self) -> None:
        self.assertEqual(normalize_person_name("  Anna  Müller "), "anna muller")


class TestSheetLabels(unittest.TestCase):
    def test_sheet_label_for_category_key(self) -> None:
        self.assertEqual(sheet_label_for_category_key("2023:half_hour:women"), "hh_W")
        self.assertEqual(sheet_label_for_category_key("2023:hour:men"), "h_M")


class TestParseSection(unittest.TestCase):
    def test_parses_first_sheet_fixture(self) -> None:
        path = Path(__file__).resolve().parents[1] / "data/2023/einzel/ground_truth/Gesamtwertung_Einzel.xlsx"
        if not path.is_file():
            self.skipTest(f"Missing fixture: {path}")
        from openpyxl import load_workbook

        wb = load_workbook(path, read_only=True, data_only=True)
        try:
            ws = wb.worksheets[0]
            rows = parse_gesamtwertung_section(ws, title_substring="Halbstundenlauf - W")
        finally:
            wb.close()
        self.assertGreaterEqual(len(rows), 30)
        self.assertEqual(rows[0].name, "Britta Rossow")
        self.assertAlmostEqual(rows[0].punkte_gesamt, 151.0)

    def test_load_all_sections_matches_four_blocks(self) -> None:
        path = Path(__file__).resolve().parents[1] / "data/2023/einzel/ground_truth/Gesamtwertung_Einzel.xlsx"
        if not path.is_file():
            self.skipTest(f"Missing fixture: {path}")
        all_sec = load_all_einzel_gesamtwertung_sections(path, series_year=2023)
        self.assertEqual(len(all_sec), 4)
        keys = [ck for ck, _ in all_sec]
        self.assertIn("2023:half_hour:women", keys)
        self.assertIn("2023:hour:men", keys)


if __name__ == "__main__":
    unittest.main()
