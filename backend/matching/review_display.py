"""Display-only helpers for import match review (couple line order + per-field highlights)."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from backend.domain.club import optional_club_from_cell
from backend.domain.enums import Gender
from backend.domain.models import Person
from backend.matching.config import MatchingConfig
from backend.matching.normalize import KNOWN_TITLES, normalize_club, normalize_whitespace, parse_person_name
from backend.matching.score import score_person_match

_DISPLAY_CONFIG = MatchingConfig()

_COMPOSITE_SEP = " / "


def _title_word_base(word: str) -> str:
    return word.lower().rstrip(".")


def _is_title_word(word: str) -> bool:
    base = _title_word_base(word)
    bases = {t.rstrip(".") for t in KNOWN_TITLES}
    return base in bases


def split_display_name_parts(raw: str) -> tuple[str, str]:
    """Split display name into (given, family) for UI, mirroring parse_person_name delimiter rules."""
    raw_clean = normalize_whitespace(raw)
    if not raw_clean:
        return "", ""

    if "," in raw_clean:
        left, right = raw_clean.split(",", 1)
        family_display = left.strip()
        words = right.strip().split()
        while words and _is_title_word(words[0]):
            words.pop(0)
        given_display = " ".join(words)
        return (given_display, family_display)

    words = raw_clean.split()
    while words and _is_title_word(words[0]):
        words.pop(0)
    if not words:
        return "", ""
    if len(words) == 1:
        return "", words[0]
    return (" ".join(words[:-1]), words[-1])


def _parse_yob_token(token: str) -> int:
    token = token.strip()
    if not token or token == "-":
        return 0
    try:
        return int(token)
    except ValueError:
        return 0


def _split_team_incoming_line(
    display_name: str,
    yob_field: str | int | None,
    club_field: str | None,
    index: int,
) -> tuple[str, int, str]:
    """Return (name, yob, club) for member slot index (0 or 1)."""
    name_tokens = [t.strip() for t in display_name.split(_COMPOSITE_SEP) if t.strip()]
    name = name_tokens[index] if index < len(name_tokens) else ""

    yob = 0
    if isinstance(yob_field, int):
        yob = yob_field if index == 0 else 0
    elif isinstance(yob_field, str) and yob_field.strip():
        y_toks = [t.strip() for t in yob_field.split(_COMPOSITE_SEP)]
        if index < len(y_toks):
            yob = _parse_yob_token(y_toks[index])

    club = ""
    if club_field and str(club_field).strip():
        c_toks = [t.strip() for t in str(club_field).split(_COMPOSITE_SEP) if t.strip()]
        if index < len(c_toks):
            club = c_toks[index]

    return name, yob, club


def person_from_member_dict(d: Mapping[str, Any]) -> Person:
    g = d.get("gender", Gender.X)
    if isinstance(g, str):
        g = Gender(g)
    return Person(
        uid=str(d.get("uid", "")),
        name=str(d.get("name", "")),
        yob=int(d.get("yob") or 0),
        gender=g,
        club=d.get("club"),
        canonical_given=str(d.get("canonical_given") or ""),
        canonical_family=str(d.get("canonical_family") or ""),
        club_normalized=str(d.get("club_normalized") or ""),
    )


def _pair_display_score(
    inc0: tuple[str, int, str],
    inc1: tuple[str, int, str],
    m0: Person,
    m1: Person,
) -> float:
    n0, y0, c0 = inc0
    n1, y1, c1 = inc1
    p0 = parse_person_name(n0)
    p1 = parse_person_name(n1)
    s0, _ = score_person_match(p0, y0, normalize_club(c0), m0, _DISPLAY_CONFIG)
    s1, _ = score_person_match(p1, y1, normalize_club(c1), m1, _DISPLAY_CONFIG)
    return min(s0, s1) * 0.65 + (s0 + s1) / 2.0 * 0.35


def align_couple_members_for_display(
    incoming_preview: Mapping[str, Any],
    member_a: Mapping[str, Any] | Person,
    member_b: Mapping[str, Any] | Person,
) -> tuple[bool, tuple[Person, Person]]:
    """Pick member order so incoming Excel lines align with candidate rows. Tie → canonical (A, B)."""
    pa = member_a if isinstance(member_a, Person) else person_from_member_dict(member_a)
    pb = member_b if isinstance(member_b, Person) else person_from_member_dict(member_b)

    display_name = str(incoming_preview.get("display_name") or "")
    yob_f = incoming_preview.get("yob")
    club_f = incoming_preview.get("club")

    inc0 = _split_team_incoming_line(display_name, yob_f, club_f, 0)
    inc1 = _split_team_incoming_line(display_name, yob_f, club_f, 1)

    score_direct = _pair_display_score(inc0, inc1, pa, pb)
    score_swap = _pair_display_score(inc0, inc1, pb, pa)
    if score_swap > score_direct:
        return True, (pb, pa)
    return False, (pa, pb)


def field_highlights_for_person_line(
    incoming_name: str,
    incoming_yob: int,
    incoming_club: str | None,
    candidate_name: str,
    candidate_yob: int,
    candidate_club: str | None,
) -> dict[str, Any]:
    """
    Build per-fragment diff flags for one person row (candidate side vs incoming).

    YOB: diff only when both years are > 0 and differ; missing year on either side → not diff.
    """
    given_disp, family_disp = split_display_name_parts(candidate_name)
    parsed_inc = parse_person_name(incoming_name)
    parsed_cand = parse_person_name(candidate_name)
    given_diff = parsed_inc.given != parsed_cand.given
    family_diff = parsed_inc.family != parsed_cand.family

    if given_disp and family_disp:
        name_segments: list[dict[str, Any]] = [
            {"text": given_disp, "diff": given_diff},
            {"text": " ", "diff": False},
            {"text": family_disp, "diff": family_diff},
        ]
    else:
        raw_single = normalize_whitespace(candidate_name) or candidate_name.strip()
        name_diff = parsed_inc.display_compact != parsed_cand.display_compact
        name_segments = [{"text": raw_single or "—", "diff": name_diff}]

    cy = int(candidate_yob or 0)
    iy = int(incoming_yob or 0)
    yob_diff = iy > 0 and cy > 0 and iy != cy
    yob_text = str(cy) if cy > 0 else "-"

    inc_eff = optional_club_from_cell(incoming_club)
    cand_eff = optional_club_from_cell(candidate_club)
    inc_c = normalize_club(inc_eff)
    cand_c = normalize_club(cand_eff)
    club_diff = inc_c != cand_c
    club_text = "—" if cand_eff is None else cand_eff

    return {
        "name_segments": name_segments,
        "yob": {"text": yob_text, "diff": yob_diff},
        "club": {"text": club_text, "diff": club_diff},
    }


def _participant_incoming_yob(yob_field: str | int | None) -> int:
    if isinstance(yob_field, int):
        return yob_field if yob_field > 0 else 0
    if isinstance(yob_field, str) and yob_field.strip():
        return _parse_yob_token(yob_field.split(_COMPOSITE_SEP)[0])
    return 0


def build_candidate_review_display(
    entry_preview: Mapping[str, Any] | None,
    candidate_preview: Mapping[str, Any] | None,
) -> dict[str, Any]:
    """JSON-serializable display hints aligned with import review table cells."""
    if not candidate_preview:
        return {"kind": "unknown", "member_order_swapped": False, "lines": []}

    cand_kind = candidate_preview.get("kind")
    entry = entry_preview or {}

    if cand_kind == "participant":
        inc_name = str(entry.get("display_name") or "")
        inc_yob = _participant_incoming_yob(entry.get("yob"))
        inc_club = entry.get("club")
        inc_club_s = inc_club if isinstance(inc_club, str) else (str(inc_club) if inc_club is not None else None)
        c_club = candidate_preview.get("club")
        c_club_s = c_club if isinstance(c_club, str) else None
        line = field_highlights_for_person_line(
            inc_name,
            inc_yob,
            inc_club_s,
            str(candidate_preview.get("display_name") or ""),
            int(candidate_preview.get("yob") or 0),
            c_club_s,
        )
        return {"kind": "participant", "member_order_swapped": False, "lines": [line]}

    if cand_kind == "team":
        ma = candidate_preview.get("member_a")
        mb = candidate_preview.get("member_b")
        if not isinstance(ma, dict) or not isinstance(mb, dict):
            return {"kind": "team", "member_order_swapped": False, "lines": []}

        swapped = False
        first_p = person_from_member_dict(ma)
        second_p = person_from_member_dict(mb)
        if entry.get("kind") == "team":
            swapped, ordered = align_couple_members_for_display(entry, ma, mb)
            first_p, second_p = ordered

        display_name = str(entry.get("display_name") or "")
        yob_f = entry.get("yob")
        club_f = entry.get("club")

        lines: list[dict[str, Any]] = []
        for idx, mem in enumerate((first_p, second_p)):
            inc_name, inc_yob, inc_club = _split_team_incoming_line(display_name, yob_f, club_f, idx)
            lines.append(
                field_highlights_for_person_line(
                    inc_name,
                    inc_yob,
                    inc_club or None,
                    mem.name,
                    mem.yob,
                    mem.club,
                )
            )
        return {"kind": "team", "member_order_swapped": swapped, "lines": lines}

    return {"kind": "unknown", "member_order_swapped": False, "lines": []}
