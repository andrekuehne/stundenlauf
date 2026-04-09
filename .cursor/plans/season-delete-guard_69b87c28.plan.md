---
name: season-delete-guard
overview: Add a guarded season-deletion workflow with a red trash action in the season selector, explicit warning, and mandatory year-entry confirmation before backend deletion.
todos: []
isProject: false
---

# Season Delete Safeguard Plan

## Requirement Mapping
- Supports hardening/usability in milestone M5 and aligns with safe German GUI workflows in [C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md](C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md).
- Extends the shipped season lifecycle UI/API from F05/F08 in [C:/Users/andre/VSCode_Projects/stundenlauf/docs/features/F05-german-ui-and-review-workflow.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/features/F05-german-ui-and-review-workflow.md) and [C:/Users/andre/VSCode_Projects/stundenlauf/docs/features/F08-python-frontend-api-layer.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/features/F08-python-frontend-api-layer.md).

## Scope
- Add a red trash-bin delete button per season row in the season entry table in [C:/Users/andre/VSCode_Projects/stundenlauf/frontend/app.js](C:/Users/andre/VSCode_Projects/stundenlauf/frontend/app.js).
- On click, show a German warning + input prompt requiring the exact season year to confirm deletion.
- Add backend API method to delete a season safely (remove `data/series/<year>` folder only after confirmation checks) in [C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/workspace.py](C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/workspace.py) and register it in [C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/service.py](C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/service.py).
- Add API tests in [C:/Users/andre/VSCode_Projects/stundenlauf/tests/test_f08_ui_api.py](C:/Users/andre/VSCode_Projects/stundenlauf/tests/test_f08_ui_api.py).

## Implementation Steps
1. **Backend delete command**
- Implement `delete_series_year(workspace_dir, payload)` in `workspace.py`.
- Validate `series_year` exists, validate `confirm_series_year` is present and equals `series_year`, then delete the season directory recursively.
- Return structured payload (`series_year`, `deleted: true`, optional deleted path info).

2. **UI API wiring**
- Add dispatcher method mapping in `UiApiService._dispatch` for `delete_series_year`.
- Keep existing error conventions (`VALIDATION_ERROR`, `NOT_FOUND`) by raising existing helper errors.

3. **Frontend UX**
- Extend season table action column to include a red trash button (`button.danger`) with trash icon/text.
- Add click handler: show warning text and require manual year input (via prompt flow or lightweight inline confirm UI consistent with current no-modal architecture).
- Call `api("delete_series_year", { series_year, confirm_series_year })` only when input matches.
- Refresh season list after deletion; show success/failure status messages in German.

4. **Safety behavior**
- If confirmation mismatch: abort without API call and show error status.
- If year not found / already deleted: show backend error message safely.
- Keep behavior non-destructive for other years; no bulk delete.

## Test Plan
- Add API tests for:
  - successful season deletion,
  - rejection when confirmation year missing or mismatched,
  - rejection when season does not exist.
- Add/adjust frontend behavior checks if test harness exists; otherwise perform manual smoke:
  - create season -> delete with wrong year (blocked) -> delete with exact year (success) -> list updates.

## Risks and Mitigations
- Risk: accidental deletion.
  - Mitigation: explicit danger copy + exact-year confirmation requirement.
- Risk: deleting wrong folder.
  - Mitigation: compute path strictly via existing `project_file_for_year`/season directory convention, no arbitrary path input.

## Docs and Completion Updates
- Add a short outcome entry in [C:/Users/andre/VSCode_Projects/stundenlauf/docs/ACCOMPLISHMENTS.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/ACCOMPLISHMENTS.md).
- Add a changelog line in [C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md](C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md) only if this is treated as milestone-relevant hardening increment.
- If needed, append a small delta section in [C:/Users/andre/VSCode_Projects/stundenlauf/docs/features/F05-german-ui-and-review-workflow.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/features/F05-german-ui-and-review-workflow.md) documenting the season delete safeguard UX.