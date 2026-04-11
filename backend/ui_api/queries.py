from __future__ import annotations

from dataclasses import asdict
from typing import Any

from backend.domain.enums import RaceEventState
from backend.domain.models import Couple, MatchingDecision, Person, ProjectDocument, RaceEntry, RaceEvent, RaceSeriesCategory
from backend.matching.review_display import build_candidate_review_display
from backend.standings_view import build_standings_rows_for_category
from backend.ui_api.errors import not_found, validation_error
from backend.ui_api.mappers import category_label, race_event_identity
from backend.ui_api.ranking_display import apply_ranking_exclusions_to_rows, ranking_exclusion_set


def _matching_decision_in_filtered_year(
    document: ProjectDocument, decision: MatchingDecision, series_year: int | None
) -> bool:
    """Whether a decision belongs to the season filter (including identity-only corrections)."""
    if series_year is None:
        return True
    if decision.kind in {"identity_correction", "identity_merge"} and decision.scope_series_year == series_year:
        return True
    related_event = next((event for event in document.events if event.race_event_uid == decision.race_event_uid), None)
    return related_event is not None and related_event.category.year == series_year


def _parse_series_year(payload: dict[str, Any], *, required: bool = False) -> int | None:
    raw = payload.get("series_year")
    if raw is None:
        if required:
            raise validation_error("series_year is required")
        return None
    return int(raw)


def _find_category(document: ProjectDocument, category_key: str) -> RaceSeriesCategory:
    for event in document.events:
        if event.category.key == category_key:
            return event.category
    raise not_found("category_key", category_key)


def get_project_state(document: ProjectDocument) -> dict[str, Any]:
    return get_project_state_filtered(document, {})


def get_project_state_filtered(document: ProjectDocument, payload: dict[str, Any]) -> dict[str, Any]:
    series_year = _parse_series_year(payload, required=False)
    scoped_events = [
        event
        for event in document.events
        if series_year is None or event.category.year == series_year
    ]
    active = [event for event in scoped_events if event.state == RaceEventState.ACTIVE]
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
            "events_total": len(scoped_events),
            "events_active": len(active),
            "matching_decisions": len(
                [d for d in document.matching_decisions if _matching_decision_in_filtered_year(document, d, series_year)]
            ),
            "review_queue": review_queue,
        },
    }


def get_standings(document: ProjectDocument, payload: dict[str, Any]) -> dict[str, Any]:
    category_key = str(payload.get("category_key", "")).strip()
    if not category_key:
        raise validation_error("category_key is required")
    _find_category(document, category_key)
    meta, rows = build_standings_rows_for_category(document, category_key)
    excluded = ranking_exclusion_set(document, category_key)
    eligible, _ = apply_ranking_exclusions_to_rows(rows, excluded)
    return {"meta": meta, "rows": eligible}


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

    meta, standings_rows = build_standings_rows_for_category(document, category_key)
    excluded = ranking_exclusion_set(document, category_key)
    _, full_rows = apply_ranking_exclusions_to_rows(standings_rows, excluded)
    response_rows: list[dict[str, Any]] = []
    for row in full_rows:
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
                "entity_uid": row["entity_uid"],
                "entity_kind": row["entity_kind"],
                "ausser_wertung": row["ausser_wertung"],
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


def _person_preview(person: Person) -> dict[str, Any]:
    return {
        "uid": person.uid,
        "kind": "participant",
        "display_name": person.name,
        "yob": person.yob or None,
        "club": person.club,
    }


def _team_preview(team: Couple) -> dict[str, Any]:
    member_names = [item for item in (team.member_a.name, team.member_b.name) if item]
    clubs = [item for item in (team.member_a.club, team.member_b.club) if item]
    yobs = [str(item) for item in (team.member_a.yob, team.member_b.yob) if item]
    return {
        "uid": team.uid,
        "kind": "team",
        "display_name": " / ".join(member_names),
        "yob": " / ".join(yobs) if yobs else None,
        "club": " / ".join(clubs) if clubs else None,
        "member_a": asdict(team.member_a),
        "member_b": asdict(team.member_b),
    }


