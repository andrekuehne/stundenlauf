from __future__ import annotations

from typing import Any

from backend.domain.models import ProjectDocument


def ranking_exclusion_set(document: ProjectDocument, category_key: str) -> frozenset[str]:
    for ck, uids in document.ranking_exclusions:
        if ck == category_key:
            return uids
    return frozenset()


def merge_ranking_exclusions_after_identity_merge(
    current: tuple[tuple[str, frozenset[str]], ...],
    category_key: str,
    survivor_uid: str,
    absorbed_uid: str,
) -> tuple[tuple[str, frozenset[str]], ...]:
    """F16 conservative rule: survivor stays excluded if either UID was excluded; absorbed removed."""
    mapping: dict[str, set[str]] = {ck: set(uids) for ck, uids in current}
    bucket = mapping.setdefault(category_key, set())
    survivor_excluded = (survivor_uid in bucket) or (absorbed_uid in bucket)
    bucket.discard(absorbed_uid)
    bucket.discard(survivor_uid)
    if survivor_excluded:
        bucket.add(survivor_uid)
    if not bucket:
        del mapping[category_key]
    return tuple(sorted((ck, frozenset(uids)) for ck, uids in mapping.items()))


def update_ranking_exclusions(
    current: tuple[tuple[str, frozenset[str]], ...],
    category_key: str,
    entity_uid: str,
    ausser_wertung: bool,
) -> tuple[tuple[str, frozenset[str]], ...]:
    mapping: dict[str, set[str]] = {ck: set(uids) for ck, uids in current}
    bucket = mapping.setdefault(category_key, set())
    if ausser_wertung:
        bucket.add(entity_uid)
    else:
        bucket.discard(entity_uid)
        if not bucket:
            del mapping[category_key]
    return tuple(sorted((ck, frozenset(uids)) for ck, uids in mapping.items()))


def apply_ranking_exclusions_to_rows(
    rows: list[dict[str, Any]],
    excluded_uids: frozenset[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Split snapshot rows into eligible-only (for Endwertung) and full list (for Laufübersicht).

    Preserves snapshot row order. Eligible rows get sequential platz 1..n; excluded rows in the
    full list get platz None and ausser_wertung True.
    """
    eligible_out: list[dict[str, Any]] = []
    full_out: list[dict[str, Any]] = []
    rank = 0
    for row in rows:
        uid = str(row["entity_uid"])
        ausser = uid in excluded_uids
        if ausser:
            platz_eff: int | None = None
        else:
            rank += 1
            platz_eff = rank
        full_out.append({**row, "platz": platz_eff, "ausser_wertung": ausser})
        if not ausser:
            eligible_out.append({**row, "platz": platz_eff})
    return eligible_out, full_out
