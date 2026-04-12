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
    name = path.name
    lauf = re.search(r"Lauf\s+(\d+)", name, flags=re.IGNORECASE)
    if lauf is not None:
        return int(lauf.group(1))
    isolated = re.findall(r"(?<!\d)\d(?!\d)", name)
    if len(isolated) != 1:
        return 0
    n = int(isolated[0])
    return n if n >= 1 else 0


def imported_now_iso() -> str:
    return datetime.now(UTC).isoformat()
