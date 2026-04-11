"""Backward-compatible re-exports; implementation in ``backend.standings_display``."""

from __future__ import annotations

from backend.standings_display import (
    category_label,
    club_for_row,
    display_name_for_row,
    people_by_uid,
    race_event_identity,
    teams_by_uid,
    yob_for_row,
)

__all__ = [
    "category_label",
    "club_for_row",
    "display_name_for_row",
    "people_by_uid",
    "race_event_identity",
    "teams_by_uid",
    "yob_for_row",
]
