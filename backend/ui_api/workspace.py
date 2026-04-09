from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from backend.domain.models import ProjectDocument
from backend.storage.repository import JsonProjectRepository
from backend.storage.schema_v2 import SCHEMA_VERSION_V2
from backend.ui_api.errors import not_found, validation_error


def project_file_for_year(workspace_dir: Path, series_year: int) -> Path:
    return workspace_dir / "data" / "series" / str(series_year) / "session_project.json"


def list_series_years(workspace_dir: Path) -> dict[str, Any]:
    series_root = workspace_dir / "data" / "series"
    items: list[dict[str, Any]] = []
    if not series_root.exists():
        return {"items": items, "count": 0}
    for year_dir in sorted([item for item in series_root.iterdir() if item.is_dir()], key=lambda p: p.name):
        year_value = year_dir.name.strip()
        if not year_value.isdigit():
            continue
        project_file = year_dir / "session_project.json"
        if not project_file.exists():
            continue
        doc = JsonProjectRepository(project_file).load()
        latest_import = max((event.imported_at for event in doc.events), default="")
        open_reviews = sum(
            1
            for event in doc.events
            if event.state.value == "active"
            for entry in event.entries
            if entry.match_meta is not None and entry.match_meta.route == "review"
        )
        items.append(
            {
                "series_year": int(year_value),
                "project_file": str(project_file),
                "events_total": len(doc.events),
                "latest_imported_at": latest_import,
                "review_queue_count": open_reviews,
            }
        )
    items.sort(key=lambda item: item["series_year"], reverse=True)
    return {"items": items, "count": len(items)}


def create_series_year(workspace_dir: Path, payload: dict[str, Any]) -> dict[str, Any]:
    year_raw = payload.get("series_year")
    display_name = str(payload.get("display_name", "")).strip()
    if year_raw is None:
        raise validation_error("series_year is required")
    series_year = int(year_raw)
    if series_year < 1900 or series_year > 2200:
        raise validation_error("series_year must be between 1900 and 2200")
    project_file = project_file_for_year(workspace_dir, series_year)
    if project_file.exists():
        raise validation_error("series_year already exists", series_year=series_year)
    repo = JsonProjectRepository(project_file)
    repo.save(ProjectDocument(schema_version=SCHEMA_VERSION_V2))
    return {
        "series_year": series_year,
        "display_name": display_name or f"Stundenlauf {series_year}",
        "project_file": str(project_file),
    }


def open_series_year(workspace_dir: Path, payload: dict[str, Any]) -> dict[str, Any]:
    year_raw = payload.get("series_year")
    if year_raw is None:
        raise validation_error("series_year is required")
    series_year = int(year_raw)
    project_file = project_file_for_year(workspace_dir, series_year)
    if not project_file.exists():
        raise not_found("series_year", str(series_year))
    return {"series_year": series_year, "project_file": str(project_file)}


def delete_series_year(workspace_dir: Path, payload: dict[str, Any]) -> dict[str, Any]:
    year_raw = payload.get("series_year")
    confirm_raw = payload.get("confirm_series_year")
    if year_raw is None:
        raise validation_error("series_year is required")
    if confirm_raw is None:
        raise validation_error("confirm_series_year is required")
    series_year = int(year_raw)
    confirm_series_year = int(confirm_raw)
    if confirm_series_year != series_year:
        raise validation_error(
            "confirm_series_year must match series_year",
            series_year=series_year,
            confirm_series_year=confirm_series_year,
        )
    project_file = project_file_for_year(workspace_dir, series_year)
    if not project_file.exists():
        raise not_found("series_year", str(series_year))
    season_dir = project_file.parent
    shutil.rmtree(season_dir)
    return {
        "series_year": series_year,
        "deleted": True,
        "deleted_path": str(season_dir),
    }
