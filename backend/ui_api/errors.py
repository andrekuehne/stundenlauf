from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.domain.validation import ValidationError
from backend.ui_api.dto import ApiErrorDTO


@dataclass(frozen=True)
class ApiError(Exception):
    code: str
    message_key: str
    details: dict[str, Any]

    def to_dto(self) -> ApiErrorDTO:
        return ApiErrorDTO(code=self.code, message_key=self.message_key, details=self.details)


def validation_error(message: str, **details: Any) -> ApiError:
    return ApiError(
        code="VALIDATION_ERROR",
        message_key="error.validation",
        details={"message": message, **details},
    )


def not_found(entity: str, value: str) -> ApiError:
    return ApiError(
        code="RACE_NOT_FOUND" if entity == "race_event_uid" else "NOT_FOUND",
        message_key="error.not_found",
        details={"entity": entity, "value": value},
    )


def map_exception(exc: Exception) -> ApiErrorDTO:
    if isinstance(exc, ApiError):
        return exc.to_dto()
    if isinstance(exc, ValidationError):
        return ApiErrorDTO(
            code="VALIDATION_ERROR",
            message_key="error.validation",
            details={"message": str(exc)},
        )
    if isinstance(exc, FileNotFoundError):
        return ApiErrorDTO(
            code="SOURCE_FILE_NOT_FOUND",
            message_key="error.source_file_not_found",
            details={"message": str(exc)},
        )
    if isinstance(exc, ValueError):
        text = str(exc)
        if "Doppelimport-Konflikt" in text:
            return ApiErrorDTO(
                code="IMPORT_DUPLICATE",
                message_key="error.import_duplicate",
                details={"message": text},
            )
        if "Teilweiser Reimport-Konflikt" in text:
            return ApiErrorDTO(
                code="REIMPORT_PARTIAL_ROLLBACK_REQUIRED",
                message_key="error.reimport_partial_rollback_required",
                details={"message": text},
            )
        if "Importkonflikt" in text:
            return ApiErrorDTO(
                code="MATCH_CONFLICT",
                message_key="error.match_conflict",
                details={"message": text},
            )
        if "Unknown race_event_uid" in text:
            return ApiErrorDTO(
                code="RACE_NOT_FOUND",
                message_key="error.race_not_found",
                details={"message": text},
            )
        return ApiErrorDTO(
            code="VALIDATION_ERROR",
            message_key="error.validation",
            details={"message": text},
        )
    return ApiErrorDTO(
        code="INTERNAL_ERROR",
        message_key="error.internal",
        details={"message": str(exc)},
    )
