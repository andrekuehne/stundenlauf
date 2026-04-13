# F-TS06: UI Framework and German UI Shell

## Overview

- Feature ID: F-TS06
- Feature name: UI framework selection, app shell, German copy catalog, core workflow screens
- Owner: —
- Status: Planned
- Related requirement(s): R1, R2, R5, R6, R8
- Related milestone(s): M-TS5
- Python predecessor(s): `frontend/app.js` (2 762 lines), `frontend/strings.js`, `frontend/styles.css`, `frontend/index.html`; `backend/ui_api/` (bridge layer, eliminated in TS port)

## Problem Statement

The Python version's frontend is a monolithic vanilla-JS IIFE that communicates with the backend through a pywebview bridge. The code is functional and battle-tested, but years of iterative refinement have left it with:

- A single 2 762-line `app.js` that mixes rendering, state management, API plumbing, and event wiring.
- Full `innerHTML` re-renders with event listeners re-attached every cycle.
- Duplicate utility functions (`escapeHtml` defined twice at lines ~1097 and ~1522).
- Dead code (`formatEntityPreview` at line ~1530, never called).
- Heavy reliance on `window.confirm()` / `window.prompt()` for destructive actions instead of styled modals.
- File-system-centric workflows (`pick_file`, `pick_save_file`, filesystem paths) that do not translate to a browser context.
- No type safety, no component boundaries, no unit-testable render logic.

The TS port needs to rewrite the UI as a modern, componentized TypeScript application that calls the domain layer directly (no bridge), uses browser-native file APIs, and preserves the proven workflow and visual language of the existing app.

## Current Frontend Audit

### File inventory

| File | Lines | Role |
|---|---|---|
| `index.html` | 55 | Static shell: header, tab nav, view containers, identity correction modal |
| `strings.js` | 376 | German string catalog (`UIStrings`) + formatting helpers (`UIFormat`) |
| `styles.css` | 1 211 | Full design system: CSS variables, layout grids, component styles, responsive breakpoints, reduced-motion |
| `app.js` | 2 762 | All application logic: state, rendering, event wiring, API calls |

### Screens and sections in `app.js`

The app has four top-level screens, each rendered by a dedicated function. The following table maps every major section to its source location and porting disposition.

#### Screen 1: Season Entry (`seasonEntryView`)

| Section | Lines | Keep / Change | Notes |
|---|---|---|---|
| `renderSeasonEntry(items)` | 248–498 | **Keep structure, change I/O** | Grid of existing seasons + create/import form. Layout and UX are solid. |
| Season list table with coverage matrix | 277–295 | **Keep** | Banded table with inline `renderImportedRunsMatrix`. |
| Open / Export / Reset / Delete buttons | 325–413 | **Change** | Currently calls `api("pick_save_file", …)` for export (filesystem dialog), `api("delete_series_year", …)`, etc. Replace with domain calls + browser download. |
| Delete confirmation (double prompt) | 332–357 | **Improve** | Uses `window.confirm()` → `window.prompt()` chain. Replace with a styled confirmation modal. |
| Reset confirmation (double prompt) | 359–388 | **Improve** | Same pattern; replace with modal. |
| Export season | 390–413 | **Change** | `pick_save_file` + `export_series_year` → generate ZIP in-memory, trigger browser download via blob URL. |
| Create season form | 414–430 | **Keep** | Simple year + name inputs; create → open → switch to import. |
| Import season from file | 431–498 | **Change** | `pick_file("season_export")` → `<input type="file" accept=".zip">`. Conflict resolution flow (re-prompt loops) should use modals instead of nested `confirm`/`prompt`. |

#### Screen 2: Standings View (`viewStandings`)

