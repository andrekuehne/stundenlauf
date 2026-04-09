from __future__ import annotations

from typing import Any

from backend.ui_api.dto import ApiEnvelopeRequest, ApiErrorDTO
from backend.ui_api.errors import validation_error

API_VERSION_V1 = "v1"


def parse_request(raw: dict[str, Any]) -> ApiEnvelopeRequest:
    api_version = str(raw.get("api_version", "")).strip()
    request_id = str(raw.get("request_id", "")).strip()
    method = str(raw.get("method", "")).strip()
    payload = raw.get("payload", {})
    if not api_version:
        raise validation_error("api_version is required")
    if api_version != API_VERSION_V1:
        raise validation_error("Unsupported api_version", api_version=api_version)
    if not request_id:
        raise validation_error("request_id is required")
    if not method:
        raise validation_error("method is required")
    if payload is None:
        payload = {}
    if not isinstance(payload, dict):
        raise validation_error("payload must be an object")
    return ApiEnvelopeRequest(
        api_version=api_version,
        request_id=request_id,
        method=method,
        payload=payload,
    )


def ok_response(*, api_version: str, request_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "api_version": api_version,
        "request_id": request_id,
        "status": "ok",
        "payload": payload,
    }


def error_response(*, api_version: str, request_id: str, error: ApiErrorDTO) -> dict[str, Any]:
    return {
        "api_version": api_version,
        "request_id": request_id,
        "status": "error",
        "error": error.to_dict(),
    }
