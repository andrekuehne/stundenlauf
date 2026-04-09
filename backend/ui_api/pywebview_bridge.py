from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from backend.ui_api.service import UiApiService


class PywebviewApiBridge:
    """Thin pywebview-compatible bridge to the UI API service."""

    def __init__(
        self,
        project_file: str | None = None,
        workspace_dir: str | None = None,
        file_picker: Callable[[], str | None] | None = None,
    ) -> None:
        self._service = UiApiService(
            project_file=None if not project_file else Path(project_file),
            workspace_dir=None if not workspace_dir else Path(workspace_dir),
        )
        self._file_picker = file_picker

    def invoke(self, request: dict[str, Any]) -> dict[str, Any]:
        if request.get("method") == "pick_file":
            chosen = self._file_picker() if self._file_picker is not None else None
            return {
                "api_version": str(request.get("api_version", "v1")),
                "request_id": str(request.get("request_id", "unknown")),
                "status": "ok",
                "payload": {"file_path": chosen or ""},
            }
        return self._service.handle(request)
