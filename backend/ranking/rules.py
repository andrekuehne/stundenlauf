from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

# Persisted ruleset identifiers (immutable once published)
RULESET_V1_LEGACY_TOP4 = "v1_legacy_top4"


@dataclass(frozen=True)
class Ruleset:
    """Versioned scoring configuration (v1: single concrete ruleset)."""

    version_id: str
    top_n: int = 4
    distance_decimals: int = 2
    primary_sort: Literal["points_desc"] = "points_desc"
    tie_break: Literal["distance_desc"] = "distance_desc"


def default_ruleset_v1() -> Ruleset:
    return Ruleset(version_id=RULESET_V1_LEGACY_TOP4, top_n=4, distance_decimals=2)
