# F-TS06b: Season, Standings, and History Workflows

## Overview

- Feature ID: F-TS06b
- Parent feature: F-TS06
- Status: Planned
- Related requirement(s): R2, R5, R8
- Related milestone(s): M-TS5
- Depends on: F-TS06a, F-TS01, F-TS04, F-TS05

## Goal

Implement the non-import workflow surfaces that users need to operate and inspect a season: season lifecycle actions, current standings views, and history/audit navigation.

This slice is intentionally focused on season/standings/history so import-review complexity stays isolated in F-TS06c.

## Scope

### In scope

- **Saison wechseln (season entry)**
  - List existing seasons
  - Create/open season
  - Reset/delete season with modal confirmations
  - Season import/export action surfaces wired to existing domain APIs (file-format internals stay in F-TS07/F-TS08)
- **Aktuelle Wertung**
  - Category quick-select grid
  - Imported runs matrix
  - Gesamtwertung table
  - Laufübersicht table with dynamic race columns
  - PDF export UI controls (generation internals remain F-TS08)
- **Korrektur flows in standings**
  - Identity correction mode and modal editor
  - Duplicate merge mode (survivor/absorbed selection + confirm modal)
- **Historie & Korrektur**
  - Import history list grouped by source batch
  - Audit timeline table rendering
  - Rollback action with modal confirmation

### Out of scope

- Import matching settings/review queue and per-row matching decisions (F-TS06c).
- New matching algorithm behavior (F-TS03/F-TS05 domain).
- Export file generation internals (F-TS08).

## Acceptance criteria

- [ ] Season list/create/open/reset/delete flows work from UI with clear German status feedback.
- [ ] Standings screen displays category grid, imported run matrix, standings table, and per-race table from live domain projections.
- [ ] Identity correction modal edits and persists expected fields.
- [ ] Duplicate merge flow supports pick survivor/pick absorbed/confirm execute.
- [ ] History screen shows grouped imports and audit rows with readable detail formatting.
- [ ] Rollback per source batch is available with confirmation modal and updates tables after completion.
- [ ] No `window.confirm()` / `window.prompt()` calls in these workflows.

## Architectural notes

- Keep state split by concern (`season`, `standings`, `history`, shared status) rather than one monolith.
- Keep complex table shaping in pure helpers (category model, imported runs matrix model, timeline grouping).
- Retain UX semantics from Python version unless there is an explicit migration reason.

## Risks and mitigations

- Risk: standings/history screens mix many projection outputs and become tightly coupled.
  - Mitigation: introduce typed view-model adapters between domain payloads and components.
- Risk: correction/merge actions trigger stale table views.
  - Mitigation: always reload/refresh overview projection after mutating actions.

## Implementation steps

1. Implement season entry view and action handlers.
2. Build standings page layout and category/race model adapters.
3. Wire standings correction and duplicate merge action flows.
4. Implement history/audit tables and rollback interaction.
5. Add component/integration tests around season + standings + history flows.

## Test plan

- Unit tests for pure adapters:
  - category quick-select model
  - imported runs matrix model
  - history grouping helpers
- Component tests for:
  - season create/open/reset/delete interactions
  - standings category switching and table rendering
  - correction/merge modal flows
  - history rollback confirmation path
- Integration test:
  - open season -> inspect standings/history -> apply correction/merge/rollback -> verify refreshed projections.

## Definition of done

- [ ] All season/standings/history workflows in this plan are functional and tested.
- [ ] Status/error paths are clear and German-localized.
- [ ] Import workflow remains delegated to F-TS06c (no scope creep).
