from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.domain.enums import Division, Gender, RaceDuration, RaceEventState
from backend.domain.models import (
    CategoryStandingsTable,
    Couple,
    EntryResult,
    FieldResolution,
    MatchingDecision,
    Person,
    ProjectDocument,
    RaceContribution,
    RaceEntry,
    RaceEntryMatchMeta,
    RaceEvent,
    RaceSeriesCategory,
    RollbackMetadata,
    StandingsRow,
    StandingsSnapshot,
)
from backend.domain.validation import ValidationError, validate_couple, validate_person

SCHEMA_VERSION_V2 = 2


def to_dict(document: ProjectDocument) -> dict[str, Any]:
    if document.schema_version != SCHEMA_VERSION_V2:
        raise ValidationError(f"Only schema_version {SCHEMA_VERSION_V2} can be serialized by schema_v2.")

    out: dict[str, Any] = {
        "schema_version": document.schema_version,
        "project_uid": document.project_uid,
        "people": [_person_to_dict(p) for p in document.people],
        "couples": [_couple_to_dict(c) for c in document.couples],
        "events": [_event_to_dict(e) for e in document.events],
        "matching_decisions": [_matching_decision_to_dict(d) for d in document.matching_decisions],
    }
    if document.standings is not None:
        out["standings"] = _standings_snapshot_to_dict(document.standings)
    return out


def from_dict(payload: dict[str, Any]) -> ProjectDocument:
    version = payload.get("schema_version")
    if version != SCHEMA_VERSION_V2:
        raise ValidationError(f"Unsupported schema_version for v2 loader: {version!r}")

    people = tuple(_person_from_dict(item) for item in payload.get("people", []))
    couples = tuple(_couple_from_dict(item) for item in payload.get("couples", []))
    events = tuple(_event_from_dict(item) for item in payload.get("events", []))
    matching_decisions = tuple(
        _matching_decision_from_dict(item) for item in payload.get("matching_decisions", [])
    )
    standings_raw = payload.get("standings")
    standings = _standings_snapshot_from_dict(standings_raw) if standings_raw is not None else None

    return ProjectDocument(
        schema_version=SCHEMA_VERSION_V2,
        project_uid=str(payload.get("project_uid", "")),
        people=people,
        couples=couples,
        events=events,
        matching_decisions=matching_decisions,
        standings=standings,
    )


def _person_to_dict(person: Person) -> dict[str, Any]:
    validate_person(person)
    return {
        "uid": person.uid,
        "name": person.name,
        "yob": person.yob,
        "gender": person.gender.value,
        "club": person.club,
        "canonical_given": person.canonical_given,
        "canonical_family": person.canonical_family,
        "club_normalized": person.club_normalized,
    }


