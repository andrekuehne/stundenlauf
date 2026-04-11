"""Export format dispatch (F20)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from backend.domain.models import ProjectDocument
from backend.export.csv_renderer import render_csv
from backend.export.pdf_renderer import render_pdf
from backend.export.projection import build_export_sections
from backend.export.resolve import load_project_document, resolve_document_for_export
from backend.export.spec import ExportSpec


def export_standings_to_path(
    document: ProjectDocument | Path | dict[str, Any],
    spec: ExportSpec | dict[str, Any],
    dest: Path,
) -> None:
    """Export standings to ``dest`` (.pdf or .csv per ``spec.format``)."""
    if isinstance(spec, dict):
        spec = ExportSpec.from_dict(spec)
    if isinstance(document, (Path, dict)):
        doc = load_project_document(document)
    else:
        doc = document

    resolved = resolve_document_for_export(spec, doc)
    sections = build_export_sections(resolved, spec)

    if spec.format == "pdf":
        render_pdf(sections, spec, dest)
    elif spec.format == "csv":
        render_csv(sections, dest)
    else:
        raise ValueError(f"Unsupported format: {spec.format!r}")


def export_standings_pdf_bytes(
    document: ProjectDocument | Path | dict[str, Any],
    spec: ExportSpec | dict[str, Any],
) -> bytes:
    """Render PDF to memory (format forced to pdf)."""
    from io import BytesIO

    if isinstance(spec, dict):
        spec_dict = dict(spec)
        spec_dict["format"] = "pdf"
        spec = ExportSpec.from_dict(spec_dict)
    else:
        from dataclasses import replace

        if spec.format != "pdf":
            spec = replace(spec, format="pdf")  # type: ignore[arg-type]
    buf = BytesIO()
    if isinstance(document, (Path, dict)):
        doc = load_project_document(document)
    else:
        doc = document
    resolved = resolve_document_for_export(spec, doc)
    sections = build_export_sections(resolved, spec)
    render_pdf(sections, spec, buf)
    return buf.getvalue()