def _entity_preview(document: ProjectDocument, entity_uid: str | None) -> dict[str, Any] | None:
    if not entity_uid:
        return None
    person = next((item for item in document.people if item.uid == entity_uid), None)
    if person is not None:
        return _person_preview(person)
    team = next((item for item in document.couples if item.uid == entity_uid), None)
    if team is not None:
        return _team_preview(team)
    return {
        "uid": entity_uid,
        "kind": "unknown",
        "display_name": entity_uid,
        "yob": None,
        "club": None,
    }


def _confidence_label(confidence: float) -> str:
    if confidence >= 0.85:
        return "hoch"
    if confidence >= 0.65:
        return "mittel"
    return "niedrig"


def _incoming_entry_preview(document: ProjectDocument, entry: RaceEntry) -> dict[str, Any] | None:
    meta = entry.match_meta
    if meta is None:
        return None
    if meta.incoming_display_name:
        preview_yob: str | int | None = meta.incoming_yob
        if meta.incoming_kind == "team" and meta.incoming_yob_text:
            preview_yob = meta.incoming_yob_text
        return {
            "uid": None,
            "kind": meta.incoming_kind if meta.incoming_kind in {"participant", "team"} else "unknown",
            "display_name": meta.incoming_display_name,
            "yob": preview_yob,
            "club": meta.incoming_club,
        }
    return (
        _entity_preview(document, entry.participant_uid)
        if entry.participant_uid
        else _entity_preview(document, entry.team_uid)
    )


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
            confidence_value = float(entry.match_meta.confidence or 0.0)
            entry_preview = _incoming_entry_preview(document, entry)
            candidate_previews = [_entity_preview(document, candidate_uid) for candidate_uid in entry.match_meta.candidate_uids]
            rows.append(
                {
                    "race_event_uid": event.race_event_uid,
                    "entry_uid": entry.entry_uid,
                    "startnr": entry.startnr,
                    "candidate_uids": list(entry.match_meta.candidate_uids),
                    "candidate_confidences": list(entry.match_meta.candidate_confidences),
                    "candidate_previews": candidate_previews,
                    "candidate_review_displays": [
                        build_candidate_review_display(entry_preview, preview) for preview in candidate_previews
                    ],
                    "top_candidate_uid": entry.match_meta.top_candidate_uid,
                    "top_candidate_preview": _entity_preview(document, entry.match_meta.top_candidate_uid),
                    "confidence": confidence_value,
                    "confidence_label": _confidence_label(confidence_value),
                    "features": dict(entry.match_meta.features),
                    "conflict_flags": list(entry.match_meta.conflict_flags),
                    "entry_preview": entry_preview,
                    "result_preview": {
                        "distance_km": entry.result.distance_km,
                        "points": entry.result.points,
                    },
                    "event": race_event_identity(event),
                }
            )
    rows.sort(key=lambda item: item["confidence"], reverse=True)
    return {"items": rows, "count": len(rows)}


def list_categories(document: ProjectDocument, payload: dict[str, Any]) -> dict[str, Any]:
    series_year = _parse_series_year(payload, required=True)
    active_events = [event for event in document.events if event.state == RaceEventState.ACTIVE]
    items: list[dict[str, Any]] = []
    category_keys = sorted({event.category.key for event in document.events if event.category.year == series_year})
    for category_key in category_keys:
        category_events = [
            event
            for event in document.events
            if event.category.key == category_key
        ]
        active_for_category = [event for event in category_events if event.state == RaceEventState.ACTIVE]
        review_queue_count = 0
        for event in active_for_category:
            for entry in event.entries:
                if entry.match_meta is not None and entry.match_meta.route == "review":
                    review_queue_count += 1
        sample = active_for_category[0] if active_for_category else category_events[0]
        latest_imported_at = ""
        if category_events:
            latest_imported_at = max((event.imported_at for event in category_events), default="")
        items.append(
            {
                "category_key": category_key,
                "category_label": category_label(sample.category.duration, sample.category.division),
                "duration": sample.category.duration.value,
                "division": sample.category.division.value,
                "events_total": len(category_events),
                "events_active": len(active_for_category),
                "review_queue_count": review_queue_count,
                "latest_imported_at": latest_imported_at,
            }
        )
    return {
        "series_year": series_year,
        "items": items,
        "count": len(items),
        "events_active_total": len([event for event in active_events if event.category.year == series_year]),
    }


