---
name: F13 season-entry-density-and-coverage-preview
overview: Tighten the season start screen by rebalancing layout widths, shorten last-import timestamp display, and add quick season coverage preview (Einzel/Paare race matrix) directly in the season overview table, reusing the existing matrix pattern.
todos:
  - id: f13-backend-readmodel
    content: Extend list_series_years payload with per-season singles/couples race coverage arrays and race columns
    status: completed
  - id: f13-contract-docs
    content: Update ui-api-v1 list_series_years contract to document race_coverage fields
    status: completed
  - id: f13-frontend-season-table
    content: Implement compact local timestamp formatting and add season overview coverage matrix column
    status: completed
  - id: f13-layout-css
    content: Adjust season entry layout to widen overview panel and reduce create panel width with responsive behavior
    status: completed
  - id: f13-tests-and-docsync
    content: Add/adjust tests and prepare accomplishments/project-plan updates for completion
    status: completed
isProject: false
---

# F13 Feature Plan: Season Entry Density and Coverage Preview

## Requirement and Milestone Mapping

- Supports requirement(s): **R1** (import transparency), **R8** (German GUI usability).
- Supports milestone: **M5** (hardening + usability friction reduction for production use).
- Why now: current season entry UX wastes horizontal space and hides useful season completeness signals that already exist in other screens.

## Problem Statement

The season entry screen currently gives too much width to the create/import card and too little to the season overview table. This makes the most frequently used information (existing seasons and readiness) harder to scan. In addition, `latest_imported_at` is rendered in raw long format, and there is no at-a-glance per-season race coverage preview (`Einzel` vs `Paare` by Laufnummer) on this screen.

## Scope

### In Scope

- Rebalance season entry layout to prioritize existing season overview (left) and reduce create/import footprint (right).
- Render `latest_imported_at` in concise local format: `HH:MM DD.MM.YYYY` (user locale timezone).
- Add quick per-season coverage preview in season table (single extra column) using the existing matrix visual language (`Einzel`/`Paare`, race numbers).
- Reuse/align with existing imported-runs matrix behavior from standings/import screen.
- Update API contract + tests to expose required season-level matrix data in `list_series_years`.

### Out of Scope

- Dedicated new season-inspection page.
- Changing import pipeline logic or race parsing rules.
- New backend persistence schema; this is a computed read-model enhancement.

## User-Facing Behavior

- On startup season screen:
  - Left panel is visibly wider; right panel is compact.
  - “Letzter Import” displays concise local time/date (or `-` if missing).
  - Each season row includes a compact coverage indicator showing which race numbers exist for `Einzel` and `Paare`.
- Coverage preview is informational only; open/export/delete actions remain unchanged.

## Technical Approach

### 1) Extend season list read model in backend

- File: [C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/workspace.py](C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/workspace.py)
- Enhance `list_series_years(...)` item payload with computed race coverage:
  - `race_coverage.singles_race_numbers: int[]`
  - `race_coverage.couples_race_numbers: int[]`
  - `race_coverage.race_columns: int[]` (default 1..5, extend to max race found)
- Computation strategy:
  - Iterate active events with valid positive `race_no`.
  - Determine singles vs couples by category division (same semantics as frontend matrix grouping).
  - Deduplicate and sort race numbers.
- Keep existing fields (`events_total`, `review_queue_count`, `latest_imported_at`) unchanged for compatibility.

### 2) Document API shape change

- File: [C:/Users/andre/VSCode_Projects/stundenlauf/docs/api/ui-api-v1.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/api/ui-api-v1.md)
- Update `list_series_years` return schema with optional/guaranteed `race_coverage` object and exact field definitions.
- Clarify that timestamps are still ISO from API; formatting is frontend responsibility.

### 3) Update season entry rendering in frontend

