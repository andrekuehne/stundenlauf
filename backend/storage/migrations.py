from __future__ import annotations

from collections.abc import Callable
from typing import Any

from backend.domain.validation import ValidationError
from backend.storage.schema_v1 import SCHEMA_VERSION_V1
from backend.storage.schema_v2 import SCHEMA_VERSION_V2

Migration = Callable[[dict[str, Any]], dict[str, Any]]


def _noop(payload: dict[str, Any]) -> dict[str, Any]:
    return payload


def _migrate_v1_to_v2(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("schema_version") != SCHEMA_VERSION_V1:
        raise ValidationError("Expected schema_version 1 for v1->v2 migration.")
    out = dict(payload)
    out["schema_version"] = SCHEMA_VERSION_V2
    out.setdefault("matching_decisions", [])
    out.setdefault("standings", None)
    for person in out.get("people", []):
        person.setdefault("canonical_given", "")
        person.setdefault("canonical_family", "")
        person.setdefault("club_normalized", "")
    for event in out.get("events", []):
        for entry in event.get("entries", []):
            entry.setdefault("match_meta", None)
    return out


MIGRATIONS: dict[int, Migration] = {
    SCHEMA_VERSION_V1: _migrate_v1_to_v2,
    SCHEMA_VERSION_V2: _noop,
}


def migrate_to_supported(payload: dict[str, Any]) -> dict[str, Any]:
    source = payload.get("schema_version")
    if not isinstance(source, int):
        raise ValidationError("schema_version must be an integer.")
    migration = MIGRATIONS.get(source)
    if migration is None:
        raise ValidationError(f"Unsupported schema_version: {source}")
    return migration(payload)
