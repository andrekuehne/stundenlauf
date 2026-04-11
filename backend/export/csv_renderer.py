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
            if sec.header_rows is not None:
                for hr in sec.header_rows:
                    w.writerow(list(hr))
            else:
                w.writerow([c.header for c in sec.columns])
            body = sec.csv_rows if sec.csv_rows is not None else sec.rows
            for row in body:
                w.writerow(list(row))
            w.writerow([])
    finally:
        if close_after:
            fh.close()