- File: [C:/Users/andre/VSCode_Projects/stundenlauf/frontend/app.js](C:/Users/andre/VSCode_Projects/stundenlauf/frontend/app.js)
- In `renderSeasonEntry(items)`:
  - Add concise timestamp formatter helper using `Date` + locale options in local timezone.
  - Replace raw `item.latest_imported_at` rendering with formatted display.
  - Add season-row coverage cell renderer reusing current matrix labels (`Einzel`, `Paare`, run columns) with compact variant markup.
- Reuse existing matrix semantics from imported-runs code path where practical (extract shared helper if this keeps code simpler).

### 4) Tighten season entry layout CSS

- File: [C:/Users/andre/VSCode_Projects/stundenlauf/frontend/styles.css](C:/Users/andre/VSCode_Projects/stundenlauf/frontend/styles.css)
- Replace generic equal split (`.grid-2`) usage in season entry with a dedicated layout class (e.g. wider left / narrower right ratio).
- Add compact matrix styles suitable for table cell usage (small font, reduced padding, horizontal scroll safety).
- Ensure responsive collapse remains acceptable on smaller widths.

### 5) String/copy updates (if needed)

- File: [C:/Users/andre/VSCode_Projects/stundenlauf/frontend/strings.js](C:/Users/andre/VSCode_Projects/stundenlauf/frontend/strings.js)
- Add/adjust season-entry table header label for coverage column (German copy).
- Reuse existing matrix row labels where possible to avoid divergence.

## Data Flow (Season Table Coverage)

```mermaid
flowchart LR
  workspaceData[workspace data/series/<year>/session_project.json] --> listYears[list_series_years]
  listYears --> coverageBuild[race_coverage compute singles/couples race numbers]
  coverageBuild --> apiPayload[list_series_years payload items[]]
  apiPayload --> seasonRender[renderSeasonEntry]
  seasonRender --> compactMatrix[season table coverage matrix cell]
```

## Risks and Mitigations

- Risk: heavier `list_series_years` response on many seasons.
  - Mitigation: coverage payload remains small arrays; no per-event full detail returned.
- Risk: timestamp parsing inconsistencies with malformed historical values.
  - Mitigation: safe formatter fallback to `-` on invalid/empty date.
- Risk: visual density regression on narrow windows.
  - Mitigation: compact CSS + responsive fallback (stacked layout/smaller matrix rendering).
- Risk: duplicate matrix rendering logic between views.
  - Mitigation: extract minimal shared renderer/helper in `app.js` to keep behavior aligned.

## Implementation Steps

1. Add backend `race_coverage` computation in `list_series_years` and keep prior fields stable.
2. Extend `ui-api-v1` docs for new payload fields.
3. Add/adjust tests for `list_series_years` to assert coverage arrays and defaults.
4. Implement local concise timestamp formatting in season entry renderer.
5. Add season overview coverage column and compact matrix HTML rendering.
6. Update season entry layout classes and CSS widths.
7. Verify manual UX in startup view with seasons containing mixed singles/couples races.

## Test Plan

- Automated (backend):
  - `list_series_years` empty workspace still returns count `0`.
  - Seeded season with mixed categories/races returns correct deduped/sorted `singles_race_numbers` and `couples_race_numbers`.
  - Seasons with no valid race numbers return default columns behavior and empty row sets.
- Automated (frontend/unit-style where available):
  - timestamp formatter converts ISO to `HH:MM DD.MM.YYYY` local; invalid input yields `-`.
  - coverage renderer shows `x`/`—` correctly for both rows.
- Manual:
  - startup screen left panel wider than right create card.
  - long season lists remain scrollable and readable.
  - coverage preview aligns with standings/import matrix expectations for same data.

## Docs and Completion Updates

- Add feature document: [C:/Users/andre/VSCode_Projects/stundenlauf/docs/features/F13-season-entry-density-and-coverage-preview.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/features/F13-season-entry-density-and-coverage-preview.md)
- After implementation, add outcome entry to [C:/Users/andre/VSCode_Projects/stundenlauf/docs/ACCOMPLISHMENTS.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/ACCOMPLISHMENTS.md).
- Update milestone/progress note in [C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md](C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md) (M5 hardening usability increment).