from __future__ import annotations

from pathlib import Path
from typing import Any

from backend.ui_api.service import UiApiService


class PywebviewApiBridge:
    """Thin pywebview-compatible bridge to the UI API service."""

    def __init__(self, project_file: str) -> None:
        self._service = UiApiService(Path(project_file))

    def invoke(self, request: dict[str, Any]) -> dict[str, Any]:
        return self._service.handle(request)
