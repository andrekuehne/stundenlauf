"""Format-agnostic standings table projection (F20)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.domain.enums import RaceEventState
from backend.domain.models import ProjectDocument, RaceEvent, RaceSeriesCategory
from backend.export.spec import GERMAN_HEADER_BY_COLUMN, ExportSpec
from backend.standings_view import build_standings_rows_for_category
from backend.standings_display import category_label
from backend.ui_api.ranking_display import apply_ranking_exclusions_to_rows, ranking_exclusion_set


@dataclass(frozen=True)
class ColumnDef:
    id: str
    header: str
    align: str = "left"  # left | right | center


@dataclass(frozen=True)
class ExportSection:
    category_key: str
    category_label: str
    title: str
    subtitle: str
    columns: tuple[ColumnDef, ...]
    rows: tuple[tuple[str, ...], ...]
    ruleset_version: str
    calculated_at: str


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
    return f"{km:.3f}"


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

        title = spec.pdf.title or f"Wertung {category_label(category.duration, category.division)}"
        subtitle = spec.pdf.subtitle

        cell_rows = tuple(_row_to_cells(r, column_defs) for r in table_rows)
        sections.append(
            ExportSection(
                category_key=cat_key,
                category_label=category_label(category.duration, category.division),
                title=title,
                subtitle=subtitle,
                columns=column_defs,
                rows=cell_rows,
                ruleset_version=str(meta.get("ruleset_version", "")),
                calculated_at=str(meta.get("calculated_at", "")),
            )
        )
    return tuple(sections)
