from __future__ import annotations

from dataclasses import asdict
from typing import Any

from backend.domain.enums import RaceEventState
from backend.domain.models import ProjectDocument, RaceEntry, RaceEvent, RaceSeriesCategory
from backend.ranking.engine import recompute_project_standings
from backend.ui_api.errors import not_found, validation_error
from backend.ui_api.mappers import category_label, club_for_row, display_name_for_row, race_event_identity, yob_for_row


def _find_category(document: ProjectDocument, category_key: str) -> RaceSeriesCategory:
    for event in document.events:
        if event.category.key == category_key:
            return event.category
    raise not_found("category_key", category_key)


def _table_by_category_key(document: ProjectDocument, category_key: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    doc = document if document.standings is not None else recompute_project_standings(document)
    if doc.standings is None:
        return {"ruleset_version": "", "calculated_at": "", "category_key": category_key}, []
    for table in doc.standings.category_tables:
        if table.category_key != category_key:
            continue
        rows = [
            {
                "platz": row.platz,
                "entity_kind": row.entity_kind,
                "entity_uid": row.entity_uid,
                "display_name": display_name_for_row(row, doc),
                "yob": yob_for_row(row, doc),
                "club": club_for_row(row, doc),
                "punkte_gesamt": row.punkte_gesamt,
                "distanz_gesamt": row.distanz_gesamt,
                "contribution_by_race": {
                    item.race_event_uid: item.counts_toward_total for item in row.race_contributions
                },
            }
            for row in table.rows
        ]
        meta = {
            "ruleset_version": doc.standings.ruleset_version,
            "calculated_at": doc.standings.calculated_at,
            "category_key": category_key,
        }
        return meta, rows
    return {"ruleset_version": doc.standings.ruleset_version, "calculated_at": doc.standings.calculated_at, "category_key": category_key}, []


def get_project_state(document: ProjectDocument) -> dict[str, Any]:
    active = [event for event in document.events if event.state == RaceEventState.ACTIVE]
    review_queue = 0
    for event in active:
        for entry in event.entries:
            if entry.match_meta is not None and entry.match_meta.route == "review":
                review_queue += 1
    return {
        "project_uid": document.project_uid,
        "schema_version": document.schema_version,
        "counts": {
            "people": len(document.people),
            "teams": len(document.couples),
            "events_total": len(document.events),
            "events_active": len(active),
            "matching_decisions": len(document.matching_decisions),
            "review_queue": review_queue,
        },
    }


def get_standings(document: ProjectDocument, payload: dict[str, Any]) -> dict[str, Any]:
    category_key = str(payload.get("category_key", "")).strip()
    if not category_key:
        raise validation_error("category_key is required")
    _find_category(document, category_key)
    meta, rows = _table_by_category_key(document, category_key)
    return {"meta": meta, "rows": rows}


def _entry_by_entity_uid(events: list[RaceEvent], entity_uid: str) -> dict[str, RaceEntry]:
    out: dict[str, RaceEntry] = {}
    for event in events:
        for entry in event.entries:
            if entry.participant_uid == entity_uid or entry.team_uid == entity_uid:
                out[event.race_event_uid] = entry
    return out


def get_category_current_results_table(document: ProjectDocument, payload: dict[str, Any]) -> dict[str, Any]:
    category_key = str(payload.get("category_key", "")).strip()
    if not category_key:
        raise validation_error("category_key is required")
    category = _find_category(document, category_key)
    max_races_raw = payload.get("max_races")
    max_races = int(max_races_raw) if max_races_raw is not None else None
    active_events = [
        event
        for event in document.events
        if event.state == RaceEventState.ACTIVE and event.category.key == category_key
    ]
    active_events.sort(key=lambda item: (item.race_no, item.race_date, item.race_event_uid))
    if max_races is not None:
        active_events = active_events[:max_races]

    meta, standings_rows = _table_by_category_key(document, category_key)
    response_rows: list[dict[str, Any]] = []
    for row in standings_rows:
        by_event = _entry_by_entity_uid(active_events, row["entity_uid"])
        race_cells: list[dict[str, Any]] = []
        for event in active_events:
            entry = by_event.get(event.race_event_uid)
            race_cells.append(
                {
                    "race_no": event.race_no,
                    "race_event_uid": event.race_event_uid,
                    "distance_km": None if entry is None else entry.result.distance_km,
                    "points": None if entry is None else entry.result.points,
                    "counts_toward_total": bool(
                        row["contribution_by_race"].get(event.race_event_uid, False)
                    ),
                }
            )
        response_rows.append(
            {
                "platz": row["platz"],
                "display_name": row["display_name"],
                "yob": row["yob"],
                "club": row["club"],
                "race_cells": race_cells,
                "distanz_gesamt": row["distanz_gesamt"],
                "punkte_gesamt": row["punkte_gesamt"],
            }
        )
    return {
        "meta": {
            **meta,
            "category_label": category_label(category.duration, category.division),
            "race_headers": [f"{event.race_no}. Lauf" for event in active_events],
            "max_races": max_races if max_races is not None else len(active_events),
        },
        "rows": response_rows,
    }


def get_review_queue(document: ProjectDocument, payload: dict[str, Any]) -> dict[str, Any]:
    race_event_uid = str(payload.get("race_event_uid", "")).strip()
    rows: list[dict[str, Any]] = []
    for event in document.events:
        if event.state != RaceEventState.ACTIVE:
            continue
        if race_event_uid and event.race_event_uid != race_event_uid:
            continue
        for entry in event.entries:
            if entry.match_meta is None or entry.match_meta.route != "review":
                continue
            rows.append(
                {
                    "race_event_uid": event.race_event_uid,
                    "entry_uid": entry.entry_uid,
                    "startnr": entry.startnr,
                    "candidate_uids": list(entry.match_meta.candidate_uids),
                    "top_candidate_uid": entry.match_meta.top_candidate_uid,
                    "confidence": entry.match_meta.confidence,
                    "features": dict(entry.match_meta.features),
                    "conflict_flags": list(entry.match_meta.conflict_flags),
                    "event": race_event_identity(event),
                }
            )
    return {"items": rows, "count": len(rows)}


def get_match_candidate(document: ProjectDocument, payload: dict[str, Any]) -> dict[str, Any]:
    candidate_uid = str(payload.get("candidate_uid", "")).strip()
    if not candidate_uid:
        raise validation_error("candidate_uid is required")
    for person in document.people:
        if person.uid == candidate_uid:
            return {
                "candidate_uid": candidate_uid,
                "candidate_kind": "participant",
                "details": {
                    "name": person.name,
                    "yob": person.yob,
                    "club": person.club,
                },
            }
    for team in document.couples:
        if team.uid == candidate_uid:
            return {
                "candidate_uid": candidate_uid,
                "candidate_kind": "team",
                "details": {
                    "member_a": asdict(team.member_a),
                    "member_b": asdict(team.member_b),
                },
            }
    raise not_found("candidate_uid", candidate_uid)


def get_audit_timeline(document: ProjectDocument, payload: dict[str, Any]) -> dict[str, Any]:
    limit_raw = payload.get("limit")
    limit = int(limit_raw) if limit_raw is not None else 200
    by_race_event_uid = str(payload.get("race_event_uid", "")).strip()
    entries: list[dict[str, Any]] = []
    for event in document.events:
        if by_race_event_uid and event.race_event_uid != by_race_event_uid:
            continue
        entries.append(
            {
                "event_type": "race_import" if event.state == RaceEventState.ACTIVE else "race_rolled_back",
                "timestamp": event.imported_at,
                "race_event_uid": event.race_event_uid,
                "state": event.state.value,
                "source_file": event.source_file,
                "race_no": event.race_no,
                "category_key": event.category.key,
            }
        )
        if event.rollback is not None:
            entries.append(
                {
                    "event_type": "rollback",
                    "timestamp": event.rollback.rolled_back_at.isoformat(),
                    "race_event_uid": event.race_event_uid,
                    "decision_uid": event.rollback.decision_uid,
                    "reason": event.rollback.reason,
                }
            )
    for decision in document.matching_decisions:
        if by_race_event_uid and decision.race_event_uid != by_race_event_uid:
            continue
        entries.append(
            {
                "event_type": "matching_decision",
                "timestamp": decision.decided_at,
                "decision_uid": decision.decision_uid,
                "race_event_uid": decision.race_event_uid,
                "entry_uid": decision.entry_uid,
                "kind": decision.kind,
                "row_fingerprint": decision.row_fingerprint,
            }
        )
    entries.sort(key=lambda item: (item.get("timestamp", ""), item.get("event_type", "")), reverse=True)
    return {"items": entries[:limit], "count": min(limit, len(entries))}
