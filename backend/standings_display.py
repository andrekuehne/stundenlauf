"""Standings-related display strings (no ui_api imports; safe for standings_view / export)."""

from __future__ import annotations

from backend.domain.enums import Division, RaceDuration
from backend.domain.models import Couple, Person, ProjectDocument, RaceEvent, StandingsRow

_DIVISION_WORD_DE: dict[Division, str] = {
    Division.MEN: "Männer",
    Division.WOMEN: "Frauen",
    Division.COUPLES_MEN: "Paare Männer",
    Division.COUPLES_WOMEN: "Paare Frauen",
    Division.COUPLES_MIXED: "Paare gemischt",
}


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


def export_pdf_category_title(year: int, duration: RaceDuration, division: Division) -> str:
    """Single-line PDF heading: season year + readable category (em dash, spelled-out divisions)."""
    duration_label = "Halbstundenlauf" if duration == RaceDuration.HALF_HOUR else "Stundenlauf"
    return f"Saison {year} \u2014 {duration_label} {_DIVISION_WORD_DE[division]}"


def category_footer_label(duration: RaceDuration, division: Division) -> str:
    """PDF footer line: duration and division with hyphen (e.g. Halbstundenlauf - Frauen)."""
    duration_label = "Halbstundenlauf" if duration == RaceDuration.HALF_HOUR else "Stundenlauf"
    return f"{duration_label} - {_DIVISION_WORD_DE[division]}"


def laufuebersicht_section_title(section_index: int, duration: RaceDuration, division: Division) -> str:
    """Numbered Laufübersicht PDF section heading (export order): ``1. Halbstundenlauf - Frauen``."""
    return f"{section_index}. {category_footer_label(duration, division)}"


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


def yob_for_row(row: StandingsRow, document: ProjectDocument) -> str | int | None:
    if row.entity_kind == "participant":
        person = people_by_uid(document).get(row.entity_uid)
        return person.yob if person is not None else None
    team = teams_by_uid(document).get(row.entity_uid)
    if team is None:
        return None
    years = [str(value) for value in (team.member_a.yob, team.member_b.yob) if value]
    if not years:
        return None
    return " / ".join(years)


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
