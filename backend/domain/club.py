from __future__ import annotations

_COMPOSITE_CLUB_SEP = " / "


def optional_club_from_cell(value: object) -> str | None:
    """Raw club string (e.g. Excel Verein, API field) → stored value or None if no affiliation."""
    if value is None:
        text = ""
    else:
        text = str(value).strip()
    if not text:
        return None
    if not any(ch.isalnum() for ch in text):
        return None
    return text


def optional_club_composite_from_field(value: object) -> str | None:
    """Like optional_club_from_cell but supports Paarlauf-style `member_a / member_b` in one string."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if _COMPOSITE_CLUB_SEP not in text:
        return optional_club_from_cell(text)
    parts = [p.strip() for p in text.split(_COMPOSITE_CLUB_SEP)]
    mapped: list[str] = []
    for p in parts:
        cell = optional_club_from_cell(p) if p else None
        mapped.append("" if cell is None else cell)
    if not any(mapped):
        return None
    return _COMPOSITE_CLUB_SEP.join(mapped)
