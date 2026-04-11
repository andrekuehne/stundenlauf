"""Declarative standings export specification (F20)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, cast

StandingsSource = Literal["embedded", "live"]
RaceFilterMode = Literal["all_active", "race_event_uids", "up_to_race_no"]
RowEligibility = Literal["eligible_only", "full_grid"]

# Logical column ids (English). Special: "points_per_race" expands to one column per race.
KNOWN_COLUMN_IDS: frozenset[str] = frozenset(
    {
        "platz",
        "display_name",
        "club",
        "yob",
        "punkte_gesamt",
        "distanz_gesamt",
        "ausser_wertung",
        "entity_uid",
        "entity_kind",
        "team_members",
        "points_per_race",
    }
)

COLUMN_PRESETS: dict[str, tuple[str, ...]] = {
    "minimal": ("platz", "display_name", "punkte_gesamt", "distanz_gesamt"),
    "official_board": ("platz", "display_name", "club", "punkte_gesamt", "distanz_gesamt"),
    "debug_uid": (
        "platz",
        "display_name",
        "club",
        "yob",
        "punkte_gesamt",
        "distanz_gesamt",
        "entity_uid",
        "entity_kind",
    ),
}

GERMAN_HEADER_BY_COLUMN: dict[str, str] = {
    "platz": "Platz",
    "display_name": "Name",
    "club": "Verein",
    "yob": "Jg.",
    "punkte_gesamt": "Punkte",
    "distanz_gesamt": "km",
    "ausser_wertung": "Außer Wertung",
    "entity_uid": "UID",
    "entity_kind": "Art",
    "team_members": "Team",
    "points_per_race": "Lauf",  # placeholder; per-race headers set dynamically
}


@dataclass(frozen=True)
class StandingsExportSourceSpec:
    """How to obtain the standings snapshot for export."""

    source: StandingsSource = "embedded"
    recompute: bool = False

    @staticmethod
    def from_dict(raw: dict[str, Any]) -> StandingsExportSourceSpec:
        src = str(raw.get("source", "embedded")).strip().lower()
        if src not in ("embedded", "live"):
            raise ValueError(f"standings.source must be 'embedded' or 'live', got {src!r}")
        return StandingsExportSourceSpec(source=cast(StandingsSource, src), recompute=bool(raw.get("recompute", False)))


@dataclass(frozen=True)
class RaceFilterSpec:
    mode: RaceFilterMode = "all_active"
    race_event_uids: tuple[str, ...] = ()
    up_to_race_no: int | None = None

    @staticmethod
    def from_dict(raw: dict[str, Any]) -> RaceFilterSpec:
        mode = str(raw.get("mode", "all_active")).strip().lower()
        if mode not in ("all_active", "race_event_uids", "up_to_race_no"):
            raise ValueError(f"race_filter.mode invalid: {mode!r}")
        uids_raw = raw.get("race_event_uids") or []
        if not isinstance(uids_raw, list):
            raise ValueError("race_filter.race_event_uids must be a list")
        uids = tuple(str(u) for u in uids_raw)
        up_n = raw.get("up_to_race_no")
        up_to = int(up_n) if up_n is not None else None
        return RaceFilterSpec(mode=cast(RaceFilterMode, mode), race_event_uids=uids, up_to_race_no=up_to)


@dataclass(frozen=True)
class RowsSpec:
    eligibility: RowEligibility = "eligible_only"

    @staticmethod
    def from_dict(raw: dict[str, Any]) -> RowsSpec:
        el = str(raw.get("eligibility", "eligible_only")).strip().lower()
        if el not in ("eligible_only", "full_grid"):
            raise ValueError(f"rows.eligibility invalid: {el!r}")
        return RowsSpec(eligibility=cast(RowEligibility, el))


@dataclass(frozen=True)
class PdfStyleSpec:
    page_size: Literal["A4", "A3"] = "A4"
    orientation: Literal["portrait", "landscape"] = "landscape"
    title: str = ""
    subtitle: str = ""
    show_ruleset_footer: bool = True
    show_export_timestamp_footer: bool = True
    repeat_header: bool = True
    logo_path: str | None = None
    max_columns: int = 48
    max_rows_per_category: int = 5000

    @staticmethod
    def from_dict(raw: dict[str, Any]) -> PdfStyleSpec:
        ps = str(raw.get("page_size", "A4")).strip().upper()
        if ps not in ("A4", "A3"):
            raise ValueError(f"pdf.page_size must be A4 or A3, got {ps!r}")
        ori = str(raw.get("orientation", "landscape")).strip().lower()
        if ori not in ("portrait", "landscape"):
            raise ValueError(f"pdf.orientation invalid: {ori!r}")
        logo = raw.get("logo_path")
        return PdfStyleSpec(
            page_size=cast(Any, ps),
            orientation=cast(Any, ori),
            title=str(raw.get("title", "") or ""),
            subtitle=str(raw.get("subtitle", "") or ""),
            show_ruleset_footer=bool(raw.get("show_ruleset_footer", True)),
            show_export_timestamp_footer=bool(raw.get("show_export_timestamp_footer", True)),
            repeat_header=bool(raw.get("repeat_header", True)),
            logo_path=str(logo) if logo else None,
            max_columns=int(raw.get("max_columns", 48)),
            max_rows_per_category=int(raw.get("max_rows_per_category", 5000)),
        )


@dataclass(frozen=True)
class ExportSpec:
    format: Literal["pdf", "csv"] = "pdf"
    standings: StandingsExportSourceSpec = field(default_factory=StandingsExportSourceSpec)
    categories: tuple[str, ...] = ()
    race_filter: RaceFilterSpec = field(default_factory=RaceFilterSpec)
    rows: RowsSpec = field(default_factory=RowsSpec)
    columns: tuple[str, ...] = ("official_board",)
    pdf: PdfStyleSpec = field(default_factory=PdfStyleSpec)

    def resolved_columns(self) -> tuple[str, ...]:
        """Expand presets to concrete column ids."""
        out: list[str] = []
        for item in self.columns:
            if item in COLUMN_PRESETS:
                out.extend(COLUMN_PRESETS[item])
            elif item == "points_per_race" or item in KNOWN_COLUMN_IDS:
                out.append(item)
            else:
                raise ValueError(
                    f"Unknown column or preset: {item!r}. Known: {sorted(KNOWN_COLUMN_IDS | set(COLUMN_PRESETS))}"
                )
        if len(out) > self.pdf.max_columns:
            raise ValueError(f"Too many columns ({len(out)}), max {self.pdf.max_columns}")
        return tuple(out)

    @staticmethod
    def from_dict(raw: dict[str, Any]) -> ExportSpec:
        fmt = str(raw.get("format", "pdf")).strip().lower()
        if fmt not in ("pdf", "csv"):
            raise ValueError(f"format must be pdf or csv, got {fmt!r}")
        cats = raw.get("categories") or []
        if not isinstance(cats, list) or not cats:
            raise ValueError("categories must be a non-empty list of category_key strings")
        col_raw = raw.get("columns")
        if col_raw is None:
            cols: tuple[str, ...] = ("official_board",)
        elif isinstance(col_raw, list):
            cols = tuple(str(c) for c in col_raw)
        else:
            raise ValueError("columns must be a list of column ids or preset names")
        st_raw = raw.get("standings") or {}
        if not isinstance(st_raw, dict):
            raise ValueError("standings must be an object")
        rf_raw = raw.get("race_filter") or {}
        if not isinstance(rf_raw, dict):
            raise ValueError("race_filter must be an object")
        rows_raw = raw.get("rows") or {}
        if not isinstance(rows_raw, dict):
            raise ValueError("rows must be an object")
        pdf_raw = raw.get("pdf") or {}
        if not isinstance(pdf_raw, dict):
            raise ValueError("pdf must be an object")
        spec = ExportSpec(
            format=cast(Any, fmt),
            standings=StandingsExportSourceSpec.from_dict(st_raw),
            categories=tuple(str(c) for c in cats),
            race_filter=RaceFilterSpec.from_dict(rf_raw),
            rows=RowsSpec.from_dict(rows_raw),
            columns=cols,
            pdf=PdfStyleSpec.from_dict(pdf_raw),
        )
        spec.resolved_columns()  # validate early
        return spec