| Section | Lines | Keep / Change | Notes |
|---|---|---|---|
| `renderStandingsView()` | 810–1095 | **Keep layout, componentize** | Two-column grid: sidebar (imported runs, category grid, PDF export) + content (standings table, per-race table). |
| Category quick-select model | 587–648 | **Keep logic** | `buildCategoryQuickSelectModel()` maps categories to a 2×N grid of Einzel/Paare buttons. Good design pattern; port as a pure function. |
| Imported runs matrix | 650–724 | **Keep** | `buildImportedRaceInfo()` + `renderImportedRunsMatrix()`. Reusable in sidebar and season entry. Port as component. |
| Standings table (Gesamtwertung) | 900–1023 | **Keep** | Standard banded table with Platz/Name/Jahrgang/Verein/Distanz/Punkte columns. |
| Per-race results table (Laufübersicht) | 944–1043 | **Keep** | Dynamic race-header columns, `a.W.` checkbox, merge-mode row highlighting. |
| PDF export sidebar block | 1106–1129 | **Change** | `renderPdfExportSidebarBlock()` with layout preset `<select>`. Currently calls `api("pick_save_file")` + `api("export_standings_pdf")`. Replace with client-side PDF generation (jsPDF/pdfmake) + blob download. |
| PDF layout preset localStorage sync | 736–757 | **Keep** | `syncPdfLayoutPresetFromStorage()` — persistence via `localStorage` is fine for browser. |
| Scroll position preservation | 884–895, 1080–1094 | **Keep concept** | Saves/restores scroll offsets across re-renders. A reactive framework may handle this differently (key-based reconciliation), but the intent should be preserved. |
| Identity correction mode | 1131–1315 | **Keep workflow, componentize** | Toggle mode → click row → open modal → edit name/yob/club → save. Good UX. Port modal as a proper component with form validation. |
| Identity modal body builder | 1164–1204 | **Keep structure** | `buildIdentityModalBodyHtml()` — participant single-field form vs. team A/B dual-block form. Port as typed form component. |
| `identityYobBounds()` | 1131–1133 | **Keep** | `{ min: 1900, max: currentYear + 1 }`. Pure utility. |
| Duplicate merge mode | 1337–1453 | **Keep workflow, improve** | Toggle → pick survivor → pick absorbed → confirm → execute. Visual highlighting with green/red inset borders. Replace `window.confirm()` with styled modal. |
| `wireStandingsPdfExport()` | 759–808 | **Change** | Replace `api("pick_save_file")` + `api("export_standings_pdf")` with client-side generation. |
| `escapeHtml()` (first definition) | 1097–1104 | **Keep one, delete duplicate** | Standard HTML escaper. Port once as a utility. The duplicate at line 1522–1528 must not be carried over. |

#### Screen 3: Import View (`viewImport`)

| Section | Lines | Keep / Change | Notes |
|---|---|---|---|
| `renderImportView()` | 2024–2538 | **Keep layout, componentize** | Two-column grid: controls sidebar + review panel. |
| File picker controls | 2080–2086 | **Change** | Currently `api("pick_file")` → filesystem path. Replace with `<input type="file" accept=".xlsx,.xls">`. |
| Filename inference | 1461–1520 | **Keep logic** | `basenameFromPath()`, `inferImportRaceNoFromBasename()`, `inferImportSourceTypeFromBasename()`. These parse the filename to auto-detect singles/couples and race number. `basenameFromPath()` path-separator logic is unnecessary (File API gives `file.name` directly), but the regex inference is reusable. |
| Type toggle (Einzel / Paare) | 2087–2089 | **Keep** | Two-button toggle with `.import-type-btn-active`. |
| Race number select | 2091–2097 | **Keep** | Dropdown populated from `importedRaceInfo.raceColumns`. |
| Import button with readiness guard | 2098–2099 | **Keep** | `isImportReady()` enables/disables. Import blocked while reviews open. |
| Matching settings collapsible panel | 2101–2147 | **Keep UX, componentize** | Tri-mode tabs (Strikt / Fuzzy / Manuell), fuzzy sub-tabs (100% / Schwelle), threshold sliders. Complex but well-designed. Port as a self-contained settings component. |
| Matching threshold range+number sync | 2302–2401 | **Keep logic** | Bidirectional sync between `<input type="range">` and `<input type="number">`, plus `capReviewMinForConfig` clamping. Port as a controlled component. |
| Review queue panel | 2149–2187 | **Keep** | Progress counter, hint text, confidence display, action buttons, unified review table. |
| Review candidate table | 1971–2022 | **Keep** | `renderCandidateTableRows()` — unified table with incoming row (blue), candidates below, diff highlighting (red cells), selection state (green row). Core UX. |
| Merge & correct modal | 1682–1910 | **Keep workflow** | Side-by-side incoming vs. existing comparison + editable fields. Opens identity modal with extra compare block. |
| `buildApplyMatchLinkPayload()` | 1578–1588 | **Keep logic** | Constructs API payload for match decisions (participant vs. team). Port as domain call builder. |
| Review selection state | 1574–1577, 2462–2483 | **Keep** | Per-review candidate selection tracking with keyboard navigation. |
| `confidenceLabel()` / `confidencePercent()` | 1556–1572 | **Keep** | Thresholds: ≥85% high, ≥65% medium, else low. Port as utility. |
| Diff highlighting helpers | 1657–1670 | **Keep** | `normalizeForDiff()`, `nameDiffClass()`, `clubDiffClass()`. |
| Granular review display rendering | 1912–1956 | **Keep** | `renderMergeNameYobHtmlFromDisplay()`, `renderMergeClubHtmlFromDisplay()` — per-segment diff with `<span class="merge-diff-part">`. Server-provided diff structure; in TS port this comes from the matching engine directly. |

#### Screen 4: History View (`viewHistory`)

| Section | Lines | Keep / Change | Notes |
|---|---|---|---|
| `renderHistoryView()` | 2632–2756 | **Keep layout, componentize** | Two cards: import history table + audit trail table. |
| Import grouping by source SHA-256 | 2646–2673 | **Keep logic** | Groups race_import timeline items by file hash. Port as a pure function. |
| Rollback button per source batch | 2733–2755 | **Keep** | `api("rollback_source_batch")`. Replace `window.confirm()` with modal. |
| Audit trail rendering | 2541–2630 | **Keep** | `formatHistoryAuditDetail()` — rich HTML for merge/correction audit entries. Complex but necessary. |

