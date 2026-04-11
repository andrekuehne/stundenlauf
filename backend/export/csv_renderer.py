"""CSV export reusing the same projection as PDF (F20 stub / second format)."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import TextIO

from backend.export.projection import ExportSection


def render_csv(sections: tuple[ExportSection, ...], dest: Path | TextIO) -> None:
    """Write UTF-8 CSV with one block per category section."""
    close_after = False
    fh: TextIO
    if isinstance(dest, Path):
        fh = dest.open("w", encoding="utf-8-sig", newline="")
        close_after = True
    else:
        fh = dest
    try:
        w = csv.writer(fh)
        for sec in sections:
            w.writerow([f"# category: {sec.category_key}"])
            w.writerow([sec.title, sec.subtitle, sec.category_label])
            w.writerow([c.header for c in sec.columns])
            for row in sec.rows:
                w.writerow(list(row))
            w.writerow([])
    finally:
        if close_after:
            fh.close()
