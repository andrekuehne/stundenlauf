# Feature Plan: Season hard reset (empty dataset, keep year)

## Overview

- Feature name: Season hard reset (empty dataset, keep year)
- Owner: TBD
- Status: Implemented (2026-04-10)
- Related requirement(s): R1, R6, R8
- Related milestone(s): M5

## Problem Statement

Rolling back race events preserves identity and matching history. For operators this makes "start over this season" cumbersome, because old identities still influence fresh imports and produce merge suggestions.

## Scope

### In Scope

- Add an explicit season reset operation that clears the season dataset in place.
- Keep the same `series_year` slot and `session_project.json` path.
- Require typed-year confirmation like season deletion.
- Expose the operation in `ui-api-v1`.
- Add a German startup-screen action for reset.

### Out of Scope

- Selective undo of individual operations.
- Full undo/redo timeline architecture.
- Deleting the season directory itself (covered by `delete_series_year`).

## Acceptance Criteria

- [x] `reset_series_year` replaces stored data with an empty `ProjectDocument` for the selected year.
- [x] Reset keeps season directory and project file path intact.
- [x] Confirmation mismatch returns `VALIDATION_ERROR`; unknown year returns `NOT_FOUND`.
- [x] Startup screen provides a guarded German reset action with clear copy.
- [x] API docs and tests cover the new method.

## Technical Plan

- Architecture/approach:
  - Implement `reset_series_year(workspace_dir, payload)` in `backend/ui_api/workspace.py`.
  - Wire method in `backend/ui_api/service.py`.
  - Reuse repository save semantics for atomic overwrite and backup creation.
- Data model/API changes:
  - New `ui-api-v1` method: `reset_series_year`.
  - Payload: `series_year`, `confirm_series_year`.
  - Response: `series_year`, `reset`, `project_file`.
- Migration needs:
  - none
- Performance/reliability concerns:
  - operation is a single local JSON rewrite; existing repository `.bak` behavior is retained.

## Risks and Assumptions

- Assumption: operators understand reset is destructive and broader than rollback.
- Risk: accidental reset by misclick.
  - Mitigation: explicit warning + typed-year confirmation.
- Risk: stale import UI state when reopening the same year.
  - Mitigation: clear import draft state after successful reset.

## Implementation Steps

1. Add backend workspace reset command with strict validation.
2. Register new UI API method in service dispatcher.
3. Document `reset_series_year` in `docs/api/ui-api-v1.md`.
4. Add `tests/test_f08_ui_api.py` coverage for success/mismatch/not-found.
5. Add season-entry reset button and German copy in frontend.
6. Update project documentation logs.

## Test Plan

- Unit/integration:
  - `reset_series_year` resets populated season to empty dataset and keeps file/dir.
  - mismatched confirmation yields `VALIDATION_ERROR`.
  - unknown year yields `NOT_FOUND`.
- Manual checks:
  - startup season table shows reset action per year.
  - warning/prompt copy clearly communicates data loss and season retention.
  - re-opening reset season shows no imported runs/review queue.
- Rollback strategy:
  - restore from `session_project.json.bak` or season export if reset was accidental.

## Definition of Done

- [x] Code implemented
- [x] Tests added/updated and passing
- [x] Docs updated
- [x] Entry added to `docs/ACCOMPLISHMENTS.md`
- [x] Requirement/milestone status updated in `PROJECT_PLAN.md`

## Links

- PR(s): TBD
- Related issue(s): TBD
- Release notes: TBD
