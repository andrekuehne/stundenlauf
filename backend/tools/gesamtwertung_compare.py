"""
Parse organizer Gesamtwertung_Einzel-style sheets and compare to project standings.

Extensible for additional years/sections via section title substring and category_key.
"""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

from openpyxl import Workbook
from openpyxl.worksheet.worksheet import Worksheet

from backend.domain.models import Person, ProjectDocument, StandingsRow, StandingsSnapshot
from backend.ranking.aggregation import sum_top_n_or_all_points_and_distance
from backend.ranking.rules import default_ruleset_v1


@dataclass(frozen=True)
class GesamtwertungRow:
    platz: int
    name: str
    yob: int | None
    punkte_gesamt: float
    distanz_gesamt: float


# Column A markers in Gesamtwertung_Einzel.xlsx (singles) — order matches typical sheet layout.
# Each tuple: (title substring in column A, RaceDuration value, Division value for category key).
EINZEL_GESAMTWERTUNG_SECTION_SPECS: tuple[tuple[str, str, str], ...] = (
    ("Halbstundenlauf - W", "half_hour", "women"),
    ("Halbstundenlauf - M", "half_hour", "men"),
    ("Einstundenlauf - W", "hour", "women"),
    ("Einstundenlauf - M", "hour", "men"),
)


def category_key_for_einzel_section(series_year: int, duration: str, division: str) -> str:
    return f"{series_year}:{duration}:{division}"


def sheet_label_for_category_key(category_key: str) -> str:
    """Short Excel-safe name, e.g. 2023:half_hour:women -> hh_W."""
    parts = category_key.split(":")
    if len(parts) != 3:
        return safe_excel_sheet_name(category_key)
    _y, dur, div = parts
    dur_s = "hh" if dur == "half_hour" else "h" if dur == "hour" else dur[:8]
    div_s = (div[:1] or "x").upper()
    return f"{dur_s}_{div_s}"


def safe_excel_sheet_name(name: str, max_len: int = 31) -> str:
    for c in '[]:*?/\\':
        name = name.replace(c, "_")
    return name[:max_len]


def normalize_person_name(name: str) -> str:
    s = " ".join(str(name).split())
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.casefold().strip()


# Pairs of names treated as the same for matching (e.g. spelling variants).
_NAME_EQUIVALENCE_CLASSES: tuple[tuple[str, str], ...] = (
    ("Bianca Bohmeier", "Bianca Bomeier"),
)


def _canonical_match_name(name: str) -> str:
    n = normalize_person_name(name)
    for a, b in _NAME_EQUIVALENCE_CLASSES:
        na, nb = normalize_person_name(a), normalize_person_name(b)
        if n == na or n == nb:
            return min(na, nb)
    return n


def _match_key(name: str, yob: int | None) -> tuple[str, int | str]:
    return (_canonical_match_name(name), yob if yob is not None else -1)


def find_section_title_row(ws: Worksheet, title_substring: str) -> int:
    """1-based row index of the cell in column A containing title_substring."""
    for r in range(1, ws.max_row + 1):
        v = ws.cell(r, 1).value
        if v is not None and title_substring in str(v):
            return r
    raise ValueError(f"No section with {title_substring!r} in column A")


def _wertung_km_pairs_from_data_row(row: tuple[object, ...]) -> tuple[tuple[float, float], ...]:
    """Columns 5–16: five (km, Punkte) pairs, 1-based Excel columns 4–15 as 0-based slice [4:16]."""
    cells = list(row[:16]) + [None] * 16
    out: list[tuple[float, float]] = []
    for i in range(5):
        km_col = 4 + i * 2
        pt_col = 5 + i * 2
        km = cells[km_col] if km_col < len(cells) else None
        pt = cells[pt_col] if pt_col < len(cells) else None
        if km is None and pt is None:
            continue
        try:
            km_f = float(km) if km is not None else 0.0
        except (TypeError, ValueError):
            km_f = 0.0
        try:
            pt_f = float(pt) if pt is not None else 0.0
        except (TypeError, ValueError):
            pt_f = 0.0
        if pt_f == 0.0 and km_f == 0.0:
            continue
        out.append((km_f, pt_f))
    return tuple(out)


