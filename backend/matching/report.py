from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field


@dataclass(frozen=True)
class MatchingReport:
    """Structured summary for one import run."""

    auto_links: int = 0
    review_queue: int = 0
    new_identities: int = 0
    conflicts: int = 0
    replay_overrides: int = 0
    notes: tuple[str, ...] = ()
    candidate_counts: list[int] = field(default_factory=list)


def aggregate_matching_reports(reports: Iterable[MatchingReport]) -> MatchingReport:
    """Combine per-section reports into a single run summary."""
    items = list(reports)
    if not items:
        return MatchingReport()
    auto = sum(r.auto_links for r in items)
    review = sum(r.review_queue for r in items)
    new_id = sum(r.new_identities for r in items)
    conflicts = sum(r.conflicts for r in items)
    replay = sum(r.replay_overrides for r in items)
    counts: list[int] = []
    for r in items:
        counts.extend(r.candidate_counts)
    return MatchingReport(
        auto_links=auto,
        review_queue=review,
        new_identities=new_id,
        conflicts=conflicts,
        replay_overrides=replay,
        candidate_counts=counts,
    )
