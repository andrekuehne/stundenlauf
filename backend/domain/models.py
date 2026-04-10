from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal, Optional
from uuid import uuid4

from backend.domain.enums import Division, Gender, RaceDuration, RaceEventState


def _new_uid(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


@dataclass(frozen=True)
class FieldResolution:
    """How a single field was resolved during merge (for audit / UI)."""

    field_name: str
    kept_from: Literal["incoming", "existing", "manual"]
    value: str


@dataclass(frozen=True)
class MatchingDecision:
    """Immutable audit entry for participant/team matching."""

    decision_uid: str = field(default_factory=lambda: _new_uid("match_decision"))
    decided_at: str = ""
    kind: Literal[
        "auto",
        "manual_accept",
        "manual_reject",
        "manual_link",
        "replay",
        "identity_correction",
        "identity_merge",
    ] = "auto"
    row_fingerprint: str = ""
    race_event_uid: str = ""
    entry_uid: str = ""
    target_participant_uid: Optional[str] = None
    target_team_uid: Optional[str] = None
    merged_absorbed_uid: Optional[str] = None
    scope_series_year: int | None = None
    rationale: str = ""
    field_resolutions: tuple[FieldResolution, ...] = ()
    feature_scores: dict[str, float] = field(default_factory=dict)
    identity_timeline: dict[str, Any] | None = None


@dataclass(frozen=True)
class RaceEntryMatchMeta:
    """Explainability + routing metadata attached to an imported entry."""

    route: Literal["auto", "review", "new_identity"] = "new_identity"
    confidence: float = 0.0
    top_candidate_uid: Optional[str] = None
    candidate_uids: tuple[str, ...] = ()
    candidate_confidences: tuple[float, ...] = ()
    features: dict[str, float] = field(default_factory=dict)
    conflict_flags: tuple[str, ...] = ()
    incoming_display_name: str = ""
    incoming_yob: Optional[int] = None
    incoming_yob_text: Optional[str] = None
    incoming_club: Optional[str] = None
    incoming_kind: Literal["participant", "team", "unknown"] = "unknown"


@dataclass(frozen=True)
class Person:
    uid: str = field(default_factory=lambda: _new_uid("participant"))
    name: str = ""
    yob: int = 0
    gender: Gender = Gender.X
    club: Optional[str] = None
    canonical_given: str = ""
    canonical_family: str = ""
    club_normalized: str = ""


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
    match_meta: Optional[RaceEntryMatchMeta] = None


@dataclass(frozen=True)
class RollbackMetadata:
    decision_uid: str = field(default_factory=lambda: _new_uid("decision"))
    rolled_back_by: str = ""
    rolled_back_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    reason: str = ""


@dataclass(frozen=True)
class RaceContribution:
    """One race's points/distance toward standings, with selection flag for top-N."""

    race_event_uid: str
    points: float
    distance_km: float
    counts_toward_total: bool


@dataclass(frozen=True)
class StandingsRow:
    """One row in a category standings table."""

    entity_kind: Literal["participant", "team"]
    entity_uid: str
    punkte_gesamt: float
    distanz_gesamt: float
    platz: int
    race_contributions: tuple[RaceContribution, ...] = ()


@dataclass(frozen=True)
class CategoryStandingsTable:
    """Standings for a single series category (same key as RaceSeriesCategory.key)."""

    category_key: str
    rows: tuple[StandingsRow, ...] = ()


@dataclass(frozen=True)
class StandingsSnapshot:
    """Full computed standings for the project at a point in time."""

    ruleset_version: str = ""
    calculated_at: str = ""
    category_tables: tuple[CategoryStandingsTable, ...] = ()


@dataclass(frozen=True)
class RaceEvent:
    race_event_uid: str = field(default_factory=lambda: _new_uid("race_event"))
    category: RaceSeriesCategory = field(
        default_factory=lambda: RaceSeriesCategory(year=1970, duration=RaceDuration.HOUR, division=Division.MEN)
    )
    race_date: str = ""
    race_no: int = 0
    source_file: str = ""
    source_sha256: str = ""
    imported_at: str = ""
    parser_version: str = ""
    schema_fingerprint: str = ""
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
    matching_decisions: tuple[MatchingDecision, ...] = ()
    standings: StandingsSnapshot | None = None
    # (category_key, excluded entity_uid set) pairs; immutable for frozen document
    ranking_exclusions: tuple[tuple[str, frozenset[str]], ...] = ()