def aggregate_row_like_standings(
    pairs: tuple[tuple[float, float], ...],
    *,
    top_n: int = 4,
    distance_decimals: int = 3,
) -> tuple[float, float]:
    """Same top-N rule as project standings, using synthetic race ids for ordering ties."""
    if not pairs:
        return 0.0, 0.0
    race_rows = tuple(
        (f"syn_lauf_{i}", float(pt), float(km)) for i, (km, pt) in enumerate(pairs)
    )
    agg = sum_top_n_or_all_points_and_distance(
        race_rows,
        n=top_n,
        distance_decimals=distance_decimals,
    )
    return agg.punkte_gesamt, agg.distanz_gesamt


def parse_gesamtwertung_section(
    ws: Worksheet,
    *,
    title_substring: str,
    rules_top_n: int | None = None,
    distance_decimals: int | None = None,
) -> list[GesamtwertungRow]:
    """
    Read one block under a section title (column A).

    Expects: title row, Lauf header row, Platz header row, (km)/(Punkte) row, then data rows
    until column A is empty or non-numeric.
    """
    rs = default_ruleset_v1()
    n = rules_top_n if rules_top_n is not None else rs.top_n
    dd = distance_decimals if distance_decimals is not None else rs.distance_decimals

    title_row = find_section_title_row(ws, title_substring)
    first_data = title_row + 4
    rows: list[GesamtwertungRow] = []
    for r in range(first_data, ws.max_row + 1):
        platz = ws.cell(r, 1).value
        if platz is None:
            break
        if isinstance(platz, str) and re.match(r"^\s*\d+\.\s", platz):
            break
        if not isinstance(platz, (int, float)):
            break
        name = ws.cell(r, 2).value
        if name is None or str(name).strip() == "":
            break
        jg = ws.cell(r, 3).value
        yob: int | None
        try:
            yob = int(jg) if jg is not None else None
        except (TypeError, ValueError):
            yob = None

        raw = tuple(ws.cell(r, c).value for c in range(1, 17))
        pairs = _wertung_km_pairs_from_data_row(raw)
        pk, dk = aggregate_row_like_standings(pairs, top_n=n, distance_decimals=dd)
        rows.append(
            GesamtwertungRow(
                platz=int(platz),
                name=str(name).strip(),
                yob=yob,
                punkte_gesamt=pk,
                distanz_gesamt=dk,
            )
        )
    return rows


def standings_rows_for_category(snapshot: StandingsSnapshot | None, category_key: str) -> tuple[StandingsRow, ...]:
    if snapshot is None:
        return ()
    for t in snapshot.category_tables:
        if t.category_key == category_key:
            return t.rows
    return ()


def _person_yob(people: dict[str, Person], uid: str) -> int | None:
    p = people.get(uid)
    return int(p.yob) if p and p.yob is not None else None


def _standings_rows_by_match_key(
    rows: Iterable[StandingsRow],
    people: dict[str, Person],
    display_name_fn,
) -> dict[tuple[str, int | str], deque[StandingsRow]]:
    by: dict[tuple[str, int | str], deque[StandingsRow]] = defaultdict(deque)
    for row in rows:
        if row.entity_kind != "participant":
            continue
        name = display_name_fn(row.entity_uid, people)
        yob = _person_yob(people, row.entity_uid)
        key = _match_key(name, yob)
        by[key].append(row)
    return by


def default_display_name(uid: str, people: dict[str, Person]) -> str:
    p = people.get(uid)
    return p.name if p else uid