def get_year_overview(document: ProjectDocument, payload: dict[str, Any]) -> dict[str, Any]:
    series_year = _parse_series_year(payload, required=True)
    category_cards = list_categories(document, payload)["items"]
    scoped_events = [event for event in document.events if event.category.year == series_year]
    active_events = [event for event in scoped_events if event.state == RaceEventState.ACTIVE]
    review_queue = 0
    for event in active_events:
        for entry in event.entries:
            if entry.match_meta is not None and entry.match_meta.route == "review":
                review_queue += 1
    race_history_groups = [
        {
            "category_key": card["category_key"],
            "category_label": card["category_label"],
            "events": [
                race_event_identity(event)
                for event in sorted(
                    [item for item in active_events if item.category.key == card["category_key"]],
                    key=lambda item: (item.race_no, item.race_date, item.race_event_uid),
                )
            ],
        }
        for card in category_cards
    ]
    return {
        "series_year": series_year,
        "totals": {
            "categories": len(category_cards),
            "events_total": len(scoped_events),
            "events_active": len(active_events),
            "review_queue": review_queue,
        },
        "health": {
            "has_active_events": bool(active_events),
            "has_review_queue": review_queue > 0,
        },
        "categories": category_cards,
        "race_history_groups": race_history_groups,
    }


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
    series_year = _parse_series_year(payload, required=False)
    by_race_event_uid = str(payload.get("race_event_uid", "")).strip()
    entries: list[dict[str, Any]] = []
    for event in document.events:
        if series_year is not None and event.category.year != series_year:
            continue
        if by_race_event_uid and event.race_event_uid != by_race_event_uid:
            continue
        entries.append(
            {
                "event_type": "race_import" if event.state == RaceEventState.ACTIVE else "race_rolled_back",
                "timestamp": event.imported_at,
                "race_event_uid": event.race_event_uid,
                "state": event.state.value,
                "source_sha256": event.source_sha256,
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
                    "source_sha256": event.source_sha256,
                    "reason": event.rollback.reason,
                }
            )
    for decision in document.matching_decisions:
        if not _matching_decision_in_filtered_year(document, decision, series_year):
            continue
        if by_race_event_uid and decision.race_event_uid != by_race_event_uid:
            continue
        item: dict[str, Any] = {
            "event_type": "matching_decision",
            "timestamp": decision.decided_at,
            "decision_uid": decision.decision_uid,
            "race_event_uid": decision.race_event_uid,
            "entry_uid": decision.entry_uid,
            "kind": decision.kind,
            "row_fingerprint": decision.row_fingerprint,
            "target_participant_uid": decision.target_participant_uid,
            "target_team_uid": decision.target_team_uid,
            "merged_absorbed_uid": decision.merged_absorbed_uid,
            "scope_series_year": decision.scope_series_year,
        }
        if decision.identity_timeline is not None:
            item["identity_timeline"] = dict(decision.identity_timeline)
        entries.append(item)
    entries.sort(key=lambda item: (item.get("timestamp", ""), item.get("event_type", "")), reverse=True)
    return {"items": entries[:limit], "count": min(limit, len(entries))}


def get_year_timeline(document: ProjectDocument, payload: dict[str, Any]) -> dict[str, Any]:
    series_year = _parse_series_year(payload, required=True)
    result = get_audit_timeline(document, {"series_year": series_year, "limit": payload.get("limit", 200)})
    return {
        "series_year": series_year,
        "items": result["items"],
        "count": result["count"],
    }
