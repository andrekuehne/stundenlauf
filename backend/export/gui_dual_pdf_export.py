"""Shared dual Laufübersicht PDF export (Einzel + Paare) used by the desktop API and pdftest CLI."""

from __future__ import annotations

from pathlib import Path

from backend.export.gui_pdf_spec import laufuebersicht_einzel_paare_export_specs
from backend.export.registry import export_standings_to_path
from backend.storage.repository import JsonProjectRepository


class InvalidDualPdfDestinationSuffixError(ValueError):
    """``destination_path`` has a suffix other than ``.pdf`` or none."""


class DualPdfExportError(Exception):
    """Season loaded but neither Einzel nor Paare export specs apply (edge case)."""

    def __init__(self, *, message_en: str, message_de: str) -> None:
        super().__init__(message_de)
        self.message_en = message_en
        self.message_de = message_de


def export_gui_laufuebersicht_dual_pdfs(
    project_file: Path,
    destination_path: Path | str,
    *,
    layout_preset: str | None = None,
) -> tuple[list[Path], int]:
    """Write GUI-style ``{stem}_einzel.pdf`` / ``{stem}_paare.pdf`` for ``session_project.json``.

    ``destination_path`` is a base path (no extension) or ends in ``.pdf`` (stripped for the stem), matching
    ``export_standings_pdf``.

    Returns ``(written_paths, total_bytes)``.

    Raises:
        InvalidDualPdfDestinationSuffixError: invalid destination suffix.
        ValueError: from :func:`laufuebersicht_einzel_paare_export_specs` (e.g. no races in season).
        DualPdfExportError: no Einzel and no Paare categories to export.
    """

    raw = Path(destination_path)
    suffix = raw.suffix.lower()
    if suffix not in ("", ".pdf"):
        raise InvalidDualPdfDestinationSuffixError("destination_path must be a base file name or end with .pdf")
    stem = raw.with_suffix("") if suffix == ".pdf" else raw

    doc = JsonProjectRepository(project_file).load()
    spec_einzel, spec_paare = laufuebersicht_einzel_paare_export_specs(doc, layout_preset=layout_preset)

    if spec_einzel is None and spec_paare is None:
        raise DualPdfExportError(
            message_en="PDF export: no standings categories in the season.",
            message_de="PDF-Export: keine Wertungskategorien in der Saison.",
        )

    stem.parent.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    total_bytes = 0
    if spec_einzel is not None:
        out_einzel = stem.parent / f"{stem.name}_einzel.pdf"
        export_standings_to_path(project_file, spec_einzel, out_einzel)
        written.append(out_einzel)
        total_bytes += out_einzel.stat().st_size
    if spec_paare is not None:
        out_paare = stem.parent / f"{stem.name}_paare.pdf"
        export_standings_to_path(project_file, spec_paare, out_paare)
        written.append(out_paare)
        total_bytes += out_paare.stat().st_size
    return written, total_bytes