def merge_duplicate_gt_rows(rows: list[GesamtwertungRow]) -> list[GesamtwertungRow]:
    """
    Some organizer sheets list the same athlete twice (split rows). Our pipeline merges
    identity; totals must be summed for a fair comparison.
    """
    groups: dict[tuple[str, int | str], list[GesamtwertungRow]] = defaultdict(list)
    for r in rows:
        groups[_match_key(r.name, r.yob)].append(r)
    merged: list[GesamtwertungRow] = []
    for _key, group in groups.items():
        if len(group) == 1:
            merged.append(group[0])
            continue
        merged.append(
            GesamtwertungRow(
                platz=min(g.platz for g in group),
                name=group[0].name,
                yob=group[0].yob,
                punkte_gesamt=sum(g.punkte_gesamt for g in group),
                distanz_gesamt=sum(g.distanz_gesamt for g in group),
            )
        )
    merged.sort(key=lambda r: r.platz)
    return merged


def compare_gesamtwertung_to_standings(
    ground_truth: list[GesamtwertungRow],
    standings_rows: tuple[StandingsRow, ...],
    people: dict[str, Person],
    *,
    display_name_fn=default_display_name,
) -> list[dict[str, object]]:
    """
    Align GT rows to merged standings by (canonical name, YOB).

    Returns one dict per GT row with keys: gt_*, merged_*, matched, punkte_delta, note.
    """
    merged_by = _standings_rows_by_match_key(standings_rows, people, display_name_fn)
    out: list[dict[str, object]] = []
    for gt in ground_truth:
        key = _match_key(gt.name, gt.yob)
        q = merged_by.get(key)
        mrow: StandingsRow | None
        if q and len(q) > 0:
            mrow = q.popleft()
        else:
            mrow = None
        delta = None
        if mrow is not None:
            delta = round(float(mrow.punkte_gesamt) - float(gt.punkte_gesamt), 6)
        out.append(
            {
                "gt_platz": gt.platz,
                "gt_name": gt.name,
                "gt_yob": gt.yob,
                "gt_punkte": gt.punkte_gesamt,
                "gt_distanz": gt.distanz_gesamt,
                "merged_platz": mrow.platz if mrow else None,
                "merged_name": display_name_fn(mrow.entity_uid, people) if mrow else None,
                "merged_yob": _person_yob(people, mrow.entity_uid) if mrow else None,
                "merged_punkte": float(mrow.punkte_gesamt) if mrow else None,
                "merged_distanz": float(mrow.distanz_gesamt) if mrow else None,
                "merged_entity_uid": mrow.entity_uid if mrow else None,
                "punkte_delta": delta,
                "matched": mrow is not None,
            }
        )
    return out


_COMPARISON_HEADERS = [
    "GT_Platz",
    "GT_Name",
    "GT_Jg",
    "GT_Punkte",
    "GT_Distanz_km",
    "Merged_Platz",
    "Merged_Name",
    "Merged_Jg",
    "Merged_Punkte",
    "Merged_Distanz_km",
    "Punkte_delta",
    "matched",
]


def append_comparison_rows(ws: Worksheet, comparison_rows: list[dict[str, object]]) -> None:
    ws.append(_COMPARISON_HEADERS)
    for row in comparison_rows:
        ws.append(
            [
                row["gt_platz"],
                row["gt_name"],
                row["gt_yob"],
                row["gt_punkte"],
                row["gt_distanz"],
                row["merged_platz"],
                row["merged_name"],
                row["merged_yob"],
                row["merged_punkte"],
                row["merged_distanz"],
                row["punkte_delta"],
                row["matched"],
            ]
        )


def write_comparison_workbook(
    *,
    out_path: Path,
    sheet_title: str,
    comparison_rows: list[dict[str, object]],
    review_notes: list[tuple[str, str]] | None = None,
) -> None:
    """Write a workbook: one comparison sheet + optional HITL notes."""
    wb = Workbook()
    ws = wb.active
    assert ws is not None
    ws.title = safe_excel_sheet_name(sheet_title)
    append_comparison_rows(ws, comparison_rows)

    if review_notes:
        wn = wb.create_sheet("HITL_review")
        wn.append(["topic", "detail"])
        for topic, detail in review_notes:
            wn.append([topic, detail])

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)


