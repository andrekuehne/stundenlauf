"""Shared standings row construction for UI API and export (F20 parity)."""

from __future__ import annotations

from typing import Any

from backend.domain.models import ProjectDocument
from backend.ranking.engine import recompute_project_standings
from backend.standings_display import club_for_row, display_name_for_row, teams_by_uid, yob_for_row


def team_members_for_standings_row(document: ProjectDocument, team_uid: str) -> list[dict[str, Any]]:
    """Per-member identity for Paarlauf standings rows (GUI identity correction, export)."""
    team = teams_by_uid(document).get(team_uid)
    if team is None:
        return []
    return [
        {
            "member": "a",
            "name": team.member_a.name,
            "yob": team.member_a.yob,
            "club": team.member_a.club or "",
        },
        {
            "member": "b",
            "name": team.member_b.name,
            "yob": team.member_b.yob,
            "club": team.member_b.club or "",
        },
    ]


def build_standings_rows_for_category(
    document: ProjectDocument, category_key: str
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Build snapshot-backed standings rows for one category (same shape as UI API).

    Uses embedded ``document.standings`` when present; otherwise recomputes and reads from
    the returned document's snapshot (does not persist).
    """
    doc = document if document.standings is not None else recompute_project_standings(document)
    if doc.standings is None:
        return {"ruleset_version": "", "calculated_at": "", "category_key": category_key}, []
    for table in doc.standings.category_tables:
        if table.category_key != category_key:
            continue
        rows: list[dict[str, Any]] = []
        for row in table.rows:
            payload: dict[str, Any] = {
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
                "points_by_race": {item.race_event_uid: item.points for item in row.race_contributions},
                "distance_by_race": {item.race_event_uid: item.distance_km for item in row.race_contributions},
            }
            if row.entity_kind == "team":
                payload["team_members"] = team_members_for_standings_row(doc, row.entity_uid)
            rows.append(payload)
        meta = {
            "ruleset_version": doc.standings.ruleset_version,
            "calculated_at": doc.standings.calculated_at,
            "category_key": category_key,
        }
        return meta, rows
    return {
        "ruleset_version": doc.standings.ruleset_version,
        "calculated_at": doc.standings.calculated_at,
        "category_key": category_key,
    }, []
