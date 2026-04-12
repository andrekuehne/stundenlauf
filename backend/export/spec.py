"""Declarative standings export specification (F20)."""

from __future__ import annotations

from collections.abc import Iterable
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


# Named PDF layout presets (merged under per-export ``pdf`` keys; export keys win). Use ``layout_preset`` in the pdf object.
PDF_LAYOUT_PRESETS: dict[str, dict[str, Any]] = {
    "default": {},
    # Example: tighter page margins and slightly larger table type (data columns unchanged).
    "compact": {
        "orientation": "portrait",
        "margin_left_cm": 0.45,
        "margin_right_cm": 0.45,
        "margin_top_cm": 0.45,
        "margin_bottom_cm": 0.65,
        "footer_font_size_pt": 5.5,
        "footer_y_cm": 0.55,
        "section_title_font_size_pt": 9.0,
        "section_title_space_after_pt": 1.5,
        "section_subtitle_font_size_pt": 6.5,
        "section_subtitle_space_after_pt": 3.0,
        "cover_year_font_size_pt": 16.0,
        "cover_year_leading_pt": 18.0,
        "cover_year_space_after_pt": 6.0,
        "cover_notice_font_size_pt": 6.5,
        "cover_notice_leading_pt": 8.5,
        "cover_spacer_after_cm": 0.2,
        "table_spacer_after_cm": 0.25,
        "logo_draw_height_cm": 1.5,
        "logo_spacer_after_cm": 0.12,
        "table_font_size": 5,
        "table_header_font_size": 5,
        "lauf_result_leading_extra_pt": 0,
        # Slightly smaller type + leading > fontSize so ascenders/descenders clear horizontal rules.
        "table_plain_leading_extra_pt": 1,
        "table_cell_horizontal_padding_pt": 2.0,
        "table_cell_vertical_padding_pt": 0.45,
        "table_width_extra_margin_cm": 0.8,
        "narrow_platz_cm": 0.72,
        "narrow_punkte_gesamt_cm": 0.82,
        "narrow_distanz_gesamt_cm": 0.88,
        "narrow_laufuebersicht_km_pkt_cm": 0.88,
        # Thinner double rules (header/body + vertical before Gesamt) to match small type.
        "double_rule_weight_pt": 0.45,
        "double_rule_gap_pt": 0.5,
    },
}

# German labels for GUI / API catalog (keys must match ``PDF_LAYOUT_PRESETS``).
PDF_LAYOUT_PRESET_LABELS_DE: dict[str, str] = {
    "default": "Standard",
    "compact": "Kompakt (Hochformat, wenig Weißraum, kleine Schrift)",
}


def pdf_layout_preset_catalog() -> list[dict[str, str]]:
    """Stable-ordered options for desktop PDF export (id + German label)."""
    preferred = ("default", "compact")
    seen: set[str] = set()
    ordered: list[str] = []
    for k in preferred:
        if k in PDF_LAYOUT_PRESETS:
            ordered.append(k)
            seen.add(k)
    for k in sorted(PDF_LAYOUT_PRESETS):
        if k not in seen:
            ordered.append(k)
    return [{"id": key, "label_de": PDF_LAYOUT_PRESET_LABELS_DE.get(key, key)} for key in ordered]


def _pdf_opt_float(raw: dict[str, Any], key: str, default: float) -> float:
    if key not in raw:
        return default
    return float(raw[key])


def _pdf_opt_int(raw: dict[str, Any], key: str, default: int) -> int:
    if key not in raw:
        return default
    return int(raw[key])