def write_multi_sheet_comparison_workbook(
    *,
    out_path: Path,
    comparison_sheets: Sequence[tuple[str, list[dict[str, object]]]],
    review_notes: list[tuple[str, str]] | None = None,
) -> None:
    """One comparison sheet per category (e.g. hh_W, hh_M, h_W, h_M) plus optional HITL_review."""
    wb = Workbook()
    first = True
    for sheet_label, rows in comparison_sheets:
        name = safe_excel_sheet_name(sheet_label)
        if first:
            ws = wb.active
            assert ws is not None
            ws.title = name
            append_comparison_rows(ws, list(rows))
            first = False
        else:
            ws = wb.create_sheet(name)
            append_comparison_rows(ws, list(rows))

    if review_notes:
        wn = wb.create_sheet("HITL_review")
        wn.append(["topic", "detail"])
        for topic, detail in review_notes:
            wn.append([topic, detail])

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)


def load_gesamtwertung_rows(
    xlsx_path: Path,
    *,
    title_substring: str,
) -> list[GesamtwertungRow]:
    from openpyxl import load_workbook

    wb = load_workbook(xlsx_path, read_only=True, data_only=True)
    try:
        ws = wb.worksheets[0]
        return parse_gesamtwertung_section(ws, title_substring=title_substring)
    finally:
        wb.close()


def load_all_einzel_gesamtwertung_sections(
    xlsx_path: Path,
    *,
    series_year: int,
    merge_gt_duplicates: bool = True,
    section_specs: Sequence[tuple[str, str, str]] | None = None,
) -> list[tuple[str, list[GesamtwertungRow]]]:
    """
    Parse all singles Gesamtwertung blocks (half/hour × W/M) in one workbook read.

    Returns (category_key, rows) in ``EINZEL_GESAMTWERTUNG_SECTION_SPECS`` order.
    """
    from openpyxl import load_workbook

    specs = tuple(section_specs) if section_specs is not None else EINZEL_GESAMTWERTUNG_SECTION_SPECS
    wb = load_workbook(xlsx_path, read_only=True, data_only=True)
    try:
        ws = wb.worksheets[0]
        out: list[tuple[str, list[GesamtwertungRow]]] = []
        for title_sub, dur, div in specs:
            ck = category_key_for_einzel_section(series_year, dur, div)
            rows = parse_gesamtwertung_section(ws, title_substring=title_sub)
            if merge_gt_duplicates:
                rows = merge_duplicate_gt_rows(rows)
            out.append((ck, rows))
        return out
    finally:
        wb.close()


@dataclass(frozen=True)
class ReviewEntryInfo:
    race_event_uid: str
    category_key: str
    race_no: int
    source_file: str
    startnr: str
    entry_uid: str
    participant_uid: str | None
    confidence: float


def collect_review_route_entries(document: ProjectDocument) -> tuple[ReviewEntryInfo, ...]:
    """All entries whose match route is `review` (HITL queue)."""
    out: list[ReviewEntryInfo] = []
    for event in document.events:
        for ent in event.entries:
            mm = ent.match_meta
            if mm is None or mm.route != "review":
                continue
            out.append(
                ReviewEntryInfo(
                    race_event_uid=event.race_event_uid,
                    category_key=event.category.key,
                    race_no=event.race_no,
                    source_file=event.source_file,
                    startnr=ent.startnr,
                    entry_uid=ent.entry_uid,
                    participant_uid=ent.participant_uid,
                    confidence=mm.confidence,
                )
            )
    return tuple(out)


def review_entries_to_notes(
    entries: tuple[ReviewEntryInfo, ...],
    people: dict[str, Person],
) -> list[tuple[str, str]]:
    """Human-readable rows for the HITL_review sheet."""
    notes: list[tuple[str, str]] = []
    for e in entries:
        pname = ""
        if e.participant_uid:
            p = people.get(e.participant_uid)
            pname = p.name if p else e.participant_uid
        notes.append(
            (
                f"review {e.category_key} Lauf {e.race_no} Startnr {e.startnr}",
                f"entry_uid={e.entry_uid} linked_participant={pname or '—'} "
                f"confidence={e.confidence:.3f} source_file={e.source_file}",
            )
        )
    return notes