### Cross-cutting code in `app.js`

| Section | Lines | Keep / Change | Notes |
|---|---|---|---|
| `api(method, payload)` | 106–118 | **Eliminate** | pywebview bridge wrapper. In TS port, UI calls domain functions directly. |
| `waitForBridge()` / `waitForPywebviewReadyEvent()` | 121–148 | **Eliminate** | pywebview bootstrap. Not needed. |
| `setStatus(text, isError)` | 150–155 | **Keep concept, improve** | Global status bar. Port as a reactive status store or toast system. |
| `state` object | 49–75 | **Port as typed store** | Currently a plain mutable object. Port as a typed reactive store (framework signals, Zustand, or similar). |
| `requestCounter` / `lastStandingsRows` | 77–79 | **Eliminate / internalize** | `requestCounter` was for bridge request IDs; `lastStandingsRows` is a workaround for innerHTML rendering (needed to map click index to data). A proper component model eliminates this. |
| `clampAutoMin()` / `clampReviewMin()` / `capReviewMinForConfig()` | 157–186 | **Keep** | Matching config clamping logic. Pure functions, port directly. |
| `effectiveAutoMinForMatchingCap()` | 173–181 | **Keep** | Derives effective auto-min from config flags. |
| `loadMatchingConfig()` / `saveMatchingConfig()` | 188–235 | **Change** | Currently `api("get_matching_config")` / `api("set_matching_config")`. Replace with domain store reads/writes. |
| `getApiErrorMessage()` | 237–246 | **Change** | Error code mapping. In TS port, domain errors are typed directly; this becomes a simple error-to-string mapper. |
| `loadOverview()` | 557–570 | **Change** | `api("get_year_overview")` → domain query. Triggers parallel render of all three views. |
| `switchView(viewName)` | 726–734 | **Keep** | Tab switching via class toggles. Framework routing or conditional rendering replaces this. |
| `durationSortKey()` / `normalizeDivision()` | 572–585 | **Keep** | Category sorting helpers. Pure functions. |
| `openSeason()` / `showSeasonEntry()` | 501–555 | **Keep flow, change I/O** | Season open/close lifecycle. Replace bridge calls with domain calls. |
| `resetImportDraft()` | 1455–1459 | **Keep** | Clears import form state. |
| `formatIncomingWertung()` | 1645–1655 | **Keep** | Formats distance/points for review table cell. |
| `teamPreviewToTeamMembers()` | 1672–1680 | **Keep** | Adapts team preview to member array for modal. |

### Dead code to discard

| Item | Location | Disposition |
|---|---|---|
| `formatEntityPreview()` | `app.js` ~1530–1543 | Dead; never called. Do not port. |
| Duplicate `escapeHtml()` | `app.js` ~1522–1528 | Shadows the first definition at ~1097. Port only one copy. |
| `UIStrings.seasonEntry.tableRaces` | `strings.js` line 70 | String `"Läufe"` never referenced. Do not port. |

### `strings.js` audit

| Section | Status | Notes |
|---|---|---|
| `shell` | **Keep** | App title, tab labels, season/review placeholders. |
| `status` | **Keep** | All status-bar messages are actively used. |
| `errors` | **Change** | `bridgeUnavailable` and `desktopApiUnavailable` are obsolete (no bridge). Replace with generic error messages or remove. |
| `seasonEntry` | **Keep** | Full season-management string catalog. Actively used. |
| `overview` | **Keep** | Single string; used. |
| `categorySlots` | **Keep** | Category grid labels. |
| `matrix` | **Keep** | Run matrix labels. |
| `standings` | **Keep** | All standings, identity, merge strings. Actively used. |
| `units` | **Keep** | km/point formatting. |
| `importView` | **Keep** | Full import/review string catalog. |
| `preview` | **Keep** | Preview formatting. |
| `confidence` | **Keep** | Confidence labels. |
| `reviewTable` | **Keep** | Single string; used. |
| `history` | **Keep** | Full history/audit trail strings. |
| `UIFormat` helpers | **Keep** | `seasonLabel()`, `reviewOpenCount()`, `reviewConfidenceHtml()`, `formatKm()`. |

### `styles.css` audit

