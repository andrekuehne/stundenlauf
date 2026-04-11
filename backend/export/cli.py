"""CLI: export standings from a session_project.json file."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from backend.export.registry import export_standings_to_path
from backend.export.spec import ExportSpec


def main() -> None:
    p = argparse.ArgumentParser(description="Export Stundenlauf standings to PDF or CSV.")
    p.add_argument("--input", "-i", type=Path, required=True, help="Path to session_project.json")
    p.add_argument("--output", "-o", type=Path, required=True, help="Output .pdf or .csv path")
    p.add_argument(
        "--spec",
        type=Path,
        default=None,
        help="JSON file with export spec (format, categories, columns, ...)",
    )
    args = p.parse_args()

    if args.spec is not None:
        spec_raw = json.loads(args.spec.read_text(encoding="utf-8"))
    else:
        payload = json.loads(args.input.read_text(encoding="utf-8"))

        def _event_category_key(e: dict) -> str:
            c = e["category"]
            return f'{c["year"]}:{c["duration"]}:{c["division"]}'

        cats: list[str] = sorted({_event_category_key(e) for e in payload.get("events", [])})
        if not cats:
            raise SystemExit("No events/categories found in input JSON")
        spec_raw = {
            "format": "pdf" if args.output.suffix.lower() == ".pdf" else "csv",
            "categories": cats,
            "columns": ["official_board"],
            "standings": {"source": "embedded", "recompute": False},
            "race_filter": {"mode": "all_active"},
            "rows": {"eligibility": "eligible_only"},
            "pdf": {"orientation": "landscape", "page_size": "A4"},
        }
    spec = ExportSpec.from_dict(spec_raw)
    export_standings_to_path(args.input, spec, args.output)


if __name__ == "__main__":
    main()
