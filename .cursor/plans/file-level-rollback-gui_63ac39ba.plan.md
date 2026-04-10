---
name: file-level-rollback-gui
overview: Add a non-messy file-level rollback flow by introducing a dedicated backend batch command and wiring a grouped history action in the German GUI. This extends existing F05/F08 workflows and aligns with your requirement to avoid partial DB states.
todos:
  - id: api-batch-rollback
    content: Add and wire new ui_api command rollback_source_batch with deterministic response payload.
    status: completed
  - id: timeline-batch-key
    content: Expose source_sha256 in timeline query payload for robust frontend grouping.
    status: completed
  - id: history-ui-grouped-action
    content: Refactor history rendering to file-batch groups and trigger one Datei zurücknehmen command per group.
    status: completed
  - id: tests-docs-project-updates
    content: Add API/frontend regression tests, update ui-api docs, accomplishments, and project plan changelog/progress.
    status: completed
isProject: false
---

# File-Level Rollback in GUI

## Requirement/Milestone Mapping
- Supports requirement **R1/R6/R8** (safe import correction + interactive GUI workflow).
- Fits milestone **M5 hardening** in [c:\Users\andre\VSCode_Projects\stundenlauf\PROJECT_PLAN.md](c:\Users\andre\VSCode_Projects\stundenlauf\PROJECT_PLAN.md).
- Extends shipped F05/F08 behavior documented in:
  - [c:\Users\andre\VSCode_Projects\stundenlauf\docs\features\F05-german-ui-and-review-workflow.md](c:\Users\andre\VSCode_Projects\stundenlauf\docs\features\F05-german-ui-and-review-workflow.md)
  - [c:\Users\andre\VSCode_Projects\stundenlauf\docs\features\F08-python-frontend-api-layer.md](c:\Users\andre\VSCode_Projects\stundenlauf\docs\features\F08-python-frontend-api-layer.md)

## Proposed Design (chosen)
- Add a new UI API command: `rollback_source_batch`.
- Backend resolves all active race events that belong to the same imported file batch and rolls them back atomically in one command.
- Frontend `Historie` view groups import entries by file-batch identity and exposes one action button: `Datei zurücknehmen`.
- Keep existing single-race rollback available only as secondary/advanced action (optional), but default UX emphasizes file-level rollback to prevent partial states.

## Core Implementation Steps
1. **Backend command surface (`ui_api`)**
   - Add `rollback_source_batch` to service method map in [c:\Users\andre\VSCode_Projects\stundenlauf\backend\ui_api\service.py](c:\Users\andre\VSCode_Projects\stundenlauf\backend\ui_api\service.py).
   - Implement command in [c:\Users\andre\VSCode_Projects\stundenlauf\backend\ui_api\commands.py](c:\Users\andre\VSCode_Projects\stundenlauf\backend\ui_api\commands.py):
     - Input either `race_event_uid` (anchor) or explicit `source_sha256`.
     - Resolve source hash from anchor event.
     - Call repository batch rollback (`mark_events_rolled_back_by_source_sha256`) and save once.
     - Return deterministic payload: `source_sha256`, `rolled_back_event_count`, `rolled_back_event_uids`.

2. **Timeline/query enrichment for grouping**
   - Extend timeline entries in [c:\Users\andre\VSCode_Projects\stundenlauf\backend\ui_api\queries.py](c:\Users\andre\VSCode_Projects\stundenlauf\backend\ui_api\queries.py) to include stable batch key for GUI grouping:
     - `source_sha256` (primary key)
     - keep/display `source_file` for readability.
   - This avoids brittle grouping by file name only.

3. **API contract docs**
   - Update [c:\Users\andre\VSCode_Projects\stundenlauf\docs\api\ui-api-v1.md](c:\Users\andre\VSCode_Projects\stundenlauf\docs\api\ui-api-v1.md):
     - new `rollback_source_batch` method section
     - timeline field additions (`source_sha256` in import/rollback entries)
     - error semantics for invalid/missing batch anchors.

4. **Frontend grouped history action**
   - Update `renderHistoryView()` in [c:\Users\andre\VSCode_Projects\stundenlauf\frontend\app.js](c:\Users\andre\VSCode_Projects\stundenlauf\frontend\app.js):
     - Group timeline `race_import` rows by `source_sha256`.
     - Render one grouped row/action per batch (`Datei zurücknehmen`).
     - Confirmation dialog explicitly states how many runs will be removed.
     - Call `rollback_source_batch` once, then refresh overview/history and status message.

5. **UX copy hardening (German)**
   - Keep wording unambiguous: rollback applies to entire imported file batch, not single race.
   - Add hint text in history card so behavior is discoverable.

6. **Tests + regression**
   - API tests in [c:\Users\andre\VSCode_Projects\stundenlauf\tests\test_f08_ui_api.py](c:\Users\andre\VSCode_Projects\stundenlauf\tests\test_f08_ui_api.py):
     - `rollback_source_batch` rolls back all active events of hash.
     - idempotent behavior when already rolled back.
     - proper validation errors.
   - Query test coverage for timeline `source_sha256` presence.
   - Frontend integration/unit checks (existing frontend test setup) for grouped history rendering and single-call command dispatch.

7. **Project workflow updates (required by repo rules)**
   - Add accomplishment entry to [c:\Users\andre\VSCode_Projects\stundenlauf\docs\ACCOMPLISHMENTS.md](c:\Users\andre\VSCode_Projects\stundenlauf\docs\ACCOMPLISHMENTS.md).
   - Update relevant progress note/changelog row in [c:\Users\andre\VSCode_Projects\stundenlauf\PROJECT_PLAN.md](c:\Users\andre\VSCode_Projects\stundenlauf\PROJECT_PLAN.md).

## Assumptions
- One imported file corresponds to one `source_sha256` batch, possibly spanning multiple race events/categories.
- Using `source_sha256` as grouping key is stable across imports and preferable to filename grouping.

## Risks and Mitigations
- **Risk:** Users may still expect per-race rollback.
  - **Mitigation:** Preserve secondary single-race action (or delayed deprecation) and explicit copy in dialog.
- **Risk:** Timeline payload change could affect existing GUI assumptions.
  - **Mitigation:** Add fields additively only; keep existing keys unchanged.
- **Risk:** Partial batch rollback via old controls creates mixed states.
  - **Mitigation:** Make grouped action primary and add guard text warning against partial rollback for normal workflow.

## Test Plan
- Import one file producing multiple events (e.g., singles/couples), then trigger grouped rollback from `Historie` and verify:
  - all corresponding events become rolled back,
  - standings recompute without those events,
  - audit timeline reflects grouped rollback operation.
- Re-import after grouped rollback succeeds without partial-rollback errors.
- Existing single-race rollback behavior remains functional if retained.