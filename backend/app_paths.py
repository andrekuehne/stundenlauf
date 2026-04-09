from __future__ import annotations

from pathlib import Path

APP_FOLDER_NAME = "Stundenlauf"


def default_workspace_dir() -> Path:
    """Return the default per-user workspace path for persisted app data."""
    return Path.home() / "Documents" / APP_FOLDER_NAME


def project_root_dir() -> Path:
    """Return the repository/app root directory."""
    return Path(__file__).resolve().parents[1]