def _pdf_opt_rgb(raw: dict[str, Any], key: str, default: tuple[int, int, int]) -> tuple[int, int, int]:
    if key not in raw:
        return default
    v = raw[key]
    if not isinstance(v, (list, tuple)) or len(v) != 3:
        raise ValueError(f"pdf.{key} must be a list of three integers [R, G, B]")
    r, g, b = (int(v[0]), int(v[1]), int(v[2]))
    for x in (r, g, b):
        if x < 0 or x > 255:
            raise ValueError(f"pdf.{key} channel values must be 0..255")
    return (r, g, b)


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
    # --- Layout / visual tokens (optional overrides; defaults match prior pdf_renderer constants) ---
    margin_left_cm: float = 1.5
    margin_right_cm: float = 1.5
    margin_top_cm: float = 1.5
    margin_bottom_cm: float = 1.8
    footer_font_size_pt: float = 8.0
    footer_y_cm: float = 1.0
    section_title_font_size_pt: float = 14.0
    section_title_space_after_pt: float = 6.0
    section_subtitle_font_size_pt: float = 10.0
    section_subtitle_space_after_pt: float = 12.0
    cover_year_font_size_pt: float = 26.0
    cover_year_leading_pt: float = 30.0
    cover_year_space_after_pt: float = 14.0
    cover_notice_font_size_pt: float = 10.0
    cover_notice_leading_pt: float = 13.0
    cover_spacer_after_cm: float = 0.35
    table_spacer_after_cm: float = 0.6
    logo_draw_height_cm: float = 2.0
    logo_spacer_after_cm: float = 0.2
    line_thin_pt: float = 0.12
    line_normal_pt: float = 0.25
    line_thick_pt: float = 0.75
    double_rule_weight_pt: float = 0.85
    double_rule_gap_pt: float = 1.25
    lauf_sub_header_delta_pt: int = 2
    lauf_sub_header_min_pt: int = 5
    lauf_result_leading_extra_pt: int = 2
    color_line_grey_hex: str = "#808080"
    color_header_green_hex: str = "#E8F5E9"
    color_header_run_red_hex: str = "#C62828"
    color_cover_year_blue_hex: str = "#1565C0"
    color_band_grey_hex: str = "#f5f5f5"
    color_zebra_even_rgb: tuple[int, int, int] = (255, 255, 255)
    color_zebra_odd_rgb: tuple[int, int, int] = (245, 245, 245)
    color_podium_tint_rgb: tuple[int, int, int] = (200, 220, 255)
    narrow_platz_cm: float = 0.95
    narrow_punkte_gesamt_cm: float = 1.15
    narrow_distanz_gesamt_cm: float = 1.35
    narrow_laufuebersicht_km_pkt_cm: float = 1.25
    table_width_extra_margin_cm: float = 3.0
    # ReportLab default cell padding is 6 pt horizontal / 3 pt vertical; lower = denser rows.
    table_cell_horizontal_padding_pt: float = 6.0
    table_cell_vertical_padding_pt: float = 3.0
    # Extra leading (pt) for plain string table cells; Laufübersicht km/Pkt Paragraphs add this too.
    # Default 1 matches prior hard-coded hdr/body leading = fontSize + 1.
    table_plain_leading_extra_pt: int = 1

    @staticmethod
    def from_dict(raw: dict[str, Any]) -> PdfStyleSpec:
        raw_d = dict(raw)
        preset_key = str(raw_d.pop("layout_preset", "") or "").strip().lower()
        base_preset: dict[str, Any] = {}
        if preset_key:
            if preset_key not in PDF_LAYOUT_PRESETS:
                known = ", ".join(sorted(PDF_LAYOUT_PRESETS))
                raise ValueError(f"pdf.layout_preset must be one of: {known}; got {preset_key!r}")
            base_preset = dict(PDF_LAYOUT_PRESETS[preset_key])
        merged: dict[str, Any] = {**base_preset, **raw_d}

        ps = str(merged.get("page_size", "A4")).strip().upper()
        if ps not in ("A4", "A3"):
            raise ValueError(f"pdf.page_size must be A4 or A3, got {ps!r}")
        ori = str(merged.get("orientation", "landscape")).strip().lower()
        if ori not in ("portrait", "landscape"):
            raise ValueError(f"pdf.orientation invalid: {ori!r}")
        logo = merged.get("logo_path")
        layout = str(merged.get("table_layout", "flat")).strip().lower()
        if layout not in ("flat", "laufuebersicht"):
            raise ValueError(f"pdf.table_layout must be 'flat' or 'laufuebersicht', got {layout!r}")
        tfs = merged.get("table_font_size")
        thfs = merged.get("table_header_font_size")
        res_extra = merged.get("laufuebersicht_result_font_extra_pt", 0)
        page_break_cats = bool(merged.get("page_break_before_each_category", False))
        show_lauf_cover = bool(merged.get("laufuebersicht_show_cover", True))
        lauf_sec_start = int(merged.get("laufuebersicht_section_number_start", 1))
        if lauf_sec_start < 1:
            raise ValueError("pdf.laufuebersicht_section_number_start must be >= 1")
        lauf_notice = merged.get("laufuebersicht_notice")
        lauf_notice_s = str(lauf_notice).strip() if lauf_notice is not None else ""
        if "organizer_footer" in merged:
            ov = merged["organizer_footer"]
            organizer_footer = str(ov).strip() if ov is not None else ""
        else:
            organizer_footer = DEFAULT_PDF_ORGANIZER_FOOTER
        return PdfStyleSpec(
            page_size=cast(Any, ps),
            orientation=cast(Any, ori),
            title=str(merged.get("title", "") or ""),
            subtitle=str(merged.get("subtitle", "") or ""),
            show_ruleset_footer=bool(merged.get("show_ruleset_footer", False)),
            show_category_footer=bool(merged.get("show_category_footer", True)),
            show_export_timestamp_footer=bool(merged.get("show_export_timestamp_footer", True)),
            organizer_footer=organizer_footer,
            show_organizer_footer=bool(merged.get("show_organizer_footer", True)),
            show_season_footer=bool(merged.get("show_season_footer", True)),
            repeat_header=bool(merged.get("repeat_header", True)),
            logo_path=str(logo) if logo else None,
            max_columns=int(merged.get("max_columns", 48)),
            max_rows_per_category=int(merged.get("max_rows_per_category", 5000)),
            table_layout=cast(TableLayout, layout),
            table_font_size=int(tfs) if tfs is not None else None,
            table_header_font_size=int(thfs) if thfs is not None else None,
            laufuebersicht_result_font_extra_pt=int(res_extra),
            page_break_before_each_category=page_break_cats,
            laufuebersicht_show_cover=show_lauf_cover,
            laufuebersicht_section_number_start=lauf_sec_start,
            laufuebersicht_notice=lauf_notice_s,
            margin_left_cm=_pdf_opt_float(merged, "margin_left_cm", 1.5),
            margin_right_cm=_pdf_opt_float(merged, "margin_right_cm", 1.5),
            margin_top_cm=_pdf_opt_float(merged, "margin_top_cm", 1.5),
            margin_bottom_cm=_pdf_opt_float(merged, "margin_bottom_cm", 1.8),
            footer_font_size_pt=_pdf_opt_float(merged, "footer_font_size_pt", 8.0),
            footer_y_cm=_pdf_opt_float(merged, "footer_y_cm", 1.0),
            section_title_font_size_pt=_pdf_opt_float(merged, "section_title_font_size_pt", 14.0),
            section_title_space_after_pt=_pdf_opt_float(merged, "section_title_space_after_pt", 6.0),
            section_subtitle_font_size_pt=_pdf_opt_float(merged, "section_subtitle_font_size_pt", 10.0),
            section_subtitle_space_after_pt=_pdf_opt_float(merged, "section_subtitle_space_after_pt", 12.0),
            cover_year_font_size_pt=_pdf_opt_float(merged, "cover_year_font_size_pt", 26.0),
            cover_year_leading_pt=_pdf_opt_float(merged, "cover_year_leading_pt", 30.0),
            cover_year_space_after_pt=_pdf_opt_float(merged, "cover_year_space_after_pt", 14.0),
            cover_notice_font_size_pt=_pdf_opt_float(merged, "cover_notice_font_size_pt", 10.0),
            cover_notice_leading_pt=_pdf_opt_float(merged, "cover_notice_leading_pt", 13.0),
            cover_spacer_after_cm=_pdf_opt_float(merged, "cover_spacer_after_cm", 0.35),
            table_spacer_after_cm=_pdf_opt_float(merged, "table_spacer_after_cm", 0.6),
            logo_draw_height_cm=_pdf_opt_float(merged, "logo_draw_height_cm", 2.0),
            logo_spacer_after_cm=_pdf_opt_float(merged, "logo_spacer_after_cm", 0.2),
            line_thin_pt=_pdf_opt_float(merged, "line_thin_pt", 0.12),
            line_normal_pt=_pdf_opt_float(merged, "line_normal_pt", 0.25),
            line_thick_pt=_pdf_opt_float(merged, "line_thick_pt", 0.75),
            double_rule_weight_pt=_pdf_opt_float(merged, "double_rule_weight_pt", 0.85),
            double_rule_gap_pt=_pdf_opt_float(merged, "double_rule_gap_pt", 1.25),
            lauf_sub_header_delta_pt=_pdf_opt_int(merged, "lauf_sub_header_delta_pt", 2),
            lauf_sub_header_min_pt=_pdf_opt_int(merged, "lauf_sub_header_min_pt", 5),
            lauf_result_leading_extra_pt=_pdf_opt_int(merged, "lauf_result_leading_extra_pt", 2),
            color_line_grey_hex=str(merged.get("color_line_grey_hex", "#808080") or "#808080").strip(),
            color_header_green_hex=str(merged.get("color_header_green_hex", "#E8F5E9") or "#E8F5E9").strip(),
            color_header_run_red_hex=str(merged.get("color_header_run_red_hex", "#C62828") or "#C62828").strip(),
            color_cover_year_blue_hex=str(merged.get("color_cover_year_blue_hex", "#1565C0") or "#1565C0").strip(),
            color_band_grey_hex=str(merged.get("color_band_grey_hex", "#f5f5f5") or "#f5f5f5").strip(),
            color_zebra_even_rgb=_pdf_opt_rgb(merged, "color_zebra_even_rgb", (255, 255, 255)),
            color_zebra_odd_rgb=_pdf_opt_rgb(merged, "color_zebra_odd_rgb", (245, 245, 245)),
            color_podium_tint_rgb=_pdf_opt_rgb(merged, "color_podium_tint_rgb", (200, 220, 255)),
            narrow_platz_cm=_pdf_opt_float(merged, "narrow_platz_cm", 0.95),
            narrow_punkte_gesamt_cm=_pdf_opt_float(merged, "narrow_punkte_gesamt_cm", 1.15),
            narrow_distanz_gesamt_cm=_pdf_opt_float(merged, "narrow_distanz_gesamt_cm", 1.35),
            narrow_laufuebersicht_km_pkt_cm=_pdf_opt_float(merged, "narrow_laufuebersicht_km_pkt_cm", 1.25),
            table_width_extra_margin_cm=_pdf_opt_float(merged, "table_width_extra_margin_cm", 3.0),
            table_cell_horizontal_padding_pt=_pdf_opt_float(merged, "table_cell_horizontal_padding_pt", 6.0),
            table_cell_vertical_padding_pt=_pdf_opt_float(merged, "table_cell_vertical_padding_pt", 3.0),
            table_plain_leading_extra_pt=_pdf_opt_int(merged, "table_plain_leading_extra_pt", 1),
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
                raise ValueError("pdf.table_layout 'laufuebersicht' requires columns: ['laufuebersicht_board'] exactly")
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
