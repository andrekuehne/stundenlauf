from __future__ import annotations

from backend.domain.enums import Division, RaceDuration
from backend.domain.models import Couple, Person, ProjectDocument, RaceEvent, StandingsRow


def category_label(duration: RaceDuration, division: Division) -> str:
    duration_label = "Halbstundenlauf" if duration == RaceDuration.HALF_HOUR else "Stundenlauf"
    division_label_map = {
        Division.MEN: "M",
        Division.WOMEN: "W",
        Division.COUPLES_MEN: "Paare M",
        Division.COUPLES_WOMEN: "Paare W",
        Division.COUPLES_MIXED: "Paare MW",
    }
    return f"{duration_label} - {division_label_map[division]}"


def people_by_uid(document: ProjectDocument) -> dict[str, Person]:
    return {item.uid: item for item in document.people}


def teams_by_uid(document: ProjectDocument) -> dict[str, Couple]:
    return {item.uid: item for item in document.couples}


def display_name_for_row(row: StandingsRow, document: ProjectDocument) -> str:
    people = people_by_uid(document)
    teams = teams_by_uid(document)
    if row.entity_kind == "participant":
        person = people.get(row.entity_uid)
        return person.name if person is not None else row.entity_uid
    team = teams.get(row.entity_uid)
    if team is None:
        return row.entity_uid
    return f"{team.member_a.name} / {team.member_b.name}"


def yob_for_row(row: StandingsRow, document: ProjectDocument) -> int | None:
    if row.entity_kind != "participant":
        return None
    person = people_by_uid(document).get(row.entity_uid)
    return person.yob if person is not None else None


def club_for_row(row: StandingsRow, document: ProjectDocument) -> str | None:
    people = people_by_uid(document)
    if row.entity_kind == "participant":
        person = people.get(row.entity_uid)
        return person.club if person is not None else None
    team = teams_by_uid(document).get(row.entity_uid)
    if team is None:
        return None
    clubs = [x for x in (team.member_a.club, team.member_b.club) if x]
    return " / ".join(clubs) if clubs else None


def race_event_identity(event: RaceEvent) -> dict[str, str | int]:
    return {
        "race_event_uid": event.race_event_uid,
        "race_no": event.race_no,
        "race_date": event.race_date,
        "category_key": event.category.key,
        "category_label": category_label(event.category.duration, event.category.division),
    }
