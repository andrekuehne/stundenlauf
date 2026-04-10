---
name: Safe Reimport Policy
overview: Implement a source-batch-aware reimport flow that keeps duplicate protection strict, allows reimport only after full rollback of the previous source import, and surfaces clear API/UI errors for unsafe attempts.
todos:
  - id: define-source-batch-rules
    content: Codify state-aware source hash duplicate/reimport rules in ingestion service.
    status: completed
  - id: batch-rollback-repo-api
    content: Add repository operation for rolling back all active events in one source batch.
    status: completed
  - id: wire-ui-api-reimport
    content: Refactor reimport command to perform source-batch rollback before import and return audit metadata.
    status: completed
  - id: update-ui-error-handling
    content: Expose clear German duplicate/partial-rollback guidance in frontend import/history flows.
    status: completed
  - id: add-tests-and-regressions
    content: Add ingestion and ui_api tests covering duplicate error, partial/full rollback, and deterministic standings.
    status: completed
  - id: sync-docs-and-progress
    content: Document API behavior changes and update project/accomplishments tracking.
    status: completed
isProject: false
---

# Safe Reimport Plan

## Scope And Requirement Mapping
- Supports duplicate-protection and correction workflow requirements in [C:\Users\andre\VSCode_Projects\stundenlauf\docs\features\F02-excel-ingestion-and-race-merge.md](C:\Users\andre\VSCode_Projects\stundenlauf\docs\features\F02-excel-ingestion-and-race-merge.md), [C:\Users\andre\VSCode_Projects\stundenlauf\docs\features\F08-python-frontend-api-layer.md](C:\Users\andre\VSCode_Projects\stundenlauf\docs\features\F08-python-frontend-api-layer.md), and [C:\Users\andre\VSCode_Projects\stundenlauf\docs\features\F05-german-ui-and-review-workflow.md](C:\Users\andre\VSCode_Projects\stundenlauf\docs\features\F05-german-ui-and-review-workflow.md).
- Desired policy confirmed:
  - Same file import without rollback => explicit duplicate error.
  - Reimport rollback scope => all events sharing same source hash (full source batch).

## Design Changes
- Introduce source-batch semantics using `source_sha256` as the batch identity.
- Differentiate import outcomes in ingestion service:
  - `duplicate_active_source`: active events with same hash exist -> raise validation error (not noop).
  - `fully_rolled_back_source`: all prior events for hash are rolled back -> permit reimport.
  - `partially_rolled_back_source`: mixed active/rolled_back for same hash -> block with explicit guidance to roll back remaining linked events.
- Add repository helper to roll back all events for a source hash atomically and recompute standings once.
- Keep rollback auditability immutable (never delete old events); new reimport creates new event UIDs.

## File-Level Plan
- In [C:\Users\andre\VSCode_Projects\stundenlauf\backend\ingestion\service.py](C:\Users\andre\VSCode_Projects\stundenlauf\backend\ingestion\service.py):
  - Replace current unconditional hash noop check with state-aware validation.
  - Return actionable error text/codes for duplicate and partial rollback states.
  - Keep race/category collision checks for active events, but ensure collisions from same source hash are explained as rollback scope issues.
- In [C:\Users\andre\VSCode_Projects\stundenlauf\backend\storage\repository.py](C:\Users\andre\VSCode_Projects\stundenlauf\backend\storage\repository.py):
  - Add `mark_events_rolled_back_by_source_sha256(...)` that updates all matching active events in one operation and triggers one deterministic standings recompute.
- In [C:\Users\andre\VSCode_Projects\stundenlauf\backend\ui_api\commands.py](C:\Users\andre\VSCode_Projects\stundenlauf\backend\ui_api\commands.py):
  - Update `reimport_race` to:
    1) resolve `previous_race_event_uid` -> source hash,
    2) rollback full source batch,
    3) run import,
    4) return payload including rolled-back event count/uids for UI traceability.
  - Keep `rollback_race` as targeted manual action, but ensure reimport path always uses source-batch rollback.
- In [C:\Users\andre\VSCode_Projects\stundenlauf\frontend\app.js](C:\Users\andre\VSCode_Projects\stundenlauf\frontend\app.js):
  - Surface duplicate/partial-rollback backend errors with user-friendly German messages and clear next action.
  - Optionally expose “Korrektur neu importieren” path from history that calls `reimport_race` instead of manual rollback+import sequence.
- In [C:\Users\andre\VSCode_Projects\stundenlauf\docs\api\ui-api-v1.md](C:\Users\andre\VSCode_Projects\stundenlauf\docs\api\ui-api-v1.md):
  - Document new error semantics and `reimport_race` batch-rollback behavior.

## Safety Guards
- Enforce atomicity: batch rollback + recompute + save must be all-or-nothing.
- Enforce deterministic standings by recomputing from full persisted event history after each command.
- Preserve immutable audit chain: old events remain with `rolled_back` metadata; new import creates new events.
- Use explicit domain-level validation errors (not silent noop) for duplicate active source and partial rollback states.

## Test Plan
- Extend [C:\Users\andre\VSCode_Projects\stundenlauf\tests\test_f02_ingestion.py](C:\Users\andre\VSCode_Projects\stundenlauf\tests\test_f02_ingestion.py):
  - `import_same_file_without_rollback_returns_duplicate_error`
  - `import_after_full_source_batch_rollback_is_allowed`
  - `import_after_partial_source_batch_rollback_is_blocked`
- Extend [C:\Users\andre\VSCode_Projects\stundenlauf\tests\test_f08_ui_api.py](C:\Users\andre\VSCode_Projects\stundenlauf\tests\test_f08_ui_api.py):
  - `reimport_race_rolls_back_all_events_with_same_source_hash`
  - `reimport_race_returns_batch_rollback_metadata`
  - `ui_api_import_race_propagates_duplicate_error_details`
- Add regression checks for standings snapshots before/after batch rollback and reimport to ensure no double counting.

## Delivery And Documentation Updates
- Update feature status/progress notes where relevant in [C:\Users\andre\VSCode_Projects\stundenlauf\PROJECT_PLAN.md](C:\Users\andre\VSCode_Projects\stundenlauf\PROJECT_PLAN.md).
- Add a concise outcome entry in [C:\Users\andre\VSCode_Projects\stundenlauf\docs\ACCOMPLISHMENTS.md](C:\Users\andre\VSCode_Projects\stundenlauf\docs\ACCOMPLISHMENTS.md) once implemented and validated.
- If behavior changes are substantial for F05 users, add a short note in [C:\Users\andre\VSCode_Projects\stundenlauf\docs\features\F05-german-ui-and-review-workflow.md](C:\Users\andre\VSCode_Projects\stundenlauf\docs\features\F05-german-ui-and-review-workflow.md).