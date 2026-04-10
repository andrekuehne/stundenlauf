from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal, cast

from backend.domain.identity import person_with_updated_identity, yob_bounds
from backend.domain.identity_merge import (
    merge_identities,
    participation_race_uids_for_category,
    validate_entity_kind_matches_uid,
)
from backend.domain.models import Couple, FieldResolution, MatchingDecision, Person, RaceEntry, RaceEntryMatchMeta
from backend.ingestion.service import import_excel_into_project
from backend.matching.config import MatchingConfig
from backend.matching.normalize import normalize_club, parse_person_name
from backend.ranking.engine import recompute_project_standings
from backend.storage.repository import JsonProjectRepository
from backend.ui_api.errors import not_found, validation_error
from backend.ui_api.queries import _find_category, _table_by_category_key
from backend.ui_api.ranking_display import (
    merge_ranking_exclusions_after_identity_merge,
    update_ranking_exclusions,
)


def _iso_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _person_identity_fields(person: Person) -> dict[str, Any]:
    return {"name": person.name, "yob": person.yob, "club": person.club or ""}


def _couple_display_name(couple: Couple) -> str:
    return f"{couple.member_a.name} / {couple.member_b.name}"


def _identity_timeline_actor_from_standings_row(row: dict[str, Any]) -> dict[str, Any]:
    actor: dict[str, Any] = {
        "entity_kind": row["entity_kind"],
        "uid": str(row["entity_uid"]),
        "display_name": row["display_name"],
        "yob": row["yob"],
        "club": row["club"] if row.get("club") is not None else "",
    }
    team_members = row.get("team_members")
    if team_members:
        actor["team_members"] = list(team_members)
    return actor


def _clone_person_identity(source: Person) -> Person:
    return Person(
        name=source.name,
        yob=source.yob,
        gender=source.gender,
        club=source.club,
        canonical_given=source.canonical_given,
        canonical_family=source.canonical_family,
        club_normalized=source.club_normalized,
    )


def _clone_couple_members(source: Couple) -> Couple:
    return Couple(member_a=_clone_person_identity(source.member_a), member_b=_clone_person_identity(source.member_b))


def _new_singles_identity_from_review(entry: RaceEntry, candidate: Person) -> tuple[Person, Literal["incoming_meta", "clone_candidate"]]:
    mm = entry.match_meta
    raw = (mm.incoming_display_name or "").strip() if mm else ""
    if not raw or (mm is not None and mm.incoming_kind == "team"):
        return _clone_person_identity(candidate), "clone_candidate"
    parsed = parse_person_name(raw)
    yob = mm.incoming_yob if mm.incoming_yob is not None else candidate.yob
    club = mm.incoming_club
    return (
        Person(
            name=raw,
            yob=yob,
            gender=candidate.gender,
            club=club,
            canonical_given=parsed.given,
            canonical_family=parsed.family,
            club_normalized=normalize_club(club),
        ),
        "incoming_meta",
    )


def _new_team_identity_from_review(entry: RaceEntry, candidate: Couple) -> tuple[Couple, Literal["incoming_meta", "clone_candidate"]]:
    mm = entry.match_meta
    if mm is None or mm.incoming_kind != "team":
        return _clone_couple_members(candidate), "clone_candidate"
    raw = (mm.incoming_display_name or "").strip()
    parts = [p.strip() for p in raw.split(" / ") if p.strip()]
    if len(parts) < 2:
        return _clone_couple_members(candidate), "clone_candidate"
    name_a, name_b = parts[0], parts[1]
    yob_a, yob_b = candidate.member_a.yob, candidate.member_b.yob
    yt = (mm.incoming_yob_text or "").strip()
    yparts: list[str] = []
    if yt:
        yparts = [p.strip() for p in yt.split(" / ")]
        if yparts:
            try:
                yob_a = int(yparts[0])
            except ValueError:
                pass
        if len(yparts) > 1:
            try:
                yob_b = int(yparts[1])
            except ValueError:
                pass
    club_a, club_b = candidate.member_a.club, candidate.member_b.club
    cc = (mm.incoming_club or "").strip()
    if cc:
        cparts = [p.strip() for p in cc.split(" / ")]
        if cparts:
            club_a = cparts[0] or club_a
        if len(cparts) > 1:
            club_b = cparts[1] or club_b
    pa, pb = parse_person_name(name_a), parse_person_name(name_b)
    ma = Person(
        name=name_a,
        yob=yob_a,
        gender=candidate.member_a.gender,
        club=club_a,
        canonical_given=pa.given,
        canonical_family=pa.family,
        club_normalized=normalize_club(club_a),
    )
    mb = Person(
        name=name_b,
        yob=yob_b,
        gender=candidate.member_b.gender,
        club=club_b,
        canonical_given=pb.given,
        canonical_family=pb.family,
        club_normalized=normalize_club(club_b),
    )
    return Couple(member_a=ma, member_b=mb), "incoming_meta"


