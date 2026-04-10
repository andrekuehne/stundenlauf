# Feature Plan: Season Entry Density and Coverage Preview

## Overview

- Feature name: Season entry density and coverage preview
- Owner: TBD
- Status: Implemented (2026-04-10)
- Related requirement(s): R1, R8
- Related milestone(s): M5

## Problem Statement

The startup season screen placed too much width on the create card and not enough on the season overview table. It also showed long raw import timestamps and lacked a quick per-season indicator of which race numbers are already included for singles and couples.

## Scope

### In Scope

- Widen the season overview area and reduce create-card width on the startup screen.
- Render `latest_imported_at` in compact local format `HH:MM DD.MM.YYYY`.
- Add a compact per-season coverage matrix (`Einzel`/`Paare`) to the season table.
- Reuse matrix semantics already used in standings/import views.
- Extend `list_series_years` payload with season race coverage summary.

### Out of Scope

- New dedicated season inspection view.
- Changes to import parsing or merge behavior.
- Storage schema changes.

## Acceptance Criteria

- [x] Startup screen allocates more horizontal space to existing seasons than create season card.
- [x] Last import is displayed as compact local time/date or `-` when missing/invalid.
- [x] Season table includes compact singles/couples run coverage preview.
- [x] `list_series_years` exposes coverage data needed by frontend.
- [x] API docs and tests reflect the new payload.

## Technical Plan

- Architecture/approach:
  - Compute coverage in `backend/ui_api/workspace.py` from active events with valid `race_no`.
  - Render compact matrix in `frontend/app.js` via existing matrix renderer with compact mode.
  - Add dedicated season-entry layout styles in `frontend/styles.css`.
- Data model/API changes:
  - `list_series_years.items[].race_coverage` with:
    - `singles_race_numbers`
    - `couples_race_numbers`
    - `race_columns` (default `1..5`, extend to max run number)
- Migration needs:
  - none
- Performance/reliability concerns:
  - coverage payload is small, computed from in-memory document load already used by list call.

## Risks and Assumptions

- Assumption: event category division reliably identifies couples via `couples_*`.
- Risk: malformed timestamps break display formatting.
  - Mitigation: frontend formatter falls back to `-`.
- Risk: dense matrix in season table harms readability.
  - Mitigation: compact table styles and responsive single-column fallback layout.

## Implementation Steps

1. Extend `list_series_years` to include `race_coverage`.
2. Update `docs/api/ui-api-v1.md` contract.
3. Update season entry rendering with compact timestamp and matrix column.
4. Add startup layout and compact matrix CSS.
5. Add/update tests for new API payload behavior.

## Test Plan

- Unit:
  - `list_series_years` returns default coverage for empty seasons.
  - active-only race coverage groups singles/couples correctly and extends columns beyond 5 when needed.
- Integration:
  - startup season list displays compact matrix per row using API payload.
- Manual checks:
  - left overview visibly wider than right create card.
  - compact timestamp format is shown in local timezone.
  - matrix aligns with expected imported races.
- Rollback strategy:
  - revert frontend/API payload additions; no storage migration needed.

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
