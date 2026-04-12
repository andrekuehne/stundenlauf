"""
Interactive PDF export scratchpad for Cursor / VS Code “Run Cell” (#%%).

Run cells top-to-bottom once, then re-run lower cells after tweaking ``spec`` or paths.
Executing the file as a script (``uv run python scripts/pdf_export_playground.py``) runs all cells
sequentially and writes ``example/_pdf_playground_export.pdf``.
"""

from __future__ import annotations

# %%
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# %%
# Season JSON (same shape as ``session_project.json`` in the app workspace).
# Point this at your file; the bundled example is small enough to iterate on.
SEASON_FILE: Path = ROOT / "example" / "stundenlauf-2025.stundenlauf-season" / "session_project.json"

# Written PDF for the example cell below (change name/path freely).
OUT_PDF: Path = ROOT / "example" / "_pdf_playground_export.pdf"

# %%
from backend.export.registry import export_standings_pdf_bytes, export_standings_to_path
from backend.export.resolve import load_project_document
from backend.export.spec import ExportSpec, sort_category_keys_for_export


# %%
def event_category_keys_from_json(path: Path) -> list[str]:
    """Category keys as used in ``ExportSpec.categories`` (mirrors ``backend.export.cli``)."""

    def _event_category_key(e: dict) -> str:
        c = e["category"]
        return f"{c['year']}:{c['duration']}:{c['division']}"

    payload = json.loads(path.read_text(encoding="utf-8"))
    cats = sorted({_event_category_key(e) for e in payload.get("events", [])})
    return cats


# Optional: load the typed document if you want to inspect ``doc.events`` / standings in the REPL.
doc = load_project_document(SEASON_FILE)
category_keys = sort_category_keys_for_export(event_category_keys_from_json(SEASON_FILE))
print(f"{SEASON_FILE.name}: {len(category_keys)} category key(s) (export order)")
for k in category_keys[:12]:
    print(f"  {k}")
if len(category_keys) > 12:
    print("  ...")

# %%
# ``spec`` is declarative: which categories, which column preset, how races/standings are resolved.
# - ``categories``: subset to export; ``category_keys`` below is sorted for print (Halb W/M, Std W/M, Paare …).
# - ``columns``: preset name → see ``COLUMN_PRESETS`` in ``backend.export.spec``, or expand manually.
# - ``standings.source`` ``embedded`` uses JSON snapshot; ``live`` + ``recompute`` recomputes like the CLI default path.
# - ``race_filter``: ``all_active`` vs ``up_to_race_no`` / ``race_event_uids`` (see ``RaceFilterSpec``).
# - ``pdf.*``: page size, orientation, title, logo_path, footers (``organizer_footer``, ``show_*_footer``) — see ``PdfStyleSpec`` in ``backend.export.spec``.

spec_dict: dict = {
    "format": "pdf",
    "categories": list(category_keys),
    # Laufübersicht layout: per-race Str. (km) + Pkt. columns, two-line header, team rows split (PDF).
    "columns": ["laufuebersicht_board"],
    "standings": {"source": "embedded", "recompute": False},
    "race_filter": {"mode": "all_active"},
    "rows": {"eligibility": "eligible_only"},
    "pdf": {
        "orientation": "landscape",
        "page_size": "A4",
        "table_layout": "laufuebersicht",
        # Each Wertung (1/2h W, 1/2h M, …) starts on a new page after the first.
        "page_break_before_each_category": True,
        # Optional: override defaults (7 pt body / 8 pt header for this layout)
        # "table_font_size": 7,
        # "table_header_font_size": 8,
        # "title": "Meine Wertung",
        # "subtitle": "Nachbearbeitung",
        # "logo_path": str(ROOT / "path" / "to" / "logo.png"),
    },
}

spec = ExportSpec.from_dict(spec_dict)

# %%
# Example: write a PDF next to the season file (open OUT_PDF in a viewer to iterate on layout).
OUT_PDF.parent.mkdir(parents=True, exist_ok=True)
export_standings_to_path(SEASON_FILE, spec, OUT_PDF)
print(f"Wrote {OUT_PDF.resolve()}")

# %%
# Optional: same render in memory (e.g. attach to a notebook or hash/compare bytes).
pdf_bytes = export_standings_pdf_bytes(SEASON_FILE, spec)
print(f"PDF bytes: {len(pdf_bytes)}")
