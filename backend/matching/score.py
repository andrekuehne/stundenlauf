from __future__ import annotations

import difflib

from backend.domain.models import Person
from backend.matching.config import MatchingConfig
from backend.matching.normalize import ParsedName, normalize_club, parse_person_name


def _ratio(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return float(difflib.SequenceMatcher(None, a, b).ratio())


def person_parsed(person: Person) -> ParsedName:
    if person.canonical_given.strip() or person.canonical_family.strip():
        g = person.canonical_given.strip()
        f = person.canonical_family.strip()
        g_tokens = g.split()
        f_tokens = f.split()
        token_list = [t for t in (*g_tokens, *f_tokens) if t]
        tokens = tuple(sorted(set(token_list)))
        return ParsedName(given=g, family=f, tokens=tokens, display_compact=person.name)
    return parse_person_name(person.name)


def name_similarity(a: ParsedName, b: ParsedName) -> tuple[float, dict[str, float]]:
    """Return composite name similarity and per-feature breakdown."""
    forward = (
        _ratio(a.given, b.given) * 0.45
        + _ratio(a.family, b.family) * 0.45
        + _ratio(a.display_compact, b.display_compact) * 0.10
    )
    swapped = (
        _ratio(a.given, b.family) * 0.45
        + _ratio(a.family, b.given) * 0.45
        + _ratio(a.display_compact, b.display_compact) * 0.10
    )
    token_overlap = 0.0
    if a.tokens and b.tokens:
        sa, sb = set(a.tokens), set(b.tokens)
        token_overlap = len(sa & sb) / max(1, len(sa | sb))
    base = max(forward, swapped)
    features = {
        "name_forward": round(forward, 4),
        "name_swapped": round(swapped, 4),
        "token_overlap": round(token_overlap, 4),
        "name_base": round(base, 4),
    }
    return base, features


def score_person_match(
    incoming: ParsedName,
    incoming_yob: int,
    incoming_club_norm: str,
    candidate: Person,
    config: MatchingConfig,
) -> tuple[float, dict[str, float]]:
    cand = person_parsed(candidate)
    base, feats = name_similarity(incoming, cand)
    score = base
    if max(base, feats["name_forward"], feats["name_swapped"]) >= 0.99:
        score += config.title_exact_bonus

    forward_swapped_delta = abs(feats["name_forward"] - feats["name_swapped"])
    if feats["name_swapped"] > feats["name_forward"] and forward_swapped_delta > 0.02:
        score += config.swapped_boost

    if incoming_yob > 0 and candidate.yob > 0:
        if incoming_yob == candidate.yob:
            score += config.yob_match_bonus
            feats["yob_agreement"] = 1.0
        else:
            score -= config.yob_mismatch_penalty
            feats["yob_agreement"] = 0.0
    else:
        feats["yob_agreement"] = 0.5

    cand_club = candidate.club_normalized or normalize_club(candidate.club)
    club_sim = _ratio(incoming_club_norm, cand_club)
    score += config.club_weight * club_sim
    feats["club_similarity"] = round(club_sim, 4)

    score = max(0.0, min(1.0, score))
    feats["total"] = round(score, 4)
    return score, feats


def route_from_score(score: float, config: MatchingConfig) -> str:
    if score >= config.auto_min:
        return "auto"
    if score >= config.review_min:
        return "review"
    return "new_identity"


def should_review_strong_name_yob_mismatch(
    top_score: float,
    feats: dict[str, float],
    config: MatchingConfig,
) -> bool:
    """If names are essentially identical but both YOBs disagree, force review (not silent new identity)."""
    if top_score >= config.review_min:
        return False
    if feats.get("yob_agreement") != 0.0:
        return False
    name_base = feats.get("name_base", 0.0)
    token_overlap = feats.get("token_overlap", 0.0)
    return not (name_base < 0.98 and token_overlap < 1.0)


def _strong_person_name_match(name_base: float, token_overlap: float) -> bool:
    return name_base >= 0.98 or token_overlap >= 1.0


def should_review_strong_couple_yob_mismatch(
    top_score: float,
    feats: dict[str, float],
    config: MatchingConfig,
) -> bool:
    """Same as singles: very strong names on both members but at least one explicit YOB clash → review."""
    if top_score >= config.review_min:
        return False
    ya0 = float(feats.get("m0_yob_agreement", 0.5))
    ya1 = float(feats.get("m1_yob_agreement", 0.5))
    if ya0 != 0.0 and ya1 != 0.0:
        return False
    nb0 = float(feats.get("m0_name_base", 0.0))
    nb1 = float(feats.get("m1_name_base", 0.0))
    to0 = float(feats.get("m0_token_overlap", 0.0))
    to1 = float(feats.get("m1_token_overlap", 0.0))
    return _strong_person_name_match(nb0, to0) and _strong_person_name_match(nb1, to1)
