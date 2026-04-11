# Club no-affiliation normalization (None-based)

## Overview

- Feature name: Club no-affiliation normalization
- Status: Done
- Related requirement(s): R1, R4
- Related milestone(s): M2, M3

## Problem Statement

Excel “Verein” cells use inconsistent spellings for “no club” (empty, `-`, `'-`, punctuation-only). Those should not become distinct stored `Person.club` values or skew matching.

## Behavior

- Shared helper: `backend/domain/club.py` — `optional_club_from_cell(value)`.
- After `str(value).strip()`, if the string is empty or contains **no** Unicode alphanumeric character (`str.isalnum()`), return `None`; otherwise return the stripped string.
- Used for Excel Verein parsing (`singles` / `couples` adapters), `person_with_updated_identity`, and review identity rebuild paths in `backend/ui_api/commands.py`.
- `normalize_club(None)` remains `""`; matching treats two empty normalized clubs as a full agreement (unchanged).

## Acceptance Criteria

- [x] Punctuation-only Verein values map to `None` at import.
- [x] API identity updates use the same rule as import.
- [x] Unit tests cover edge cases.
