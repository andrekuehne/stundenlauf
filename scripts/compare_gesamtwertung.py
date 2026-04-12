"""
Build a side-by-side Excel comparison: Gesamtwertung ground truth vs merged project standings.

Single section:

  uv run python scripts/compare_gesamtwertung.py \\
    --ground-truth data/2023/einzel/ground_truth/Gesamtwertung_Einzel.xlsx \\
    --project data/2023/einzel/session_project.json \\
    --section-substring "Halbstundenlauf - W" \\
    --category-key 2023:half_hour:women \\
    --output data/2023/einzel/exports/gesamtwertung_compare_W_2023.xlsx

All Einzel blocks (half/hour × women/men):

  uv run python scripts/compare_gesamtwertung.py \\
    --ground-truth .../Gesamtwertung_Einzel.xlsx \\
    --project .../session_project.json \\
    --all-sections --series-year 2023 \\
    --output .../gesamtwertung_compare_all.xlsx
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.ranking.engine import recompute_project_standings
from backend.storage.repository import JsonProjectRepository
from backend.tools.fixture_session import people_couples_maps
from backend.tools.gesamtwertung_compare import (
    collect_review_route_entries,
    compare_gesamtwertung_to_standings,
    load_all_einzel_gesamtwertung_sections,
    load_gesamtwertung_rows,
    merge_duplicate_gt_rows,
    review_entries_to_notes,
    sheet_label_for_category_key,
    standings_rows_for_category,
    write_comparison_workbook,
    write_multi_sheet_comparison_workbook,
)


def _comparison_issues(comparison: list[dict[str, object]]) -> tuple[int, int]:
    unmatched = sum(1 for c in comparison if not c["matched"])
    bad_delta = 0
    for c in comparison:
        if not c["matched"]:
            continue
        d = c["punkte_delta"]
        if d is not None and abs(float(d)) > 0.01:
            bad_delta += 1
    return unmatched, bad_delta


def main() -> None:
    parser = argparse.ArgumentParser(description="Gesamtwertung.xlsx vs project standings (Excel report).")
    parser.add_argument("--ground-truth", type=Path, required=True, help="Organizer Gesamtwertung *.xlsx")
    parser.add_argument("--project", type=Path, required=True, help="session_project.json")
    parser.add_argument(
        "--all-sections",
        action="store_true",
        help="Process all Einzel blocks (half/hour × W/M); use with --series-year.",
    )
    parser.add_argument(
        "--series-year",
        type=int,
        default=None,
        help="Series year for category keys (required with --all-sections).",
    )
    parser.add_argument(
        "--section-substring",
        type=str,
        default=None,
        help='Section marker in column A, e.g. "Halbstundenlauf - W"',
    )
    parser.add_argument(
        "--category-key",
        type=str,
        default=None,
        help="Standings category key, e.g. 2023:half_hour:women",
    )
    parser.add_argument("--output", type=Path, required=True, help="Output .xlsx path")
    parser.add_argument(
        "--recompute-standings",
        action="store_true",
        help="Recompute standings from events (ignore persisted snapshot).",
    )
    parser.add_argument(
        "--no-merge-gt-duplicates",
        action="store_true",
        help="Do not merge duplicate (name, YOB) rows in ground truth (debug).",
    )
    parser.add_argument(
        "--sheet-title",
        type=str,
        default="Vergleich",
        help="Excel sheet name for single-section mode (max 31 chars).",
    )
    parser.add_argument(
        "--fixture-hint",
        type=str,
        default="",
        help="Optional note appended to HITL_review (e.g. policy for a known fixture).",
    )
    args = parser.parse_args()

    if args.all_sections:
        if args.series_year is None:
            parser.error("--series-year is required with --all-sections")
        if args.section_substring is not None or args.category_key is not None:
            parser.error("With --all-sections, do not pass --section-substring or --category-key")
    else:
        if args.section_substring is None or args.category_key is None:
            parser.error("Without --all-sections, both --section-substring and --category-key are required")

    repo = JsonProjectRepository(args.project)
    document = repo.load()
    if args.recompute_standings:
        document = recompute_project_standings(document)

    people, _couples = people_couples_maps(document)

    reviews = collect_review_route_entries(document)
    notes_list: list[tuple[str, str]] = []
    if reviews:
        notes_list.extend(review_entries_to_notes(reviews, people))
    hint = (args.fixture_hint or "").strip()
    if hint:
        notes_list.append(("Fixture policy", hint))
    notes = notes_list or None

    if args.all_sections:
        sections = load_all_einzel_gesamtwertung_sections(
            args.ground_truth,
            series_year=args.series_year,
            merge_gt_duplicates=not args.no_merge_gt_duplicates,
        )
        comparison_sheets: list[tuple[str, list[dict[str, object]]]] = []
        for category_key, gt_rows in sections:
            standings_rows = standings_rows_for_category(document.standings, category_key)
            comparison = compare_gesamtwertung_to_standings(gt_rows, standings_rows, people)
            label = sheet_label_for_category_key(category_key)
            comparison_sheets.append((label, comparison))
        write_multi_sheet_comparison_workbook(
            out_path=args.output,
            comparison_sheets=comparison_sheets,
            review_notes=notes,
        )
        print(f"Written {args.output}")
        for (category_key, _), (label, comp) in zip(sections, comparison_sheets, strict=True):
            um, bd = _comparison_issues(comp)
            print(f"  {label} ({category_key}): {len(comp)} rows, unmatched={um}, punkte_mismatch={bd}")
        if reviews:
            print(f"HITL review entries: {len(reviews)} (see sheet HITL_review).")
        return

    assert args.section_substring is not None and args.category_key is not None
    gt_rows = load_gesamtwertung_rows(args.ground_truth, title_substring=args.section_substring)
    if not args.no_merge_gt_duplicates:
        gt_rows = merge_duplicate_gt_rows(gt_rows)

    standings_rows = standings_rows_for_category(document.standings, args.category_key)
    comparison = compare_gesamtwertung_to_standings(gt_rows, standings_rows, people)

    write_comparison_workbook(
        out_path=args.output,
        sheet_title=args.sheet_title,
        comparison_rows=comparison,
        review_notes=notes,
    )
    um, bd = _comparison_issues(comparison)
    print(f"Written {args.output} ({len(comparison)} rows, unmatched={um}, punkte_mismatch={bd}).")
    if reviews:
        print(f"HITL review entries: {len(reviews)} (see sheet HITL_review).")


if __name__ == "__main__":
    main()
