from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.domain.enums import Division, Gender, RaceDuration
from backend.domain.models import EntryResult, Person, ProjectDocument, RaceEntry, RaceEntryMatchMeta, RaceEvent, RaceSeriesCategory
from backend.ranking.engine import recompute_project_standings
from backend.storage.repository import JsonProjectRepository
from backend.storage.schema_v2 import SCHEMA_VERSION_V2
from backend.ui_api import API_VERSION_V1, PywebviewApiBridge, UiApiService


def _seed_project(path: Path) -> None:
    category = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.MEN)
    participant = Person(uid="participant_target", name="Max Mustermann", yob=1990, gender=Gender.M, club="TSV")
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
    doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(participant,), events=(event,))
    doc = recompute_project_standings(doc)
    JsonProjectRepository(path).save(doc)


class TestF08UiApi(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
