"""Fixed ExportSpec for desktop GUI PDF export (Laufübersicht, matches pdf_export_playground)."""

from __future__ import annotations

from backend.domain.models import ProjectDocument
from backend.export.spec import ExportSpec, sort_category_keys_for_export


def laufuebersicht_export_spec_from_document(doc: ProjectDocument) -> ExportSpec:
    """Build the same Laufübersicht PDF spec as ``scripts/pdf_export_playground.py``."""

    keys = {e.category.key for e in doc.events}
    if not keys:
        raise ValueError("Keine Läufe in der Saison; PDF-Export ist nicht möglich.")
    categories = list(sort_category_keys_for_export(keys))
    spec_dict: dict = {
        "format": "pdf",
        "categories": categories,
        "columns": ["laufuebersicht_board"],
        "standings": {"source": "embedded", "recompute": False},
        "race_filter": {"mode": "all_active"},
        "rows": {"eligibility": "eligible_only"},
        "pdf": {
            "orientation": "landscape",
            "page_size": "A4",
            "table_layout": "laufuebersicht",
            "page_break_before_each_category": True,
        },
    }
    return ExportSpec.from_dict(spec_dict)
