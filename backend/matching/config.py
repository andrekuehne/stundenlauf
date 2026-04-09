from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MatchingConfig:
    """Tunable weights and thresholds for participant/team matching (v1)."""

    auto_min: float = 0.88
    review_min: float = 0.72
    yob_match_bonus: float = 0.1
    yob_mismatch_penalty: float = 0.45
    club_weight: float = 0.08
    swapped_boost: float = 0.04
    title_exact_bonus: float = 0.02
    max_candidates_per_row: int = 48
    member_mismatch_floor: float = 0.52
    pair_unsafe_cap: float = 0.78
    strict_normalized_auto_only: bool = False
