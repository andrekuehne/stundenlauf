"""Fixed ExportSpec for desktop GUI PDF export (Laufübersicht, matches pdf_export_playground)."""

from __future__ import annotations

from backend.domain.models import ProjectDocument
from backend.export.spec import ExportSpec, sort_category_keys_for_export, split_category_keys_einzel_paare


def _laufuebersicht_gui_spec_dict(
    categories: list[str], *, section_number_start: int, layout_preset: str | None = None
) -> dict:
    pdf_block: dict = {
        "orientation": "landscape",
        "page_size": "A4",
        "table_layout": "laufuebersicht",
        "page_break_before_each_category": True,
        "laufuebersicht_section_number_start": section_number_start,
    }
    if layout_preset:
        lp = str(layout_preset).strip().lower()
        if lp:
            pdf_block["layout_preset"] = lp
    return {
        "format": "pdf",
        "categories": categories,
        "columns": ["laufuebersicht_board"],
        "standings": {"source": "embedded", "recompute": False},
        "race_filter": {"mode": "all_active"},
        "rows": {"eligibility": "eligible_only"},
        "pdf": pdf_block,
    }


def laufuebersicht_export_spec_from_document(
    doc: ProjectDocument, *, layout_preset: str | None = None
) -> ExportSpec:
    """Build the same Laufübersicht PDF spec as ``scripts/pdf_export_playground.py`` (all categories, one PDF)."""

    keys = {e.category.key for e in doc.events}
    if not keys:
        raise ValueError("Keine Läufe in der Saison; PDF-Export ist nicht möglich.")
    categories = list(sort_category_keys_for_export(keys))
    return ExportSpec.from_dict(
        _laufuebersicht_gui_spec_dict(categories, section_number_start=1, layout_preset=layout_preset)
    )


def laufuebersicht_einzel_paare_export_specs(
    doc: ProjectDocument, *, layout_preset: str | None = None
) -> tuple[ExportSpec | None, ExportSpec | None]:
    """Specs for GUI dual PDF export: Einzel only, Paare only; Paare section indices continue after Einzel."""

    keys = {e.category.key for e in doc.events}
    if not keys:
        raise ValueError("Keine Läufe in der Saison; PDF-Export ist nicht möglich.")
    einzel, paare = split_category_keys_einzel_paare(keys)
    n_einzel = len(einzel)
    spec_einzel = (
        ExportSpec.from_dict(
            _laufuebersicht_gui_spec_dict(list(einzel), section_number_start=1, layout_preset=layout_preset)
        )
        if einzel
        else None
    )
    spec_paare = (
        ExportSpec.from_dict(
            _laufuebersicht_gui_spec_dict(list(paare), section_number_start=n_einzel + 1, layout_preset=layout_preset)
        )
        if paare
        else None
    )
    return spec_einzel, spec_paare
