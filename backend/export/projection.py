"""Format-agnostic standings table projection (F20)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.domain.enums import RaceEventState
from backend.domain.models import ProjectDocument, RaceEvent, RaceSeriesCategory
from backend.export.spec import GERMAN_HEADER_BY_COLUMN, ExportSpec
from backend.standings_view import build_standings_rows_for_category
from backend.standings_display import (
    category_footer_label,
    category_label,
    export_pdf_category_title,
    laufuebersicht_section_title,
)


@dataclass(frozen=True)
class ColumnDef:
    id: str
    header: str
    align: str = "left"  # left | right | center


@dataclass(frozen=True)
class ExportSection:
    category_key: str
    category_label: str
    footer_category_label: str
    season_year: int
    title: str
    subtitle: str
    columns: tuple[ColumnDef, ...]
    rows: tuple[tuple[str, ...], ...]
    ruleset_version: str
    calculated_at: str
    # Multi-row PDF header + ReportLab SPANs; CSV uses csv_rows when set (duplicate team numerics).
    header_rows: tuple[tuple[str, ...], ...] | None = None
    table_spans: tuple[tuple[tuple[int, int], tuple[int, int]], ...] | None = None
    csv_rows: tuple[tuple[str, ...], ...] | None = None
    # Per body row: logical band index (same for both partner rows of a team). PDF alternates fill by id % 2.
    body_row_band_group: tuple[int, ...] | None = None
    # Per body row: PDF highlight for Platz 1–3 (both lines for a Paar); None = no podium styling.
    body_row_podium: tuple[bool, ...] | None = None


def _find_category(document: ProjectDocument, category_key: str) -> RaceSeriesCategory:
    for event in document.events:
        if event.category.key == category_key:
            return event.category
    raise ValueError(f"Unknown category_key: {category_key!r}")


def _ordered_active_races_for_category(document: ProjectDocument, category_key: str) -> tuple[RaceEvent, ...]:
    active = [
        e
        for e in document.events
        if e.state == RaceEventState.ACTIVE and e.category.key == category_key
    ]
    active.sort(key=lambda e: (e.race_no, e.race_date, e.race_event_uid))
    return tuple(active)


def _format_distance(km: float) -> str:
    # German-style decimal comma for standings export (PDF/CSV).
    return f"{km:.3f}".replace(".", ",")


def _format_points(p: float) -> str:
    if p == int(p):
        return str(int(p))
    return f"{p:.1f}".rstrip("0").rstrip(".")


def _cell_team_members(row: dict[str, Any]) -> str:
    members = row.get("team_members") or []
    if not members:
        return ""
    lines = []
    for m in members:
        name = str(m.get("name", ""))
        yob = m.get("yob")
        club = str(m.get("club", ""))
        bits = [name]
        if yob:
            bits.append(f"({yob})")
        if club:
            bits.append(club)
        lines.append(" ".join(bits))
    return "\n".join(lines)


def _build_column_defs(
    resolved_columns: tuple[str, ...], race_events: tuple[RaceEvent, ...]
) -> tuple[ColumnDef, ...]:
    cols: list[ColumnDef] = []
    for cid in resolved_columns:
        if cid == "points_per_race":
            for ev in race_events:
                rid = f"points_race:{ev.race_event_uid}"
                header = f"{ev.race_no}. Lauf" if ev.race_no else ev.race_event_uid[:8]
                cols.append(ColumnDef(id=rid, header=header, align="right"))
            continue
        header = GERMAN_HEADER_BY_COLUMN.get(cid, cid)
        align = "right" if cid in ("platz", "punkte_gesamt", "distanz_gesamt", "yob") else "left"
        cols.append(ColumnDef(id=cid, header=header, align=align))
    return tuple(cols)


# Empty Laufübersicht cells (PDF/CSV). Str./Pkt. columns are centered in PDF; Verein stays left.
_EM_DASH = "\u2014"


def _laufuebersicht_club_cell(raw: Any) -> str:
    if raw is None:
        return _EM_DASH
    s = str(raw).strip()
    return s if s else _EM_DASH


def _race_km_cell(uid: str, row: dict[str, Any]) -> str:
    pr = row.get("points_by_race") or {}
    dr = row.get("distance_by_race") or {}
    p_raw, d_raw = pr.get(uid), dr.get(uid)
    if p_raw is None and d_raw is None:
        return _EM_DASH
    if d_raw is not None:
        return _format_distance(float(d_raw))
    return _EM_DASH


def _race_pkt_cell(uid: str, row: dict[str, Any]) -> str:
    pr = row.get("points_by_race") or {}
    dr = row.get("distance_by_race") or {}
    p_raw, d_raw = pr.get(uid), dr.get(uid)
    if p_raw is None and d_raw is None:
        return _EM_DASH
    if p_raw is not None:
        return _format_points(float(p_raw))
    return _EM_DASH


def _gesamt_km_cell(row: dict[str, Any]) -> str:
    return _format_distance(float(row.get("distanz_gesamt", 0.0)))


def _gesamt_pkt_cell(row: dict[str, Any]) -> str:
    return _format_points(float(row.get("punkte_gesamt", 0.0)))


def _display_name_yob_line(name: str, yob: Any) -> str:
    name = str(name).strip()
    if yob is not None and str(yob).strip():
        return f"{name} ({yob})"
    return name


def _laufuebersicht_column_defs(race_events: tuple[RaceEvent, ...]) -> tuple[ColumnDef, ...]:
    cols: list[ColumnDef] = [
        ColumnDef(id="platz", header="Platz", align="right"),
        ColumnDef(id="display_name", header="Name", align="left"),
        ColumnDef(id="club", header="Verein", align="left"),
    ]
    for ev in race_events:
        uid = ev.race_event_uid
        cols.append(ColumnDef(id=f"race_km:{uid}", header="Str. (km)", align="center"))
        cols.append(ColumnDef(id=f"race_pkt:{uid}", header="Pkt.", align="center"))
    cols.append(ColumnDef(id="gesamt_km", header="Str. (km)", align="center"))
    cols.append(ColumnDef(id="gesamt_pkt", header="Pkt.", align="center"))
    return tuple(cols)


def _build_laufuebersicht_header_rows(
    race_events: tuple[RaceEvent, ...],
) -> tuple[tuple[str, ...], tuple[str, ...], tuple[str, ...]]:
    """Three-row header: run / Gesamt group labels, then Laufstr.|Wertung, then (km)|(Punkte)."""
    row0: list[str] = ["Platz", "Name", "Verein"]
    row1: list[str] = ["", "", ""]
    row2: list[str] = ["", "", ""]
    for ev in race_events:
        label = f"{ev.race_no}. Lauf" if ev.race_no else ev.race_event_uid[:8]
        row0.extend((label, ""))
        row1.extend(("Laufstr.", "Wertung"))
        row2.extend(("(km)", "(Punkte)"))
    row0.extend(("Gesamt", ""))
    row1.extend(("Laufstr.", "Wertung"))
    row2.extend(("(km)", "(Punkte)"))
    return (tuple(row0), tuple(row1), tuple(row2))


def _build_laufuebersicht_sections(document: ProjectDocument, spec: ExportSpec) -> tuple[ExportSection, ...]:
    from backend.ui_api.ranking_display import apply_ranking_exclusions_to_rows, ranking_exclusion_set

    sections: list[ExportSection] = []
    title_override = spec.pdf.title.strip()
    sec0 = spec.pdf.laufuebersicht_section_number_start
    for section_no, cat_key in enumerate(spec.categories, start=sec0):
        category = _find_category(document, cat_key)
        races = _ordered_active_races_for_category(document, cat_key)
        column_defs = _laufuebersicht_column_defs(races)
        header_rows_t = _build_laufuebersicht_header_rows(races)

        meta, raw_rows = build_standings_rows_for_category(document, cat_key)
        excluded = ranking_exclusion_set(document, cat_key)
        eligible, _full = apply_ranking_exclusions_to_rows(raw_rows, excluded)
        table_rows = eligible if spec.rows.eligibility == "eligible_only" else _full

        if len(table_rows) > spec.pdf.max_rows_per_category:
            raise ValueError(
                f"Category {cat_key!r} has {len(table_rows)} rows; max {spec.pdf.max_rows_per_category}"
            )
        ncols_chk = 5 + 2 * len(races)
        if ncols_chk > spec.pdf.max_columns:
            raise ValueError(
                f"laufuebersicht: category {cat_key!r} needs {ncols_chk} columns; max {spec.pdf.max_columns}"
            )

        if title_override:
            title = spec.pdf.title
        else:
            title = laufuebersicht_section_title(section_no, category.duration, category.division)
        subtitle = spec.pdf.subtitle

        n_r = len(races)
        last_col = 3 + 2 * (n_r + 1) - 1  # last Str./Pkt. column (Gesamt Pkt.)
        hdr_n = 3
        spans: list[tuple[tuple[int, int], tuple[int, int]]] = []
        for col in (0, 1, 2):
            spans.append(((col, 0), (col, hdr_n - 1)))
        for i in range(n_r + 1):
            c0 = 3 + 2 * i
            spans.append(((c0, 0), (c0 + 1, 0)))
        pdf_body: list[tuple[str, ...]] = []
        csv_body: list[tuple[str, ...]] = []
        band_groups: list[int] = []
        podium_rows: list[bool] = []
        band_g = 0

        def numeric_cells(r: dict[str, Any]) -> list[str]:
            cells: list[str] = []
            for ev in races:
                uid = ev.race_event_uid
                cells.append(_race_km_cell(uid, r))
                cells.append(_race_pkt_cell(uid, r))
            cells.append(_gesamt_km_cell(r))
            cells.append(_gesamt_pkt_cell(r))
            return cells

        for row in table_rows:
            nums = numeric_cells(row)
            platz_s = "" if row.get("platz") is None else str(int(row["platz"]))
            pv = row.get("platz")
            on_podium = pv is not None and 1 <= int(pv) <= 3

            if row.get("entity_kind") == "team":
                members = row.get("team_members") or []
                if len(members) >= 2:
                    m0, m1 = members[0], members[1]
                    n0 = _display_name_yob_line(str(m0.get("name", "")), m0.get("yob"))
                    n1 = _display_name_yob_line(str(m1.get("name", "")), m1.get("yob"))
                    c0 = _laufuebersicht_club_cell(m0.get("club"))
                    c1 = _laufuebersicht_club_cell(m1.get("club"))
                    tr = hdr_n + len(pdf_body)
                    row_pdf_a = (platz_s, n0, c0, *nums)
                    row_pdf_b = ("", n1, c1, *([""] * len(nums)))
                    pdf_body.append(row_pdf_a)
                    pdf_body.append(row_pdf_b)
                    band_groups.extend((band_g, band_g))
                    podium_rows.extend((on_podium, on_podium))
                    band_g += 1
                    csv_body.append(row_pdf_a)
                    csv_body.append((platz_s, n1, c1, *nums))
                    for c in [0, *range(3, last_col + 1)]:
                        spans.append(((c, tr), (c, tr + 1)))
                else:
                    yob_c = row.get("yob")
                    name_cell = _display_name_yob_line(str(row.get("display_name", "")), yob_c)
                    club_s = _laufuebersicht_club_cell(row.get("club"))
                    one = (platz_s, name_cell, club_s, *nums)
                    pdf_body.append(one)
                    band_groups.append(band_g)
                    podium_rows.append(on_podium)
                    band_g += 1
                    csv_body.append(one)
            else:
                yob = row.get("yob")
                name_cell = _display_name_yob_line(str(row.get("display_name", "")), yob)
                club_s = _laufuebersicht_club_cell(row.get("club"))
                one = (platz_s, name_cell, club_s, *nums)
                pdf_body.append(one)
                band_groups.append(band_g)
                podium_rows.append(on_podium)
                band_g += 1
                csv_body.append(one)

        sections.append(
            ExportSection(
                category_key=cat_key,
                category_label=category_label(category.duration, category.division),
                footer_category_label=category_footer_label(category.duration, category.division),
                season_year=category.year,
                title=title,
                subtitle=subtitle,
                columns=column_defs,
                rows=tuple(pdf_body),
                ruleset_version=str(meta.get("ruleset_version", "")),
                calculated_at=str(meta.get("calculated_at", "")),
                header_rows=header_rows_t,
                table_spans=tuple(spans) if spans else None,
                csv_rows=tuple(csv_body),
                body_row_band_group=tuple(band_groups),
                body_row_podium=tuple(podium_rows),
            )
        )
    return tuple(sections)


def _row_to_cells(row: dict[str, Any], column_defs: tuple[ColumnDef, ...]) -> tuple[str, ...]:
    out: list[str] = []
    for c in column_defs:
        if c.id == "platz":
            p = row.get("platz")
            out.append("" if p is None else str(int(p)))
        elif c.id == "display_name":
            out.append(str(row.get("display_name", "")))
        elif c.id == "club":
            v = row.get("club")
            out.append("" if v is None else str(v))
        elif c.id == "yob":
            v = row.get("yob")
            out.append("" if v is None else str(v))
        elif c.id == "punkte_gesamt":
            out.append(_format_points(float(row.get("punkte_gesamt", 0.0))))
        elif c.id == "distanz_gesamt":
            out.append(_format_distance(float(row.get("distanz_gesamt", 0.0))))
        elif c.id == "ausser_wertung":
            out.append("Ja" if row.get("ausser_wertung") else "Nein")
        elif c.id == "entity_uid":
            out.append(str(row.get("entity_uid", "")))
        elif c.id == "entity_kind":
            out.append(str(row.get("entity_kind", "")))
        elif c.id == "team_members":
            out.append(_cell_team_members(row))
        elif c.id.startswith("points_race:"):
            uid = c.id.split(":", 1)[1]
            pr = row.get("points_by_race") or {}
            val = pr.get(uid)
            out.append("" if val is None else _format_points(float(val)))
        else:
            raise ValueError(f"Unhandled column id in projection: {c.id!r}")
    return tuple(out)


def build_export_sections(document: ProjectDocument, spec: ExportSpec) -> tuple[ExportSection, ...]:
    """Build table sections from an already :func:`resolve_document_for_export` document."""
    if spec.pdf.table_layout == "laufuebersicht":
        return _build_laufuebersicht_sections(document, spec)

    from backend.ui_api.ranking_display import apply_ranking_exclusions_to_rows, ranking_exclusion_set

    resolved_cols = spec.resolved_columns()

    sections: list[ExportSection] = []
    for cat_key in spec.categories:
        category = _find_category(document, cat_key)
        races = _ordered_active_races_for_category(document, cat_key)
        column_defs = _build_column_defs(resolved_cols, races)

        meta, raw_rows = build_standings_rows_for_category(document, cat_key)
        excluded = ranking_exclusion_set(document, cat_key)
        eligible, full = apply_ranking_exclusions_to_rows(raw_rows, excluded)
        if spec.rows.eligibility == "eligible_only":
            table_rows = eligible
        else:
            table_rows = full

        if len(table_rows) > spec.pdf.max_rows_per_category:
            raise ValueError(
                f"Category {cat_key!r} has {len(table_rows)} rows; max {spec.pdf.max_rows_per_category}"
            )

        title = spec.pdf.title or export_pdf_category_title(
            category.year, category.duration, category.division
        )
        subtitle = spec.pdf.subtitle

        cell_rows = tuple(_row_to_cells(r, column_defs) for r in table_rows)
        sections.append(
            ExportSection(
                category_key=cat_key,
                category_label=category_label(category.duration, category.division),
                footer_category_label=category_footer_label(category.duration, category.division),
                season_year=category.year,
                title=title,
                subtitle=subtitle,
                columns=column_defs,
                rows=cell_rows,
                ruleset_version=str(meta.get("ruleset_version", "")),
                calculated_at=str(meta.get("calculated_at", "")),
            )
        )
    return tuple(sections)
