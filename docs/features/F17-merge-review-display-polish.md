# Feature Plan: Import merge review display polish

## Overview

- Feature name: Merge review UX (couple alignment + granular diffs)
- Owner: TBD
- Status: Done
- Related requirement(s): R6, R8
- Related milestone(s): M5

## Problem Statement

The import review table highlighted entire name/YOB or club cells when any part differed. For Paarlauf rows, Excel member order can disagree with stored `member_a` / `member_b` while the fuzzy matcher already treats the pair as order-insensitive, which made side-by-side comparison harder than necessary.

## Scope

### In Scope

- Pure display helpers in [`backend/matching/review_display.py`](../../backend/matching/review_display.py): display-oriented name split (mirroring `parse_person_name` rules), optional couple member reordering for review UI using the same pairing score shape as matching, per-field diff segments for given/family, YOB, and club.
- `get_review_queue` adds `candidate_review_displays[]` aligned with `candidate_uids` (documented in [`docs/api/ui-api-v1.md`](../../docs/api/ui-api-v1.md)).
- German import review UI: inline `.merge-diff-part` spans instead of whole-cell `.merge-diff-cell` when hints are present; CSS in [`frontend/styles.css`](../../frontend/styles.css).
- Tests: [`tests/test_match_review_display.py`](../../tests/test_match_review_display.py), extended [`tests/test_f08_ui_api.py`](../../tests/test_f08_ui_api.py).

### Out of Scope

- Changing match persistence, `RaceEntry` linkage, or `apply_match_decision` behavior.
- Persisting display order or diff metadata on the project file.

## Acceptance Criteria

- [x] Team review rows can show candidate members reordered to align with incoming Excel lines when the swapped permutation scores strictly higher (visual only).
- [x] Singles and team lines show red highlighting on differing given/family fragments, YOB (only when both sides have a year), and club halves for couples.
- [x] API contract and tests document the `candidate_review_displays` shape.

## Risks

- Unusual name formats still follow the same heuristics as `parse_person_name`; ambiguous cases may fall back to a single name segment.

## Links

- Implementation: [`backend/ui_api/queries.py`](../../backend/ui_api/queries.py) (`get_review_queue`), [`frontend/app.js`](../../frontend/app.js)
