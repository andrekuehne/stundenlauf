from __future__ import annotations

import sys
from pathlib import Path

APP_FOLDER_NAME = "Stundenlauf"


def default_workspace_dir() -> Path:
    """Return the default per-user workspace path for persisted app data."""
    return Path.home() / "Documents" / APP_FOLDER_NAME


def project_root_dir() -> Path:
    """Return the repository/app root directory.

    When frozen (PyInstaller), static assets live under sys._MEIPASS.
    """
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass)
    return Path(__file__).resolve().parents[1]
