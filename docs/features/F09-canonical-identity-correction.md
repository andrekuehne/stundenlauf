# Feature Plan: Canonical participant identity correction

## Overview

- Feature name: Canonical participant identity correction
- Owner: TBD
- Status: Implemented (backend + API + tests; GUI wiring optional follow-up)
- Related requirement(s): R3, R4, R6, R7
- Related milestone(s): M5

## Problem Statement

The merged season treats `Person` (and Paarlauf team members) as the source of truth for names, clubs, and year of birth in standings and tables. A typo in an early import pollutes that canonical record; users need to correct display fields without deleting the season or editing raw import rows. `apply_match_decision` records field-level audit for link decisions but does not mutate canonical `Person` rows.

## Scope

### In Scope

- Backend command to update canonical `name`, `yob`, and `club` for a single participant or one Paarlauf team member (`member` `a` | `b`).
- Recompute derived matching fields (`canonical_given`, `canonical_family`, `club_normalized`) via existing normalization (`parse_person_name`, `normalize_club`).
- Recompute standings snapshot after mutation (UID-keyed points/distance unchanged).
- Append `MatchingDecision` with `kind=identity_correction` and `scope_series_year` so year-filtered audit timeline and `matching_decisions` counts include identity-only edits.
- UI API method `update_participant_identity` and `docs/api/ui-api-v1.md` contract.
- Automated API tests (singles, team member, validation, timeline scoping, standings stability).

### Out of Scope

- Editing gender (immutable; would break category assumptions).
- Separate “display name” vs “matching profile” models.
- Auto-updating Excel source files.
- Bulk rename without explicit UID.
- German GUI form (can be a follow-up milestone; API is ready for standings-driven flows).

## Acceptance Criteria

- [x] Callers can patch canonical identity for singles (`participant_uid`) or Paarlauf (`team_uid` + `member`).
- [x] Derived normalization fields stay consistent with the matching pipeline after edits.
- [x] Identity corrections appear in `get_year_timeline` / `get_audit_timeline` when `series_year` matches `scope_series_year`.
- [x] `get_project_state` filtered counts include identity corrections for the selected season.
- [x] Standings numeric totals for an entity are unchanged by identity-only edits.
- [x] API documented and covered by tests.

## Technical Plan

- Architecture/approach:
  - `backend/domain/identity.py`: `person_with_updated_identity`, `yob_bounds`; preserve existing `couple_key`.
  - `backend/ui_api/commands.py`: `update_participant_identity` loads document, replaces `Person` or updates `Couple` member + matching row in `people`, appends audit, `recompute_project_standings`, save.
  - `MatchingDecision`: new `kind` value `identity_correction`, optional `scope_series_year`; empty `race_event_uid` / `entry_uid` for identity-only rows.
  - `backend/ui_api/queries.py`: `_matching_decision_in_filtered_year` centralizes inclusion for timeline and counts.
- Data model/API changes: `schema_v2` persists `scope_series_year` on decisions.
- Migration needs: none required for this repo’s datasets (greenfield serialization).
- Performance/reliability: single-document mutation; same cost profile as other project saves.

## Risks and Assumptions

- Assumption: operators accept that correcting canonical identity while Excel still contains old text may lower auto-match scores on the next import until the file is fixed or manually reviewed.
- Risk: YOB mismatch penalty on import if file YOB disagrees with corrected canonical YOB.
  - Mitigation: document tradeoff; fix source or use review workflow.
- Risk: Timeline filtering omitted identity-only audits before `scope_series_year`.
  - Mitigation: explicit year on decision + query helper (implemented).

## Implementation Steps

1. Extend `MatchingDecision` and `schema_v2` serialization.
2. Implement `update_participant_identity` and identity helper functions.
3. Update timeline and project-state counting.
4. Register UI API method and document contract.
5. Add regression tests in `tests/test_f08_ui_api.py`.

## Test Plan

- Unit: covered via API tests loading persisted project JSON.
- Integration: `update_participant_identity` → `get_standings`, `get_year_timeline`, `get_project_state`, wrong-year exclusion.
- Manual checks: optional GUI hook to call API from standings row (future).
- Rollback strategy: users rely on file backup / version control; no dedicated undo command in this feature.

## Definition of Done

- [x] Code implemented
- [x] Tests added/updated and passing
- [x] Docs updated (`docs/api/ui-api-v1.md`, this feature plan)
- [x] Entry added to `docs/ACCOMPLISHMENTS.md`
- [x] Requirement/milestone progress noted in `PROJECT_PLAN.md`

## Links

- API: `docs/api/ui-api-v1.md` (`update_participant_identity`)
- Tests: `tests/test_f08_ui_api.py`
