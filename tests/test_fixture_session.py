from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.domain.enums import Gender
from backend.domain.models import (
    CategoryStandingsTable,
    Couple,
    Person,
    ProjectDocument,
    StandingsRow,
    StandingsSnapshot,
)
from backend.ranking.rules import RULESET_V1_LEGACY_TOP4
from backend.tools.fixture_session import (
    entity_display_name,
    ordered_import_paths,
    people_couples_maps,
    safe_filename_stem,
    standings_snapshot_to_csv,
)
from backend.storage.schema_v2 import SCHEMA_VERSION_V2


class TestOrderedImportPaths(unittest.TestCase):
    def test_orders_by_race_and_singles_before_couples(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / "Ergebnisliste MW Lauf 2.xlsx").touch()
            (tmp_path / "Ergebnisliste MW_Paare Lauf 2.xlsx").touch()
            (tmp_path / "Ergebnisliste MW Lauf 1.xlsx").touch()
            (tmp_path / "Ergebnisliste MW_Paare Lauf 1.xlsx").touch()
            got = ordered_import_paths(tmp_path)
            names = [p.name for p in got]
            self.assertEqual(
                names,
                [
                    "Ergebnisliste MW Lauf 1.xlsx",
                    "Ergebnisliste MW_Paare Lauf 1.xlsx",
                    "Ergebnisliste MW Lauf 2.xlsx",
                    "Ergebnisliste MW_Paare Lauf 2.xlsx",
                ],
            )

    def test_raises_on_empty_dir(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError) as ctx:
                ordered_import_paths(Path(tmp))
            self.assertIn("No .xlsx", str(ctx.exception))

    def test_raises_on_duplicate_singles_same_race(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / "A Lauf 1.xlsx").touch()
            (tmp_path / "B Lauf 1.xlsx").touch()
            with self.assertRaises(ValueError) as ctx:
                ordered_import_paths(tmp_path)
            self.assertIn("Multiple singles", str(ctx.exception))

    def test_raises_without_lauf_in_filename(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / "nope.xlsx").touch()
            with self.assertRaises(ValueError) as ctx:
                ordered_import_paths(tmp_path)
            self.assertIn("Lauf number", str(ctx.exception))


class TestStandingsCsv(unittest.TestCase):
    def test_csv_includes_display_names(self) -> None:
        p = Person(uid="p1", name="Anna", yob=1990, gender=Gender.F)
        team = Couple(
            uid="t1",
            member_a=Person(name="X", yob=1980, gender=Gender.M),
            member_b=Person(name="Y", yob=1981, gender=Gender.F),
        )
        snap = StandingsSnapshot(
            ruleset_version=RULESET_V1_LEGACY_TOP4,
            calculated_at="2026-01-01T00:00:00+00:00",
            category_tables=(
                CategoryStandingsTable(
                    category_key="2026:hour:men",
                    rows=(
                        StandingsRow(
                            entity_kind="participant",
                            entity_uid="p1",
                            punkte_gesamt=10.0,
                            distanz_gesamt=5.5,
                            platz=1,
                        ),
                    ),
                ),
                CategoryStandingsTable(
                    category_key="2026:hour:couples_mixed",
                    rows=(
                        StandingsRow(
                            entity_kind="team",
                            entity_uid="t1",
                            punkte_gesamt=8.0,
                            distanz_gesamt=4.0,
                            platz=1,
                        ),
                    ),
                ),
            ),
        )
        csv_text = standings_snapshot_to_csv(snap, {"p1": p}, {"t1": team})
        self.assertIn("Anna", csv_text)
        self.assertIn("X / Y", csv_text)
        self.assertIn("2026:hour:men", csv_text)

    def test_entity_display_name_fallback(self) -> None:
        self.assertEqual(entity_display_name("participant", "missing", {}, {}), "missing")

    def test_people_couples_maps(self) -> None:
        p = Person(uid="p1", name="A", yob=1990, gender=Gender.M)
        doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p,))
        pm, cm = people_couples_maps(doc)
        self.assertEqual(pm["p1"].name, "A")
        self.assertEqual(cm, {})

    def test_safe_filename_stem(self) -> None:
        self.assertEqual(safe_filename_stem(Path("a b c.xlsx")), "a_b_c")


if __name__ == "__main__":
    unittest.main()
