from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from backend.domain.enums import Division, Gender, RaceDuration
from backend.domain.models import Couple, EntryResult, Person, ProjectDocument, RaceEntry, RaceEvent, RaceSeriesCategory
from backend.domain.validation import ValidationError
from backend.storage.migrations import migrate_to_supported
from backend.storage.repository import JsonProjectRepository
from backend.storage.schema_v2 import SCHEMA_VERSION_V2, from_dict, to_dict


def build_sample_document() -> ProjectDocument:
    person = Person(uid="participant_1", name="Alex", yob=1988, gender=Gender.M)
    partner = Person(uid="participant_2", name="Bea", yob=1990, gender=Gender.F)
    team = Couple(uid="team_1", member_a=person, member_b=partner)
    category = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.COUPLES_MIXED)
    event = RaceEvent(
        race_event_uid="race_event_1",
        category=category,
        race_date="2026-03-01",
        source_file="race1.xlsx",
        entries=(
            RaceEntry(entry_uid="entry_1", startnr="17", team_uid="team_1", result=EntryResult(distance_km=10.0, points=20.0)),
        ),
    )
    return ProjectDocument(
        schema_version=SCHEMA_VERSION_V2,
        project_uid="project_1",
        people=(person, partner),
        couples=(team,),
        events=(event,),
        matching_decisions=(),
    )


class TestF01Storage(unittest.TestCase):
    def test_serialize_deserialize_roundtrip(self) -> None:
        doc = build_sample_document()
        encoded = to_dict(doc)
        decoded = from_dict(encoded)
        self.assertEqual(decoded.schema_version, SCHEMA_VERSION_V2)
        self.assertEqual(decoded.project_uid, "project_1")
        self.assertEqual(decoded.events[0].entries[0].startnr, "17")

    def test_deserialize_rejects_unknown_schema_version(self) -> None:
        with self.assertRaises(ValidationError):
            from_dict({"schema_version": 999})

    def test_migration_v1_to_v2(self) -> None:
        payload = {"schema_version": 1, "people": [], "couples": [], "events": []}
        migrated = migrate_to_supported(payload)
        self.assertEqual(migrated["schema_version"], 2)
        self.assertEqual(migrated["matching_decisions"], [])

    def test_save_load_roundtrip_preserves_uids(self) -> None:
        doc = build_sample_document()
        with tempfile.TemporaryDirectory() as temp_dir:
            repo = JsonProjectRepository(Path(temp_dir) / "project.json")
            repo.save(doc)
            loaded = repo.load()
            self.assertEqual(loaded.people[0].uid, "participant_1")
            self.assertEqual(loaded.couples[0].uid, "team_1")
            self.assertEqual(loaded.events[0].race_event_uid, "race_event_1")

    def test_backup_created_before_overwrite(self) -> None:
        doc = build_sample_document()
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "project.json"
            repo = JsonProjectRepository(path)
            repo.save(doc)
            repo.save(doc)
            self.assertTrue(path.with_suffix(".json.bak").exists())

    def test_invalid_file_returns_user_friendly_error(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "project.json"
            path.write_text("{ broken", encoding="utf-8")
            repo = JsonProjectRepository(path)
            with self.assertRaises(ValidationError):
                repo.load()

    def test_rollback_marks_event_without_deleting(self) -> None:
        doc = build_sample_document()
        with tempfile.TemporaryDirectory() as temp_dir:
            repo = JsonProjectRepository(Path(temp_dir) / "project.json")
            rolled_back = repo.mark_event_rolled_back(doc, "race_event_1", "tester", "manual correction")
            self.assertEqual(len(rolled_back.events), 1)
            self.assertEqual(len(repo.active_events(rolled_back)), 0)
            self.assertEqual(len(repo.all_events(rolled_back)), 1)
            self.assertEqual(rolled_back.events[0].rollback.reason, "manual correction")

    def test_atomic_write_uses_temp_replace(self) -> None:
        doc = build_sample_document()
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "project.json"
            repo = JsonProjectRepository(path)
            repo.save(doc)
            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(data["schema_version"], 2)
            self.assertFalse((Path(temp_dir) / "project.json.tmp").exists())


if __name__ == "__main__":
    unittest.main()
