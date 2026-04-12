from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

from backend.app_paths import default_workspace_dir
from backend.export.gui_pdf_spec import laufuebersicht_einzel_paare_export_specs
from backend.export.registry import export_standings_to_path
from backend.matching.config import MatchingConfig
from backend.storage.repository import JsonProjectRepository
from backend.ui_api import commands, queries, workspace
from backend.ui_api.dto import ApiEnvelopeRequest
from backend.ui_api.envelopes import API_VERSION_V1, error_response, ok_response, parse_request
from backend.ui_api.errors import map_exception, validation_error

LOGGER = logging.getLogger(__name__)


class UiApiService:
    def __init__(self, project_file: Path | None = None, workspace_dir: Path | None = None) -> None:
        self.workspace_dir = workspace_dir or default_workspace_dir()
        self.project_file = project_file
        self._auto_min_setting = 0.5
        self._review_min_setting = 0.5
        self._auto_merge_enabled = False
        self._perfect_match_auto_merge = True
        self._strict_normalized_auto_only = False
        self.matching_config = self._build_matching_config()

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
            "delete_series_year": lambda payload: self._delete_series_year(payload),
            "reset_series_year": lambda payload: workspace.reset_series_year(self.workspace_dir, payload),
            "export_series_year": lambda payload: workspace.export_series_year(self.workspace_dir, payload),
            "export_standings_pdf": lambda payload: self._export_standings_pdf(payload),
            "import_series_year": lambda payload: self._import_series_year(payload),
            "get_matching_config": lambda payload: self._get_matching_config(payload),
            "set_matching_config": lambda payload: self._set_matching_config(payload),
            "get_project_state": lambda payload: queries.get_project_state_filtered(self._load(), payload),
            "get_standings": lambda payload: queries.get_standings(self._load(), payload),
            "get_category_current_results_table": lambda payload: queries.get_category_current_results_table(
                self._load(), payload
            ),
            "list_categories": lambda payload: queries.list_categories(self._load(), payload),
            "get_year_overview": lambda payload: queries.get_year_overview(self._load(), payload),
            "get_year_timeline": lambda payload: queries.get_year_timeline(self._load(), payload),
            "get_review_queue": lambda payload: queries.get_review_queue(self._load(), payload),
            "get_match_candidate": lambda payload: queries.get_match_candidate(self._load(), payload),
            "get_audit_timeline": lambda payload: queries.get_audit_timeline(self._load(), payload),
            "import_race": lambda payload: commands.import_race(
                self._require_active_project_file(),
                payload,
                matching_config=self.matching_config,
            ),
            "apply_match_decision": lambda payload: commands.apply_match_decision(
                self._require_active_project_file(), payload
            ),
            "update_participant_identity": lambda payload: commands.update_participant_identity(
                self._require_active_project_file(), payload
            ),
            "set_ranking_eligibility": lambda payload: commands.set_ranking_eligibility(
                self._require_active_project_file(), payload
            ),
            "merge_standings_entities": lambda payload: commands.merge_standings_entities(
                self._require_active_project_file(), payload
            ),
            "rollback_race": lambda payload: commands.rollback_race(self._require_active_project_file(), payload),
            "rollback_source_batch": lambda payload: commands.rollback_source_batch(
                self._require_active_project_file(), payload
            ),
            "reimport_race": lambda payload: commands.reimport_race(self._require_active_project_file(), payload),
        }
        handler = handlers.get(req.method)
        if handler is None:
            raise ValueError(f"Unknown method: {req.method}")
        return handler(req.payload)

    def _export_standings_pdf(self, payload: dict[str, Any]) -> dict[str, Any]:
        path_raw = str(payload.get("destination_path", "")).strip()
        if not path_raw:
            raise validation_error("destination_path is required")
        destination_path = Path(path_raw)
        suffix = destination_path.suffix.lower()
        if suffix not in ("", ".pdf"):
            raise validation_error("destination_path must be a base file name or end with .pdf")
        stem = destination_path.with_suffix("") if suffix == ".pdf" else destination_path
        project_file = self._require_active_project_file()
        repo = JsonProjectRepository(project_file)
        doc = repo.load()
        try:
            spec_einzel, spec_paare = laufuebersicht_einzel_paare_export_specs(doc)
        except ValueError as exc:
            raise validation_error(str(exc)) from exc
        if spec_einzel is None and spec_paare is None:
            raise validation_error("PDF-Export: keine Wertungskategorien in der Saison.")
        out_einzel = stem.parent / f"{stem.name}_einzel.pdf"
        out_paare = stem.parent / f"{stem.name}_paare.pdf"
        stem.parent.mkdir(parents=True, exist_ok=True)
        written: list[str] = []
        total_bytes = 0
        if spec_einzel is not None:
            export_standings_to_path(project_file, spec_einzel, out_einzel)
            written.append(str(out_einzel))
            total_bytes += out_einzel.stat().st_size
        if spec_paare is not None:
            export_standings_to_path(project_file, spec_paare, out_paare)
            written.append(str(out_paare))
            total_bytes += out_paare.stat().st_size
        return {
            "export_files": written,
            "bytes_written": total_bytes,
        }

    def _open_series_year(self, payload: dict[str, Any]) -> dict[str, Any]:
        result = workspace.open_series_year(self.workspace_dir, payload)
        self.project_file = Path(result["project_file"])
        return {
            "series_year": result["series_year"],
            "project_file": result["project_file"],
            "active": True,
        }

    def _delete_series_year(self, payload: dict[str, Any]) -> dict[str, Any]:
        result = workspace.delete_series_year(self.workspace_dir, payload)
        if self.project_file is not None and self.project_file.parent == Path(result["deleted_path"]):
            self.project_file = None
        return result

    def _import_series_year(self, payload: dict[str, Any]) -> dict[str, Any]:
        result = workspace.import_series_year(self.workspace_dir, payload)
        self.project_file = Path(result["project_file"])
        return result

    def _get_matching_config(self, payload: dict[str, Any]) -> dict[str, Any]:
        _ = payload
        return {
            "auto_min": float(self._auto_min_setting),
            "review_min": float(self._review_min_setting),
            "auto_merge_enabled": bool(self._auto_merge_enabled),
            "perfect_match_auto_merge": bool(self._perfect_match_auto_merge),
            "strict_normalized_auto_only": bool(self._strict_normalized_auto_only),
            "effective_auto_min": float(self.matching_config.auto_min),
        }

    def _set_matching_config(self, payload: dict[str, Any]) -> dict[str, Any]:
        auto_min_raw = payload.get("auto_min")
        auto_merge_enabled_raw = payload.get("auto_merge_enabled", True)
        perfect_match_auto_merge_raw = payload.get("perfect_match_auto_merge", True)
        strict_normalized_raw = payload.get("strict_normalized_auto_only", False)

        if auto_min_raw is None:
            raise validation_error("auto_min is required")
        auto_min = float(auto_min_raw)
        if auto_min < 0.0 or auto_min > 1.0:
            raise validation_error("auto_min must be between 0.0 and 1.0")

        review_min_next = float(self._review_min_setting)
        if "review_min" in payload:
            review_min_next = float(payload["review_min"])
            if review_min_next < 0.0 or review_min_next > 1.0:
                raise validation_error("review_min must be between 0.0 and 1.0")

        auto_merge_enabled = bool(auto_merge_enabled_raw)
        perfect_match_auto_merge = bool(perfect_match_auto_merge_raw)
        if auto_merge_enabled:
            effective_auto_min = auto_min
        elif perfect_match_auto_merge:
            effective_auto_min = 1.0
        else:
            effective_auto_min = 1.01

        if review_min_next > effective_auto_min:
            raise validation_error("review_min must be less than or equal to effective_auto_min")

        self._auto_min_setting = auto_min
        self._review_min_setting = review_min_next
        self._auto_merge_enabled = auto_merge_enabled
        self._perfect_match_auto_merge = perfect_match_auto_merge
        self._strict_normalized_auto_only = bool(strict_normalized_raw)
        self.matching_config = self._build_matching_config()
        return self._get_matching_config({})

    def _build_matching_config(self) -> MatchingConfig:
        base_cfg = self.matching_config if hasattr(self, "matching_config") else MatchingConfig()
        if self._auto_merge_enabled:
            effective_auto_min = self._auto_min_setting
        elif self._perfect_match_auto_merge:
            effective_auto_min = 1.0
        else:
            effective_auto_min = 1.01
        self.matching_config = MatchingConfig(
            auto_min=effective_auto_min,
            review_min=float(self._review_min_setting),
            yob_match_bonus=base_cfg.yob_match_bonus,
            yob_mismatch_penalty=base_cfg.yob_mismatch_penalty,
            club_weight=base_cfg.club_weight,
            swapped_boost=base_cfg.swapped_boost,
            title_exact_bonus=base_cfg.title_exact_bonus,
            max_candidates_per_row=base_cfg.max_candidates_per_row,
            member_mismatch_floor=base_cfg.member_mismatch_floor,
            pair_unsafe_cap=base_cfg.pair_unsafe_cap,
            strict_normalized_auto_only=bool(self._strict_normalized_auto_only),
        )
        return self.matching_config

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
