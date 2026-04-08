from __future__ import annotations

from collections import defaultdict

from backend.domain.enums import Gender
from backend.domain.models import Person
from backend.matching.config import MatchingConfig
from backend.matching.normalize import ParsedName
from backend.matching.score import person_parsed


def _prefix(token: str, length: int = 3) -> str:
    if not token:
        return ""
    return token[:length]


def build_person_block_index(people: tuple[Person, ...], gender: Gender) -> dict[str, list[Person]]:
    """Map blocking key -> candidate persons (same gender)."""
    index: dict[str, list[Person]] = defaultdict(list)
    for p in people:
        if p.gender != gender:
            continue
        parsed = person_parsed(p)
        fam = parsed.family or (parsed.tokens[-1] if parsed.tokens else "")
        giv = parsed.given.split()[0] if parsed.given else (parsed.tokens[0] if parsed.tokens else "")
        yob = p.yob
        if fam and yob > 0:
            index[f"fam|{_prefix(fam)}|{yob}"].append(p)
        if giv and yob > 0:
            index[f"giv|{_prefix(giv)}|{yob}"].append(p)
        if fam:
            index[f"fam|{_prefix(fam)}|no_yob"].append(p)
        if giv:
            index[f"giv|{_prefix(giv)}|no_yob"].append(p)
    return dict(index)


def candidate_person_keys(incoming: ParsedName, yob: int) -> list[str]:
    keys: list[str] = []
    fam = incoming.family or (incoming.tokens[-1] if incoming.tokens else "")
    giv = incoming.given.split()[0] if incoming.given else (incoming.tokens[0] if incoming.tokens else "")
    if fam and yob > 0:
        keys.append(f"fam|{_prefix(fam)}|{yob}")
    if giv and yob > 0:
        keys.append(f"giv|{_prefix(giv)}|{yob}")
    if fam:
        keys.append(f"fam|{_prefix(fam)}|no_yob")
    if giv:
        keys.append(f"giv|{_prefix(giv)}|no_yob")
    return keys


def gather_candidates(
    incoming: ParsedName,
    yob: int,
    gender: Gender,
    index: dict[str, list[Person]],
    config: MatchingConfig,
) -> list[Person]:
    keys = candidate_person_keys(incoming, yob)
    seen: set[str] = set()
    out: list[Person] = []
    for key in keys:
        for person in index.get(key, ()):
            if person.uid in seen:
                continue
            seen.add(person.uid)
            out.append(person)
            if len(out) >= config.max_candidates_per_row:
                return out
    return out
