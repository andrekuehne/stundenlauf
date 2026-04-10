from __future__ import annotations

from dataclasses import replace
from typing import Literal

from backend.domain.enums import RaceEventState
from backend.domain.models import (
    MatchingDecision,
    ProjectDocument,
    RaceEntry,
    RaceEntryMatchMeta,
    RaceEvent,
)

EntityKind = Literal["participant", "team"]


def participation_race_uids_for_category(
    document: ProjectDocument,
    category_key: str,
    entity_uid: str,
    entity_kind: EntityKind,
) -> frozenset[str]:
    """Active race_event_uids in this category where the entity has an entry row."""
    out: set[str] = set()
    for event in document.events:
        if event.state != RaceEventState.ACTIVE or event.category.key != category_key:
            continue
        for entry in event.entries:
            if entity_kind == "participant" and entry.participant_uid == entity_uid:
                out.add(event.race_event_uid)
            elif entity_kind == "team" and entry.team_uid == entity_uid:
                out.add(event.race_event_uid)
    return frozenset(out)


def collect_referenced_person_uids(document: ProjectDocument) -> frozenset[str]:
    """Person UIDs still needed by any entry or couple membership."""
    refs: set[str] = set()
    for couple in document.couples:
        refs.add(couple.member_a.uid)
        refs.add(couple.member_b.uid)
    for event in document.events:
        for entry in event.entries:
            if entry.participant_uid:
                refs.add(entry.participant_uid)
            if entry.team_uid:
                team = next((c for c in document.couples if c.uid == entry.team_uid), None)
                if team is not None:
                    refs.add(team.member_a.uid)
                    refs.add(team.member_b.uid)
    return frozenset(refs)


def _remap_match_meta(meta: RaceEntryMatchMeta | None, absorbed: str, survivor: str) -> RaceEntryMatchMeta | None:
    if meta is None:
        return None
    top = meta.top_candidate_uid
    if top == absorbed:
        top = survivor
    cand = tuple(survivor if u == absorbed else u for u in meta.candidate_uids)
    if top == meta.top_candidate_uid and cand == meta.candidate_uids:
        return meta
    return replace(meta, top_candidate_uid=top, candidate_uids=cand)


def _remap_entry(entry: RaceEntry, absorbed: str, survivor: str, entity_kind: EntityKind) -> tuple[RaceEntry, int]:
    """Returns (possibly updated entry, 1 if uid field changed else 0)."""
    changed = 0
    pu, tu = entry.participant_uid, entry.team_uid
    if entity_kind == "participant" and pu == absorbed:
        pu = survivor
        changed = 1
    elif entity_kind == "team" and tu == absorbed:
        tu = survivor
        changed = 1
    new_meta = _remap_match_meta(entry.match_meta, absorbed, survivor)
    if changed or new_meta != entry.match_meta:
        return (
            replace(entry, participant_uid=pu, team_uid=tu, match_meta=new_meta),
            changed,
        )
    return entry, 0


def _remap_decision_targets(d: MatchingDecision, absorbed: str, survivor: str) -> MatchingDecision:
    tp = d.target_participant_uid
    tt = d.target_team_uid
    if tp == absorbed:
        tp = survivor
    if tt == absorbed:
        tt = survivor
    if tp == d.target_participant_uid and tt == d.target_team_uid:
        return d
    return replace(d, target_participant_uid=tp, target_team_uid=tt)


def merge_identities(
    document: ProjectDocument,
    survivor_uid: str,
    absorbed_uid: str,
    entity_kind: EntityKind,
) -> tuple[ProjectDocument, int]:
    """Rewire entries and audit metadata from absorbed to survivor; remove absorbed entity.

    Returns (updated_document, entries_updated_count).
    """
    if survivor_uid == absorbed_uid:
        raise ValueError("survivor_uid and absorbed_uid must differ")

    entries_updated = 0
    new_events: list[RaceEvent] = []
    for event in document.events:
        new_entries: list[RaceEntry] = []
        for entry in event.entries:
            new_e, delta = _remap_entry(entry, absorbed_uid, survivor_uid, entity_kind)
            entries_updated += delta
            new_entries.append(new_e)
        new_events.append(replace(event, entries=tuple(new_entries)))

    new_decisions = tuple(_remap_decision_targets(d, absorbed_uid, survivor_uid) for d in document.matching_decisions)

    if entity_kind == "participant":
        new_people = tuple(p for p in document.people if p.uid != absorbed_uid)
        new_couples = document.couples
        if len(new_people) == len(document.people):
            raise ValueError("absorbed participant not found")
    else:
        new_couples = tuple(c for c in document.couples if c.uid != absorbed_uid)
        if len(new_couples) == len(document.couples):
            raise ValueError("absorbed team not found")
        new_people = document.people

    interim = replace(
        document,
        events=tuple(new_events),
        matching_decisions=new_decisions,
        people=new_people,
        couples=new_couples,
    )

    refs = collect_referenced_person_uids(interim)
    pruned_people = tuple(p for p in interim.people if p.uid in refs)
    return replace(interim, people=pruned_people), entries_updated


def validate_entity_kind_matches_uid(document: ProjectDocument, entity_uid: str, entity_kind: EntityKind) -> None:
    if entity_kind == "participant":
        if not any(p.uid == entity_uid for p in document.people):
            raise ValueError("participant uid not found")
        if any(c.uid == entity_uid for c in document.couples):
            raise ValueError("uid is both participant and team")
    else:
        if not any(c.uid == entity_uid for c in document.couples):
            raise ValueError("team uid not found")