| Section | Lines | Status | Notes |
|---|---|---|---|
| CSS custom properties (`:root`) | 1–14 | **Keep** | Design tokens: colors, spacing, font sizes. |
| Base reset and body | 16–28 | **Keep** | Standard box-sizing + body setup. |
| App grid shell | 30–61 | **Keep** | `100vh` grid with header + main. |
| Tab navigation | 93–131 | **Keep** | Horizontal tab bar with active state. |
| Status line | 132–155 | **Keep** | Bottom status bar. |
| Shell view grid | 145–168 | **Keep** | Three-row grid: tabs, view, status. |
| Button styles (primary/secondary/danger) | 171–215 | **Keep** | Consistent button system with press feedback. |
| Form inputs | 217–242 | **Keep** | Input/select/textarea base + checkbox/range overrides. |
| Table styles | 244–273 | **Keep** | Base table + sticky header + banded rows. |
| Imported runs matrix | 280–350 | **Keep** | Compact and normal matrix variants. |
| Standings layout | 352–457 | **Keep** | Sidebar + content grid, category quick-select grid. |
| Season entry layout | 472–519 | **Keep** | Two-column season management grid. |
| Review/merge table | 521–620 | **Keep** | Incoming row highlight, diff cells, candidate row styles. |
| Import view layout | 622–720 | **Keep** | Controls sidebar + review column grid. |
| Matching settings panel | 722–858 | **Keep** | Collapsible panel, mode tabs, threshold grid. |
| Modal styles | 860–963 | **Keep** | Backdrop, dialog, header/body/footer, icon button. |
| Identity field grid | 946–980 | **Keep** | Form layout for identity correction modal. |
| Import merge-correct compare | 982–1010 | **Keep** | Side-by-side comparison layout. |
| Standings mode banners & merge panel | 1026–1082 | **Keep** | Correction/merge mode indicators, pick highlights. |
| History audit detail | 1128–1149 | **Keep** | Audit trail cell formatting. |
| `@media (prefers-reduced-motion)` | 1151–1173 | **Keep** | Accessibility: disables transitions. |
| `@media (max-width: 1200px)` | 1176–1200 | **Keep** | Responsive: collapse grids to single column. |
| `@media (max-width: 980px)` | 1202–1210 | **Keep** | Responsive: collapse season entry grid. |

**CSS verdict:** The stylesheet is clean, well-structured, and actively used. It can be ported almost entirely. Convert CSS custom properties to the chosen framework's theming approach if desired, otherwise use as-is.

---

## Scope

### In Scope

- UI framework decision and initial project setup (Vite + framework).
- App shell: header, tab navigation, view routing, global status bar.
- German string catalog as a typed constant module (porting `strings.js`).
- Formatting utilities (`formatKm`, `seasonLabel`, `reviewOpenCount`, `reviewConfidenceHtml`).
- Component decomposition for all four screens (season entry, standings, import, history).
- State management architecture (typed reactive store replacing the `state` object).
- CSS porting: design tokens, component styles, responsive breakpoints, reduced-motion.
- Replacement of pywebview bridge calls with direct domain function calls.
- Replacement of filesystem dialogs with browser File API (`<input type="file">`, `URL.createObjectURL`, download links).
- Replacement of `window.confirm()` / `window.prompt()` with styled confirmation modals.
- Removal of all identified dead code and duplicate definitions.
- Accessibility baseline: ARIA attributes, keyboard navigation, focus management for modals.

### Out of Scope

- Domain logic implementation (F-TS01 through F-TS05 cover event store, parsing, matching, ranking, orchestration).
- Client-side PDF generation internals (F-TS08).
- Client-side Excel export (F-TS08).
- Season ZIP export/import file format (F-TS07).
- PWA service worker, offline caching, GitHub Pages deployment (F-TS09).
- Dark mode or theme switching (not present in Python version; defer to polish phase).
- Multi-language support (German only per R8; no i18n framework needed).
- Mobile-first responsive redesign (existing responsive breakpoints are sufficient).

## Acceptance Criteria

- [ ] A UI framework is selected and documented with rationale.
- [ ] The app shell renders: header with title, tab navigation (Aktuelle Wertung / Import / Historie & Korrektur / Saison wechseln), global status bar.
- [ ] All German user-facing strings are in a typed string catalog module; no hardcoded German text in component code.
- [ ] Season entry screen: list seasons, create, open, delete (with modal confirmation), reset (with modal confirmation), import from file upload, export as download.
- [ ] Standings screen: category quick-select grid, imported runs matrix, standings table, per-race results table with race-header columns.
- [ ] Standings identity correction: toggle mode, click row, edit in modal, save.
- [ ] Standings duplicate merge: toggle mode, pick survivor/absorbed, confirm in modal, execute.
- [ ] Standings PDF export: layout preset selector, generate + download.
- [ ] Import screen: file upload via browser input, auto-infer type/race-no from filename, type toggle, race-number select, import button with readiness guard.
- [ ] Import matching settings: collapsible panel with strict/fuzzy/manual mode tabs, fuzzy sub-tabs, threshold sliders with bidirectional sync.
- [ ] Import review queue: progress counter, incoming row + candidate rows with diff highlighting, candidate selection, accept/new-identity/merge-correct actions.
- [ ] Import merge-correct modal: side-by-side comparison + editable fields for the existing identity.
- [ ] History screen: grouped import table with rollback (modal confirmation), audit trail table with rich detail rendering.
- [ ] No `window.confirm()` or `window.prompt()` — all destructive-action confirmations use styled modal dialogs.
- [ ] No pywebview bridge references — all domain interaction is direct function calls.
- [ ] No dead code carried over from the Python frontend.
- [ ] Responsive layout collapses gracefully at ≤ 1200px and ≤ 980px.
- [ ] `prefers-reduced-motion` disables all transitions.
- [ ] All components are individually testable (render + interaction tests via Vitest + testing library).