def import_race(
    project_file: Path,
    payload: dict[str, Any],
    *,
    matching_config: MatchingConfig | None = None,
) -> dict[str, Any]:
    file_path = str(payload.get("file_path", "")).strip()
    series_year_raw = payload.get("series_year")
    source_type = payload.get("source_type")
    race_no_raw = payload.get("race_no")
    if not file_path:
        raise validation_error("file_path is required")
    if series_year_raw is None:
        raise validation_error("series_year is required")
    source_type_value: Literal["singles", "couples"] | None = None
    if source_type is not None:
        source_type_raw = str(source_type).strip().lower()
        if source_type_raw not in {"singles", "couples"}:
            raise validation_error("source_type must be 'singles' or 'couples'")
        source_type_value = cast(Literal["singles", "couples"], source_type_raw)
    race_no_value: int | None = None
    if race_no_raw is not None:
        try:
            race_no_parsed = int(race_no_raw)
        except (TypeError, ValueError):
            raise validation_error("race_no must be an integer") from None
        if race_no_parsed < 1:
            raise validation_error("race_no must be >= 1")
        race_no_value = race_no_parsed
    series_year = int(series_year_raw)
    result = import_excel_into_project(
        project_file=project_file,
        excel_file=Path(file_path),
        series_year=series_year,
        source_type=source_type_value,
        matching_config=matching_config,
        race_no=race_no_value,
    )
    return {
        "noop": result.noop,
        "issues": list(result.issues),
        "merged_event_uids": list(result.merged_event_uids),
        "rows_imported": result.rows_imported,
        "source_file": str(result.source_file),
        "matching_report": None
        if result.matching_report is None
        else {
            "auto_links": result.matching_report.auto_links,
            "review_queue": result.matching_report.review_queue,
            "new_identities": result.matching_report.new_identities,
            "conflicts": result.matching_report.conflicts,
            "replay_overrides": result.matching_report.replay_overrides,
            "candidate_counts": list(result.matching_report.candidate_counts),
        },
    }


