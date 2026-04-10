from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from backend.domain.enums import Division, Gender, RaceDuration, RaceEventState
from backend.domain.models import Couple, EntryResult, Person, ProjectDocument, RaceEntry, RaceEntryMatchMeta, RaceEvent, RaceSeriesCategory
from backend.ranking.engine import recompute_project_standings
from backend.storage.repository import JsonProjectRepository
from backend.storage.schema_v2 import SCHEMA_VERSION_V2
from backend.ui_api import API_VERSION_V1, PywebviewApiBridge, UiApiService


def _seed_project(path: Path) -> None:
    category = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.MEN)
    old_category = RaceSeriesCategory(year=2025, duration=RaceDuration.HOUR, division=Division.MEN)
    participant = Person(uid="participant_target", name="Max Mustermann", yob=1990, gender=Gender.M, club="TSV")
    old_participant = Person(uid="participant_legacy", name="Erik Alt", yob=1988, gender=Gender.M, club="ALT")
    review_meta = RaceEntryMatchMeta(
        route="review",
        confidence=0.82,
        top_candidate_uid="participant_target",
        candidate_uids=("participant_target",),
        candidate_confidences=(0.82,),
        features={"name_similarity": 0.82},
    )
    review_entry = RaceEntry(
        entry_uid="entry_review_1",
        participant_uid="participant_target",
        startnr="11",
        result=EntryResult(distance_km=12.3, points=25.0),
        match_meta=review_meta,
    )
    event = RaceEvent(
        race_event_uid="race_event_1",
        category=category,
        race_date="2026-01-05",
        race_no=1,
        source_file="fixture.xlsx",
        source_sha256="abc",
        imported_at="2026-01-05T10:00:00+00:00",
        parser_version="v1",
        schema_fingerprint="fp",
        entries=(review_entry,),
    )
    old_event = RaceEvent(
        race_event_uid="race_event_legacy",
        category=old_category,
        race_date="2025-01-05",
        race_no=1,
        source_file="legacy_fixture.xlsx",
        source_sha256="legacy",
        imported_at="2025-01-05T10:00:00+00:00",
        parser_version="v1",
        schema_fingerprint="fp_legacy",
        entries=(
            RaceEntry(
                entry_uid="entry_legacy_1",
                participant_uid="participant_legacy",
                startnr="7",
                result=EntryResult(distance_km=10.5, points=20.0),
            ),
        ),
    )
    doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(participant, old_participant), events=(event, old_event))
    doc = recompute_project_standings(doc)
    JsonProjectRepository(path).save(doc)


def _seed_project_for_year(path: Path, series_year: int) -> None:
    category = RaceSeriesCategory(year=series_year, duration=RaceDuration.HALF_HOUR, division=Division.MEN)
    participant = Person(
        uid=f"participant_{series_year}",
        name=f"Starter {series_year}",
        yob=1990,
        gender=Gender.M,
        club="TSV",
    )
    event = RaceEvent(
        race_event_uid=f"race_event_{series_year}_1",
        category=category,
        race_date=f"{series_year}-01-05",
        race_no=1,
        source_file=f"fixture_{series_year}.xlsx",
        source_sha256=f"sha_{series_year}",
        imported_at=f"{series_year}-01-05T10:00:00+00:00",
        parser_version="v1",
        schema_fingerprint=f"fp_{series_year}",
        entries=(
            RaceEntry(
                entry_uid=f"entry_{series_year}_1",
                participant_uid=participant.uid,
                startnr="1",
                result=EntryResult(distance_km=10.0, points=20.0),
            ),
        ),
    )
    doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(participant,), events=(event,))
    JsonProjectRepository(path).save(recompute_project_standings(doc))


