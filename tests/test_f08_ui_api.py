from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.domain.enums import Division, Gender, RaceDuration, RaceEventState
from backend.domain.models import EntryResult, Person, ProjectDocument, RaceEntry, RaceEntryMatchMeta, RaceEvent, RaceSeriesCategory
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


class TestF08UiApi(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