def merge_standings_entities(project_file: Path, payload: dict[str, Any]) -> dict[str, Any]:
    series_year_raw = payload.get("series_year")
    if series_year_raw is None:
        raise validation_error("series_year ist erforderlich.")
    series_year = int(series_year_raw)

    category_key = str(payload.get("category_key", "")).strip()
    if not category_key:
        raise validation_error("category_key ist erforderlich.")

    survivor_uid = str(payload.get("survivor_uid", "")).strip()
    absorbed_uid = str(payload.get("absorbed_uid", "")).strip()
    if not survivor_uid or not absorbed_uid:
        raise validation_error("survivor_uid und absorbed_uid sind erforderlich.")
    if survivor_uid == absorbed_uid:
        raise validation_error("survivor_uid und absorbed_uid müssen sich unterscheiden.")

    entity_kind_raw = str(payload.get("entity_kind", "")).strip().lower()
    if entity_kind_raw not in {"participant", "team"}:
        raise validation_error("entity_kind muss 'participant' oder 'team' sein.")
    entity_kind = cast(Literal["participant", "team"], entity_kind_raw)

    repo = JsonProjectRepository(project_file)
    document = repo.load()
    category = _find_category(document, category_key)
    if category.year != series_year:
        raise validation_error("Das Jahr der Kategorie stimmt nicht mit series_year überein.")

    _, rows = _table_by_category_key(document, category_key)
    allowed = {str(r["entity_uid"]) for r in rows}
    if survivor_uid not in allowed or absorbed_uid not in allowed:
        raise validation_error("Beide Einträge müssen in der Wertung dieser Kategorie vorkommen.")

    row_by_uid = {str(r["entity_uid"]): r for r in rows}
    rs = row_by_uid[survivor_uid]
    ra = row_by_uid[absorbed_uid]
    if rs["entity_kind"] != entity_kind or ra["entity_kind"] != entity_kind:
        raise validation_error("Die ausgewählten Zeilen passen nicht zur angegebenen Art (Einzel/Paar).")

    try:
        validate_entity_kind_matches_uid(document, survivor_uid, entity_kind)
        validate_entity_kind_matches_uid(document, absorbed_uid, entity_kind)
    except ValueError as exc:
        raise validation_error("Unbekannte Entität oder falsche Art (Einzel/Paar).") from exc

    ev_s = participation_race_uids_for_category(document, category_key, survivor_uid, entity_kind)
    ev_a = participation_race_uids_for_category(document, category_key, absorbed_uid, entity_kind)
    if ev_s & ev_a:
        raise validation_error(
            "Die beiden Identitäten sind in mindestens einem Lauf dieser Kategorie gemeinsam gemeldet "
            "und können nicht zusammengeführt werden."
        )

    try:
        merged_doc, entries_updated = merge_identities(document, survivor_uid, absorbed_uid, entity_kind)
    except ValueError:
        raise validation_error("Die aufzulösende Identität wurde nicht gefunden.") from None

    rex = merge_ranking_exclusions_after_identity_merge(
        document.ranking_exclusions, category_key, survivor_uid, absorbed_uid
    )
    decision = MatchingDecision(
        decided_at=_iso_now(),
        kind="identity_merge",
        race_event_uid="",
        entry_uid="",
        target_participant_uid=survivor_uid if entity_kind == "participant" else None,
        target_team_uid=survivor_uid if entity_kind == "team" else None,
        merged_absorbed_uid=absorbed_uid,
        scope_series_year=series_year,
        rationale=str(payload.get("rationale", "")).strip(),
        feature_scores={"identity_merge": 1.0},
        identity_timeline={
            "kind": "identity_merge",
            "category_key": category_key,
            "survivor": _identity_timeline_actor_from_standings_row(rs),
            "absorbed": _identity_timeline_actor_from_standings_row(ra),
        },
    )
    updated = replace(
        merged_doc,
        ranking_exclusions=rex,
        matching_decisions=tuple([*merged_doc.matching_decisions, decision]),
    )
    updated = recompute_project_standings(updated)
    repo.save(updated)
    return {
        "status": "applied",
        "decision_uid": decision.decision_uid,
        "entries_updated_count": entries_updated,
        "survivor_uid": survivor_uid,
        "absorbed_uid": absorbed_uid,
        "category_key": category_key,
    }


def set_ranking_eligibility(project_file: Path, payload: dict[str, Any]) -> dict[str, Any]:
    category_key = str(payload.get("category_key", "")).strip()
    entity_uid = str(payload.get("entity_uid", "")).strip()
    if not category_key:
        raise validation_error("category_key is required")
    if not entity_uid:
        raise validation_error("entity_uid is required")
    if "ausser_wertung" not in payload:
        raise validation_error("ausser_wertung is required")
    ausser_wertung = bool(payload["ausser_wertung"])

    repo = JsonProjectRepository(project_file)
    document = repo.load()
    _find_category(document, category_key)
    _, rows = _table_by_category_key(document, category_key)
    allowed = {str(r["entity_uid"]) for r in rows}
    if entity_uid not in allowed:
        raise validation_error("entity_uid is not in standings for this category")

    updated = update_ranking_exclusions(document.ranking_exclusions, category_key, entity_uid, ausser_wertung)
    repo.save(replace(document, ranking_exclusions=updated))
    return {
        "category_key": category_key,
        "entity_uid": entity_uid,
        "ausser_wertung": ausser_wertung,
    }


