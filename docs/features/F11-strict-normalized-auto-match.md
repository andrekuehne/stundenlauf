# Feature Plan: Strict normalized auto-match mode

## Overview

- Feature name: Strict normalized auto-match (import matching)
- Owner: TBD
- Status: Done
- Related requirement(s): R4, R6, M5
- Related milestone(s): M5

## Problem Statement

Fuzzy matching with `auto_min` and “perfect” score 1.0 can still auto-link near-duplicate names (bonuses + clamping). Operators need an optional mode where **automatic** linking happens only when the Excel row matches an existing participant/team on **normalized** name, YOB, gender, and club—without relying on similarity scores.

## Scope

### In Scope

- `MatchingConfig.strict_normalized_auto_only` and session API field `strict_normalized_auto_only` on `get_matching_config` / `set_matching_config`.
- Singles: full scan of same-gender `people` for strict hits; exactly one hit → auto with `strict_identity_auto` feature; multiple → review; none → fuzzy path with **fuzzy auto downgraded to review**.
- Paarlauf: full scan of division-compatible couples; same semantics.
- Helpers in [`backend/matching/strict_identity.py`](../../backend/matching/strict_identity.py); `name_key()` shared via [`backend/matching/decisions.py`](../../backend/matching/decisions.py) for fingerprint alignment.
- German Import UI: **Strikt** is the default mode in the Import matching panel (tabbed mode selector: Strikt / Fuzzy-Automatik / Manuell; under Fuzzy, sub-modes *Nur 100 %-Ähnlichkeit* vs *Ab Schwelle* with grouped slider). Copy in `frontend/strings.js`.
- Tests: helpers, workflow integration, UI API round-trip.

### Out of Scope

- Persisting matching mode in the project file (session-only, like existing matching settings).
- Changing replay (`manual_link` / `replay`) semantics.

## Acceptance Criteria

- [x] With strict mode on, file row identical to canonical `Person.name` parsing + YOB + club norm → auto.
- [x] With strict mode on, one character name difference → review (not auto) even if fuzzy score would auto.
- [x] With strict mode off, behavior unchanged from prior release.
- [x] API and GUI expose and persist the flag for the session.

## Technical Notes

- Stored name key uses `parse_person_name(person.name)` so it matches incoming row parsing (canonical display string).
- Club compared via `normalize_club` / `club_normalized`.

## Links

- API: [`docs/api/ui-api-v1.md`](../../docs/api/ui-api-v1.md) (`get_matching_config`, `set_matching_config`)
- Matcher: [`backend/matching/workflow.py`](../../backend/matching/workflow.py), [`backend/matching/strict_identity.py`](../../backend/matching/strict_identity.py)
- UI: [`frontend/app.js`](../../frontend/app.js), [`frontend/strings.js`](../../frontend/strings.js)