class TestF08UiApi(unittest.TestCase):
    def test_get_standings_returns_member_yobs_for_couples(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            category = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.COUPLES_MIXED)
            team = Couple(
                uid="team_mixed_1",
                member_a=Person(name="Alex Beispiel", yob=1987, gender=Gender.M, club="TSV"),
                member_b=Person(name="Sina Beispiel", yob=1992, gender=Gender.F, club="TSV"),
            )
            event = RaceEvent(
                race_event_uid="race_event_couples_1",
                category=category,
                race_date="2026-01-05",
                race_no=1,
                source_file="fixture_couples.xlsx",
                source_sha256="sha-couples",
                imported_at="2026-01-05T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp-couples",
                entries=(
                    RaceEntry(
                        entry_uid="entry_couples_1",
                        team_uid=team.uid,
                        startnr="1",
                        result=EntryResult(distance_km=10.5, points=20.0),
                    ),
                ),
            )
            doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, couples=(team,), events=(event,))
            JsonProjectRepository(project_path).save(recompute_project_standings(doc))
            service = UiApiService(project_path)
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_standings_couples_yob",
                    "method": "get_standings",
                    "payload": {"category_key": "2026:hour:couples_mixed"},
                }
            )
            self.assertEqual(response["status"], "ok")
            rows = response["payload"]["rows"]
            self.assertGreaterEqual(len(rows), 1)
            self.assertEqual(rows[0]["display_name"], "Alex Beispiel / Sina Beispiel")
            self.assertEqual(rows[0]["yob"], "1987 / 1992")
            members = rows[0]["team_members"]
            self.assertEqual(len(members), 2)
            self.assertEqual(members[0]["member"], "a")
            self.assertEqual(members[0]["name"], "Alex Beispiel")
            self.assertEqual(members[0]["yob"], 1987)
            self.assertEqual(members[0]["club"], "TSV")
            self.assertEqual(members[1]["member"], "b")
            self.assertEqual(members[1]["name"], "Sina Beispiel")
            self.assertEqual(members[1]["yob"], 1992)
            self.assertEqual(members[1]["club"], "TSV")

    def test_list_series_years_returns_empty_without_workspace_data(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            service = UiApiService(workspace_dir=Path(temp_dir))
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_series_list_1",
                    "method": "list_series_years",
                    "payload": {},
                }
            )
            self.assertEqual(response["status"], "ok")
            self.assertEqual(response["payload"]["count"], 0)

    def test_create_open_and_list_series_year(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            service = UiApiService(workspace_dir=workspace)
            created = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_series_create_1",
                    "method": "create_series_year",
                    "payload": {"series_year": 2026, "display_name": "Saison 2026"},
                }
            )
            self.assertEqual(created["status"], "ok")
            self.assertEqual(created["payload"]["series_year"], 2026)

            listed = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_series_list_2",
                    "method": "list_series_years",
                    "payload": {},
                }
            )
            self.assertEqual(listed["status"], "ok")
            self.assertEqual(listed["payload"]["count"], 1)
            self.assertEqual(listed["payload"]["items"][0]["series_year"], 2026)
            race_coverage = listed["payload"]["items"][0]["race_coverage"]
            self.assertEqual(race_coverage["singles_race_numbers"], [])
            self.assertEqual(race_coverage["couples_race_numbers"], [])
            self.assertEqual(race_coverage["race_columns"], [1, 2, 3, 4, 5])

            opened = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_series_open_1",
                    "method": "open_series_year",
                    "payload": {"series_year": 2026},
                }
            )
            self.assertEqual(opened["status"], "ok")
            self.assertTrue(opened["payload"]["active"])
            project_state = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_project_state_1",
                    "method": "get_project_state",
                    "payload": {"series_year": 2026},
                }
            )
            self.assertEqual(project_state["status"], "ok")
            self.assertEqual(project_state["payload"]["counts"]["events_total"], 0)

    def test_list_series_years_includes_race_coverage_for_active_events(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            service = UiApiService(workspace_dir=workspace)
            project_file = workspace / "data" / "series" / "2026" / "session_project.json"
            men_category = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.MEN)
            couples_category = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.COUPLES_MIXED)
            participant = Person(uid="participant_1", name="Max Muster", yob=1990, gender=Gender.M, club="TSV")
            team = Couple(
                uid="team_1",
                member_a=Person(name="Alex Team", yob=1985, gender=Gender.M, club="TSV"),
                member_b=Person(name="Nina Team", yob=1988, gender=Gender.F, club="TSV"),
            )
            event_single_1 = RaceEvent(
                race_event_uid="race_single_1",
                category=men_category,
                race_date="2026-01-01",
                race_no=1,
                source_file="single_1.xlsx",
                source_sha256="single_1",
                imported_at="2026-01-01T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp_single_1",
                entries=(RaceEntry(entry_uid="entry_single_1", participant_uid=participant.uid, startnr="1", result=EntryResult(10.0, 20.0)),),
            )
            event_single_7 = RaceEvent(
                race_event_uid="race_single_7",
                category=men_category,
                race_date="2026-02-01",
                race_no=7,
                source_file="single_7.xlsx",
                source_sha256="single_7",
                imported_at="2026-02-01T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp_single_7",
                entries=(RaceEntry(entry_uid="entry_single_7", participant_uid=participant.uid, startnr="2", result=EntryResult(11.0, 22.0)),),
            )
            event_couples_2 = RaceEvent(
                race_event_uid="race_couples_2",
                category=couples_category,
                race_date="2026-03-01",
                race_no=2,
                source_file="couples_2.xlsx",
                source_sha256="couples_2",
                imported_at="2026-03-01T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp_couples_2",
                entries=(RaceEntry(entry_uid="entry_couples_2", team_uid=team.uid, startnr="5", result=EntryResult(9.0, 18.0)),),
            )
            event_rolled_back = RaceEvent(
                race_event_uid="race_single_3_old",
                category=men_category,
                race_date="2026-01-15",
                race_no=3,
                source_file="single_3_old.xlsx",
                source_sha256="single_3_old",
                imported_at="2026-01-15T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp_single_3_old",
                state=RaceEventState.ROLLED_BACK,
                entries=(RaceEntry(entry_uid="entry_single_3_old", participant_uid=participant.uid, startnr="3", result=EntryResult(10.5, 21.0)),),
            )
            event_invalid_race_no = RaceEvent(
                race_event_uid="race_single_invalid",
                category=men_category,
                race_date="2026-01-20",
                race_no=0,
                source_file="single_invalid.xlsx",
                source_sha256="single_invalid",
                imported_at="2026-01-20T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp_single_invalid",
                entries=(RaceEntry(entry_uid="entry_single_invalid", participant_uid=participant.uid, startnr="4", result=EntryResult(8.0, 16.0)),),
            )
            doc = ProjectDocument(
                schema_version=SCHEMA_VERSION_V2,
                people=(participant,),
                couples=(team,),
                events=(event_single_1, event_single_7, event_couples_2, event_rolled_back, event_invalid_race_no),
            )
            JsonProjectRepository(project_file).save(doc)
            listed = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_series_list_coverage",
                    "method": "list_series_years",
                    "payload": {},
                }
            )
            self.assertEqual(listed["status"], "ok")
            self.assertEqual(listed["payload"]["count"], 1)
            race_coverage = listed["payload"]["items"][0]["race_coverage"]
            self.assertEqual(race_coverage["singles_race_numbers"], [1, 7])
            self.assertEqual(race_coverage["couples_race_numbers"], [2])
            self.assertEqual(race_coverage["race_columns"], [1, 2, 3, 4, 5, 6, 7])

    def test_delete_series_year_removes_workspace_season_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            service = UiApiService(workspace_dir=workspace)
            created = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_series_create_delete_ok",
                    "method": "create_series_year",
                    "payload": {"series_year": 2026},
                }
            )
            self.assertEqual(created["status"], "ok")
            project_file = Path(created["payload"]["project_file"])
            self.assertTrue(project_file.exists())

            deleted = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_series_delete_ok",
                    "method": "delete_series_year",
                    "payload": {"series_year": 2026, "confirm_series_year": 2026},
                }
            )
            self.assertEqual(deleted["status"], "ok")
            self.assertTrue(deleted["payload"]["deleted"])
            self.assertEqual(deleted["payload"]["series_year"], 2026)
            self.assertFalse(project_file.parent.exists())

            listed = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_series_list_after_delete",
                    "method": "list_series_years",
                    "payload": {},
                }
            )
            self.assertEqual(listed["status"], "ok")
            self.assertEqual(listed["payload"]["count"], 0)

    def test_delete_series_year_rejects_confirmation_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            service = UiApiService(workspace_dir=workspace)
            service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_series_create_delete_mismatch",
                    "method": "create_series_year",
                    "payload": {"series_year": 2026},
                }
            )
            deleted = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_series_delete_mismatch",
                    "method": "delete_series_year",
                    "payload": {"series_year": 2026, "confirm_series_year": 2025},
                }
            )
            self.assertEqual(deleted["status"], "error")
            self.assertEqual(deleted["error"]["code"], "VALIDATION_ERROR")

    def test_delete_series_year_rejects_unknown_year(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            service = UiApiService(workspace_dir=workspace)
            deleted = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_series_delete_not_found",
                    "method": "delete_series_year",
                    "payload": {"series_year": 2040, "confirm_series_year": 2040},
                }
            )
            self.assertEqual(deleted["status"], "error")
            self.assertEqual(deleted["error"]["code"], "NOT_FOUND")

    def test_reset_series_year_replaces_dataset_but_keeps_season_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            service = UiApiService(workspace_dir=workspace)
            created = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_series_create_reset_ok",
                    "method": "create_series_year",
                    "payload": {"series_year": 2026},
                }
            )
            self.assertEqual(created["status"], "ok")
            project_file = Path(created["payload"]["project_file"])
            _seed_project_for_year(project_file, 2026)
            before = JsonProjectRepository(project_file).load()
            self.assertGreater(len(before.events), 0)
            self.assertGreater(len(before.people), 0)

            reset = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_series_reset_ok",
                    "method": "reset_series_year",
                    "payload": {"series_year": 2026, "confirm_series_year": 2026},
                }
            )
            self.assertEqual(reset["status"], "ok")
            self.assertTrue(reset["payload"]["reset"])
            self.assertTrue(project_file.parent.exists())
            self.assertTrue(project_file.exists())

            after = JsonProjectRepository(project_file).load()
            self.assertEqual(after.schema_version, SCHEMA_VERSION_V2)
            self.assertEqual(len(after.events), 0)
            self.assertEqual(len(after.people), 0)
            self.assertEqual(len(after.couples), 0)
            self.assertEqual(len(after.matching_decisions), 0)

    def test_reset_series_year_rejects_confirmation_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            service = UiApiService(workspace_dir=workspace)
            service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_series_create_reset_mismatch",
                    "method": "create_series_year",
                    "payload": {"series_year": 2026},
                }
            )
            reset = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_series_reset_mismatch",
                    "method": "reset_series_year",
                    "payload": {"series_year": 2026, "confirm_series_year": 2025},
                }
            )
            self.assertEqual(reset["status"], "error")
            self.assertEqual(reset["error"]["code"], "VALIDATION_ERROR")

    def test_reset_series_year_rejects_unknown_year(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            service = UiApiService(workspace_dir=workspace)
            reset = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_series_reset_not_found",
                    "method": "reset_series_year",
                    "payload": {"series_year": 2040, "confirm_series_year": 2040},
                }
            )
            self.assertEqual(reset["status"], "error")
            self.assertEqual(reset["error"]["code"], "NOT_FOUND")

    def test_export_series_year_writes_manifest_and_payload_zip(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            service = UiApiService(workspace_dir=workspace)
            created = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_export_create",
                    "method": "create_series_year",
                    "payload": {"series_year": 2026},
                }
            )
            project_file = Path(created["payload"]["project_file"])
            _seed_project_for_year(project_file, 2026)
            export_file = workspace / "exports" / "s2026.stundenlauf-season.zip"
            exported = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_export",
                    "method": "export_series_year",
                    "payload": {"series_year": 2026, "destination_path": str(export_file)},
                }
            )
            self.assertEqual(exported["status"], "ok")
            self.assertTrue(export_file.exists())
            self.assertGreater(exported["payload"]["bytes_written"], 0)
            with zipfile.ZipFile(export_file, "r") as archive:
                self.assertCountEqual(
                    archive.namelist(),
                    ["manifest.json", "session_project.json"],
                )
                manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
                session_bytes = archive.read("session_project.json")
            self.assertEqual(manifest["series_year"], 2026)
            self.assertEqual(manifest["schema_version"], SCHEMA_VERSION_V2)
            self.assertEqual(manifest["sha256_session_project"], hashlib.sha256(session_bytes).hexdigest())

    def test_import_series_year_rejects_checksum_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            archive_path = Path(temp_dir) / "bad.stundenlauf-season.zip"
            payload_bytes = b'{"schema_version":2,"people":[],"couples":[],"events":[],"matching_decisions":[],"standings_snapshots":[]}'
            bad_manifest = {
                "format_version": 1,
                "schema_version": 2,
                "series_year": 2026,
                "events_total": 0,
                "sha256_session_project": "deadbeef",
            }
            with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("manifest.json", json.dumps(bad_manifest))
                archive.writestr("session_project.json", payload_bytes)
            service = UiApiService(workspace_dir=Path(temp_dir))
            imported = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_import_bad_checksum",
                    "method": "import_series_year",
                    "payload": {"file_path": str(archive_path)},
                }
            )
            self.assertEqual(imported["status"], "error")
            self.assertEqual(imported["error"]["code"], "VALIDATION_ERROR")

    def test_import_series_year_can_replace_existing_when_confirmed(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            service = UiApiService(workspace_dir=workspace)
            created = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_import_create",
                    "method": "create_series_year",
                    "payload": {"series_year": 2026},
                }
            )
            project_file = Path(created["payload"]["project_file"])
            _seed_project_for_year(project_file, 2026)
            exported = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_export_for_import",
                    "method": "export_series_year",
                    "payload": {"series_year": 2026},
                }
            )
            self.assertEqual(exported["status"], "ok")
            # Make local season different first.
            JsonProjectRepository(project_file).save(ProjectDocument(schema_version=SCHEMA_VERSION_V2))

            no_replace = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_import_no_replace",
                    "method": "import_series_year",
                    "payload": {"file_path": exported["payload"]["export_file"]},
                }
            )
            self.assertEqual(no_replace["status"], "error")
            self.assertEqual(no_replace["error"]["code"], "VALIDATION_ERROR")

            replaced = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_import_replace",
                    "method": "import_series_year",
                    "payload": {
                        "file_path": exported["payload"]["export_file"],
                        "replace_existing": True,
                        "confirm_replace_series_year": 2026,
                    },
                }
            )
            self.assertEqual(replaced["status"], "ok")
            self.assertTrue(replaced["payload"]["replaced_existing"])
            restored = JsonProjectRepository(project_file).load()
            self.assertEqual(len(restored.events), 1)

    def test_envelope_requires_api_version_and_request_id(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            service = UiApiService(project_path)
            response = service.handle({"method": "get_project_state", "payload": {}})
            self.assertEqual(response["status"], "error")
            self.assertEqual(response["error"]["code"], "VALIDATION_ERROR")

    def test_get_category_current_results_table_returns_race_cells(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            service = UiApiService(project_path)
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_table_1",
                    "method": "get_category_current_results_table",
                    "payload": {"category_key": "2026:hour:men"},
                }
            )
            self.assertEqual(response["status"], "ok")
            payload = response["payload"]
            self.assertEqual(payload["meta"]["category_key"], "2026:hour:men")
            self.assertEqual(payload["meta"]["race_headers"], ["1. Lauf"])
            self.assertGreaterEqual(len(payload["rows"]), 1)
            self.assertIn("race_cells", payload["rows"][0])

    def test_list_categories_filters_by_year(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            service = UiApiService(project_path)
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_categories_2026",
                    "method": "list_categories",
                    "payload": {"series_year": 2026},
                }
            )
            self.assertEqual(response["status"], "ok")
            payload = response["payload"]
            self.assertEqual(payload["series_year"], 2026)
            self.assertEqual(payload["count"], 1)
            self.assertEqual(payload["items"][0]["category_key"], "2026:hour:men")

    def test_get_year_overview_returns_compact_workspace_data(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            service = UiApiService(project_path)
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_overview_2026",
                    "method": "get_year_overview",
                    "payload": {"series_year": 2026},
                }
            )
            self.assertEqual(response["status"], "ok")
            payload = response["payload"]
            self.assertEqual(payload["series_year"], 2026)
            self.assertEqual(payload["totals"]["events_total"], 1)
            self.assertEqual(payload["totals"]["categories"], 1)
            self.assertEqual(len(payload["race_history_groups"]), 1)
            self.assertEqual(payload["race_history_groups"][0]["category_key"], "2026:hour:men")

    def test_get_year_overview_race_history_groups_only_include_active_events(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            category = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.MEN)
            active_event = RaceEvent(
                race_event_uid="race_event_active_1",
                category=category,
                race_date="2026-01-05",
                race_no=1,
                source_file="fixture_1.xlsx",
                source_sha256="sha1",
                imported_at="2026-01-05T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp1",
                entries=(),
            )
            rolled_back_event = RaceEvent(
                race_event_uid="race_event_rolled_back_2",
                category=category,
                race_date="2026-02-05",
                race_no=2,
                source_file="fixture_2.xlsx",
                source_sha256="sha2",
                imported_at="2026-02-05T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp2",
                state=RaceEventState.ROLLED_BACK,
                entries=(),
            )
            doc = ProjectDocument(
                schema_version=SCHEMA_VERSION_V2,
                events=(active_event, rolled_back_event),
            )
            JsonProjectRepository(project_path).save(recompute_project_standings(doc))
            service = UiApiService(project_path)
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_overview_active_only",
                    "method": "get_year_overview",
                    "payload": {"series_year": 2026},
                }
            )
            self.assertEqual(response["status"], "ok")
            payload = response["payload"]
            self.assertEqual(payload["totals"]["events_total"], 2)
            self.assertEqual(payload["totals"]["events_active"], 1)
            self.assertEqual(len(payload["race_history_groups"]), 1)
            events = payload["race_history_groups"][0]["events"]
            self.assertEqual([item["race_no"] for item in events], [1])

    def test_get_year_timeline_scopes_audit_items(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            bridge = PywebviewApiBridge(str(project_path))

            bridge.invoke(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_apply_timeline",
                    "method": "apply_match_decision",
                    "payload": {
                        "race_event_uid": "race_event_1",
                        "entry_uid": "entry_review_1",
                        "target_participant_uid": "participant_target",
                    },
                }
            )
            timeline = bridge.invoke(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_timeline_2026",
                    "method": "get_year_timeline",
                    "payload": {"series_year": 2026},
                }
            )
            self.assertEqual(timeline["status"], "ok")
            self.assertGreaterEqual(timeline["payload"]["count"], 1)
            for item in timeline["payload"]["items"]:
                if "category_key" in item:
                    self.assertTrue(str(item["category_key"]).startswith("2026:"))
                if item["event_type"] in {"race_import", "race_rolled_back", "rollback"}:
                    self.assertIn("source_sha256", item)

    def test_get_project_state_accepts_optional_year_filter(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            service = UiApiService(project_path)

            filtered = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_project_state_filter",
                    "method": "get_project_state",
                    "payload": {"series_year": 2026},
                }
            )
            self.assertEqual(filtered["status"], "ok")
            self.assertEqual(filtered["payload"]["counts"]["events_total"], 1)
            self.assertEqual(filtered["payload"]["counts"]["events_active"], 1)

    def test_apply_match_decision_rejects_missing_required_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            service = UiApiService(project_path)
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_apply_1",
                    "method": "apply_match_decision",
                    "payload": {"race_event_uid": "race_event_1"},
                }
            )
            self.assertEqual(response["status"], "error")
            self.assertEqual(response["error"]["code"], "VALIDATION_ERROR")

    def test_import_race_accepts_optional_source_type(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            service = UiApiService(project_path)
            with patch("backend.ui_api.commands.import_excel_into_project") as mock_import:
                mock_import.return_value = type(
                    "ImportResultStub",
                    (),
                    {
                        "noop": False,
                        "issues": (),
                        "merged_event_uids": ("race_event_x",),
                        "rows_imported": 0,
                        "source_file": Path("dummy.xlsx"),
                        "matching_report": None,
                    },
                )()
                response = service.handle(
                    {
                        "api_version": API_VERSION_V1,
                        "request_id": "req_import_source_type",
                        "method": "import_race",
                        "payload": {
                            "file_path": "dummy.xlsx",
                            "series_year": 2026,
                            "source_type": "singles",
                        },
                    }
                )
                self.assertEqual(response["status"], "ok")
                mock_import.assert_called_once()
                self.assertEqual(mock_import.call_args.kwargs["source_type"], "singles")
                self.assertIsNone(mock_import.call_args.kwargs.get("race_no"))
                self.assertEqual(mock_import.call_args.kwargs["matching_config"].auto_min, 1.0)

    def test_import_race_accepts_optional_race_no(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            service = UiApiService(project_path)
            with patch("backend.ui_api.commands.import_excel_into_project") as mock_import:
                mock_import.return_value = type(
                    "ImportResultStub",
                    (),
                    {
                        "noop": False,
                        "issues": (),
                        "merged_event_uids": ("race_event_x",),
                        "rows_imported": 0,
                        "source_file": Path("dummy.xlsx"),
                        "matching_report": None,
                    },
                )()
                response = service.handle(
                    {
                        "api_version": API_VERSION_V1,
                        "request_id": "req_import_race_no",
                        "method": "import_race",
                        "payload": {
                            "file_path": "dummy.xlsx",
                            "series_year": 2026,
                            "source_type": "singles",
                            "race_no": 4,
                        },
                    }
                )
                self.assertEqual(response["status"], "ok")
                mock_import.assert_called_once()
                self.assertEqual(mock_import.call_args.kwargs["race_no"], 4)

    def test_import_race_rejects_invalid_race_no(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            service = UiApiService(project_path)
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_import_bad_race_no",
                    "method": "import_race",
                    "payload": {
                        "file_path": "dummy.xlsx",
                        "series_year": 2026,
                        "race_no": 0,
                    },
                }
            )
            self.assertEqual(response["status"], "error")
            self.assertEqual(response["error"]["code"], "VALIDATION_ERROR")

    def test_import_race_rejects_invalid_source_type(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            service = UiApiService(project_path)
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_import_invalid_source_type",
                    "method": "import_race",
                    "payload": {
                        "file_path": "dummy.xlsx",
                        "series_year": 2026,
                        "source_type": "invalid",
                    },
                }
            )
            self.assertEqual(response["status"], "error")
            self.assertEqual(response["error"]["code"], "VALIDATION_ERROR")

    def test_matching_config_can_be_read_and_updated(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            service = UiApiService(project_path)
            initial = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_matching_cfg_initial",
                    "method": "get_matching_config",
                    "payload": {},
                }
            )
            self.assertEqual(initial["status"], "ok")
            self.assertFalse(initial["payload"]["auto_merge_enabled"])
            self.assertTrue(initial["payload"]["perfect_match_auto_merge"])
            self.assertTrue(initial["payload"]["strict_normalized_auto_only"])
            self.assertEqual(initial["payload"]["auto_min"], 1.0)
            self.assertEqual(initial["payload"]["effective_auto_min"], 1.0)

            updated = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_matching_cfg_update",
                    "method": "set_matching_config",
                    "payload": {
                        "auto_min": 0.94,
                        "auto_merge_enabled": True,
                        "perfect_match_auto_merge": True,
                        "strict_normalized_auto_only": False,
                    },
                }
            )
            self.assertEqual(updated["status"], "ok")
            self.assertTrue(updated["payload"]["auto_merge_enabled"])
            self.assertTrue(updated["payload"]["perfect_match_auto_merge"])
            self.assertFalse(updated["payload"]["strict_normalized_auto_only"])
            self.assertEqual(updated["payload"]["auto_min"], 0.94)
            self.assertEqual(updated["payload"]["effective_auto_min"], 0.94)

            strict_on = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_matching_cfg_strict",
                    "method": "set_matching_config",
                    "payload": {
                        "auto_min": 0.94,
                        "auto_merge_enabled": True,
                        "perfect_match_auto_merge": True,
                        "strict_normalized_auto_only": True,
                    },
                }
            )
            self.assertEqual(strict_on["status"], "ok")
            self.assertTrue(strict_on["payload"]["strict_normalized_auto_only"])
            self.assertTrue(service.matching_config.strict_normalized_auto_only)

    def test_reimport_race_rolls_back_all_events_with_same_source_hash(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            category = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.MEN)
            event_a = RaceEvent(
                race_event_uid="race_event_same_source_a",
                category=category,
                race_date="2026-01-05",
                race_no=1,
                source_file="fixture_a.xlsx",
                source_sha256="shared_source_sha",
                imported_at="2026-01-05T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp",
                entries=(),
            )
            event_b = RaceEvent(
                race_event_uid="race_event_same_source_b",
                category=category,
                race_date="2026-01-06",
                race_no=1,
                source_file="fixture_b.xlsx",
                source_sha256="shared_source_sha",
                imported_at="2026-01-06T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp",
                entries=(),
            )
            JsonProjectRepository(project_path).save(
                recompute_project_standings(
                    ProjectDocument(schema_version=SCHEMA_VERSION_V2, events=(event_a, event_b))
                )
            )
            service = UiApiService(project_path)
            with patch("backend.ui_api.commands.import_excel_into_project") as mock_import:
                mock_import.return_value = type(
                    "ImportResultStub",
                    (),
                    {
                        "noop": False,
                        "issues": (),
                        "merged_event_uids": ("race_event_reimported",),
                        "rows_imported": 0,
                        "source_file": Path("dummy.xlsx"),
                        "matching_report": None,
                    },
                )()
                response = service.handle(
                    {
                        "api_version": API_VERSION_V1,
                        "request_id": "req_reimport_batch_1",
                        "method": "reimport_race",
                        "payload": {
                            "previous_race_event_uid": "race_event_same_source_a",
                            "file_path": "dummy.xlsx",
                            "series_year": 2026,
                            "source_type": "singles",
                        },
                    }
                )
            self.assertEqual(response["status"], "ok")
            reimport_meta = response["payload"]["reimport"]
            self.assertEqual(reimport_meta["source_sha256"], "shared_source_sha")
            self.assertEqual(reimport_meta["rolled_back_event_count"], 2)
            self.assertCountEqual(
                reimport_meta["rolled_back_event_uids"],
                ["race_event_same_source_a", "race_event_same_source_b"],
            )
            doc = JsonProjectRepository(project_path).load()
            for event in doc.events:
                self.assertEqual(event.state, RaceEventState.ROLLED_BACK)
            self.assertEqual(len([event for event in doc.events if event.rollback is not None]), 2)

    def test_rollback_source_batch_rolls_back_all_events_with_same_source_hash(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            category = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.MEN)
            event_a = RaceEvent(
                race_event_uid="race_event_batch_a",
                category=category,
                race_date="2026-01-05",
                race_no=1,
                source_file="fixture_a.xlsx",
                source_sha256="batch_source_sha",
                imported_at="2026-01-05T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp",
                entries=(),
            )
            event_b = RaceEvent(
                race_event_uid="race_event_batch_b",
                category=category,
                race_date="2026-01-06",
                race_no=2,
                source_file="fixture_b.xlsx",
                source_sha256="batch_source_sha",
                imported_at="2026-01-06T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp",
                entries=(),
            )
            JsonProjectRepository(project_path).save(
                recompute_project_standings(ProjectDocument(schema_version=SCHEMA_VERSION_V2, events=(event_a, event_b)))
            )
            service = UiApiService(project_path)
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_rollback_source_batch_1",
                    "method": "rollback_source_batch",
                    "payload": {"race_event_uid": "race_event_batch_a"},
                }
            )
            self.assertEqual(response["status"], "ok")
            self.assertEqual(response["payload"]["source_sha256"], "batch_source_sha")
            self.assertEqual(response["payload"]["rolled_back_event_count"], 2)
            self.assertCountEqual(
                response["payload"]["rolled_back_event_uids"],
                ["race_event_batch_a", "race_event_batch_b"],
            )

            doc = JsonProjectRepository(project_path).load()
            for event in doc.events:
                self.assertEqual(event.state, RaceEventState.ROLLED_BACK)

    def test_rollback_source_batch_requires_anchor_or_hash(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            service = UiApiService(project_path)
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_rollback_source_batch_missing",
                    "method": "rollback_source_batch",
                    "payload": {},
                }
            )
            self.assertEqual(response["status"], "error")
            self.assertEqual(response["error"]["code"], "VALIDATION_ERROR")

    def test_ui_api_import_race_propagates_duplicate_error_details(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            service = UiApiService(project_path)
            with patch(
                "backend.ui_api.commands.import_excel_into_project",
                side_effect=ValueError("Doppelimport-Konflikt: Diese Datei wurde bereits importiert."),
            ):
                response = service.handle(
                    {
                        "api_version": API_VERSION_V1,
                        "request_id": "req_import_duplicate_1",
                        "method": "import_race",
                        "payload": {
                            "file_path": "dummy.xlsx",
                            "series_year": 2026,
                            "source_type": "singles",
                        },
                    }
                )
            self.assertEqual(response["status"], "error")
            self.assertEqual(response["error"]["code"], "IMPORT_DUPLICATE")

    def test_bridge_apply_decision_updates_review_queue_and_audit(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            bridge = PywebviewApiBridge(str(project_path))

            before = bridge.invoke(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_q_before",
                    "method": "get_review_queue",
                    "payload": {},
                }
            )
            self.assertEqual(before["status"], "ok")
            self.assertEqual(before["payload"]["count"], 1)
            first_review_item = before["payload"]["items"][0]
            self.assertIn("entry_preview", first_review_item)
            self.assertIn("candidate_previews", first_review_item)
            self.assertEqual(first_review_item["entry_preview"]["display_name"], "Max Mustermann")
            self.assertEqual(first_review_item["candidate_previews"][0]["display_name"], "Max Mustermann")

            applied = bridge.invoke(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_apply_2",
                    "method": "apply_match_decision",
                    "payload": {
                        "race_event_uid": "race_event_1",
                        "entry_uid": "entry_review_1",
                        "row_fingerprint": "person:max:1990:m",
                        "target_participant_uid": "participant_target",
                        "rationale": "manual review accept",
                    },
                }
            )
            self.assertEqual(applied["status"], "ok")

            after = bridge.invoke(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_q_after",
                    "method": "get_review_queue",
                    "payload": {},
                }
            )
            self.assertEqual(after["status"], "ok")
            self.assertEqual(after["payload"]["count"], 0)

            audit = bridge.invoke(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_audit_1",
                    "method": "get_audit_timeline",
                    "payload": {"race_event_uid": "race_event_1"},
                }
            )
            self.assertEqual(audit["status"], "ok")
            kinds = [item["event_type"] for item in audit["payload"]["items"]]
            self.assertIn("matching_decision", kinds)

    def test_apply_match_decision_can_create_new_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            bridge = PywebviewApiBridge(str(project_path))

            before_state = bridge.invoke(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_state_before_new_identity",
                    "method": "get_project_state",
                    "payload": {},
                }
            )
            self.assertEqual(before_state["status"], "ok")
            before_people = before_state["payload"]["counts"]["people"]

            created = bridge.invoke(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_create_identity_1",
                    "method": "apply_match_decision",
                    "payload": {
                        "race_event_uid": "race_event_1",
                        "entry_uid": "entry_review_1",
                        "decision_action": "create_new_identity",
                        "rationale": "manuell als neu geführt",
                    },
                }
            )
            self.assertEqual(created["status"], "ok")

            after_state = bridge.invoke(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_state_after_new_identity",
                    "method": "get_project_state",
                    "payload": {},
                }
            )
            self.assertEqual(after_state["status"], "ok")
            self.assertEqual(after_state["payload"]["counts"]["people"], before_people + 1)

            queue_after = bridge.invoke(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_queue_after_new_identity",
                    "method": "get_review_queue",
                    "payload": {},
                }
            )
            self.assertEqual(queue_after["status"], "ok")
            self.assertEqual(queue_after["payload"]["count"], 0)

    def test_get_review_queue_includes_confidence_label_and_sorted_desc(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            category = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.MEN)
            high = Person(uid="participant_high", name="Alpha Beispiel", yob=1991, gender=Gender.M, club="TSV A")
            low = Person(uid="participant_low", name="Beta Beispiel", yob=1992, gender=Gender.M, club="TSV B")
            entry_high = RaceEntry(
                entry_uid="entry_high",
                participant_uid=high.uid,
                startnr="1",
                result=EntryResult(distance_km=11.0, points=22.0),
                match_meta=RaceEntryMatchMeta(
                    route="review",
                    confidence=0.9,
                    top_candidate_uid=high.uid,
                    candidate_uids=(high.uid,),
                    candidate_confidences=(0.9,),
                    features={"name_similarity": 0.9},
                ),
            )
            entry_low = RaceEntry(
                entry_uid="entry_low",
                participant_uid=low.uid,
                startnr="2",
                result=EntryResult(distance_km=10.0, points=20.0),
                match_meta=RaceEntryMatchMeta(
                    route="review",
                    confidence=0.7,
                    top_candidate_uid=low.uid,
                    candidate_uids=(low.uid,),
                    candidate_confidences=(0.7,),
                    features={"name_similarity": 0.7},
                ),
            )
            event = RaceEvent(
                race_event_uid="race_event_2026_1",
                category=category,
                race_date="2026-02-01",
                race_no=2,
                source_file="fixture_sort.xlsx",
                source_sha256="sha-sort",
                imported_at="2026-02-01T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp-sort",
                entries=(entry_low, entry_high),
            )
            doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(high, low), events=(event,))
            JsonProjectRepository(project_path).save(recompute_project_standings(doc))
            service = UiApiService(project_path)
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_queue_sorted",
                    "method": "get_review_queue",
                    "payload": {},
                }
            )
            self.assertEqual(response["status"], "ok")
            items = response["payload"]["items"]
            self.assertEqual([item["entry_uid"] for item in items], ["entry_high", "entry_low"])
            self.assertEqual(items[0]["confidence_label"], "hoch")
            self.assertEqual(items[1]["confidence_label"], "mittel")

    def test_get_review_queue_includes_candidate_confidences_per_candidate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            category = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.WOMEN)
            a = Person(uid="participant_a", name="Miriam Winkler", yob=2009, gender=Gender.F, club="TSV")
            b = Person(uid="participant_b", name="Mirjam Hertenstein", yob=2001, gender=Gender.F, club="TSV")
            review_entry = RaceEntry(
                entry_uid="entry_two_cand",
                participant_uid=a.uid,
                startnr="9",
                result=EntryResult(distance_km=9.0, points=18.0),
                match_meta=RaceEntryMatchMeta(
                    route="review",
                    confidence=1.0,
                    top_candidate_uid=a.uid,
                    candidate_uids=(a.uid, b.uid),
                    candidate_confidences=(0.88, 0.61),
                    features={"total": 1.0},
                ),
            )
            event = RaceEvent(
                race_event_uid="race_event_cc",
                category=category,
                race_date="2026-03-01",
                race_no=1,
                source_file="fixture_cc.xlsx",
                source_sha256="sha-cc",
                imported_at="2026-03-01T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp-cc",
                entries=(review_entry,),
            )
            doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(a, b), events=(event,))
            JsonProjectRepository(project_path).save(recompute_project_standings(doc))
            service = UiApiService(project_path)
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_cc",
                    "method": "get_review_queue",
                    "payload": {},
                }
            )
            self.assertEqual(response["status"], "ok")
            item = response["payload"]["items"][0]
            self.assertEqual(item["candidate_confidences"], [0.88, 0.61])
            self.assertEqual(len(item["candidate_confidences"]), len(item["candidate_uids"]))

    def test_get_review_queue_prefers_incoming_preview_over_provisional_link(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            category = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.MEN)
            existing = Person(uid="participant_existing", name="Max Mustermann", yob=1990, gender=Gender.M, club="TSV")
            review_entry = RaceEntry(
                entry_uid="entry_review_incoming",
                participant_uid=existing.uid,
                startnr="17",
                result=EntryResult(distance_km=11.5, points=23.0),
                match_meta=RaceEntryMatchMeta(
                    route="review",
                    confidence=0.8,
                    top_candidate_uid=existing.uid,
                    candidate_uids=(existing.uid,),
                    candidate_confidences=(0.8,),
                    features={"name_similarity": 0.8},
                    incoming_display_name="Max Mustermannn",
                    incoming_yob=1990,
                    incoming_club="TSV",
                    incoming_kind="participant",
                ),
            )
            event = RaceEvent(
                race_event_uid="race_event_preview_1",
                category=category,
                race_date="2026-02-07",
                race_no=3,
                source_file="fixture_preview.xlsx",
                source_sha256="sha-preview",
                imported_at="2026-02-07T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp-preview",
                entries=(review_entry,),
            )
            JsonProjectRepository(project_path).save(
                recompute_project_standings(ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(existing,), events=(event,)))
            )
            service = UiApiService(project_path)
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_queue_incoming_preview",
                    "method": "get_review_queue",
                    "payload": {},
                }
            )
            self.assertEqual(response["status"], "ok")
            item = response["payload"]["items"][0]
            self.assertEqual(item["entry_preview"]["display_name"], "Max Mustermannn")
            self.assertEqual(item["candidate_previews"][0]["display_name"], "Max Mustermann")

    def test_get_review_queue_includes_member_yobs_for_team_previews(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            category = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.COUPLES_MIXED)
            team = Couple(
                uid="team_review_1",
                member_a=Person(name="Alex Beispiel", yob=1987, gender=Gender.M, club="TSV"),
                member_b=Person(name="Sina Beispiel", yob=1992, gender=Gender.F, club="TSV"),
            )
            review_entry = RaceEntry(
                entry_uid="entry_review_team_1",
                team_uid=team.uid,
                startnr="41",
                result=EntryResult(distance_km=9.8, points=18.0),
                match_meta=RaceEntryMatchMeta(
                    route="review",
                    confidence=0.8,
                    top_candidate_uid=team.uid,
                    candidate_uids=(team.uid,),
                    candidate_confidences=(0.8,),
                    features={"name_similarity": 0.8},
                ),
            )
            event = RaceEvent(
                race_event_uid="race_event_review_team_1",
                category=category,
                race_date="2026-02-10",
                race_no=2,
                source_file="fixture_review_team.xlsx",
                source_sha256="sha-review-team",
                imported_at="2026-02-10T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp-review-team",
                entries=(review_entry,),
            )
            doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, couples=(team,), events=(event,))
            JsonProjectRepository(project_path).save(recompute_project_standings(doc))
            service = UiApiService(project_path)
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_queue_team_yobs",
                    "method": "get_review_queue",
                    "payload": {},
                }
            )
            self.assertEqual(response["status"], "ok")
            item = response["payload"]["items"][0]
            self.assertEqual(item["entry_preview"]["display_name"], "Alex Beispiel / Sina Beispiel")
            self.assertEqual(item["entry_preview"]["yob"], "1987 / 1992")
            self.assertEqual(item["candidate_previews"][0]["yob"], "1987 / 1992")

    def test_get_review_queue_uses_incoming_team_yobs_for_left_preview(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            category = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.COUPLES_MIXED)
            existing_team = Couple(
                uid="team_existing_1",
                member_a=Person(name="Alex Beispiel", yob=1980, gender=Gender.M, club="TSV"),
                member_b=Person(name="Sina Beispiel", yob=1981, gender=Gender.F, club="TSV"),
            )
            review_entry = RaceEntry(
                entry_uid="entry_review_team_incoming_1",
                team_uid=existing_team.uid,
                startnr="44",
                result=EntryResult(distance_km=9.8, points=18.0),
                match_meta=RaceEntryMatchMeta(
                    route="review",
                    confidence=0.78,
                    top_candidate_uid=existing_team.uid,
                    candidate_uids=(existing_team.uid,),
                    candidate_confidences=(0.78,),
                    features={"name_similarity": 0.78},
                    incoming_display_name="Alex Beispiel / Sina Beispiel",
                    incoming_yob_text="1987 / 1992",
                    incoming_club="TSV / TSV",
                    incoming_kind="team",
                ),
            )
            event = RaceEvent(
                race_event_uid="race_event_review_team_incoming_1",
                category=category,
                race_date="2026-02-11",
                race_no=3,
                source_file="fixture_review_team_incoming.xlsx",
                source_sha256="sha-review-team-incoming",
                imported_at="2026-02-11T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp-review-team-incoming",
                entries=(review_entry,),
            )
            doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, couples=(existing_team,), events=(event,))
            JsonProjectRepository(project_path).save(recompute_project_standings(doc))
            service = UiApiService(project_path)
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_queue_team_incoming_yobs",
                    "method": "get_review_queue",
                    "payload": {},
                }
            )
            self.assertEqual(response["status"], "ok")
            item = response["payload"]["items"][0]
            self.assertEqual(item["entry_preview"]["yob"], "1987 / 1992")
            self.assertEqual(item["candidate_previews"][0]["yob"], "1980 / 1981")

    def test_get_audit_timeline_accepts_optional_year_filter(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            service = UiApiService(project_path)
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_audit_filtered",
                    "method": "get_audit_timeline",
                    "payload": {"series_year": 2026},
                }
            )
            self.assertEqual(response["status"], "ok")
            items = response["payload"]["items"]
            self.assertGreaterEqual(len(items), 1)
            import_items = [item for item in items if "category_key" in item]
            self.assertTrue(all(str(item["category_key"]).startswith("2026:") for item in import_items))

    def test_switching_series_year_uses_active_year_categories(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            service = UiApiService(workspace_dir=workspace)

            created_2026 = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_create_2026",
                    "method": "create_series_year",
                    "payload": {"series_year": 2026},
                }
            )
            created_2027 = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_create_2027",
                    "method": "create_series_year",
                    "payload": {"series_year": 2027},
                }
            )
            _seed_project_for_year(Path(created_2026["payload"]["project_file"]), 2026)
            _seed_project_for_year(Path(created_2027["payload"]["project_file"]), 2027)

            service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_open_2026",
                    "method": "open_series_year",
                    "payload": {"series_year": 2026},
                }
            )
            stale_key = "2026:half_hour:men"
            before_switch = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_standings_2026",
                    "method": "get_standings",
                    "payload": {"category_key": stale_key},
                }
            )
            self.assertEqual(before_switch["status"], "ok")

            service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_open_2027",
                    "method": "open_series_year",
                    "payload": {"series_year": 2027},
                }
            )

            stale_after_switch = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_stale_key_2027",
                    "method": "get_standings",
                    "payload": {"category_key": stale_key},
                }
            )
            self.assertEqual(stale_after_switch["status"], "error")
            self.assertEqual(stale_after_switch["error"]["code"], "NOT_FOUND")

            current_year = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_standings_2027",
                    "method": "get_standings",
                    "payload": {"category_key": "2027:half_hour:men"},
                }
            )
            self.assertEqual(current_year["status"], "ok")

    def test_update_participant_identity_singles_updates_display_and_keeps_points(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            service = UiApiService(project_path)
            before = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_standings_before_id",
                    "method": "get_standings",
                    "payload": {"category_key": "2026:hour:men"},
                }
            )
            self.assertEqual(before["status"], "ok")
            pts = before["payload"]["rows"][0]["punkte_gesamt"]
            self.assertEqual(before["payload"]["rows"][0]["display_name"], "Max Mustermann")

            upd = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_id_update",
                    "method": "update_participant_identity",
                    "payload": {
                        "series_year": 2026,
                        "participant_uid": "participant_target",
                        "name": "Max Mustermann Sr.",
                        "yob": 1990,
                        "club": "TSV",
                    },
                }
            )
            self.assertEqual(upd["status"], "ok")
            self.assertEqual(upd["payload"]["participant_uid"], "participant_target")
            self.assertIsNone(upd["payload"]["team_uid"])

            after = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_standings_after_id",
                    "method": "get_standings",
                    "payload": {"category_key": "2026:hour:men"},
                }
            )
            self.assertEqual(after["status"], "ok")
            self.assertEqual(after["payload"]["rows"][0]["punkte_gesamt"], pts)
            self.assertEqual(after["payload"]["rows"][0]["display_name"], "Max Mustermann Sr.")

            loaded = JsonProjectRepository(project_path).load()
            person = next(p for p in loaded.people if p.uid == "participant_target")
            self.assertTrue(person.canonical_family)

            state = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_state_counts",
                    "method": "get_project_state",
                    "payload": {"series_year": 2026},
                }
            )
            self.assertEqual(state["payload"]["counts"]["matching_decisions"], 1)

    def test_update_participant_identity_team_member(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            category = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.COUPLES_MIXED)
            pa = Person(uid="pa_uid", name="Alex Beispiel", yob=1987, gender=Gender.M, club="TSV")
            pb = Person(uid="pb_uid", name="Sina Beispiel", yob=1992, gender=Gender.F, club="TSV")
            team = Couple(uid="team_mixed_1", member_a=pa, member_b=pb)
            event = RaceEvent(
                race_event_uid="race_event_couples_1",
                category=category,
                race_date="2026-01-05",
                race_no=1,
                source_file="fixture_couples.xlsx",
                source_sha256="sha-couples",
                imported_at="2026-01-05T10:00:00+00:00",
                parser_version="v1",
                schema_fingerprint="fp-couples",
                entries=(
                    RaceEntry(
                        entry_uid="entry_couples_1",
                        team_uid=team.uid,
                        startnr="1",
                        result=EntryResult(distance_km=10.5, points=20.0),
                    ),
                ),
            )
            doc = ProjectDocument(
                schema_version=SCHEMA_VERSION_V2,
                people=(pa, pb),
                couples=(team,),
                events=(event,),
            )
            JsonProjectRepository(project_path).save(recompute_project_standings(doc))
            service = UiApiService(project_path)

            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_team_id",
                    "method": "update_participant_identity",
                    "payload": {
                        "series_year": 2026,
                        "team_uid": "team_mixed_1",
                        "member": "a",
                        "name": "Alexander Beispiel",
                        "yob": 1987,
                        "club": "TSV",
                    },
                }
            )
            self.assertEqual(response["status"], "ok")
            self.assertEqual(response["payload"]["team_uid"], "team_mixed_1")

            standings = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_team_standings",
                    "method": "get_standings",
                    "payload": {"category_key": "2026:hour:couples_mixed"},
                }
            )
            self.assertEqual(standings["payload"]["rows"][0]["display_name"], "Alexander Beispiel / Sina Beispiel")

    def test_update_participant_identity_timeline_includes_correction(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            bridge = PywebviewApiBridge(str(project_path))
            bridge.invoke(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_id_timeline",
                    "method": "update_participant_identity",
                    "payload": {
                        "series_year": 2026,
                        "participant_uid": "participant_target",
                        "name": "Max Fixed",
                        "yob": 1990,
                        "club": "TSV",
                    },
                }
            )
            timeline = bridge.invoke(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_timeline_after_id",
                    "method": "get_year_timeline",
                    "payload": {"series_year": 2026},
                }
            )
            self.assertEqual(timeline["status"], "ok")
            kinds = [
                item["kind"]
                for item in timeline["payload"]["items"]
                if item.get("event_type") == "matching_decision"
            ]
            self.assertIn("identity_correction", kinds)

    def test_update_participant_identity_not_in_wrong_year_timeline(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            service = UiApiService(project_path)
            service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_id_wrong_year",
                    "method": "update_participant_identity",
                    "payload": {
                        "series_year": 2026,
                        "participant_uid": "participant_target",
                        "name": "Max Other Year",
                        "yob": 1990,
                        "club": "TSV",
                    },
                }
            )
            timeline = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_timeline_2025",
                    "method": "get_year_timeline",
                    "payload": {"series_year": 2025},
                }
            )
            self.assertEqual(timeline["status"], "ok")
            for item in timeline["payload"]["items"]:
                if item.get("event_type") == "matching_decision":
                    self.assertNotEqual(item.get("kind"), "identity_correction")

    def test_update_participant_identity_rejects_invalid_payload(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            service = UiApiService(project_path)
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_id_bad",
                    "method": "update_participant_identity",
                    "payload": {
                        "series_year": 2026,
                        "participant_uid": "participant_target",
                        "name": "",
                        "yob": 1990,
                    },
                }
            )
            self.assertEqual(response["status"], "error")
            self.assertEqual(response["error"]["code"], "VALIDATION_ERROR")

    def test_update_participant_identity_unknown_uid(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "project.json"
            _seed_project(project_path)
            service = UiApiService(project_path)
            response = service.handle(
                {
                    "api_version": API_VERSION_V1,
                    "request_id": "req_id_missing",
                    "method": "update_participant_identity",
                    "payload": {
                        "series_year": 2026,
                        "participant_uid": "no_such_person",
                        "name": "X",
                        "yob": 1990,
                    },
                }
            )
            self.assertEqual(response["status"], "error")
            self.assertEqual(response["error"]["code"], "NOT_FOUND")


if __name__ == "__main__":
    unittest.main()
