from __future__ import annotations


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
