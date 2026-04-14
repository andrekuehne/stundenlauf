# F-TS06d: Python GUI Parity Pass (Layout + Workflow)

## Overview

- Feature ID: F-TS06d
- Parent feature: F-TS06
- Status: Done
- Related requirement(s): R1, R2, R3, R4, R5, R6, R8
- Related milestone(s): M-TS5
- Depends on: F-TS06a, F-TS06b, F-TS06c

## Goal

Align the TS production GUI in `packages/stundenlauf-ts` with the hand-tuned legacy Python frontend behavior and layout from `frontend/` to reduce usability drift early.

## Source references

- Legacy baseline:
  - `frontend/index.html`
  - `frontend/app.js`
  - `frontend/strings.js`
  - `frontend/styles.css`
- TS implementation anchors:
  - `packages/stundenlauf-ts/src/App.tsx`
  - `packages/stundenlauf-ts/src/theme.css`
  - `packages/stundenlauf-ts/src/strings.ts`
  - `packages/stundenlauf-ts/src/components/standings/StandingsView.tsx`
  - `packages/stundenlauf-ts/src/components/import/ImportView.tsx`
  - `packages/stundenlauf-ts/src/components/season/SeasonEntryView.tsx`
  - `packages/stundenlauf-ts/src/components/history/HistoryView.tsx`

## Screen-by-screen parity checklist

Legend: `MATCH` = already aligned, `DRIFT` = behavior/layout mismatch to fix, `DEFER` = intentionally out of scope for this pass.

| Area | Legacy reference | TS reference | Status | Notes |
|---|---|---|---|---|
| Shell title + tab labels/order | `frontend/index.html`, `frontend/strings.js` | `src/App.tsx`, `src/strings.ts` | MATCH | Labels/order already aligned (`Aktuelle Wertung`, `Lauf Importieren`, `Historie & Korrektur`, `Saison wechseln`). |
| Header context (season + open review count) | `frontend/index.html#headerContext`, `frontend/app.js openSeason/loadOverview` | `src/App.tsx` | DRIFT | TS shell currently lacks visible header context row and wires review count as constant 0. |
| Saison wechseln tab visual separation | `frontend/styles.css .tab.subtle` | `src/theme.css` | DRIFT | Legacy places switch-season action at far right; TS shows all tabs equal. |
| Global status semantics | `frontend/app.js setStatus`, `frontend/styles.css .status-line` | `src/components/shared/StatusBar.tsx` | MATCH | Prefix/default semantics aligned (`Status:` + `Bereit`). |
| Standings category quick-select ordering | `frontend/app.js buildCategoryQuickSelectModel` | `src/components/standings/adapters.ts` | DRIFT | TS derives order from computed standings rather than fixed legacy slot order. |
| Standings correction/merge mode exclusivity | `frontend/app.js` toggle handlers | `src/stores/standings.ts`, `src/components/standings/StandingsView.tsx` | MATCH | One mode active at a time in TS store/view logic. |
| Standings a.W. merge constraints | `frontend/app.js` merge mode gating for a.W. | `src/components/standings/StandingsView.tsx` | DEFER | TS 06b does not yet expose per-entry a.W. toggles; not regressing existing TS scope. |
| Standings success/error status strings | `frontend/strings.js standings.*` | `src/components/standings/StandingsView.tsx`, `src/strings.ts` | DRIFT | Several messages remain inline in TS and should move into catalog. |
| Imported runs matrix semantics | `frontend/app.js renderImportedRunsMatrix` | `src/components/shared/ImportedRunsMatrix.tsx` | DRIFT | TS renders list table; legacy uses compact matrix affordance and slot logic. |
| Season entry action flow (create/open/reset/delete) | `frontend/app.js renderSeasonEntry` | `src/components/season/SeasonEntryView.tsx` | MATCH | Core workflow parity exists with modal confirmations replacing browser dialogs by design. |
| History grouped import rollback | `frontend/app.js renderHistoryView` | `src/components/history/adapters.ts`, `src/components/history/HistoryView.tsx` | DRIFT | TS rollback confirm/body and history row labels are simpler than legacy wording and count context. |
| Import screen layout (controls left, review right) | `frontend/styles.css .import-view-layout`, `frontend/app.js renderImportView` | `src/components/import/ImportView.tsx` | DRIFT | TS import tab is still placeholder. |
| Import matching mode controls + hints | `frontend/app.js renderImportView` + matching handlers | `src/components/import/*`, `src/stores/import.ts` | DRIFT | Planned in 06c; currently unimplemented in production view. |
| Import review queue progression + gating | `frontend/app.js reviewQueue/import guard` | `src/components/import/*`, `src/stores/import.ts` | DRIFT | Planned in 06c; currently unimplemented in production view. |
| String catalog centralization | `frontend/strings.js` | `src/strings.ts` + views | DRIFT | TS has catalog foundation but still contains inline UI strings in multiple view components. |

## Implementation acceptance checklist

- [x] Shell shows `Saison: ...` and dynamic `Prüfungen offen: N` in header (not only inside views).
- [x] Switch-season tab is visually separated to match legacy workflow affordance.
- [x] Import tab is fully functional and no longer placeholder.
- [x] Standings/import/history status and action copy are sourced from `src/strings.ts` (no hardcoded user text in views).
- [x] Parity-sensitive UI tests cover shell context, standings ordering semantics, history rollback copy, and import review gating.

## Risks

- Import parity work may accidentally change orchestration semantics from F-TS05 harness behavior.
- Category ordering parity may conflict with purely data-driven ordering if not explicitly encoded.
- Copy centralization can alter small UX phrasing if not cross-checked against legacy strings.

## Test strategy

- Unit tests for helper logic (category ordering, threshold clamping/capping, import draft inference).
- Component tests for shell context, standings controls, import workflow controls, review queue interactions.
- Integration test for import phase transition path (`startImport -> runMatching -> review -> finalize`) through store wiring.
