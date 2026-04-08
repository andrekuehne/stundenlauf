from __future__ import annotations

import json
import os
from dataclasses import replace
from pathlib import Path

from backend.domain.enums import RaceEventState
from backend.domain.models import ProjectDocument, RaceEvent, RollbackMetadata
from backend.domain.validation import ValidationError
from backend.storage.migrations import migrate_to_supported
from backend.storage.schema_v1 import SCHEMA_VERSION_V1, from_dict, to_dict


class JsonProjectRepository:
    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> ProjectDocument:
        if not self.path.exists():
            return ProjectDocument(schema_version=SCHEMA_VERSION_V1)
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ValidationError(f"Invalid JSON file: {exc}") from exc
        migrated = migrate_to_supported(raw)
        return from_dict(migrated)

    def save(self, document: ProjectDocument) -> None:
        self._validate_document(document)
        payload = to_dict(document)
        encoded = json.dumps(payload, ensure_ascii=False, indent=2)

        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists():
            backup_path = self.path.with_suffix(self.path.suffix + ".bak")
            backup_path.write_bytes(self.path.read_bytes())

        temp_path = self.path.with_suffix(self.path.suffix + ".tmp")
        temp_path.write_text(encoded, encoding="utf-8")
        os.replace(temp_path, self.path)

    def active_events(self, document: ProjectDocument) -> tuple[RaceEvent, ...]:
        return tuple(event for event in document.events if event.state == RaceEventState.ACTIVE)

    def all_events(self, document: ProjectDocument) -> tuple[RaceEvent, ...]:
        return document.events

    def mark_event_rolled_back(
        self,
        document: ProjectDocument,
        race_event_uid: str,
        rolled_back_by: str,
        reason: str,
    ) -> ProjectDocument:
        updated_events: list[RaceEvent] = []
        found = False
        for event in document.events:
            if event.race_event_uid == race_event_uid:
                found = True
                rollback = RollbackMetadata(rolled_back_by=rolled_back_by, reason=reason)
                updated_events.append(replace(event, state=RaceEventState.ROLLED_BACK, rollback=rollback))
            else:
                updated_events.append(event)
        if not found:
            raise ValidationError(f"Unknown race_event_uid: {race_event_uid}")
        return replace(document, events=tuple(updated_events))

    def _validate_document(self, document: ProjectDocument) -> None:
        if document.schema_version != SCHEMA_VERSION_V1:
            raise ValidationError(
                f"Document schema_version={document.schema_version} does not match repository version {SCHEMA_VERSION_V1}."
            )
