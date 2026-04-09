from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Callable

from backend.app_paths import default_workspace_dir
from backend.storage.repository import JsonProjectRepository
from backend.ui_api import commands, queries
from backend.ui_api import workspace
from backend.ui_api.dto import ApiEnvelopeRequest
from backend.ui_api.envelopes import API_VERSION_V1, error_response, ok_response, parse_request
from backend.ui_api.errors import map_exception

LOGGER = logging.getLogger(__name__)


class UiApiService:
    def __init__(self, project_file: Path | None = None, workspace_dir: Path | None = None) -> None:
        self.workspace_dir = workspace_dir or default_workspace_dir()
        self.project_file = project_file

    def _load(self):
        if self.project_file is None:
            raise ValueError("No active season selected")
        repo = JsonProjectRepository(self.project_file)
        return repo.load()

    def _require_active_project_file(self) -> Path:
        if self.project_file is None:
            raise ValueError("No active season selected")
        return self.project_file

    def _dispatch(self, req: ApiEnvelopeRequest) -> dict[str, Any]:
        handlers: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
            "list_series_years": lambda payload: workspace.list_series_years(self.workspace_dir),
            "create_series_year": lambda payload: workspace.create_series_year(self.workspace_dir, payload),
            "open_series_year": lambda payload: self._open_series_year(payload),
            "get_project_state": lambda payload: queries.get_project_state_filtered(self._load(), payload),
            "get_standings": lambda payload: queries.get_standings(self._load(), payload),
            "get_category_current_results_table": lambda payload: queries.get_category_current_results_table(self._load(), payload),
            "list_categories": lambda payload: queries.list_categories(self._load(), payload),
            "get_year_overview": lambda payload: queries.get_year_overview(self._load(), payload),
            "get_year_timeline": lambda payload: queries.get_year_timeline(self._load(), payload),
            "get_review_queue": lambda payload: queries.get_review_queue(self._load(), payload),
            "get_match_candidate": lambda payload: queries.get_match_candidate(self._load(), payload),
            "get_audit_timeline": lambda payload: queries.get_audit_timeline(self._load(), payload),
            "import_race": lambda payload: commands.import_race(self._require_active_project_file(), payload),
            "apply_match_decision": lambda payload: commands.apply_match_decision(self._require_active_project_file(), payload),
            "rollback_race": lambda payload: commands.rollback_race(self._require_active_project_file(), payload),
            "reimport_race": lambda payload: commands.reimport_race(self._require_active_project_file(), payload),
        }
        handler = handlers.get(req.method)
        if handler is None:
            raise ValueError(f"Unknown method: {req.method}")
        return handler(req.payload)

    def _open_series_year(self, payload: dict[str, Any]) -> dict[str, Any]:
        result = workspace.open_series_year(self.workspace_dir, payload)
        self.project_file = Path(result["project_file"])
        return {
            "series_year": result["series_year"],
            "project_file": result["project_file"],
            "active": True,
        }

    def handle(self, raw_request: dict[str, Any]) -> dict[str, Any]:
        request_id = str(raw_request.get("request_id", "unknown"))
        try:
            req = parse_request(raw_request)
            LOGGER.info("ui_api request method=%s request_id=%s", req.method, req.request_id)
            payload = self._dispatch(req)
            return ok_response(api_version=req.api_version, request_id=req.request_id, payload=payload)
        except Exception as exc:
            LOGGER.exception("ui_api error request_id=%s", request_id)
            api_version = str(raw_request.get("api_version", API_VERSION_V1))
            return error_response(
                api_version=api_version if api_version else API_VERSION_V1,
                request_id=request_id,
                error=map_exception(exc),
            )
