"""
Convenience wrapper: 2023 Einzel Gesamtwertung vs session (all half/hour × W/M blocks).

  uv run python scripts/compare_2023_einzel_halbstunden_w.py [--output PATH] [--recompute-standings]

The fixture has one `review` match (men, Lauf 4); see HITL_review / Fixture policy in the workbook.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    default_out = ROOT / "data/2023/einzel/exports/gesamtwertung_compare_all.xlsx"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=default_out, help="Excel output path")
    parser.add_argument(
        "--recompute-standings",
        action="store_true",
        help="Recompute standings from events before comparing.",
    )
    args = parser.parse_args()

    fixture_hint = (
        "2023 Einzel import: one entry stayed on the `review` route (men, Lauf 4, Startnr 53). "
        "Reject the proposed participant link — it is incorrect for this fixture."
    )

    cmd = [
        sys.executable,
        str(ROOT / "scripts/compare_gesamtwertung.py"),
        "--ground-truth",
        str(ROOT / "data/2023/einzel/ground_truth/Gesamtwertung_Einzel.xlsx"),
        "--project",
        str(ROOT / "data/2023/einzel/session_project.json"),
        "--all-sections",
        "--series-year",
        "2023",
        "--output",
        str(args.output),
        "--fixture-hint",
        fixture_hint,
    ]
    if args.recompute_standings:
        cmd.append("--recompute-standings")

    subprocess.run(cmd, check=True, cwd=ROOT)


if __name__ == "__main__":
    main()