---

## Technical Plan

### 1. Framework Decision

The technology stack table in `PROJECT_PLAN.md` lists the UI framework as TBD. This section proposes criteria and a recommendation.

**Criteria:**

| Criterion | Weight | Notes |
|---|---|---|
| Bundle size | Medium | Static site; initial load matters. |
| TypeScript support | High | Strict types for all props, state, events. |
| Learning curve / team familiarity | High | Solo developer; minimize ramp-up. |
| Ecosystem (testing, routing, devtools) | Medium | Need Vitest integration, basic devtools. |
| Reactivity model | High | Fine-grained reactivity avoids full re-renders (current pain point). |
| Component model | High | Clean decomposition of the 2 762-line monolith. |

**Decision: React + Zustand**

- **React** is the industry-standard component framework. For a solo developer without prior framework experience, this is the safest choice: the most tutorials, the most Stack Overflow answers, the best AI-assisted coding support, and the most battle-tested tooling.
- **Zustand** (1 KB) for state management. It works like a typed version of the existing mutable `state` object — define a store with state and actions, consume it in components via hooks. Dramatically simpler than Redux while covering everything this app needs.
- **Vite** provides the dev server and build pipeline. `@vitejs/plugin-react` gives Fast Refresh during development.
- **Vitest + `@testing-library/react`** for component tests — the best-documented testing setup in the React ecosystem.
- Bundle size (~40 KB for React) is a non-issue: users load the app once and use it for extended sessions. This is not a landing page where every kilobyte matters.

**Alternatives considered:**
- *Preact + Signals*: 3 KB bundle, React-compatible API. Rejected because the bundle savings are irrelevant for this use case, and the smaller ecosystem means fewer resources when debugging edge cases.
- *Svelte*: Smallest output, excellent reactivity, but a different mental model from standard JS/TS, less mature TypeScript support for component props, and significantly less training data for AI assistants.
- *Vanilla TS + Lit*: Closest to the existing code, but would essentially require building a mini-framework for state management, making the current monolith problem harder to solve cleanly.

The concrete stack:

| Concern | Library | Version constraint |
|---|---|---|
| UI framework | `react` + `react-dom` | ^18 or ^19 (latest stable) |
| State management | `zustand` | ^5 |
| Build | `vite` + `@vitejs/plugin-react` | latest |
| Testing | `vitest` + `@testing-library/react` + `jsdom` | latest |
| Linting | `eslint` + `prettier` | latest |

### 2. App Shell Architecture

```
src/
  main.ts                    # Entry point; mounts app
  App.tsx                    # Shell: header, tab nav, view router, status bar
  strings.ts                 # Typed German string catalog (port of strings.js)
  format.ts                  # Formatting utilities (formatKm, seasonLabel, etc.)
  theme.css                  # CSS custom properties (port of :root block)
  components/
    shared/
      ConfirmModal.tsx       # Replaces window.confirm / window.prompt
      StatusBar.tsx          # Global status line
      ImportedRunsMatrix.tsx # Reusable matrix component
      CategoryGrid.tsx       # Einzel / Paare quick-select grid
    season/
      SeasonEntryView.tsx    # Season list + create/import form
      SeasonRow.tsx          # Single season row with action buttons
    standings/
      StandingsView.tsx      # Layout wrapper: sidebar + content
      StandingsSidebar.tsx   # Imported runs, category grid, PDF export
      StandingsTable.tsx     # Gesamtwertung table
      PerRaceTable.tsx       # Laufübersicht with dynamic columns
      IdentityModal.tsx      # Correction modal for participant/team
      MergePanel.tsx         # Duplicate merge controls and state
    import/
      ImportView.tsx         # Layout wrapper: controls + review
      ImportControls.tsx     # File input, type toggle, race select, import button
      MatchingSettings.tsx   # Collapsible panel with mode tabs and thresholds
      ReviewPanel.tsx        # Review queue display
      ReviewTable.tsx        # Incoming + candidate rows with diff
      MergeCorrectModal.tsx  # Side-by-side compare + edit modal
    history/
      HistoryView.tsx        # Layout wrapper: imports + audit trail
      ImportHistoryTable.tsx # Grouped import rows with rollback
      AuditTrailTable.tsx    # Correction/merge audit entries
  stores/
    season.ts               # Active season state (year, categories, race history)
    standings.ts            # Selected category, correction mode, merge mode
    import.ts               # Import draft state, review queue, matching config
    status.ts               # Global status messages
  domain/                   # Domain interface types (consumed from F-TS01..F-TS05)
    types.ts                # Re-exported domain types for UI consumption
```

### 3. State Management (Zustand)

Port the current `state` object (lines 49–75) to Zustand stores. Each store is a `create()` call that returns a hook; components subscribe to exactly the slices they need, so only affected components re-render.

