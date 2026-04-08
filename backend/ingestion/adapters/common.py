from __future__ import annotations

import hashlib
import re
from datetime import UTC, datetime
from pathlib import Path


PARSER_VERSION = "f02-v1"


def to_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def parse_decimal(value: object) -> float:
    text = to_text(value).replace(",", ".")
    if not text:
        raise ValueError("empty")
    return float(text)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_race_no(path: Path) -> int:
    match = re.search(r"Lauf\s+(\d+)", path.name, flags=re.IGNORECASE)
    if match is None:
        return 0
    return int(match.group(1))


def imported_now_iso() -> str:
    return datetime.now(UTC).isoformat()
