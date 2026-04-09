from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from backend.domain.models import FieldResolution, MatchingDecision, RaceEntryMatchMeta
from backend.ingestion.service import import_excel_into_project
from backend.ranking.engine import recompute_project_standings
from backend.storage.repository import JsonProjectRepository
from backend.ui_api.errors import not_found, validation_error


def _iso_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def import_race(project_file: Path, payload: dict[str, Any]) -> dict[str, Any]:
    file_path = str(payload.get("file_path", "")).strip()
    series_year_raw = payload.get("series_year")
    if not file_path:
        raise validation_error("file_path is required")
    if series_year_raw is None:
        raise validation_error("series_year is required")
    series_year = int(series_year_raw)
    result = import_excel_into_project(
        project_file=project_file,
        excel_file=Path(file_path),
        series_year=series_year,
    )
    return {
        "noop": result.noop,
        "issues": list(result.issues),
        "merged_event_uids": list(result.merged_event_uids),
        "rows_imported": result.rows_imported,
        "source_file": str(result.source_file),
        "matching_report": None
        if result.matching_report is None
        else {
            "auto_links": result.matching_report.auto_links,
            "review_queue": result.matching_report.review_queue,
            "new_identities": result.matching_report.new_identities,
            "conflicts": result.matching_report.conflicts,
            "replay_overrides": result.matching_report.replay_overrides,
            "candidate_counts": list(result.matching_report.candidate_counts),
        },
    }


def apply_match_decision(project_file: Path, payload: dict[str, Any]) -> dict[str, Any]:
    race_event_uid = str(payload.get("race_event_uid", "")).strip()
    entry_uid = str(payload.get("entry_uid", "")).strip()
    row_fingerprint = str(payload.get("row_fingerprint", "")).strip()
    target_participant_uid = str(payload.get("target_participant_uid", "")).strip() or None
    target_team_uid = str(payload.get("target_team_uid", "")).strip() or None
    rationale = str(payload.get("rationale", "")).strip()
    if not race_event_uid:
        raise validation_error("race_event_uid is required")
    if not entry_uid:
        raise validation_error("entry_uid is required")
    if target_participant_uid is None and target_team_uid is None:
        raise validation_error("target_participant_uid or target_team_uid is required")

    repo = JsonProjectRepository(project_file)
    document = repo.load()
    event_index = next((i for i, item in enumerate(document.events) if item.race_event_uid == race_event_uid), None)
    if event_index is None:
        raise not_found("race_event_uid", race_event_uid)
    event = document.events[event_index]
    entry_index = next((i for i, item in enumerate(event.entries) if item.entry_uid == entry_uid), None)
    if entry_index is None:
        raise not_found("entry_uid", entry_uid)
    entry = event.entries[entry_index]
    target_uid = target_participant_uid or target_team_uid
    updated_meta = RaceEntryMatchMeta(
        route="auto",
        confidence=1.0,
        top_candidate_uid=target_uid,
        candidate_uids=(target_uid,) if target_uid else (),
        features={"manual_link": 1.0},
        conflict_flags=(),
    )
    updated_entry = replace(
        entry,
        participant_uid=target_participant_uid if target_participant_uid else entry.participant_uid,
        team_uid=target_team_uid if target_team_uid else entry.team_uid,
        match_meta=updated_meta,
    )
    updated_entries = list(event.entries)
    updated_entries[entry_index] = updated_entry
    updated_event = replace(event, entries=tuple(updated_entries))
    field_resolutions = tuple(
        FieldResolution(
            field_name=str(item.get("field_name", "")).strip(),
            kept_from=str(item.get("kept_from", "manual")).strip(),  # type: ignore[arg-type]
            value=str(item.get("value", "")).strip(),
        )
        for item in payload.get("field_resolutions", [])
        if isinstance(item, dict)
    )
    decision = MatchingDecision(
        decided_at=_iso_now(),
        kind="manual_link",
        row_fingerprint=row_fingerprint,
        race_event_uid=race_event_uid,
        entry_uid=entry_uid,
        target_participant_uid=target_participant_uid,
        target_team_uid=target_team_uid,
        rationale=rationale,
        field_resolutions=field_resolutions,
        feature_scores={"manual_link": 1.0},
    )
    updated_events = list(document.events)
    updated_events[event_index] = updated_event
    updated_doc = replace(
        document,
        events=tuple(updated_events),
        matching_decisions=tuple([*document.matching_decisions, decision]),
    )
    updated_doc = recompute_project_standings(updated_doc)
    repo.save(updated_doc)
    return {
        "decision_uid": decision.decision_uid,
        "race_event_uid": race_event_uid,
        "entry_uid": entry_uid,
        "target_uid": target_uid,
        "status": "applied",
    }


def rollback_race(project_file: Path, payload: dict[str, Any]) -> dict[str, Any]:
    race_event_uid = str(payload.get("race_event_uid", "")).strip()
    reason = str(payload.get("reason", "")).strip() or "ui_api.rollback"
    if not race_event_uid:
        raise validation_error("race_event_uid is required")
    repo = JsonProjectRepository(project_file)
    loaded = repo.load()
    updated = repo.mark_event_rolled_back(loaded, race_event_uid, "ui_api", reason)
    repo.save(updated)
    return {"race_event_uid": race_event_uid, "state": "rolled_back"}


def reimport_race(project_file: Path, payload: dict[str, Any]) -> dict[str, Any]:
    previous_race_event_uid = str(payload.get("previous_race_event_uid", "")).strip()
    if not previous_race_event_uid:
        raise validation_error("previous_race_event_uid is required")
    rollback_race(project_file, {"race_event_uid": previous_race_event_uid, "reason": "ui_api.reimport"})
    return import_race(project_file, payload)