def _person_from_dict(payload: dict[str, Any]) -> Person:
    person = Person(
        uid=str(payload["uid"]),
        name=str(payload["name"]),
        yob=int(payload["yob"]),
        gender=Gender(str(payload["gender"])),
        club=payload.get("club"),
        canonical_given=str(payload.get("canonical_given", "")),
        canonical_family=str(payload.get("canonical_family", "")),
        club_normalized=str(payload.get("club_normalized", "")),
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
    out: dict[str, Any] = {
        "entry_uid": entry.entry_uid,
        "startnr": entry.startnr,
        "participant_uid": entry.participant_uid,
        "team_uid": entry.team_uid,
        "result": {
            "distance_km": entry.result.distance_km,
            "points": entry.result.points,
        },
    }
    if entry.match_meta is not None:
        out["match_meta"] = _match_meta_to_dict(entry.match_meta)
    else:
        out["match_meta"] = None
    return out


def _entry_from_dict(payload: dict[str, Any]) -> RaceEntry:
    result = payload["result"]
    meta_raw = payload.get("match_meta")
    match_meta = _match_meta_from_dict(meta_raw) if meta_raw is not None else None
    return RaceEntry(
        entry_uid=str(payload["entry_uid"]),
        startnr=str(payload.get("startnr", "")),
        participant_uid=payload.get("participant_uid"),
        team_uid=payload.get("team_uid"),
        result=EntryResult(distance_km=float(result["distance_km"]), points=float(result["points"])),
        match_meta=match_meta,
    )


def _match_meta_to_dict(meta: RaceEntryMatchMeta) -> dict[str, Any]:
    return {
        "route": meta.route,
        "confidence": meta.confidence,
        "top_candidate_uid": meta.top_candidate_uid,
        "candidate_uids": list(meta.candidate_uids),
        "features": dict(meta.features),
        "conflict_flags": list(meta.conflict_flags),
    }


def _match_meta_from_dict(payload: dict[str, Any]) -> RaceEntryMatchMeta:
    return RaceEntryMatchMeta(
        route=payload["route"],  # type: ignore[arg-type]
        confidence=float(payload["confidence"]),
        top_candidate_uid=payload.get("top_candidate_uid"),
        candidate_uids=tuple(str(u) for u in payload.get("candidate_uids", [])),
        features={str(k): float(v) for k, v in payload.get("features", {}).items()},
        conflict_flags=tuple(str(x) for x in payload.get("conflict_flags", [])),
    )


def _matching_decision_to_dict(decision: MatchingDecision) -> dict[str, Any]:
    return {
        "decision_uid": decision.decision_uid,
        "decided_at": decision.decided_at,
        "kind": decision.kind,
        "row_fingerprint": decision.row_fingerprint,
        "race_event_uid": decision.race_event_uid,
        "entry_uid": decision.entry_uid,
        "target_participant_uid": decision.target_participant_uid,
        "target_team_uid": decision.target_team_uid,
        "rationale": decision.rationale,
        "field_resolutions": [
            {"field_name": fr.field_name, "kept_from": fr.kept_from, "value": fr.value} for fr in decision.field_resolutions
        ],
        "feature_scores": dict(decision.feature_scores),
    }


def _matching_decision_from_dict(payload: dict[str, Any]) -> MatchingDecision:
    frs = tuple(
        FieldResolution(
            field_name=str(item["field_name"]),
            kept_from=item["kept_from"],  # type: ignore[arg-type]
            value=str(item["value"]),
        )
        for item in payload.get("field_resolutions", [])
    )
    return MatchingDecision(
        decision_uid=str(payload["decision_uid"]),
        decided_at=str(payload.get("decided_at", "")),
        kind=payload["kind"],  # type: ignore[arg-type]
        row_fingerprint=str(payload.get("row_fingerprint", "")),
        race_event_uid=str(payload.get("race_event_uid", "")),
        entry_uid=str(payload.get("entry_uid", "")),
        target_participant_uid=payload.get("target_participant_uid"),
        target_team_uid=payload.get("target_team_uid"),
        rationale=str(payload.get("rationale", "")),
        field_resolutions=frs,
        feature_scores={str(k): float(v) for k, v in payload.get("feature_scores", {}).items()},
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


def _standings_snapshot_to_dict(snapshot: StandingsSnapshot) -> dict[str, Any]:
    return {
        "ruleset_version": snapshot.ruleset_version,
        "calculated_at": snapshot.calculated_at,
        "category_tables": [_category_standings_table_to_dict(t) for t in snapshot.category_tables],
    }


def _standings_snapshot_from_dict(payload: dict[str, Any]) -> StandingsSnapshot:
    return StandingsSnapshot(
        ruleset_version=str(payload.get("ruleset_version", "")),
        calculated_at=str(payload.get("calculated_at", "")),
        category_tables=tuple(
            _category_standings_table_from_dict(item) for item in payload.get("category_tables", [])
        ),
    )


def _category_standings_table_to_dict(table: CategoryStandingsTable) -> dict[str, Any]:
    return {
        "category_key": table.category_key,
        "rows": [_standings_row_to_dict(r) for r in table.rows],
    }


def _category_standings_table_from_dict(payload: dict[str, Any]) -> CategoryStandingsTable:
    return CategoryStandingsTable(
        category_key=str(payload["category_key"]),
        rows=tuple(_standings_row_from_dict(item) for item in payload.get("rows", [])),
    )


def _standings_row_to_dict(row: StandingsRow) -> dict[str, Any]:
    return {
        "entity_kind": row.entity_kind,
        "entity_uid": row.entity_uid,
        "punkte_gesamt": row.punkte_gesamt,
        "distanz_gesamt": row.distanz_gesamt,
        "platz": row.platz,
        "race_contributions": [_race_contribution_to_dict(c) for c in row.race_contributions],
    }


def _standings_row_from_dict(payload: dict[str, Any]) -> StandingsRow:
    return StandingsRow(
        entity_kind=payload["entity_kind"],  # type: ignore[arg-type]
        entity_uid=str(payload["entity_uid"]),
        punkte_gesamt=float(payload["punkte_gesamt"]),
        distanz_gesamt=float(payload["distanz_gesamt"]),
        platz=int(payload["platz"]),
        race_contributions=tuple(
            _race_contribution_from_dict(item) for item in payload.get("race_contributions", [])
        ),
    )


def _race_contribution_to_dict(c: RaceContribution) -> dict[str, Any]:
    return {
        "race_event_uid": c.race_event_uid,
        "points": c.points,
        "distance_km": c.distance_km,
        "counts_toward_total": c.counts_toward_total,
    }


def _race_contribution_from_dict(payload: dict[str, Any]) -> RaceContribution:
    return RaceContribution(
        race_event_uid=str(payload["race_event_uid"]),
        points=float(payload["points"]),
        distance_km=float(payload["distance_km"]),
        counts_toward_total=bool(payload.get("counts_toward_total", True)),
    )
