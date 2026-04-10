from __future__ import annotations

import hashlib
import json
import shutil
import tempfile
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from backend.domain.models import ProjectDocument
from backend.storage.repository import JsonProjectRepository
from backend.storage.schema_v2 import SCHEMA_VERSION_V2
from backend.ui_api.errors import not_found, unsupported_import_format, validation_error

SEASON_EXPORT_FORMAT_VERSION = 1
SEASON_EXPORT_SUFFIX = ".stundenlauf-season.zip"
SEASON_EXPORT_MANIFEST_FILE = "manifest.json"
SEASON_EXPORT_PROJECT_FILE = "session_project.json"
SEASON_EXPORT_FILES = {SEASON_EXPORT_MANIFEST_FILE, SEASON_EXPORT_PROJECT_FILE}


def _iso_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


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


def export_series_year(workspace_dir: Path, payload: dict[str, Any]) -> dict[str, Any]:
    year_raw = payload.get("series_year")
    if year_raw is None:
        raise validation_error("series_year is required")
    series_year = int(year_raw)
    project_file = project_file_for_year(workspace_dir, series_year)
    if not project_file.exists():
        raise not_found("series_year", str(series_year))

    destination_raw = str(payload.get("destination_path", "")).strip()
    if destination_raw:
        destination_path = Path(destination_raw)
    else:
        exports_dir = workspace_dir / "data" / "exports"
        destination_path = exports_dir / f"stundenlauf-{series_year}{SEASON_EXPORT_SUFFIX}"
    if destination_path.suffix.lower() != ".zip" or not str(destination_path).lower().endswith(SEASON_EXPORT_SUFFIX):
        raise validation_error(f"destination_path must end with {SEASON_EXPORT_SUFFIX}")

    project_bytes = project_file.read_bytes()
    doc = JsonProjectRepository(project_file).load()
    manifest = {
        "format_version": SEASON_EXPORT_FORMAT_VERSION,
        "exported_at": _iso_now(),
        "schema_version": int(doc.schema_version),
        "series_year": int(series_year),
        "events_total": len(doc.events),
        "sha256_session_project": _sha256_bytes(project_bytes),
    }

    destination_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=destination_path.suffix,
        dir=str(destination_path.parent),
    ) as temp_file:
        temp_path = Path(temp_file.name)
    try:
        with zipfile.ZipFile(temp_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(SEASON_EXPORT_MANIFEST_FILE, json.dumps(manifest, ensure_ascii=True, indent=2))
            archive.writestr(SEASON_EXPORT_PROJECT_FILE, project_bytes)
        temp_path.replace(destination_path)
    finally:
        if temp_path.exists():
            temp_path.unlink()

    return {
        "series_year": series_year,
        "export_file": str(destination_path),
        "bytes_written": destination_path.stat().st_size,
        "events_total": len(doc.events),
        "sha256_session_project": manifest["sha256_session_project"],
    }


def import_series_year(workspace_dir: Path, payload: dict[str, Any]) -> dict[str, Any]:
    file_path = str(payload.get("file_path", "")).strip()
    if not file_path:
        raise validation_error("file_path is required")
    archive_path = Path(file_path)
    if not archive_path.exists():
        raise FileNotFoundError(str(archive_path))
    if not archive_path.is_file():
        raise validation_error("file_path must point to a file")

    with zipfile.ZipFile(archive_path, "r") as archive:
        names = set(archive.namelist())
        if names != SEASON_EXPORT_FILES:
            raise validation_error(
                "invalid season export contents",
                expected=sorted(SEASON_EXPORT_FILES),
                found=sorted(names),
            )
        manifest_raw = archive.read(SEASON_EXPORT_MANIFEST_FILE)
        project_bytes = archive.read(SEASON_EXPORT_PROJECT_FILE)

    try:
        manifest = json.loads(manifest_raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise validation_error("manifest.json is invalid") from exc
    if not isinstance(manifest, dict):
        raise validation_error("manifest.json must be an object")

    format_version = int(manifest.get("format_version", 0))
    if format_version != SEASON_EXPORT_FORMAT_VERSION:
        raise unsupported_import_format(
            "unsupported season export format version",
            format_version=format_version,
            supported_format_version=SEASON_EXPORT_FORMAT_VERSION,
        )

    manifest_schema_version = int(manifest.get("schema_version", 0))
    if manifest_schema_version != SCHEMA_VERSION_V2:
        raise unsupported_import_format(
            "unsupported schema_version in season export",
            schema_version=manifest_schema_version,
            supported_schema_version=SCHEMA_VERSION_V2,
        )
    manifest_series_year = int(manifest.get("series_year", 0))
    if manifest_series_year < 1900 or manifest_series_year > 2200:
        raise validation_error("manifest series_year must be between 1900 and 2200")
    manifest_checksum = str(manifest.get("sha256_session_project", "")).strip().lower()
    if not manifest_checksum:
        raise validation_error("manifest sha256_session_project is required")
    computed_checksum = _sha256_bytes(project_bytes)
    if manifest_checksum != computed_checksum:
        raise validation_error("session_project checksum mismatch")

    try:
        project_payload = json.loads(project_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise validation_error("session_project.json is invalid") from exc
    loaded_schema_version = int(project_payload.get("schema_version", 0)) if isinstance(project_payload, dict) else 0
    if loaded_schema_version != SCHEMA_VERSION_V2:
        raise unsupported_import_format(
            "unsupported loaded session_project schema_version",
            schema_version=loaded_schema_version,
            supported_schema_version=SCHEMA_VERSION_V2,
        )

    target_series_year_raw = payload.get("target_series_year")
    target_series_year = int(target_series_year_raw) if target_series_year_raw is not None else manifest_series_year
    if target_series_year < 1900 or target_series_year > 2200:
        raise validation_error("target_series_year must be between 1900 and 2200")
    replace_existing = bool(payload.get("replace_existing", False))
    target_project_file = project_file_for_year(workspace_dir, target_series_year)
    existing = target_project_file.exists()
    if existing and not replace_existing:
        raise validation_error(
            "target series_year already exists; use replace_existing=true to overwrite",
            series_year=target_series_year,
        )
    if existing and replace_existing:
        confirm_raw = payload.get("confirm_replace_series_year")
        if confirm_raw is None:
            raise validation_error("confirm_replace_series_year is required when replace_existing=true")
        if int(confirm_raw) != target_series_year:
            raise validation_error(
                "confirm_replace_series_year must match target series_year",
                target_series_year=target_series_year,
                confirm_replace_series_year=int(confirm_raw),
            )

    target_project_file.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=target_project_file.suffix,
        dir=str(target_project_file.parent),
    ) as temp_file:
        temp_path = Path(temp_file.name)
        temp_file.write(project_bytes)
    backup_path: Path | None = None
    try:
        if existing and replace_existing:
            backup_path = target_project_file.with_name(f"{target_project_file.name}.bak")
            if backup_path.exists():
                backup_path.unlink()
            target_project_file.replace(backup_path)
        temp_path.replace(target_project_file)
        if backup_path is not None and backup_path.exists():
            backup_path.unlink()
    except Exception:
        if temp_path.exists():
            temp_path.unlink()
        if backup_path is not None and backup_path.exists() and not target_project_file.exists():
            backup_path.replace(target_project_file)
        raise

    reloaded = JsonProjectRepository(target_project_file).load()
    return {
        "series_year": target_series_year,
        "project_file": str(target_project_file),
        "replaced_existing": bool(existing and replace_existing),
        "events_total": len(reloaded.events),
        "source_file": str(archive_path),
    }