```typescript
// stores/season.ts
import { create } from 'zustand';

interface SeasonState {
  seriesYear: number | null;
  categories: Category[];
  raceHistoryGroups: RaceHistoryGroup[];
  openSeason: (year: number) => Promise<void>;
  loadOverview: () => Promise<void>;
}

export const useSeasonStore = create<SeasonState>()((set, get) => ({
  seriesYear: null,
  categories: [],
  raceHistoryGroups: [],
  openSeason: async (year) => { /* domain call, then set(...) */ },
  loadOverview: async () => { /* domain query, then set(...) */ },
}));
```

```typescript
// stores/standings.ts
interface StandingsState {
  selectedCategory: string;
  correctionMode: boolean;
  mergeMode: boolean;
  mergeSurvivor: MergePick | null;
  mergeAbsorbed: MergePick | null;
  pdfLayoutPresetId: string;
  pdfLayoutPresets: PdfLayoutPreset[] | null;
  selectCategory: (key: string) => void;
  toggleCorrectionMode: () => void;
  toggleMergeMode: () => void;
  pickMergeTarget: (pick: MergePick) => void;
  resetMergePicks: () => void;
}

export const useStandingsStore = create<StandingsState>()(/* ... */);
```

```typescript
// stores/import.ts
interface ImportState {
  file: File | null;          // browser File object (replaces filesystem path)
  fileName: string;           // file.name for display
  sourceType: '' | 'singles' | 'couples';
  raceNo: number | null;
  matchingConfig: MatchingConfig;
  matchingSettingsExpanded: boolean;
  reviewQueue: ReviewItem[];
  reviewIndex: number;
  reviewSelections: Record<string, string>;
  setFile: (file: File) => void;
  resetDraft: () => void;
}

export const useImportStore = create<ImportState>()(/* ... */);
```

```typescript
// stores/status.ts
interface StatusState {
  message: string;
  isError: boolean;
  setStatus: (message: string, isError?: boolean) => void;
  clearStatus: () => void;
}

export const useStatusStore = create<StatusState>()(/* ... */);
```

Components consume stores via hooks with selectors for minimal re-renders:

