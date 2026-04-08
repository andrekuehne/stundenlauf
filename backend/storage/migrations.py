from __future__ import annotations

from collections.abc import Callable
from typing import Any

from backend.domain.validation import ValidationError
from backend.storage.schema_v1 import SCHEMA_VERSION_V1

Migration = Callable[[dict[str, Any]], dict[str, Any]]


def _noop(payload: dict[str, Any]) -> dict[str, Any]:
    return payload


MIGRATIONS: dict[int, Migration] = {
    SCHEMA_VERSION_V1: _noop,
}


def migrate_to_supported(payload: dict[str, Any]) -> dict[str, Any]:
    source = payload.get("schema_version")
    if not isinstance(source, int):
        raise ValidationError("schema_version must be an integer.")
    migration = MIGRATIONS.get(source)
    if migration is None:
        raise ValidationError(f"Unsupported schema_version: {source}")
    return migration(payload)
