# Feature Plan: Season Import and Export (GUI)

## Overview

- Feature name: Season import and export (GUI)
- Owner: TBD
- Status: Implemented (2026-04-10)
- Related requirement(s): R1, R7, R8
- Related milestone(s): M5

## Problem Statement

Operators need a safe way to move complete season datasets between machines and create backups.
Today seasons are local-only and can be deleted/edited; without explicit export/import, portability relies on manual filesystem work that is error-prone for non-technical users.

## Scope

### In Scope

- Add season-level export actions in season screen list (one export action per stored season).
- Add a season import action in season screen.
- Export one complete season dataset into a portable file format.
- Import an exported season file back into local storage with conflict handling.
- German UI copy for buttons, dialogs, progress, and errors.
- Validation and safety checks for schema compatibility and malformed files.

### Out of Scope

- Multi-season bundle import/export in a single file.
- Cloud sync, remote sharing, or automatic conflict merge of two modified seasons.
- Cross-version migration beyond currently supported schema migrations.

## UX Decision (Year Handling)

- **Decision:** The exported file must include `series_year` in a manifest.
- **Import flow:** Import dialog pre-fills target year from file metadata and shows it read-only by default.
- **Conflict option:** If that year already exists locally, user must choose:
  - cancel import,
  - import as a different year (explicit new year input),
  - replace existing year only after strong confirmation (typed year).
- **Why:** Keeps backups/restores deterministic and avoids accidental imports into wrong year.

## File Format Proposal

- Export file extension: `.stundenlauf-season.zip`
- Zip content:
  - `manifest.json` (metadata and integrity info)
  - `session_project.json` (canonical season document)
- `manifest.json` fields (minimum):
  - `format_version` (for import parser evolution)
  - `exported_at`
  - `app_version` (if available)
  - `schema_version`
  - `series_year`
  - `events_total`
  - `sha256_session_project`

## Acceptance Criteria

- [x] Season screen shows one export button per existing season row (icon/button style clearly implies export, e.g. arrow).
- [x] Season screen offers one global import button for selecting an exported season file.
- [x] Export writes a valid `.stundenlauf-season.zip` containing `manifest.json` and `session_project.json`.
- [x] Import validates file structure, checksum, and schema before writing local data.
- [x] Import defaults to the year embedded in the file and clearly handles year conflicts.
- [x] Imported season appears immediately in `list_series_years` and can be opened.
- [x] Failed import never leaves partial files or half-created season directories.

## Technical Plan

- Architecture/approach:
  - implement export/import in `backend/ui_api/workspace.py` and expose via `backend/ui_api/commands.py` + `service.py`.
  - frontend season screen (`frontend/app.js`) adds:
    - per-row export button (`secondary` style with arrow glyph),
    - global import button near "Neue Saison anlegen".
  - use `pick_file` for import selection and a new save-file picker method for export destination (or deterministic default path + confirmation when picker unavailable).
- Data model/API changes:
  - `export_series_year(series_year, destination_path?)`
    - reads `session_project.json` for year, writes zip+manifest, returns export path and byte size.
  - `import_series_year(file_path, target_series_year?, replace_existing?)`
    - reads/validates zip, uses `manifest.series_year` when no override is given, writes season file atomically, returns imported year and project path.
  - optional helper: `inspect_season_export(file_path)` for preview-before-import UX.
- Migration needs:
  - none for existing local storage layout; import reuses current `project_file_for_year(...)` convention.
- Performance/reliability concerns:
  - import/export runs on one season file, expected small enough for synchronous API call; keep checksum validation mandatory.
  - atomic write pattern: write temp file and rename; on replace, keep backup until success.

## Risks and Assumptions

- Assumption: Season data is fully represented by one canonical `session_project.json` per year.
- Risk: User imports wrong file type or manually edited/corrupt zip.
  - Mitigation: strict format checks (`manifest.json` + payload + checksum), explicit error messages in German.
- Risk: Importing into an existing year overwrites valid data.
  - Mitigation: default deny overwrite; require explicit overwrite mode with typed-year confirmation.
- Risk: Schema/version mismatch from future/older app builds.
  - Mitigation: explicit compatibility check and actionable error (`update app` / `export from compatible version`).
- Risk: Path traversal in zip entries.
  - Mitigation: only accept expected filenames at zip root; reject all other paths.
- Risk: Partial writes on crash/power loss.
  - Mitigation: temp directory + atomic replace; cleanup on failure.

## Implementation Steps

1. Define export/import contract
   - add method specs to `docs/api/ui-api-v1.md` (payloads, responses, error codes).
   - finalize `manifest.json` structure and `format_version`.
2. Backend export implementation
   - load season via existing workspace year path.
   - generate manifest + checksum and write zip.
3. Backend import implementation
   - validate zip structure and manifest.
   - validate checksum and schema compatibility.
   - resolve target year (manifest default, optional override), apply conflict strategy.
   - write atomically to `data/series/<year>/session_project.json`.
4. Frontend season screen changes
   - per-season export button (arrow-style affordance).
   - global import button and import conflict dialog flow.
   - status messages and errors via `UIStrings`.
5. Tests and docs
   - add API and workspace unit tests.
   - update `docs/features/` status + references after implementation.

## Test Plan

- Unit:
  - export builds valid manifest and checksum for known season fixture.
  - import rejects invalid zip/missing manifest/checksum mismatch.
  - import rejects unsupported schema/format versions.
  - overwrite-protection logic behaves correctly (deny by default).
- Integration:
  - GUI flow: export season -> delete local season -> import exported file -> open season -> counts/events match.
  - conflict flow: import file whose `series_year` already exists and verify all three branches (cancel/new year/replace confirm).
- Manual checks:
  - verify button placement and "export-y" visual cue clarity with organizer users.
  - verify import errors are actionable in German.
- Rollback strategy:
  - import is atomic; on any failure local data remains unchanged.
  - replace mode creates restorable pre-import backup until commit succeeds.

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
