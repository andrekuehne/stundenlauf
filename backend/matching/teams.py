from __future__ import annotations

from collections import defaultdict

from backend.domain.enums import Division, Gender
from backend.domain.models import Couple
from backend.matching.config import MatchingConfig
from backend.matching.normalize import ParsedName
from backend.matching.score import score_person_match


def _couple_division_ok(couple: Couple, division: Division) -> bool:
    genders = {couple.member_a.gender, couple.member_b.gender}
    if division == Division.COUPLES_MEN:
        return genders == {Gender.M}
    if division == Division.COUPLES_WOMEN:
        return genders == {Gender.F}
    if division == Division.COUPLES_MIXED:
        return genders == {Gender.M, Gender.F}
    return False


def build_couple_block_index(couples: tuple[Couple, ...], division: Division) -> dict[str, list[Couple]]:
    """Blocking index for couples (order-insensitive keys)."""
    from backend.matching.score import person_parsed

    index: dict[str, list[Couple]] = defaultdict(list)
    for c in couples:
        if not _couple_division_ok(c, division):
            continue
        for member in (c.member_a, c.member_b):
            parsed = person_parsed(member)
            fam = parsed.family or (parsed.tokens[-1] if parsed.tokens else "")
            giv = parsed.given.split()[0] if parsed.given else (parsed.tokens[0] if parsed.tokens else "")
            yob = member.yob
            if fam and yob > 0:
                index[f"fam|{fam[:3]}|{yob}"].append(c)
            if giv and yob > 0:
                index[f"giv|{giv[:3]}|{yob}"].append(c)
            if fam:
                index[f"fam|{fam[:3]}|no_yob"].append(c)
            if giv:
                index[f"giv|{giv[:3]}|no_yob"].append(c)
    return dict(index)


def gather_couple_candidates(
    a: ParsedName,
    yob_a: int,
    b: ParsedName,
    yob_b: int,
    index: dict[str, list[Couple]],
    config: MatchingConfig,
) -> list[Couple]:
    from backend.matching.candidates import candidate_person_keys

    keys_a = candidate_person_keys(a, yob_a)
    keys_b = candidate_person_keys(b, yob_b)
    keys = list(dict.fromkeys([*keys_a, *keys_b]))
    seen: set[str] = set()
    out: list[Couple] = []
    for key in keys:
        for couple in index.get(key, ()):
            if couple.uid in seen:
                continue
            seen.add(couple.uid)
            out.append(couple)
            if len(out) >= config.max_candidates_per_row:
                return out
    return out


def score_couple_match(
    inc_a: ParsedName,
    yob_a: int,
    club_a: str,
    inc_b: ParsedName,
    yob_b: int,
    club_b: str,
    team: Couple,
    config: MatchingConfig,
) -> tuple[float, dict[str, float]]:
    """Order-insensitive bipartite pairing of two incoming members vs team members."""
    members = (team.member_a, team.member_b)
    alignments: list[tuple[float, float, float]] = []
    for perm in ((0, 1), (1, 0)):
        s0, _f0 = score_person_match(inc_a, yob_a, club_a, members[perm[0]], config)
        s1, _f1 = score_person_match(inc_b, yob_b, club_b, members[perm[1]], config)
        pair_score = min(s0, s1) * 0.65 + (s0 + s1) / 2.0 * 0.35
        alignments.append((pair_score, s0, s1))

    best = max(alignments, key=lambda item: item[0])
    pair_score, s0, s1 = best

    if min(s0, s1) < config.member_mismatch_floor:
        pair_score = min(pair_score, config.pair_unsafe_cap)

    feats = {
        "pair_score": round(pair_score, 4),
        "member_low": round(min(s0, s1), 4),
        "member_high": round(max(s0, s1), 4),
    }
    return float(pair_score), feats
