from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.domain.enums import Division, Gender, RaceDuration, RaceEventState
from backend.domain.models import (
    Couple,
    EntryResult,
    Person,
    ProjectDocument,
    RaceEntry,
    RaceEvent,
    RaceSeriesCategory,
    RollbackMetadata,
)
from backend.domain.validation import ValidationError, validate_couple, validate_person

SCHEMA_VERSION_V1 = 1


def to_dict(document: ProjectDocument) -> dict[str, Any]:
    if document.schema_version != SCHEMA_VERSION_V1:
        raise ValidationError("Only schema_version 1 can be serialized by schema_v1.")

    return {
        "schema_version": document.schema_version,
        "project_uid": document.project_uid,
        "people": [_person_to_dict(p) for p in document.people],
        "couples": [_couple_to_dict(c) for c in document.couples],
        "events": [_event_to_dict(e) for e in document.events],
    }


def from_dict(payload: dict[str, Any]) -> ProjectDocument:
    version = payload.get("schema_version")
    if version != SCHEMA_VERSION_V1:
        raise ValidationError(f"Unsupported schema_version for v1 loader: {version!r}")

    people = tuple(_person_from_dict(item) for item in payload.get("people", []))
    couples = tuple(_couple_from_dict(item) for item in payload.get("couples", []))
    events = tuple(_event_from_dict(item) for item in payload.get("events", []))

    return ProjectDocument(
        schema_version=SCHEMA_VERSION_V1,
        project_uid=str(payload.get("project_uid", "")),
        people=people,
        couples=couples,
        events=events,
    )


def _person_to_dict(person: Person) -> dict[str, Any]:
    validate_person(person)
    return {
        "uid": person.uid,
        "name": person.name,
        "yob": person.yob,
        "gender": person.gender.value,
        "club": person.club,
    }


def _person_from_dict(payload: dict[str, Any]) -> Person:
    person = Person(
        uid=str(payload["uid"]),
        name=str(payload["name"]),
        yob=int(payload["yob"]),
        gender=Gender(str(payload["gender"])),
        club=payload.get("club"),
    )
    validate_person(person)
    return person


def _couple_to_dict(couple: Couple) -> dict[str, Any]:
    validate_couple(couple)
    return {
        "uid": couple.uid,
        "member_a": _person_to_dict(couple.member_a),
        "member_b": _person_to_dict(couple.member_b),
    }


def _couple_from_dict(payload: dict[str, Any]) -> Couple:
    couple = Couple(
        uid=str(payload["uid"]),
        member_a=_person_from_dict(payload["member_a"]),
        member_b=_person_from_dict(payload["member_b"]),
    )
    validate_couple(couple)
    return couple


def _event_to_dict(event: RaceEvent) -> dict[str, Any]:
    return {
        "race_event_uid": event.race_event_uid,
        "category": {
            "year": event.category.year,
            "duration": event.category.duration.value,
            "division": event.category.division.value,
        },
        "race_date": event.race_date,
        "race_no": event.race_no,
        "source_file": event.source_file,
        "source_sha256": event.source_sha256,
        "imported_at": event.imported_at,
        "parser_version": event.parser_version,
        "schema_fingerprint": event.schema_fingerprint,
        "state": event.state.value,
        "entries": [_entry_to_dict(entry) for entry in event.entries],
        "rollback": _rollback_to_dict(event.rollback),
    }


def _event_from_dict(payload: dict[str, Any]) -> RaceEvent:
    category_raw = payload["category"]
    return RaceEvent(
        race_event_uid=str(payload["race_event_uid"]),
        category=RaceSeriesCategory(
            year=int(category_raw["year"]),
            duration=RaceDuration(str(category_raw["duration"])),
            division=Division(str(category_raw["division"])),
        ),
        race_date=str(payload["race_date"]),
        race_no=int(payload.get("race_no", 0)),
        source_file=str(payload.get("source_file", "")),
        source_sha256=str(payload.get("source_sha256", "")),
        imported_at=str(payload.get("imported_at", "")),
        parser_version=str(payload.get("parser_version", "")),
        schema_fingerprint=str(payload.get("schema_fingerprint", "")),
        state=RaceEventState(str(payload.get("state", RaceEventState.ACTIVE.value))),
        entries=tuple(_entry_from_dict(entry) for entry in payload.get("entries", [])),
        rollback=_rollback_from_dict(payload.get("rollback")),
    )


def _entry_to_dict(entry: RaceEntry) -> dict[str, Any]:
    return {
        "entry_uid": entry.entry_uid,
        "startnr": entry.startnr,
        "participant_uid": entry.participant_uid,
        "team_uid": entry.team_uid,
        "result": {
            "distance_km": entry.result.distance_km,
            "points": entry.result.points,
        },
    }


def _entry_from_dict(payload: dict[str, Any]) -> RaceEntry:
    result = payload["result"]
    return RaceEntry(
        entry_uid=str(payload["entry_uid"]),
        startnr=str(payload.get("startnr", "")),
        participant_uid=payload.get("participant_uid"),
        team_uid=payload.get("team_uid"),
        result=EntryResult(distance_km=float(result["distance_km"]), points=float(result["points"])),
    )


def _rollback_to_dict(rollback: RollbackMetadata | None) -> dict[str, Any] | None:
    if rollback is None:
        return None
    return {
        "decision_uid": rollback.decision_uid,
        "rolled_back_by": rollback.rolled_back_by,
        "rolled_back_at": rollback.rolled_back_at.isoformat(),
        "reason": rollback.reason,
    }


def _rollback_from_dict(payload: dict[str, Any] | None) -> RollbackMetadata | None:
    if payload is None:
        return None
    return RollbackMetadata(
        decision_uid=str(payload["decision_uid"]),
        rolled_back_by=str(payload.get("rolled_back_by", "")),
        rolled_back_at=datetime.fromisoformat(str(payload["rolled_back_at"])),
        reason=str(payload.get("reason", "")),
    )
