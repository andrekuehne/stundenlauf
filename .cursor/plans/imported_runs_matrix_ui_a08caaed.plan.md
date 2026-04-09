---
name: Imported Runs Matrix UI
overview: Replace the current text-based imported-runs summary with a compact matrix shown in both `Aktuelle Wertung` and `Lauf hinzufügen`, using two rows (`Einzel`, `Paare`) and dynamic Lauf columns (default 1–5, auto-extend beyond).
todos:
  - id: frontend-matrix-model
    content: Build shared imported-runs matrix model with two rows and dynamic Lauf columns (min 5).
    status: completed
  - id: standings-view-matrix
    content: Replace imported-runs text summary in Aktuelle Wertung with matrix rendering.
    status: completed
  - id: import-view-matrix
    content: Add same imported-runs matrix section to Lauf hinzufügen view.
    status: completed
  - id: matrix-styles
    content: Add compact responsive CSS styles for matrix readability and overflow handling.
    status: completed
  - id: verify-and-docs
    content: Validate import/rollback scenarios and update accomplishments (and project log if relevant).
    status: completed
isProject: false
---

# Imported Runs Matrix in Standings + Import View

## Requirement / Milestone Mapping

Supports `R8` (German GUI clarity) and hardening in `M5` by improving visibility of imported race coverage before and during import/review.

## Current State (What exists now)

- Imported runs are currently rendered as plain text lines in `frontend/app.js` via `raceListLabel(...)`:
  - `Einzel: 1. Lauf, 2. Lauf, ...`
  - `Paare: ...`
- This appears in the sidebar of `Aktuelle Wertung` and is not currently shown as a matrix in `Lauf hinzufügen`.
- Data source is already available from `state.raceHistoryGroups` through `buildImportedRaceInfo()`.

Key files:
- [C:/Users/andre/VSCode_Projects/stundenlauf/frontend/app.js](C:/Users/andre/VSCode_Projects/stundenlauf/frontend/app.js)
- [C:/Users/andre/VSCode_Projects/stundenlauf/frontend/styles.css](C:/Users/andre/VSCode_Projects/stundenlauf/frontend/styles.css)

## Implementation Approach

1. **Add a reusable imported-runs matrix renderer in frontend state layer**
   - In `frontend/app.js`, replace the current list-focused model with a matrix model derived from existing category/event data.
   - Keep row granularity exactly as chosen:
     - Row 1: `Einzel`
     - Row 2: `Paare`
   - For each row, collect active `race_no` values into sets.

2. **Define dynamic Lauf columns with default floor of 5**
   - Compute `maxRaceNo` across both rows.
   - Compute `columnMax = max(5, maxRaceNo)`.
   - Render headers: `Lauf | 1 | 2 | 3 | ... | columnMax`.
   - This satisfies “default to 5 and extend if there is another run beyond”.

3. **Render `x` occupancy cells**
   - For each row and each race number column:
     - render `x` if race exists in that row set,
     - render empty marker (e.g. `-`) otherwise.
   - Keep content text-only (no interactive deletion behavior requested).

4. **Show the same matrix in both views**
   - `Aktuelle Wertung` sidebar section: replace the two hint lines with the matrix.
   - `Lauf hinzufügen` controls column: add matching “Importierte Läufe” card/section with the same matrix to ensure parity.

5. **Add lightweight styling for readability**
   - New CSS classes for a compact matrix table (small cells, centered markers, sticky header optional if needed).
   - Ensure it remains readable in existing sidebar widths and responsive breakpoints.

## Concrete Edits

- [C:/Users/andre/VSCode_Projects/stundenlauf/frontend/app.js](C:/Users/andre/VSCode_Projects/stundenlauf/frontend/app.js)
  - Replace/extend `buildImportedRaceInfo()` to include matrix-ready sets + `columnMax`.
  - Add helper rendering function (e.g. `renderImportedRunsMatrix(info)`).
  - Update `renderStandingsView()` sidebar markup to inject matrix HTML.
  - Update `renderImportView()` markup to include same matrix block.
  - Remove or reduce reliance on `raceListLabel(...)` where no longer used.

- [C:/Users/andre/VSCode_Projects/stundenlauf/frontend/styles.css](C:/Users/andre/VSCode_Projects/stundenlauf/frontend/styles.css)
  - Add styles for matrix container/table/cells, including compact header row and clear row labels.

## Risks / Assumptions

- Assumption: `x` is sufficient visual marker for imported run presence (no icon buttons or delete actions in this change).
- Risk: Sidebar width constraints may cause overflow with larger race counts.
  - Mitigation: wrap matrix in horizontal scroll (`overflow-x: auto`) while keeping labels readable.
- Risk: Duplicated rendering logic across views.
  - Mitigation: one shared renderer helper reused by both view templates.

## Test Plan

1. **Manual UI checks**
   - With no imports: table shows columns 1..5 and empty markers for both rows.
   - With races 1 and 2 only in Einzel: Einzel row has `x` in 1,2; Paare empty.
   - With Paare containing race 7: table extends to at least column 7.
   - Verify matrix appears in both `Aktuelle Wertung` and `Lauf hinzufügen`.

2. **Behavior checks after import/rollback**
   - Import new race updates matrix immediately after `loadOverview()`.
   - Rollback race removes corresponding `x` from appropriate row.

3. **Regression checks**
   - Category quick-select and standings tables still render unchanged.
   - Import review queue interaction remains unaffected.

## Documentation / Tracking Updates (after implementation)

- Add short outcome entry to [C:/Users/andre/VSCode_Projects/stundenlauf/docs/ACCOMPLISHMENTS.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/ACCOMPLISHMENTS.md).
- If this is treated as a scoped F05 UX improvement, add a brief progress note in [C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md](C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md) change log.