def apply_match_decision(project_file: Path, payload: dict[str, Any]) -> dict[str, Any]:
    race_event_uid = str(payload.get("race_event_uid", "")).strip()
    entry_uid = str(payload.get("entry_uid", "")).strip()
    row_fingerprint = str(payload.get("row_fingerprint", "")).strip()
    target_participant_uid = str(payload.get("target_participant_uid", "")).strip() or None
    target_team_uid = str(payload.get("target_team_uid", "")).strip() or None
    decision_action = str(payload.get("decision_action", "link_existing")).strip() or "link_existing"
    rationale = str(payload.get("rationale", "")).strip()
    if not race_event_uid:
        raise validation_error("race_event_uid is required")
    if not entry_uid:
        raise validation_error("entry_uid is required")
    if decision_action not in {"link_existing", "create_new_identity"}:
        raise validation_error("decision_action must be 'link_existing' or 'create_new_identity'")
    if decision_action == "link_existing" and target_participant_uid is None and target_team_uid is None:
        raise validation_error("target_participant_uid or target_team_uid is required")

    repo = JsonProjectRepository(project_file)
    document = repo.load()
    event_index = next((i for i, item in enumerate(document.events) if item.race_event_uid == race_event_uid), None)
    if event_index is None:
        raise not_found("race_event_uid", race_event_uid)
    event = document.events[event_index]
    entry_index = next((i for i, item in enumerate(event.entries) if item.entry_uid == entry_uid), None)
    if entry_index is None:
        raise not_found("entry_uid", entry_uid)
    entry = event.entries[entry_index]
    target_uid = target_participant_uid or target_team_uid
    if decision_action == "create_new_identity":
        if entry.team_uid:
            source_team = next((item for item in document.couples if item.uid == entry.team_uid), None)
            if source_team is None:
                raise validation_error("entry team candidate was not found")
            created_team, _team_identity_source = _new_team_identity_from_review(entry, source_team)
            member_a = created_team.member_a
            member_b = created_team.member_b
            target_team_uid = created_team.uid
            target_participant_uid = None
            target_uid = created_team.uid
            updated_people = tuple([*document.people, member_a, member_b])
            updated_couples = tuple([*document.couples, created_team])
        else:
            source_person_uid = entry.participant_uid or target_participant_uid
            source_person = next((item for item in document.people if item.uid == source_person_uid), None)
            if source_person is None:
                raise validation_error("entry participant candidate was not found")
            created_person, _ = _new_singles_identity_from_review(entry, source_person)
            target_participant_uid = created_person.uid
            target_team_uid = None
            target_uid = created_person.uid
            updated_people = tuple([*document.people, created_person])
            updated_couples = document.couples
        updated_meta = RaceEntryMatchMeta(
            route="new_identity",
            confidence=1.0,
            top_candidate_uid=None,
            candidate_uids=(),
            candidate_confidences=(),
            features={"manual_new_identity": 1.0},
            conflict_flags=(),
        )
        decision_kind = "manual_accept"
        decision_features = {"manual_new_identity": 1.0}
    else:
        updated_people = document.people
        updated_couples = document.couples
        updated_meta = RaceEntryMatchMeta(
            route="auto",
            confidence=1.0,
            top_candidate_uid=target_uid,
            candidate_uids=(target_uid,) if target_uid else (),
            candidate_confidences=(1.0,) if target_uid else (),
            features={"manual_link": 1.0},
            conflict_flags=(),
        )
        decision_kind = "manual_link"
        decision_features = {"manual_link": 1.0}
    updated_entry = replace(
        entry,
        participant_uid=target_participant_uid if target_participant_uid else entry.participant_uid,
        team_uid=target_team_uid if target_team_uid else entry.team_uid,
        match_meta=updated_meta,
    )
    updated_entries = list(event.entries)
    updated_entries[entry_index] = updated_entry
    updated_event = replace(event, entries=tuple(updated_entries))
    field_resolutions = tuple(
        FieldResolution(
            field_name=str(item.get("field_name", "")).strip(),
            kept_from=str(item.get("kept_from", "manual")).strip(),  # type: ignore[arg-type]
            value=str(item.get("value", "")).strip(),
        )
        for item in payload.get("field_resolutions", [])
        if isinstance(item, dict)
    )
    decision = MatchingDecision(
        decided_at=_iso_now(),
        kind=decision_kind,
        row_fingerprint=row_fingerprint,
        race_event_uid=race_event_uid,
        entry_uid=entry_uid,
        target_participant_uid=target_participant_uid,
        target_team_uid=target_team_uid,
        rationale=rationale,
        field_resolutions=field_resolutions,
        feature_scores=decision_features,
    )
    updated_events = list(document.events)
    updated_events[event_index] = updated_event
    updated_doc = replace(
        document,
        people=updated_people,
        couples=updated_couples,
        events=tuple(updated_events),
        matching_decisions=tuple([*document.matching_decisions, decision]),
    )
    updated_doc = recompute_project_standings(updated_doc)
    repo.save(updated_doc)
    return {
        "decision_uid": decision.decision_uid,
        "race_event_uid": race_event_uid,
        "entry_uid": entry_uid,
        "target_uid": target_uid,
        "status": "applied",
    }


