from __future__ import annotations

from dataclasses import replace

from backend.domain.enums import Division, Gender
from backend.domain.identity import couple_key, person_key
from backend.domain.models import Couple, EntryResult, Person, ProjectDocument, RaceEntry, RaceEvent, RaceSeriesCategory
from backend.ingestion.types import ParsedSectionCouples, ParsedSectionSingles


def _gender_for_division(division: Division) -> Gender:
    if division == Division.MEN:
        return Gender.M
    if division == Division.WOMEN:
        return Gender.F
    raise ValueError(f"No single-runner gender mapping for division {division.value}.")


def map_singles_section(section: ParsedSectionSingles, document: ProjectDocument, source_meta: dict[str, str]) -> ProjectDocument:
    people = list(document.people)
    by_key = {person_key(p): p for p in people}
    entries: list[RaceEntry] = []
    for row in section.rows:
        candidate = Person(name=row.name, yob=row.yob, gender=_gender_for_division(section.context.division), club=row.club)
        existing = by_key.get(person_key(candidate))
        if existing is None:
            people.append(candidate)
            by_key[person_key(candidate)] = candidate
            existing = candidate
        entries.append(
            RaceEntry(
                startnr=row.startnr,
                participant_uid=existing.uid,
                result=EntryResult(distance_km=row.distance_km, points=row.points),
            )
        )
    event = RaceEvent(
        category=RaceSeriesCategory(
            year=section.context.series_year,
            duration=section.context.duration,
            division=section.context.division,
        ),
        race_no=section.context.race_no,
        race_date=section.context.event_date or "",
        source_file=source_meta["source_file"],
        source_sha256=source_meta["source_sha256"],
        imported_at=source_meta["imported_at"],
        parser_version=source_meta["parser_version"],
        schema_fingerprint=source_meta["schema_fingerprint"],
        entries=tuple(entries),
    )
    return replace(document, people=tuple(people), events=tuple([*document.events, event]))


def map_couples_section(section: ParsedSectionCouples, document: ProjectDocument, source_meta: dict[str, str]) -> ProjectDocument:
    people = list(document.people)
    couples = list(document.couples)
    by_person_key = {person_key(p): p for p in people}
    by_couple_key = {couple_key(c): c for c in couples}
    entries: list[RaceEntry] = []
    for row in section.rows:
        a_gender = Gender.M if section.context.division in {Division.COUPLES_MEN, Division.COUPLES_MIXED} else Gender.F
        b_gender = Gender.F if section.context.division in {Division.COUPLES_WOMEN, Division.COUPLES_MIXED} else Gender.M
        person_a = Person(name=row.name_a, yob=row.yob_a, gender=a_gender, club=row.club_a)
        person_b = Person(name=row.name_b, yob=row.yob_b, gender=b_gender, club=row.club_b)
        existing_a = by_person_key.get(person_key(person_a), person_a)
        if existing_a.uid == person_a.uid:
            people.append(existing_a)
            by_person_key[person_key(existing_a)] = existing_a
        existing_b = by_person_key.get(person_key(person_b), person_b)
        if existing_b.uid == person_b.uid:
            people.append(existing_b)
            by_person_key[person_key(existing_b)] = existing_b
        team = Couple(member_a=existing_a, member_b=existing_b)
        existing_team = by_couple_key.get(couple_key(team))
        if existing_team is None:
            couples.append(team)
            by_couple_key[couple_key(team)] = team
            existing_team = team
        entries.append(
            RaceEntry(
                startnr=row.startnr,
                team_uid=existing_team.uid,
                result=EntryResult(distance_km=row.distance_km, points=row.points),
            )
        )
    event = RaceEvent(
        category=RaceSeriesCategory(
            year=section.context.series_year,
            duration=section.context.duration,
            division=section.context.division,
        ),
        race_no=section.context.race_no,
        race_date=section.context.event_date or "",
        source_file=source_meta["source_file"],
        source_sha256=source_meta["source_sha256"],
        imported_at=source_meta["imported_at"],
        parser_version=source_meta["parser_version"],
        schema_fingerprint=source_meta["schema_fingerprint"],
        entries=tuple(entries),
    )
    return replace(document, people=tuple(people), couples=tuple(couples), events=tuple([*document.events, event]))