```typescript
// In a component:
const year = useSeasonStore((s) => s.seriesYear);
const setStatus = useStatusStore((s) => s.setStatus);
```
```

### 4. Bridge Elimination

Every `api(method, payload)` call maps to a domain function. The mapping:

| Bridge method | Domain replacement | Notes |
|---|---|---|
| `list_series_years` | `seasonStore.listSeasons()` | Query over IndexedDB |
| `create_series_year` | `commandBus.dispatch(createSeason(...))` | Event-sourced command |
| `open_series_year` | `seasonStore.loadSeason(year)` | Hydrate from event log |
| `delete_series_year` | `commandBus.dispatch(deleteSeason(...))` | With double confirmation |
| `reset_series_year` | `commandBus.dispatch(resetSeason(...))` | Clears events for year |
| `export_series_year` | `seasonExport.toZip(year)` → blob download | F-TS07 |
| `import_series_year` | `seasonImport.fromZip(file)` | F-TS07 |
| `get_year_overview` | `queries.yearOverview(year)` | Derived from season state |
| `get_matching_config` | `importStore.matchingConfig` | In-memory config |
| `set_matching_config` | `importStore.updateMatchingConfig(...)` | Persisted to IndexedDB |
| `get_standings` | `queries.standings(categoryKey)` | F-TS04 derived view |
| `get_category_current_results_table` | `queries.categoryResults(categoryKey)` | F-TS04 derived view |
| `get_review_queue` | `importOrchestrator.reviewQueue()` | F-TS05 staging |
| `apply_match_decision` | `importOrchestrator.resolveReview(...)` | F-TS05 |
| `import_race` | `importOrchestrator.importFile(...)` | F-TS05 |
| `pick_file` / `pick_save_file` | `<input type="file">` / blob download | Browser native |
| `rollback_source_batch` | `commandBus.dispatch(rollbackBatch(...))` | Event-sourced |
| `update_participant_identity` | `commandBus.dispatch(correctIdentity(...))` | Event-sourced |
| `merge_standings_entities` | `commandBus.dispatch(mergeEntities(...))` | Event-sourced |
| `set_ranking_eligibility` | `commandBus.dispatch(setEligibility(...))` | Event-sourced |
| `list_pdf_export_layout_presets` | `pdfExport.listPresets()` | F-TS08 |
| `export_standings_pdf` | `pdfExport.generate(...)` → blob download | F-TS08 |
| `get_year_timeline` | `queries.yearTimeline(year, limit)` | Derived from event log |

### 5. File API Migration

| Python pattern | Browser replacement |
|---|---|
| `api("pick_file", {})` → filesystem path string | `<input type="file" accept=".xlsx,.xls">` → `File` object |
| `api("pick_file", { kind: "season_export" })` | `<input type="file" accept=".zip">` → `File` object |
| `api("pick_save_file", { suggested_name })` | Generate blob → `URL.createObjectURL(blob)` → `<a download="name">` click |
| `basenameFromPath(path)` with `\` and `/` splitting | `file.name` directly from `File` object |
| `state.importFilePath` (filesystem path string) | `state.file: File | null` + `state.fileName: string` |

### 6. Confirmation Modal Migration

All six `window.confirm()` / `window.prompt()` call sites need a styled `<ConfirmModal>`:

| Call site | Current UX | Replacement |
|---|---|---|
| Delete season (line 334) | `confirm()` → `prompt()` for year | Modal with warning text + year input + confirm/cancel buttons |
| Reset season (line 365) | `confirm()` → `prompt()` for year | Same pattern |
| Rollback source batch (line 2738) | `confirm()` with race count | Modal with warning text + confirm/cancel |
| Merge entities (line 1388) | `confirm()` with names | Modal with survivor/absorbed preview + confirm/cancel |
| Season import conflict (lines 445–488) | Nested `confirm()` + `prompt()` chain | Multi-step modal: "Import as new year?" → year input → confirm |
| Season import replace (lines 462–487) | `confirm()` → `prompt()` → `prompt()` | Multi-step modal with replace confirmation |

### 7. German String Catalog

Port `strings.js` as a TypeScript module with full type safety:

```typescript
// strings.ts — typed string catalog
export const STR = {
  shell: {
    appTitle: 'HSG Uni Greifswald Triathlon Laufgruppe - Stundenlauf-Auswertung',
    tabStandings: 'Aktuelle Wertung',
    tabImport: 'Lauf Importieren',
    tabHistory: 'Historie & Korrektur',
    switchSeason: 'Saison wechseln',
    // ...
  },
  // ... all sections
} as const satisfies UIStringCatalog;
```

Changes from Python version:
- Remove `errors.bridgeUnavailable` — no bridge.
- Remove `errors.desktopApiUnavailable` — no desktop API.
- Remove `seasonEntry.tableRaces` — dead string.
- Replace `seasonEntry.exportPickFailed` / `seasonEntry.importPickFailed` — no filesystem picker failures; file input always succeeds or user cancels.
- Add generic file-handling error messages for browser context.

### 8. CSS Porting Strategy

The existing `styles.css` is 1 211 lines of well-structured CSS with no dead rules. Porting approach:

1. **Extract CSS custom properties** into `theme.css` (or framework theme config).
2. **Keep component styles** as CSS modules or scoped styles, depending on framework choice.
3. **Keep responsive breakpoints** at 1200px and 980px.
4. **Keep `prefers-reduced-motion`** media query.
5. **Remove pywebview-specific workarounds** if any exist (none identified in audit).
6. **Add focus-visible styles** where missing for keyboard-only users.

---

## Mapping from Python Implementation

### Python approach

- Single `app.js` IIFE with all logic.
- `strings.js` as a separate `<script>` tag exposing `window.UIStrings`.
- Communication through `window.pywebview.api.invoke()`.
- Full `innerHTML` re-renders; event listeners re-attached per render.
- Mutable `state` object accessed by closure.

### TS port differences

- Component-based architecture with typed props and state.
- Reactive rendering: only changed parts re-render.
- Direct domain function calls; no serialization boundary.
- Browser File API instead of filesystem dialogs.
- Typed string catalog imported as a module.
- Styled modals replace `window.confirm()` / `window.prompt()`.

### Reusable logic (port directly)

These pure functions from `app.js` can be ported with minimal changes:

| Function | Lines | Port as |
|---|---|---|
| `clampAutoMin(value)` | 157–163 | `clampAutoMin(value: number): number` |
| `clampReviewMin(value)` | 165–171 | `clampReviewMin(value: number): number` |
| `effectiveAutoMinForMatchingCap(cfg)` | 173–181 | `effectiveAutoMinForMatchingCap(cfg: MatchingConfig): number` |
| `capReviewMinForConfig(reviewMin, cfg)` | 183–186 | `capReviewMinForConfig(reviewMin: number, cfg: MatchingConfig): number` |
| `durationSortKey(duration)` | 572–581 | `durationSortKey(duration: string): number` |
| `normalizeDivision(division)` | 583–585 | `normalizeDivision(division: string): string` |
| `buildCategoryQuickSelectModel()` | 587–648 | `buildCategoryQuickSelectModel(categories, selected): QuickSelectModel` |
| `buildImportedRaceInfo()` | 650–698 | `buildImportedRaceInfo(categories, raceHistoryGroups): ImportedRaceInfo` |
| `inferImportRaceNoFromBasename(name)` | 1470–1483 | `inferRaceNoFromFilename(name: string): number \| null` |
| `inferImportSourceTypeFromBasename(name)` | 1485–1488 | `inferSourceTypeFromFilename(name: string): 'singles' \| 'couples'` |
| `identityYobBounds()` | 1131–1133 | `identityYobBounds(): { min: number; max: number }` |
| `confidenceLabel(confidence)` | 1556–1566 | `confidenceLabel(value: number): string` |
| `confidencePercent(confidence)` | 1568–1572 | `confidencePercent(value: number): number` |
| `normalizeForDiff(val)` | 1657–1660 | `normalizeForDiff(val: unknown): string` |
| `formatKm(value)` | strings.js 7–13 | `formatKm(value: number): string` |

---

## Risks and Assumptions

- **Assumption:** A component framework (Preact/React/Svelte) will be chosen. If vanilla TS is preferred, the component decomposition still applies but the implementation details differ.
- **Assumption:** Domain types from F-TS01 through F-TS05 will be available as importable TypeScript interfaces by the time UI implementation starts.
- **Risk:** The matching settings panel (strict/fuzzy/manual with sub-tabs and threshold sync) is the most complex UI component. Regression risk during port.
  - Mitigation: Comprehensive component tests for all mode transitions and threshold clamping.
- **Risk:** Review table diff highlighting depends on backend-computed `candidate_review_displays` structure. The TS domain layer may produce a different shape.
  - Mitigation: Define a stable `ReviewDisplay` interface in F-TS05 that the UI consumes.
- **Risk:** PDF generation quality may differ from Python's ReportLab output.
  - Mitigation: Deferred to F-TS08; this feature only provides the UI trigger.

## Implementation Steps

1. **Framework setup** — Initialize Vite + chosen framework, configure TypeScript strict mode, add Vitest with component testing library.
2. **String catalog** — Port `strings.js` to `strings.ts` with full types. Remove dead strings, update bridge-related error messages.
3. **Formatting utilities** — Port `formatKm`, `seasonLabel`, `reviewOpenCount`, `reviewConfidenceHtml` to `format.ts`.
4. **CSS foundation** — Port `styles.css` to the project. Extract theme tokens. Set up CSS modules or scoped styles.
5. **App shell** — Implement `App.tsx` with header, tab navigation, view routing, `StatusBar`.
6. **ConfirmModal** — Build reusable confirmation modal component to replace all `window.confirm()` / `window.prompt()` usage.
7. **Shared components** — `ImportedRunsMatrix`, `CategoryGrid`.
8. **Stores** — Implement `SeasonStore`, `StandingsStore`, `ImportStore`, `StatusStore` with typed reactive state.
9. **Season entry screen** — Port `renderSeasonEntry()` with browser file I/O.
10. **Standings screen** — Port standings layout, table, per-race table, PDF export trigger.
11. **Identity correction** — Port modal with form validation.
12. **Duplicate merge** — Port merge mode toggle, pick flow, merge execution.
13. **Import screen** — Port file upload, type/race inference, import button with guards.
14. **Matching settings** — Port collapsible panel with mode tabs and threshold sync.
15. **Review queue** — Port review panel, candidate table with diff, accept/new-identity/merge-correct actions.
16. **Merge-correct modal** — Port side-by-side compare + edit form.
17. **History screen** — Port import history table with rollback, audit trail table.
18. **Integration testing** — End-to-end workflow tests: create season → import → review → standings → export.

## Test Plan

- **Unit:** Pure utility functions (`clampAutoMin`, `inferRaceNoFromFilename`, `buildCategoryQuickSelectModel`, etc.) tested with Vitest.
- **Component:** Each component renders correctly with mock data; interaction tests for button clicks, form inputs, modal open/close.
- **Integration:** Full workflow tests with an in-memory domain layer: create season → import file → resolve reviews → verify standings render.
- **Visual regression:** Optional; screenshot comparisons for key screens.
- **Accessibility:** Keyboard navigation through tabs, modals, review table candidate selection. Screen reader testing for ARIA attributes.
- **Responsive:** Verify layout collapse at 1200px and 980px breakpoints.
- **Manual checks:** Compare side-by-side with Python version for visual fidelity and workflow parity.

## Definition of Done

- [ ] UI framework selected and configured (Vite + framework + Vitest).
- [ ] All four screens implemented and functional.
- [ ] German string catalog fully typed; no hardcoded German text in components.
- [ ] No pywebview bridge references in any file.
- [ ] No `window.confirm()` or `window.prompt()` calls.
- [ ] No dead code from Python frontend carried over.
- [ ] All identified pure functions ported with unit tests.
- [ ] Component tests for all interactive flows.
- [ ] CSS ported with responsive breakpoints and reduced-motion support.
- [ ] Entry added to `packages/stundenlauf-ts/docs/ACCOMPLISHMENTS.md`.
- [ ] Requirement/milestone status updated in `packages/stundenlauf-ts/PROJECT_PLAN.md`.

## Links

- Python source: `frontend/app.js`, `frontend/strings.js`, `frontend/styles.css`, `frontend/index.html`
- Depends on: F-TS01 (event types), F-TS04 (standings queries), F-TS05 (import orchestration API, review queue)
- Depended on by: F-TS08 (PDF/CSV export UI triggers), F-TS09 (PWA/deployment wraps the shell)
