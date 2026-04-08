from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

from backend.domain.enums import Division
from backend.ingestion.adapters.couples import parse_couples_workbook
from backend.ingestion.adapters.singles import parse_singles_workbook
from backend.ingestion.service import import_excel_into_project
from backend.ingestion.validation import ImportValidationError
from backend.storage.repository import JsonProjectRepository


WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
DATA_2023 = WORKSPACE_ROOT / "data" / "2023"


def has_local_fixtures() -> bool:
    return DATA_2023.exists() and any(DATA_2023.glob("*.xlsx"))


@unittest.skipUnless(has_local_fixtures(), "Local Excel fixtures under data/2023 are required for fixture-driven tests.")
class TestF02AdaptersWithFixtures(unittest.TestCase):
    def test_singles_adapter_parses_known_good_files(self) -> None:
        for idx in range(1, 6):
            path = DATA_2023 / f"Ergebnisliste MW Lauf {idx}.xlsx"
            parsed = parse_singles_workbook(path, series_year=2023)
            self.assertTrue(parsed.singles_sections)
            self.assertGreater(sum(len(section.rows) for section in parsed.singles_sections), 0)

    def test_couples_adapter_parses_known_good_files(self) -> None:
        for idx in range(1, 6):
            path = DATA_2023 / f"Ergebnisliste MW_Paare Lauf {idx}.xlsx"
            parsed = parse_couples_workbook(path, series_year=2023)
            self.assertTrue(parsed.couples_sections)
            self.assertGreater(sum(len(section.rows) for section in parsed.couples_sections), 0)

    def test_reimport_same_file_is_noop(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            excel_file = DATA_2023 / "Ergebnisliste MW Lauf 1.xlsx"
            first = import_excel_into_project(project_path, excel_file, series_year=2023)
            second = import_excel_into_project(project_path, excel_file, series_year=2023)
            self.assertFalse(first.noop)
            self.assertTrue(second.noop)

    def test_import_singles_and_couples_do_not_collide(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            import_excel_into_project(project_path, DATA_2023 / "Ergebnisliste MW Lauf 1.xlsx", series_year=2023)
            import_excel_into_project(project_path, DATA_2023 / "Ergebnisliste MW_Paare Lauf 1.xlsx", series_year=2023)
            repo = JsonProjectRepository(project_path)
            doc = repo.load()
            self.assertTrue(any(event.category.division in {Division.MEN, Division.WOMEN} for event in doc.events))
            self.assertTrue(
                any(
                    event.category.division in {Division.COUPLES_MEN, Division.COUPLES_WOMEN, Division.COUPLES_MIXED}
                    for event in doc.events
                )
            )


class TestF02SyntheticValidation(unittest.TestCase):
    def test_schema_fingerprint_mismatch_fails_fast(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            file_path = Path(temp_dir) / "Ergebnisliste MW Lauf 9.xlsx"
            wb = Workbook()
            ws = wb.active
            ws["A1"] = "Wrong"
            wb.save(file_path)
            with self.assertRaises(ImportValidationError):
                parse_singles_workbook(file_path, series_year=2023)

    def test_decimal_comma_is_parsed_correctly(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            file_path = Path(temp_dir) / "Ergebnisliste MW Lauf 9.xlsx"
            wb = Workbook()
            ws = wb.active
            ws.append(["Platz", "Startnr.", "Name", "Jahrg.", "Verein", "Distanz", "Rückstand", "Punkte"])
            ws.append(["1/2 h-Lauf", "", "", "", "", "", "", ""])
            ws.append(["Frauen", "", "", "", "", "", "", ""])
            ws.append([1, "7", "Anna Test", 1990, "TSV", "12,5", "", "42,0"])
            ws.append(["Männer", "", "", "", "", "", "", ""])
            ws.append([1, "8", "Max Test", 1988, "TSV", "13,5", "", "41,5"])
            ws.append(["h-Lauf", "", "", "", "", "", "", ""])
            ws.append(["Frauen", "", "", "", "", "", "", ""])
            ws.append([1, "9", "Eva Test", 1991, "TSV", "11,1", "", "30,2"])
            ws.append(["Männer", "", "", "", "", "", "", ""])
            ws.append([1, "10", "Tom Test", 1989, "TSV", "22,2", "", "55,5"])
            wb.save(file_path)

            parsed = parse_singles_workbook(file_path, series_year=2023)
            first_row = parsed.singles_sections[0].rows[0]
            self.assertEqual(first_row.distance_km, 12.5)
            self.assertEqual(first_row.points, 42.0)
