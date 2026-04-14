# F-TS06: UI Framework and German UI Shell (Umbrella)

## Overview

- Feature ID: F-TS06
- Feature name: UI framework and German shell migration umbrella
- Status: Planned
- Related requirement(s): R1, R2, R5, R6, R8
- Related milestone(s): M-TS5

## Why this split exists

The original `F-TS06` plan mixed framework setup, shell architecture, and all four major workflows in one document. That scope is too large for single-pass implementation planning and execution.

This umbrella keeps the architectural through-line and delegates implementation scope to three focused subplans that each fit comfortably into one work package/context window.

## Subplans

### F-TS06a — Foundation: app shell + German strings

File: `packages/stundenlauf-ts/docs/features/F-TS06a-ui-shell-layout-and-strings.md`

Focus:
- Framework baseline (React + Zustand + testing harness setup assumptions).
- Shell chrome (header, tabs, view container, global status line).
- Typed German string catalog + format helpers.
- Shared UI primitives and CSS token baseline.
- No domain-heavy workflows yet.

### F-TS06b — Season, standings, history workflows

File: `packages/stundenlauf-ts/docs/features/F-TS06b-season-standings-history-workflows.md`

Focus:
- Saison wechseln / season lifecycle screen.
- Aktuelle Wertung screen (category quick-select, standings, per-race table, imported-runs matrix).
- Historie & Korrektur screen baseline (timeline and rollback UX).
- Identity correction / duplicate merge flows in standings context.
- Deliberately excludes import matching review orchestration.

### F-TS06c — Import orchestration + matching review GUI

File: `packages/stundenlauf-ts/docs/features/F-TS06c-import-orchestration-matching-workflow.md`

Focus:
- Lauf import flow (`startImport` → `runMatching` → review queue → `resolveReviewEntry` → `finalizeImport`).
- Matching mode controls (Strikt/Fuzzy-Automatik/Manuell) and threshold behavior.
- Review queue rendering, candidate selection, and merge-correct affordances.
- Scope and acceptance criteria are grounded in the existing dev harness `?harness=import-season`.

### F-TS06d — Python GUI parity pass (layout + workflow)

File: `packages/stundenlauf-ts/docs/features/F-TS06d-python-gui-parity-pass.md`

Focus:
- Cross-check production TS GUI behavior against `frontend/` legacy behavior.
- Correct shell/layout/workflow drift with explicit `MATCH` / `DRIFT` / `DEFER` mapping.
- Land parity-sensitive tests and outcome tracking updates after implementation.

## Shared constraints across 06a/06b/06c

- Keep all user-facing text in German (R8).
- Remove pywebview bridge assumptions; use direct domain/store calls.
- Replace `window.confirm()` / `window.prompt()` with styled modal flows.
- Preserve proven UX semantics from Python unless intentionally changed and documented.
- Keep component logic testable (unit + component + integration where appropriate).

## Cross-feature dependencies

- Depends on: `F-TS01`, `F-TS04`, `F-TS05`
- Works alongside: `F-TS07` (season portability), `F-TS08` (export), `F-TS09` (deployment/PWA)

## Completion policy

`F-TS06` is considered complete when:

- `F-TS06a`, `F-TS06b`, and `F-TS06c` each meet their own acceptance criteria.
- Integration across the three slices produces the full M-TS5 GUI behavior.
- Project plan and accomplishments are updated with outcome-focused entries.
