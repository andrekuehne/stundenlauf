from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from backend.domain.enums import Division, RaceDuration

IssueSeverity = Literal["error", "warning"]


@dataclass(frozen=True)
class IssueLocation:
    sheet: str
    row: int
    column: str


@dataclass(frozen=True)
class ValidationIssue:
    code: str
    message_de: str
    location: IssueLocation
    severity: IssueSeverity = "error"


@dataclass(frozen=True)
class ImportWorkbookMeta:
    source_file: str
    source_sha256: str
    file_mtime: float
    imported_at: str
    parser_version: str
    schema_fingerprint: str


@dataclass(frozen=True)
class ImportRaceContext:
    series_year: int
    race_no: int
    duration: RaceDuration
    division: Division
    event_date: str | None = None


@dataclass(frozen=True)
class ImportRowSingles:
    startnr: str
    name: str
    yob: int
    club: str | None
    distance_km: float
    points: float


@dataclass(frozen=True)
class ImportRowCouples:
    startnr: str
    name_a: str
    yob_a: int
    club_a: str | None
    name_b: str
    yob_b: int
    club_b: str | None
    distance_km: float
    points: float


@dataclass(frozen=True)
class ParsedSectionSingles:
    context: ImportRaceContext
    rows: tuple[ImportRowSingles, ...]


@dataclass(frozen=True)
class ParsedSectionCouples:
    context: ImportRaceContext
    rows: tuple[ImportRowCouples, ...]


@dataclass(frozen=True)
class ParsedWorkbook:
    meta: ImportWorkbookMeta
    singles_sections: tuple[ParsedSectionSingles, ...] = ()
    couples_sections: tuple[ParsedSectionCouples, ...] = ()


@dataclass(frozen=True)
class ImportResult:
    noop: bool
    issues: tuple[ValidationIssue, ...]
    merged_event_uids: tuple[str, ...]
    rows_imported: int
    source_file: Path
