# F-TS06e: Legacy Layout Parity Page (Dev-only)

## Overview

- Feature ID: F-TS06e
- Parent feature: F-TS06
- Status: Done
- Related requirement(s): R8
- Related milestone(s): M-TS5
- Depends on: F-TS06a, F-TS06d

## Goal

Provide a dev-only page that reproduces the legacy Python frontend shell/layout baseline so layout and typography parity can be validated independently from production workflow wiring.

## Source references

- Legacy frontend baseline:
  - `frontend/index.html`
  - `frontend/styles.css`
  - `frontend/strings.js`
  - `frontend/app.js`
- TS implementation anchors:
  - `src/App.tsx`
  - `src/devtools/LegacyLayoutParityPage.tsx`
  - `src/theme.css`
  - `tests/ui/app-shell.test.tsx`

## Scope

### In scope

- Dev-only harness route via query param (`?harness=legacy-layout`), hidden from normal app navigation.
- Shell-level structural parity to legacy `index.html`:
  - Header and context row (`Saison`, `Prüfungen offen`)
  - Tabs affordance and right-aligned `Saison wechseln` action
  - Global status line position
  - Primary view containers: season entry, standings, import, history
- Namespaced CSS port of layout-critical rules from `frontend/styles.css`:
  - spacing tokens, font sizing baseline, shell grid, tabs, card and status surfaces
  - overflow/scroll containment to avoid clipped sections and overlap
  - responsive behavior around desktop and narrower breakpoints
- Static placeholder content only for visual verification.

### Out of scope

- Real store/domain wiring for season, standings, import, and history behavior.
- Production shell style replacement.
- Additional legacy modal/interaction parity beyond shell containers.

## Deliverables

- New devtools page component rendering legacy-like shell/layout containers.
- New harness gate in `App.tsx` for `?harness=legacy-layout`.
- Namespaced legacy parity CSS section in `theme.css`.
- UI tests covering harness routing and key shell container rendering.

## Acceptance criteria

- [x] `?harness=legacy-layout` renders a dedicated parity page in dev mode.
- [x] Page mirrors legacy shell container hierarchy and placement semantics.
- [x] Fonts/spacing/overflow behavior in parity page follows legacy baseline closely enough to prevent obvious overlap regressions.
- [x] Normal production app navigation remains unchanged.
- [x] UI tests cover harness routing and parity-shell structure.

## Risks and mitigations

- CSS leakage risk into production views.
  - Mitigation: strict `.legacy-parity` namespace on all imported parity rules.
- Parity drift from only partial rule port.
  - Mitigation: prioritize shell/layout/overflow and typography-critical selectors from `frontend/styles.css`.

## Test plan

- `tests/ui/app-shell.test.tsx`:
  - new test for dev harness route rendering parity page
  - assertions for title/tab labels and key layout containers
- Manual check in dev server with `?harness=legacy-layout` at desktop and narrower widths.
