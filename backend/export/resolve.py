"""Load project documents and apply race-filter + standings resolution for export."""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path
from typing import Any

from backend.domain.enums import RaceEventState
from backend.domain.models import ProjectDocument, RaceEvent
from backend.export.spec import ExportSpec, RaceFilterSpec
from backend.ranking.engine import recompute_project_standings
from backend.storage.schema_v2 import from_dict as project_from_dict


def load_project_document(path_or_dict: Path | dict[str, Any]) -> ProjectDocument:
    if isinstance(path_or_dict, Path):
        payload = json.loads(path_or_dict.read_text(encoding="utf-8"))
    else:
        payload = path_or_dict
    return project_from_dict(payload)


def _active_race_event_uids(document: ProjectDocument) -> frozenset[str]:
    return frozenset(e.race_event_uid for e in document.events if e.state == RaceEventState.ACTIVE)


def _allowed_race_event_uids(document: ProjectDocument, rf: RaceFilterSpec) -> frozenset[str]:
    active = [e for e in document.events if e.state == RaceEventState.ACTIVE]
    if rf.mode == "all_active":
        return frozenset(e.race_event_uid for e in active)
    if rf.mode == "race_event_uids":
        if not rf.race_event_uids:
            raise ValueError("race_filter.race_event_uids must be non-empty when mode is race_event_uids")
        wanted = frozenset(rf.race_event_uids)
        unknown = wanted - _active_race_event_uids(document)
        if unknown:
            raise ValueError(f"race_event_uids not found among active events: {sorted(unknown)}")
        return wanted
    if rf.mode == "up_to_race_no":
        if rf.up_to_race_no is None:
            raise ValueError("race_filter.up_to_race_no is required when mode is up_to_race_no")
        n = rf.up_to_race_no
        return frozenset(e.race_event_uid for e in active if e.race_no <= n)
    raise AssertionError(f"Unhandled race filter mode: {rf.mode}")


def ephemeral_document_with_race_filter(document: ProjectDocument, rf: RaceFilterSpec) -> ProjectDocument:
    """Copy document: active events outside the filter become ROLLED_BACK; standings cleared."""
    if rf.mode == "all_active":
        return document
    allowed = _allowed_race_event_uids(document, rf)
    new_events: list[RaceEvent] = []
    for e in document.events:
        if e.state != RaceEventState.ACTIVE:
            new_events.append(e)
            continue
        if e.race_event_uid in allowed:
            new_events.append(e)
        else:
            new_events.append(replace(e, state=RaceEventState.ROLLED_BACK))
    return replace(document, events=tuple(new_events), standings=None)


def resolve_document_for_export(spec: ExportSpec, document: ProjectDocument) -> ProjectDocument:
    """Return a document whose standings match export semantics (ephemeral; do not persist)."""
    base = ephemeral_document_with_race_filter(document, spec.race_filter)
    subset_applied = spec.race_filter.mode != "all_active"
    want_live = spec.standings.source == "live" or spec.standings.recompute

    if subset_applied or want_live:
        return recompute_project_standings(base)

    if base.standings is None:
        return recompute_project_standings(base)
    return base
