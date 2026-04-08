from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Optional
from uuid import uuid4

from backend.domain.enums import Division, Gender, RaceDuration, RaceEventState


def _new_uid(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


@dataclass(frozen=True)
class Person:
    uid: str = field(default_factory=lambda: _new_uid("participant"))
    name: str = ""
    yob: int = 0
    gender: Gender = Gender.X
    club: Optional[str] = None


@dataclass(frozen=True)
class Couple:
    uid: str = field(default_factory=lambda: _new_uid("team"))
    member_a: Person = field(default_factory=Person)
    member_b: Person = field(default_factory=Person)


@dataclass(frozen=True)
class RaceSeriesCategory:
    year: int
    duration: RaceDuration
    division: Division

    @property
    def key(self) -> str:
        return f"{self.year}:{self.duration.value}:{self.division.value}"


@dataclass(frozen=True)
class EntryResult:
    distance_km: float
    points: float


@dataclass(frozen=True)
class RaceEntry:
    entry_uid: str = field(default_factory=lambda: _new_uid("entry"))
    startnr: str = ""
    participant_uid: Optional[str] = None
    team_uid: Optional[str] = None
    result: EntryResult = field(default_factory=lambda: EntryResult(distance_km=0.0, points=0.0))


@dataclass(frozen=True)
class RollbackMetadata:
    decision_uid: str = field(default_factory=lambda: _new_uid("decision"))
    rolled_back_by: str = ""
    rolled_back_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    reason: str = ""


@dataclass(frozen=True)
class RaceEvent:
    race_event_uid: str = field(default_factory=lambda: _new_uid("race_event"))
    category: RaceSeriesCategory = field(
        default_factory=lambda: RaceSeriesCategory(year=1970, duration=RaceDuration.HOUR, division=Division.MEN)
    )
    race_date: str = ""
    source_file: str = ""
    state: RaceEventState = RaceEventState.ACTIVE
    entries: tuple[RaceEntry, ...] = ()
    rollback: Optional[RollbackMetadata] = None


@dataclass(frozen=True)
class ProjectDocument:
    schema_version: int
    project_uid: str = field(default_factory=lambda: _new_uid("project"))
    people: tuple[Person, ...] = ()
    couples: tuple[Couple, ...] = ()
    events: tuple[RaceEvent, ...] = ()
