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
        file_picker: Callable[[str], str | None] | None = None,
        save_file_picker: Callable[[str], str | None] | None = None,
    ) -> None:
        self._service = UiApiService(
            project_file=None if not project_file else Path(project_file),
            workspace_dir=None if not workspace_dir else Path(workspace_dir),
        )
        self._file_picker = file_picker
        self._save_file_picker = save_file_picker

    def invoke(self, request: dict[str, Any]) -> dict[str, Any]:
        if request.get("method") == "pick_file":
            payload = request.get("payload") if isinstance(request.get("payload"), dict) else {}
            kind = str(payload.get("kind", "excel")).strip() or "excel"
            chosen = self._file_picker(kind) if self._file_picker is not None else None
            return {
                "api_version": str(request.get("api_version", "v1")),
                "request_id": str(request.get("request_id", "unknown")),
                "status": "ok",
                "payload": {"file_path": chosen or ""},
            }
        if request.get("method") == "pick_save_file":
            payload = request.get("payload") if isinstance(request.get("payload"), dict) else {}
            suggested_name = str(payload.get("suggested_name", "")).strip()
            dialog_kind = str(payload.get("dialog_kind", "season_zip")).strip() or "season_zip"
            picker = self._save_file_picker
            if picker is not None:
                try:
                    chosen = picker(suggested_name, dialog_kind)  # type: ignore[call-arg]
                except TypeError:
                    chosen = picker(suggested_name)  # type: ignore[misc]
            else:
                chosen = None
            return {
                "api_version": str(request.get("api_version", "v1")),
                "request_id": str(request.get("request_id", "unknown")),
                "status": "ok",
                "payload": {"file_path": chosen or ""},
            }
        return self._service.handle(request)
