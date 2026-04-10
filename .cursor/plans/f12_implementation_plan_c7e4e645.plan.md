---
name: F12 implementation plan
overview: Implement season-level import/export in the GUI and UI API with safe, validated, atomic behavior for portability and backup workflows. Deliver backend API, frontend controls/dialogs, tests, and project-documentation updates required by the workflow rule.
todos:
  - id: api-contract
    content: Document export/import UI API methods and archive format in ui-api-v1 docs
    status: completed
  - id: backend-export
    content: Implement season export zip+manifest generation in workspace layer
    status: completed
  - id: backend-import
    content: Implement validated atomic import with year conflict strategies
    status: completed
  - id: service-wiring
    content: Expose new methods through commands/service bridge
    status: completed
  - id: frontend-actions
    content: Add season export/import controls, dialogs, and German copy
    status: completed
  - id: tests
    content: Add unit/integration tests for success/failure/conflict flows
    status: completed
  - id: docs-closeout
    content: Update F12 status, accomplishments, and project plan progress notes
    status: completed
isProject: false
---

# F12 Season Import/Export Implementation Plan

## Scope Alignment
- Supports requirements `R1` (import reliability), `R7` (portable file-based data), and `R8` (German GUI workflows).
- Fits milestone `M5` hardening/production-readiness by adding backup/restore operations for non-technical users.
- In-scope behavior follows [docs/features/F12-season-import-export.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/features/F12-season-import-export.md).

## Target Files
- API contract: [docs/api/ui-api-v1.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/api/ui-api-v1.md)
- Backend workspace/import-export logic: [backend/ui_api/workspace.py](C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/workspace.py)
- Command/service exposure: [backend/ui_api/commands.py](C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/commands.py), [backend/ui_api/service.py](C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/service.py)
- Frontend season UI + dialogs: [frontend/app.js](C:/Users/andre/VSCode_Projects/stundenlauf/frontend/app.js), [frontend/strings.js](C:/Users/andre/VSCode_Projects/stundenlauf/frontend/strings.js)
- Tests near UI API/workspace/frontend contract test locations already used by F08–F11
- Completion docs: [docs/ACCOMPLISHMENTS.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/ACCOMPLISHMENTS.md), [PROJECT_PLAN.md](C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md), and status update in [docs/features/F12-season-import-export.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/features/F12-season-import-export.md)

## Implementation Steps
1. **Lock API Contract First**
- Add `export_series_year(...)` and `import_series_year(...)` to UI API docs with request/response/error semantics.
- Specify export package format: `.stundenlauf-season.zip` with root entries `manifest.json` and `session_project.json`.
- Define compatibility/error behavior for unsupported `format_version`/schema mismatch.

2. **Implement Safe Export in UI API Workspace Layer**
- Read canonical season file from existing year path convention.
- Build `manifest.json` with required metadata (`format_version`, `series_year`, `schema_version`, checksum, etc.).
- Produce zip at chosen destination and return path + size metadata.

3. **Implement Safe Import with Conflict Handling**
- Validate zip shape (exact expected root filenames), reject malformed/extra/path-traversal content.
- Validate checksum and compatibility prior to writes.
- Resolve target year (manifest default unless explicit override).
- Enforce conflict policy:
  - default: deny overwrite,
  - allow import-as-different-year,
  - allow replace only with explicit confirmed flag.
- Persist atomically (temp write + replace) and ensure cleanup on failure.

4. **Expose Commands Through Service Bridge**
- Wire new workspace methods into command handlers and service dispatch.
- Keep response payloads stable and frontend-consumable (year, destination/imported path, counters).

5. **Frontend Season Screen UX**
- Add per-row export action in season list.
- Add global import action near season creation/open actions.
- Implement import flow:
  - file picker,
  - metadata-driven default year,
  - conflict modal for cancel/new-year/replace.
- Add/adjust German UI copy in `UIStrings` for buttons, confirmations, progress, and actionable errors.

6. **Tests and Regression Coverage**
- Unit tests: export manifest/checksum generation; import validation failures (missing manifest, checksum mismatch, unsupported versions).
- Conflict behavior tests: existing-year branches (cancel/new-year/replace).
- Integration/API-flow test: export -> remove/absent season -> import -> season visible/openable.
- Ensure failure paths leave no partial files.

7. **Project Workflow Completion Updates**
- Update F12 doc status from Planned to implemented details.
- Add outcome-focused accomplishment entry.
- Update `PROJECT_PLAN.md` change log/milestone note if this materially advances M5 hardening.

## Risks and Mitigations
- Overwrite risk: require explicit replace mode plus typed-year confirmation in UI.
- Corrupt/manual-edited archives: strict structural validation + checksum + clear German error copy.
- Version drift: compatibility gate with actionable failure messages.
- Partial write risk: temp + atomic replace strategy with rollback/cleanup.

## Verification
- Run targeted backend/UI API tests for new commands and workspace logic.
- Run frontend contract/integration tests for season screen actions and dialog branches.
- Manual smoke: export a real season, delete or isolate local copy, re-import, open season, verify standings/events parity.