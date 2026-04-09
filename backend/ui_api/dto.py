from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ApiEnvelopeRequest:
    api_version: str
    request_id: str
    method: str
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ApiErrorDTO:
    code: str
    message_key: str
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message_key": self.message_key,
            "details": self.details,
        }