def rollback_race(project_file: Path, payload: dict[str, Any]) -> dict[str, Any]:
    race_event_uid = str(payload.get("race_event_uid", "")).strip()
    reason = str(payload.get("reason", "")).strip() or "ui_api.rollback"
    if not race_event_uid:
        raise validation_error("race_event_uid is required")
    repo = JsonProjectRepository(project_file)
    loaded = repo.load()
    updated = repo.mark_event_rolled_back(loaded, race_event_uid, "ui_api", reason)
    repo.save(updated)
    return {"race_event_uid": race_event_uid, "state": "rolled_back"}


def rollback_source_batch(project_file: Path, payload: dict[str, Any]) -> dict[str, Any]:
    source_sha256 = str(payload.get("source_sha256", "")).strip()
    race_event_uid = str(payload.get("race_event_uid", "")).strip()
    reason = str(payload.get("reason", "")).strip() or "ui_api.rollback_source_batch"
    if not source_sha256 and not race_event_uid:
        raise validation_error("source_sha256 or race_event_uid is required")

    repo = JsonProjectRepository(project_file)
    loaded = repo.load()
    if not source_sha256:
        anchor_event = next((event for event in loaded.events if event.race_event_uid == race_event_uid), None)
        if anchor_event is None:
            raise not_found("race_event_uid", race_event_uid)
        source_sha256 = anchor_event.source_sha256
        if not source_sha256:
            raise validation_error("race_event_uid has no source_sha256")

    updated, rolled_back_event_uids = repo.mark_events_rolled_back_by_source_sha256(
        loaded,
        source_sha256=source_sha256,
        rolled_back_by="ui_api",
        reason=reason,
    )
    repo.save(updated)
    return {
        "source_sha256": source_sha256,
        "rolled_back_event_count": len(rolled_back_event_uids),
        "rolled_back_event_uids": list(rolled_back_event_uids),
        "state": "rolled_back",
    }


def reimport_race(project_file: Path, payload: dict[str, Any]) -> dict[str, Any]:
    previous_race_event_uid = str(payload.get("previous_race_event_uid", "")).strip()
    if not previous_race_event_uid:
        raise validation_error("previous_race_event_uid is required")
    repo = JsonProjectRepository(project_file)
    loaded = repo.load()
    previous_event = next((event for event in loaded.events if event.race_event_uid == previous_race_event_uid), None)
    if previous_event is None:
        raise not_found("race_event_uid", previous_race_event_uid)
    source_sha256 = previous_event.source_sha256
    if not source_sha256:
        raise validation_error("previous race event has no source_sha256")

    updated, rolled_back_event_uids = repo.mark_events_rolled_back_by_source_sha256(
        loaded,
        source_sha256=source_sha256,
        rolled_back_by="ui_api",
        reason="ui_api.reimport",
    )
    repo.save(updated)

    imported = import_race(project_file, payload)
    imported["reimport"] = {
        "source_sha256": source_sha256,
        "rolled_back_event_count": len(rolled_back_event_uids),
        "rolled_back_event_uids": list(rolled_back_event_uids),
    }
    return imported


