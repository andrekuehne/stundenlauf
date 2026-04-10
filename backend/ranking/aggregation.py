from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TopNAggregation:
    """Result of legacy v1 'best N or all available' for points and distance."""

    punkte_gesamt: float
    distanz_gesamt: float  # rounded to ruleset distance_decimals for distance total
    selected_race_event_uids: tuple[str, ...]
    dropped_race_event_uids: tuple[str, ...]


def sum_top_n_or_all_points_and_distance(
    race_rows: tuple[tuple[str, float, float], ...],
    *,
    n: int = 4,
    distance_decimals: int = 3,
) -> TopNAggregation:
    """
    For each race row: (race_event_uid, points, distance_km).

    If there are n or fewer rows, all count toward totals.
    If more than n rows, only the n races with highest points count (tie-break: race_event_uid ascending).
    Distance total uses distances from the same selected races as points.
    Final distance is rounded to ``distance_decimals`` places.
    """
    if n < 1:
        raise ValueError("n must be >= 1")

    # Stable ordering: highest points first, then race_event_uid for determinism
    sorted_rows = sorted(race_rows, key=lambda r: (-r[1], r[0]))
    all_uids = tuple(r[0] for r in sorted_rows)

    if len(sorted_rows) <= n:
        selected = sorted_rows
        dropped: tuple[str, ...] = ()
    else:
        selected = sorted_rows[:n]
        selected_set = {r[0] for r in selected}
        dropped = tuple(uid for uid in all_uids if uid not in selected_set)

    p_sum = sum(r[1] for r in selected)
    d_sum = sum(r[2] for r in selected)
    factor = 10**distance_decimals
    d_rounded = round(d_sum * factor) / factor

    return TopNAggregation(
        punkte_gesamt=p_sum,
        distanz_gesamt=d_rounded,
        selected_race_event_uids=tuple(r[0] for r in selected),
        dropped_race_event_uids=dropped,
    )
