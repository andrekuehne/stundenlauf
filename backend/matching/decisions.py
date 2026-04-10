from __future__ import annotations

import hashlib

from backend.domain.enums import Gender
from backend.domain.models import MatchingDecision
from backend.matching.normalize import ParsedName


def name_key(parsed: ParsedName) -> str:
    """Normalized name key aligned with identity fingerprints (token order ignored)."""
    return "|".join(sorted(parsed.tokens)) if parsed.tokens else parsed.display_compact


def identity_fingerprint(parsed: ParsedName, yob: int, gender: Gender) -> str:
    """Stable fingerprint for replay (order-insensitive on tokens)."""
    token_part = name_key(parsed)
    key = f"{token_part}|{yob}|{gender.value}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def team_fingerprint(
    parsed_a: ParsedName,
    yob_a: int,
    gender_a: Gender,
    parsed_b: ParsedName,
    yob_b: int,
    gender_b: Gender,
) -> str:
    """Order-insensitive fingerprint for a pair (sorted member keys)."""
    m1 = f"{identity_fingerprint(parsed_a, yob_a, gender_a)}"
    m2 = f"{identity_fingerprint(parsed_b, yob_b, gender_b)}"
    pair_key = "|".join(sorted([m1, m2]))
    return hashlib.sha256(pair_key.encode("utf-8")).hexdigest()


def latest_decisions_by_fingerprint(decisions: tuple[MatchingDecision, ...]) -> dict[str, MatchingDecision]:
    """Most recent decision wins per fingerprint (sorted by decided_at)."""
    ordered = sorted(decisions, key=lambda d: d.decided_at)
    out: dict[str, MatchingDecision] = {}
    for d in ordered:
        if d.row_fingerprint:
            out[d.row_fingerprint] = d
    return out


def rejected_participant_uids(decisions: tuple[MatchingDecision, ...]) -> dict[str, set[str]]:
    """Map fingerprint -> participant uids that were explicitly rejected."""
    out: dict[str, set[str]] = {}
    for d in decisions:
        if d.kind != "manual_reject" or not d.row_fingerprint:
            continue
        uid = d.target_participant_uid
        if uid is None:
            continue
        out.setdefault(d.row_fingerprint, set()).add(uid)
    return out


def rejected_team_uids(decisions: tuple[MatchingDecision, ...]) -> dict[str, set[str]]:
    """Map fingerprint -> team uids that were explicitly rejected."""
    out: dict[str, set[str]] = {}
    for d in decisions:
        if d.kind != "manual_reject" or not d.row_fingerprint:
            continue
        uid = d.target_team_uid
        if uid is None:
            continue
        out.setdefault(d.row_fingerprint, set()).add(uid)
    return out
