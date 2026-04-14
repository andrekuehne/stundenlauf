# F-TS06a: UI Foundation - Shell Layout and German Strings

## Overview

- Feature ID: F-TS06a
- Parent feature: F-TS06
- Status: Done
- Related requirement(s): R8
- Related milestone(s): M-TS5

## Goal

Deliver the UI foundation layer: app shell, typed German copy/format helpers, and shared UI primitives. This package intentionally excludes heavy workflow logic so it can be implemented and validated quickly.

## Scope

### In scope

- App shell frame in `App.tsx`:
  - Header/title
  - Top-level tabs (Aktuelle Wertung, Lauf Importieren, Historie & Korrektur, Saison wechseln)
  - View routing/switching scaffold
  - Global status line surface
- Typed German string catalog module (port of `frontend/strings.js`) with dead/bridge-only strings removed.
- Formatting utilities (`formatKm`, `seasonLabel`, `reviewOpenCount`, confidence label helpers).
- Shared primitives used by later slices:
  - `StatusBar`
  - `ConfirmModal` base component
  - common button/table/form classes
- CSS/token baseline port (design tokens, global reset/base, reduced-motion baseline).
- Placeholder view containers for the 06b/06c feature slices.

### Out of scope

- Season/standings/history business workflows (F-TS06b).
- Import orchestration/review workflows (F-TS06c).
- PDF/Excel export generation details (F-TS08).
- Season ZIP portability internals (F-TS07).

## Deliverables

- `App.tsx` renders production shell (not harness-only fallback).
- New typed `strings` module is the single source of German UI text.
- Common formatting helpers exist and are unit-tested.
- Shared modal/status primitives exist and are reusable by 06b/06c.
- No pywebview bridge references in foundation files.

## Acceptance criteria

- [x] Shell renders with all planned tabs and status area in German.
- [x] Switching tabs changes active view region without full page reload.
- [x] All foundation-level UI text comes from typed catalog constants.
- [x] Removed dead/obsolete strings (`bridgeUnavailable`, `desktopApiUnavailable`, dead `tableRaces`).
- [x] Shared `ConfirmModal` supports title/body/confirm/cancel and keyboard-close behavior.
- [x] `prefers-reduced-motion` handling is active in baseline styles.
- [x] Unit tests cover formatting/string helper behavior.

## Implementation notes

- `App.tsx` now renders the production shell with tab state, view switching, and global `StatusBar`, while preserving existing dev harness query-param entry points.
- Foundation modules were implemented and wired:
  - typed catalog: `src/strings.ts`
  - format helpers: `src/format.ts`
  - status primitives: `src/stores/status.ts`, `src/components/shared/StatusBar.tsx`
  - modal primitive: `src/components/shared/ConfirmModal.tsx`
  - placeholder roots for 06b/06c: `src/components/{standings,import,history,season}/*.tsx`
  - baseline shell/styles + reduced motion: `src/theme.css`
- Added UI foundation tests:
  - `tests/format.test.ts`
  - `tests/ui/app-shell.test.tsx`
  - `tests/ui/status-bar.test.tsx`
  - `tests/ui/confirm-modal.test.tsx`

## Risks and assumptions

- Assumes React + Zustand remains the selected stack from F-TS06.
- Risk: if shell wiring drifts from upcoming view contracts, 06b/06c may need refactors.
  - Mitigation: keep view interface contracts minimal (props for status, active season id, and dispatch functions).

## Implementation steps

1. Create typed string catalog and helper type definitions.
2. Port baseline format helpers from Python `UIFormat`.
3. Build shell layout and tab switch state.
4. Add `StatusBar` and `ConfirmModal` primitives.
5. Port token/base CSS and reduced-motion behavior.
6. Add placeholder stubs for season/import/history/standings view roots.
7. Add unit/component tests for shell/text/helpers.

## Test plan

- Unit tests for formatting and string helper utilities.
- Component tests:
  - tab rendering and switching
  - status bar state rendering
  - confirm modal keyboard/click interactions
- Manual dev check: `npm run dev` renders shell without harness query params.

## Definition of done

- [x] Shell + strings + baseline primitives merged and test-covered.
- [x] No hardcoded German text in shell/primitives.
- [x] 06b and 06c can implement against stable shell contracts.
