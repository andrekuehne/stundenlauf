"""Declarative standings export specification (F20)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Literal, cast

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
    # Placeholder preset: use with pdf.table_layout "laufuebersicht" (projection builds columns from races).
    "laufuebersicht_board": (),
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


TableLayout = Literal["flat", "laufuebersicht"]


def sort_category_keys_for_export(category_keys: Iterable[str]) -> tuple[str, ...]:
    """Sort ``year:duration:division`` keys for typical print order.

    Order: Halbstundenlauf W, Halbstundenlauf M, Stundenlauf W, Stundenlauf M,
    then Paare (W, M, MW) for each duration in the same order, then any other
    divisions last. Within each bucket, ascending year.
    """

    def _key(k: str) -> tuple[int, int, int, int, str]:
        parts = k.split(":")
        if len(parts) != 3:
            return (99, 99, 99, 9999, k)
        year_s, duration, division = parts[0], parts[1], parts[2]
        try:
            year = int(year_s)
        except ValueError:
            year = 9999
        dur_ord = 0 if duration == "half_hour" else (1 if duration == "hour" else 50)
        if division == "women":
            return (0, dur_ord, 0, year, k)
        if division == "men":
            return (0, dur_ord, 1, year, k)
        if division == "couples_women":
            return (1, dur_ord, 0, year, k)
        if division == "couples_men":
            return (1, dur_ord, 1, year, k)
        if division == "couples_mixed":
            return (1, dur_ord, 2, year, k)
        return (50, dur_ord, 99, year, k)

    return tuple(sorted(category_keys, key=_key))


def category_key_is_couples(category_key: str) -> bool:
    """True if ``year:duration:division`` uses a Paare division (``couples_*``)."""
    parts = category_key.split(":")
    return len(parts) == 3 and str(parts[2]).startswith("couples_")


def split_category_keys_einzel_paare(category_keys: Iterable[str]) -> tuple[tuple[str, ...], tuple[str, ...]]:
    """Export order within Einzel vs Paare (same global order as :func:`sort_category_keys_for_export`)."""
    ordered = sort_category_keys_for_export(category_keys)
    einzel = tuple(k for k in ordered if not category_key_is_couples(k))
    paare = tuple(k for k in ordered if category_key_is_couples(k))
    return einzel, paare


# Default main organizer line in PDF footers (overridable via export spec ``pdf.organizer_footer``).
DEFAULT_PDF_ORGANIZER_FOOTER = "HSG Uni Greifswald Triathlon Laufgruppe"

# Default Hinweis body on the Laufübersicht cover page (``pdf.laufuebersicht_notice`` empty = use this).
DEFAULT_LAUFUEBERSICHT_NOTICE = (
    "In die Pokalwertung kommen alle Ergebnisse von Teilnehmern, die mindestens an drei "
    "Veranstaltungen teilgenommen haben. Für die Gesamtwertung werden maximal die vier besten "
    "Ergebnisse von insgesamt fünf Läufen berücksichtigt."
)


@dataclass(frozen=True)
class PdfStyleSpec:
    page_size: Literal["A4", "A3"] = "A4"
    orientation: Literal["portrait", "landscape"] = "landscape"
    title: str = ""
    subtitle: str = ""
    # Deprecated: ruleset is no longer printed in the PDF footer; kept for spec compatibility.
    show_ruleset_footer: bool = False
    show_category_footer: bool = True
    show_export_timestamp_footer: bool = True
    organizer_footer: str = DEFAULT_PDF_ORGANIZER_FOOTER
    show_organizer_footer: bool = True
    show_season_footer: bool = True
    repeat_header: bool = True
    logo_path: str | None = None
    max_columns: int = 48
    max_rows_per_category: int = 5000
    table_layout: TableLayout = "flat"
    # None = layout defaults (9 pt flat; 7 pt body / 8 pt header for laufuebersicht).
    table_font_size: int | None = None
    table_header_font_size: int | None = None
    # Reserved for spec compatibility; Laufübersicht uses one body size for all columns (see pdf_renderer).
    laufuebersicht_result_font_extra_pt: int = 0
    # Insert a page break before each category section after the first (multi-category PDFs).
    page_break_before_each_category: bool = False
    # Laufübersicht: dedicated first page (season year + Hinweis) before category tables.
    laufuebersicht_show_cover: bool = True
    # First section heading index for ``N. Halbstundenlauf - …`` (Paare PDF continues after Einzel).
    laufuebersicht_section_number_start: int = 1
    # Override cover notice body; empty string uses ``DEFAULT_LAUFUEBERSICHT_NOTICE``.
    laufuebersicht_notice: str = ""

    @staticmethod
    def from_dict(raw: dict[str, Any]) -> PdfStyleSpec:
        ps = str(raw.get("page_size", "A4")).strip().upper()
        if ps not in ("A4", "A3"):
            raise ValueError(f"pdf.page_size must be A4 or A3, got {ps!r}")
        ori = str(raw.get("orientation", "landscape")).strip().lower()
        if ori not in ("portrait", "landscape"):
            raise ValueError(f"pdf.orientation invalid: {ori!r}")
        logo = raw.get("logo_path")
        layout = str(raw.get("table_layout", "flat")).strip().lower()
        if layout not in ("flat", "laufuebersicht"):
            raise ValueError(f"pdf.table_layout must be 'flat' or 'laufuebersicht', got {layout!r}")
        tfs = raw.get("table_font_size")
        thfs = raw.get("table_header_font_size")
        res_extra = raw.get("laufuebersicht_result_font_extra_pt", 0)
        page_break_cats = bool(raw.get("page_break_before_each_category", False))
        show_lauf_cover = bool(raw.get("laufuebersicht_show_cover", True))
        lauf_sec_start = int(raw.get("laufuebersicht_section_number_start", 1))
        if lauf_sec_start < 1:
            raise ValueError("pdf.laufuebersicht_section_number_start must be >= 1")
        lauf_notice = raw.get("laufuebersicht_notice")
        lauf_notice_s = str(lauf_notice).strip() if lauf_notice is not None else ""
        if "organizer_footer" in raw:
            ov = raw["organizer_footer"]
            organizer_footer = str(ov).strip() if ov is not None else ""
        else:
            organizer_footer = DEFAULT_PDF_ORGANIZER_FOOTER
        return PdfStyleSpec(
            page_size=cast(Any, ps),
            orientation=cast(Any, ori),
            title=str(raw.get("title", "") or ""),
            subtitle=str(raw.get("subtitle", "") or ""),
            show_ruleset_footer=bool(raw.get("show_ruleset_footer", False)),
            show_category_footer=bool(raw.get("show_category_footer", True)),
            show_export_timestamp_footer=bool(raw.get("show_export_timestamp_footer", True)),
            organizer_footer=organizer_footer,
            show_organizer_footer=bool(raw.get("show_organizer_footer", True)),
            show_season_footer=bool(raw.get("show_season_footer", True)),
            repeat_header=bool(raw.get("repeat_header", True)),
            logo_path=str(logo) if logo else None,
            max_columns=int(raw.get("max_columns", 48)),
            max_rows_per_category=int(raw.get("max_rows_per_category", 5000)),
            table_layout=cast(TableLayout, layout),
            table_font_size=int(tfs) if tfs is not None else None,
            table_header_font_size=int(thfs) if thfs is not None else None,
            laufuebersicht_result_font_extra_pt=int(res_extra),
            page_break_before_each_category=page_break_cats,
            laufuebersicht_show_cover=show_lauf_cover,
            laufuebersicht_section_number_start=lauf_sec_start,
            laufuebersicht_notice=lauf_notice_s,
        )

    def resolved_laufuebersicht_notice(self) -> str:
        """Plain text body for the cover Hinweis (after the underlined 'Hinweis:' line)."""
        s = self.laufuebersicht_notice.strip()
        return s if s else DEFAULT_LAUFUEBERSICHT_NOTICE


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
        if self.pdf.table_layout == "laufuebersicht":
            if self.columns != ("laufuebersicht_board",):
                raise ValueError(
                    "pdf.table_layout 'laufuebersicht' requires columns: ['laufuebersicht_board'] exactly"
                )
            return ()
        out: list[str] = []
        for item in self.columns:
            if item == "laufuebersicht_board":
                raise ValueError("laufuebersicht_board is only valid with pdf.table_layout: laufuebersicht")
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
