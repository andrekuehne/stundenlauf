"""CLI: dual Laufübersicht PDF export matching the desktop GUI (Einzel + Paare)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from backend.app_paths import project_root_dir
from backend.export.gui_pdf_spec import laufuebersicht_einzel_paare_export_specs
from backend.export.registry import export_standings_to_path
from backend.export.spec import normalize_pdf_layout_preset, pdf_layout_preset_catalog
from backend.storage.repository import JsonProjectRepository


def _default_season_path() -> Path:
    return (project_root_dir() / "example" / "stundenlauf-2025.stundenlauf-season" / "session_project.json").resolve()


def _parse_layout_preset(arg: str | None) -> str | None:
    if arg is None:
        return None
    s = str(arg).strip()
    if not s:
        return None
    return normalize_pdf_layout_preset(s)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(
        description=(
            "Export Laufübersicht PDFs like the GUI: writes {base}_einzel.pdf and {base}_paare.pdf "
            "from session_project.json."
        )
    )
    p.add_argument(
        "layout_preset",
        nargs="?",
        default=None,
        help="PDF layout preset id (e.g. default, compact) or substring of the German GUI label; omit for standard.",
    )
    p.add_argument(
        "--input",
        "-i",
        type=Path,
        default=None,
        help=f"Path to session_project.json (default: {_default_season_path()})",
    )
    p.add_argument(
        "--output",
        "-o",
        type=Path,
        default=None,
        help="Base output path (stem for _einzel/_paare); default: <input_dir>/pdftest_export",
    )
    p.add_argument(
        "--list-presets",
        action="store_true",
        help="Print preset ids and German labels, then exit.",
    )
    args = p.parse_args(argv)

    if args.list_presets:
        for row in pdf_layout_preset_catalog():
            print(f"{row['id']}\t{row['label_de']}")
        return

    season = (args.input or _default_season_path()).resolve()
    if not season.is_file():
        print(f"Input not found: {season}", file=sys.stderr)
        raise SystemExit(2)

    try:
        layout_preset = _parse_layout_preset(args.layout_preset)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(2) from exc

    if args.output is not None:
        out_base = args.output.resolve()
    else:
        out_base = (season.parent / "pdftest_export").resolve()

    suffix = out_base.suffix.lower()
    if suffix not in ("", ".pdf"):
        print("--output must be a base file name or end with .pdf", file=sys.stderr)
        raise SystemExit(2)
    stem = out_base.with_suffix("") if suffix == ".pdf" else out_base

    repo = JsonProjectRepository(season)
    doc = repo.load()
    try:
        spec_einzel, spec_paare = laufuebersicht_einzel_paare_export_specs(doc, layout_preset=layout_preset)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc

    if spec_einzel is None and spec_paare is None:
        print("PDF export: no standings categories in the season.", file=sys.stderr)
        raise SystemExit(1)

    stem.parent.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    if spec_einzel is not None:
        path_e = stem.parent / f"{stem.name}_einzel.pdf"
        export_standings_to_path(season, spec_einzel, path_e)
        written.append(path_e)
    if spec_paare is not None:
        path_p = stem.parent / f"{stem.name}_paare.pdf"
        export_standings_to_path(season, spec_paare, path_p)
        written.append(path_p)

    preset_note = layout_preset or "default (standard)"
    print(json.dumps({"preset": preset_note, "files": [str(p) for p in written]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