def update_participant_identity(project_file: Path, payload: dict[str, Any]) -> dict[str, Any]:
    """Update canonical name/yob/club for a single participant or one Paarlauf team member."""
    series_year_raw = payload.get("series_year")
    if series_year_raw is None:
        raise validation_error("series_year is required")
    series_year = int(series_year_raw)

    participant_uid = str(payload.get("participant_uid", "")).strip() or None
    team_uid = str(payload.get("team_uid", "")).strip() or None
    member_raw = payload.get("member")
    member: Literal["a", "b"] | None = None
    if member_raw is not None:
        ms = str(member_raw).strip().lower()
        if ms not in {"a", "b"}:
            raise validation_error("member must be 'a' or 'b'")
        member = cast(Literal["a", "b"], ms)

    name = str(payload.get("name", "")).strip()
    if not name:
        raise validation_error("name is required")

    yob_raw = payload.get("yob")
    if yob_raw is None:
        raise validation_error("yob is required")
    try:
        yob = int(yob_raw)
    except (TypeError, ValueError):
        raise validation_error("yob must be an integer") from None
    lo, hi = yob_bounds()
    if yob < lo or yob > hi:
        raise validation_error(f"yob must be between {lo} and {hi}")

    club_raw = payload.get("club")
    if club_raw is None:
        club: str | None = None
    else:
        club = str(club_raw).strip() or None

    has_participant = bool(participant_uid)
    has_team = bool(team_uid)
    if has_participant == has_team:
        raise validation_error("exactly one of participant_uid or team_uid is required")
    if team_uid is not None and member is None:
        raise validation_error("member is required when team_uid is set")
    if participant_uid is not None and member is not None:
        raise validation_error("member must not be set when participant_uid is set")

    repo = JsonProjectRepository(project_file)
    document = repo.load()

    if participant_uid is not None:
        pidx = next((i for i, p in enumerate(document.people) if p.uid == participant_uid), None)
        if pidx is None:
            raise not_found("participant_uid", participant_uid)
        old = document.people[pidx]
        updated_person = person_with_updated_identity(person=old, name=name, yob=yob, club=club)
        new_people = list(document.people)
        new_people[pidx] = updated_person
        new_couples = document.couples
        target_pt: str | None = participant_uid
        target_tm: str | None = None
        identity_timeline: dict[str, Any] = {
            "kind": "identity_correction",
            "member": None,
            "team_uid": None,
            "team_display_name": None,
            "before": _person_identity_fields(old),
            "after": _person_identity_fields(updated_person),
        }
    else:
        assert team_uid is not None and member is not None
        cidx = next((i for i, c in enumerate(document.couples) if c.uid == team_uid), None)
        if cidx is None:
            raise not_found("team_uid", team_uid)
        couple = document.couples[cidx]
        target_old = couple.member_a if member == "a" else couple.member_b
        new_member = person_with_updated_identity(person=target_old, name=name, yob=yob, club=club)
        new_couple = replace(
            couple,
            member_a=new_member if member == "a" else couple.member_a,
            member_b=new_member if member == "b" else couple.member_b,
        )
        new_couples = list(document.couples)
        new_couples[cidx] = new_couple
        midx = next((i for i, p in enumerate(document.people) if p.uid == new_member.uid), None)
        if midx is None:
            raise validation_error("team member not found in people table")
        new_people = list(document.people)
        new_people[midx] = new_member
        target_pt = new_member.uid
        target_tm = team_uid
        identity_timeline = {
            "kind": "identity_correction",
            "member": member,
            "team_uid": team_uid,
            "team_display_name": _couple_display_name(couple),
            "before": _person_identity_fields(target_old),
            "after": _person_identity_fields(new_member),
        }

    decision = MatchingDecision(
        decided_at=_iso_now(),
        kind="identity_correction",
        race_event_uid="",
        entry_uid="",
        target_participant_uid=target_pt,
        target_team_uid=target_tm,
        scope_series_year=series_year,
        rationale=str(payload.get("rationale", "")).strip(),
        feature_scores={"identity_correction": 1.0},
        identity_timeline=identity_timeline,
    )
    updated_doc = replace(
        document,
        people=tuple(new_people),
        couples=tuple(new_couples),
        matching_decisions=tuple([*document.matching_decisions, decision]),
    )
    updated_doc = recompute_project_standings(updated_doc)
    repo.save(updated_doc)
    return {
        "decision_uid": decision.decision_uid,
        "status": "applied",
        "participant_uid": target_pt,
        "team_uid": target_tm,
        "scope_series_year": series_year,
    }
