# Stundenlauf TypeScript Port – Project Plan

## Vision

Port the Stundenlauf race-series management application from a local-first Python desktop app (pywebview + GTK/WebView2) to a **static-site TypeScript/JavaScript web application** hosted on GitHub Pages. All computation and data management happens client-side; there is no backend server. Data is persisted in the browser (IndexedDB / localStorage) and can be exported/imported as JSON files.

The port preserves all functional capabilities of the Python version while gaining:

- Zero-install access via any modern browser.
- Cross-platform support without native dependencies.
- Offline-capable via a service worker (PWA).
- Simpler distribution and deployment via GitHub Pages.

## Architecture Principles

- **Static site only** – no server, no API calls, no database. All logic runs in the browser.
- **Event-sourced core** – the domain state is rebuilt deterministically from an append-only event log. Snapshots are optional caches, never the source of truth.
- **Teams as the universal entity** – a solo participant is a team of size 1. Couples are teams of size 2. This unifies identity, matching, and standings logic.
- **TypeScript-first** – all domain logic, storage, and UI in TypeScript (or JS transpiled from TS). Strict types for domain models.
- **Offline-first / local-first** – data never leaves the browser unless the user explicitly exports.

## Core Requirements

Mapped from the Python version's requirements, adapted for the static-site context:

- [ ] R1: Import race data from structured sources (Excel or CSV upload) and persist race-by-race history.
- [ ] R2: Support race categories: 30-minute and 60-minute races for men, women, and team (Paarlauf) divisions.
- [ ] R3: Track participants and teams across non-consecutive races and partial participation.
- [ ] R4: Implement robust participant/team matching with typo tolerance and configurable thresholds.
- [ ] R5: Compute cumulative distance/points and produce ranking tables using configurable rules.
- [ ] R6: Provide interactive review and override for suggested matches before merge.
- [ ] R7: Keep data portable with browser-local storage and file-based import/export.
- [ ] R8: Provide German-language UI for display and user workflows.

## Non-Goals

- Server-side computation or storage.
- Multi-user real-time collaboration (single-user local-first only).
- Support for browsers older than latest two major releases of Chrome, Firefox, Safari, Edge.
- Native mobile app packaging (PWA is sufficient).

## Technology Stack (Proposed)

| Layer | Technology | Notes |
|---|---|---|
| Language | TypeScript 5.x | Strict mode, ES2022+ target |
| Build | Vite | Fast dev server, static output for GitHub Pages |
| UI Framework | React 18+ | Largest ecosystem, best AI-assist support, most docs; decided in F-TS06 |
| State Management | Zustand + event-sourced event log | Zustand for UI state; event log for domain state (F-TS01) |
| Storage | IndexedDB (via idb or Dexie) + JSON export | Offline persistence |
| Excel Parsing | SheetJS (xlsx) or ExcelJS | Client-side .xlsx reading |
| Fuzzy Matching | Custom port or fuse.js + custom scoring | Port Python matching logic |
| PDF Export | jsPDF + jsPDF-AutoTable | Client-side PDF generation (decided in F-TS08) |
| Excel Export | ExcelJS | Client-side .xlsx generation for standings (decided in F-TS08) |
| Testing | Vitest | Unit + integration |
| Linting | ESLint + Prettier | Consistent code style |
| Deployment | GitHub Pages via GitHub Actions | Static build output |

## Milestones

| Milestone | Description | Status |
|---|---|---|
| M-TS1 | Event-sourced domain foundation and storage | Done |
| M-TS2 | Excel/CSV ingestion and team/participant registration | Done |
| M-TS3 | Matching engine and review workflow | Done |
| M-TS4 | Ranking engine and standings computation | Done |
| M-TS5 | German UI shell and core workflows | Planned |
| M-TS6 | Export (PDF, Excel) and season portability | Planned |
| M-TS7 | GitHub Pages deployment, PWA, polish | Planned |

## Feature Inventory

Features are prefixed `F-TS` to distinguish from the Python version's `F` prefix.

| Feature | Description | Milestone | Status |
|---|---|---|---|
| F-TS01 | Event-sourced event architecture | M-TS1 | Done |
| F-TS02 | Client-side Excel (.xlsx) parsing | M-TS2 | Done |
| F-TS03 | Fuzzy matching engine and review workflow | M-TS3 | Done |
| F-TS04 | Ranking engine and standings computation | M-TS4 | Done |
| F-TS05 | Import orchestration workflow (parse → validate → match → review → emit) | M-TS2 | Done |
| F-TS06 | UI framework and German UI shell | M-TS5 | Planned |
| F-TS07 | Season data portability (JSON/ZIP export and import) | M-TS6 | Planned |
| F-TS08 | Standings and results export (PDF, Excel) | M-TS6 | Planned |
| F-TS09 | GitHub Pages deployment and PWA | M-TS7 | Planned |

## Hardening Inventory

Hardening work is prefixed `H-TS` and tracks cross-cutting reliability, architecture-alignment, and bug-class elimination work that is not primarily a new user-visible feature.

| Hardening | Description | Supports | Status |
|---|---|---|---|
| H-TS01 | Team-first matching identity unification (single + couple review candidates always carry `team_id`) | R3, R4, R6 | Done |
| H-TS02 | Central event validation write barrier (reject invalid events before persistence/projection) | R1, R3, R5, R7 | Planned |

## Mapping from Python Features

The following maps Python features to their TS-port equivalents or notes on approach changes:

| Python Feature | TS Port Approach |
|---|---|
| F01 Domain model & storage | F-TS01 event-sourced model replaces snapshot-based ProjectDocument |
| F02 Excel ingestion | F-TS02: client-side xlsx parsing; F-TS05: import orchestration (parse → match → emit) |
| F03 Matching engine | F-TS03: port scoring/normalization/modes to TS; same fingerprint + scoring approach |
| F04 Ranking engine | F-TS04: port as `stundenlauf_v1` ruleset; pure derived view over SeasonState |
| F05 German UI | F-TS06: UI framework selection, app shell, German copy catalog, core workflow screens |
| F06 Fixture HITL import script | Not ported – developer tooling; replaced by Vitest fixture-based tests |
| F07 Gesamtwertung ground-truth comparison | Not ported – developer tooling; replaced by Vitest fixture-based tests |
| F08 API layer | Eliminated – UI calls domain directly (no pywebview bridge) |
| F09–F19 Identity/matching/review features | Subsumed into F-TS03 (matching) + F-TS05 (orchestration & review workflow) |
| F12 Season import/export | F-TS07: browser-local season export/import (JSON/ZIP download/upload, IndexedDB ↔ file) |
| F20 Export | F-TS08: client-side PDF/Excel generation for standings and results |
| F22 Windows packaging | Eliminated – replaced by F-TS09 (GitHub Pages deployment + PWA) |

## Python Dead Surface (Do Not Port)

An audit of the Python GUI (2026-04-12) found unused code that should **not** be carried into the TS port. Documented here so porting work can reference Python source files without accidentally reproducing dead paths.

### Dead API methods (registered in `backend/ui_api/service.py` `_dispatch`, never called by `frontend/app.js`)

| Method | Why dead | Porting note |
|---|---|---|
| `get_project_state` | Superseded by `get_year_overview` which returns richer data. `queries.get_project_state()` wrapper is also uncalled. | Design year-overview query only; no separate project-state query needed. |
| `list_categories` | Category info is embedded in the `get_year_overview` response. | Same — no standalone category-list query. |
| `get_match_candidate` | Candidate data is returned inline within `get_review_queue`. | Return full candidate data in review queue response. |
| `get_audit_timeline` | `get_year_timeline` covers audit rows. Separate endpoint was never wired. | Single timeline query covers both source-history and audit. |
| `rollback_race` | Frontend uses `rollback_source_batch` (rolls back entire file import, not individual races). | Port `rollback_source_batch` semantics only. |
| `reimport_race` | No UI flow ever existed for re-importing over a previous race. | Skip unless a clear use case emerges. |

### Dead frontend code (`frontend/app.js`, `frontend/strings.js`)

| Item | Location | Note |
|---|---|---|
| `formatEntityPreview()` | `app.js` line ~1530 | Defined, never called. |
| `UIStrings.seasonEntry.tableRaces` | `strings.js` line 70 | String `"Läufe"` never referenced. |
| Duplicate `escapeHtml()` | `app.js` lines ~1097 and ~1522 | Second definition shadows first; redundant copy. |

### Dead API-layer re-exports (`backend/ui_api/mappers.py`)

`mappers.py` re-exports `club_for_row`, `display_name_for_row`, `people_by_uid`, `teams_by_uid`, `yob_for_row` from `standings_display`. Only `category_label` and `race_event_identity` are actually imported by `queries.py`. The re-exports are unused within the API layer (the underlying functions are used elsewhere, but through direct imports from `standings_display`).

### Stale Python feature docs (not authoritative for TS port)

These Python docs have **drifted from shipped behavior** — when referencing Python source, trust the code over the doc text:

| Doc | Drift |
|---|---|
| F05 (German UI) | Acceptance criteria still `[ ]` unchecked despite being shipped. References to `MergeResolutionDialog` and side-by-side layout are stale; actual UI uses a stacked comparison table. |
| F06 (Fixture HITL) | Motivation says "Before the German GUI exists…" — GUI shipped long ago. |
| F20 (Export) | Out-of-scope says "Desktop GUI export button is deferred" — but it was shipped (layout presets, PDF export in Aktuelle Wertung). |

## Key Architectural Differences from Python Version

### 1. Event Sourcing replaces Snapshot Storage

Python version: mutate `ProjectDocument` in memory, serialize entire state as JSON.

TS version: append **commands** (events) to an ordered log. Rebuild current state by replaying all commands. Persist the command log. Optionally cache snapshots for performance.

### 2. Unified Team Model

Python version: `Person` (singles) and `Couple` (pairs) are distinct types with `participant_uid` vs `team_uid` on entries.

TS version: **`Team`** is the universal entity. A solo runner is `Team { members: [person] }`. A couple is `Team { members: [personA, personB] }`. Entries always reference `team_id`. Division rules validate team size.

### 3. No Server, No Bridge

Python version: pywebview bridge → `UiApiService` → domain commands/queries.

TS version: UI components call domain functions directly. No serialization boundary. Reactivity via framework signals/stores or event emitter on the command log.

## Risks and Dependencies

- Risk: Excel parsing fidelity – client-side xlsx libraries may handle edge cases differently from openpyxl.
  - Mitigation: extensive fixture-based testing against the same Excel files used in Python tests.
- Risk: Fuzzy matching performance in the browser for large datasets.
  - Mitigation: profile early; consider Web Workers for heavy computation.
- Risk: IndexedDB storage limits on some browsers.
  - Mitigation: monitor storage usage; offer explicit export/import for archival.
- Risk: PDF generation quality may differ from ReportLab.
  - Mitigation: evaluate jsPDF/pdfmake early; accept layout differences if functional.

## Working Agreements

- Every feature must map to at least one requirement or milestone.
- Each feature requires a plan document in `docs/features/`.
- Hardening work that spans multiple features should use `H-TSxx` and a plan doc in `docs/hardening/`.
- "Done" means code + tests + docs + accomplishments entry.
- All end-user UI text is German; internal identifiers stay English.
- Domain logic must be framework-agnostic (pure TS functions, no UI imports).

## Change Log

| Date | Change | Why |
|---|---|---|
| 2026-04-12 | Initial project plan scaffold | Begin TS port planning |
| 2026-04-12 | Self-consistency review fixes | Terminology (command→event), added F-TS05 import orchestrator, fixed cross-doc type inconsistencies |
| 2026-04-12 | F-TS05 feature plan created | Detailed import orchestration workflow: phased API, eager resolution, review staging, event batch construction |
| 2026-04-12 | Added F-TS06 through F-TS09 | Fill feature inventory gaps for M-TS5 (UI), M-TS6 (export/portability), M-TS7 (deployment/PWA); updated Python mapping table |
| 2026-04-12 | Python dead-surface audit | Documented 6 dead API methods, dead frontend code, stale re-exports, and drifted Python docs as porting reference; added F06/F07 to mapping table as dev-tooling (not ported) |
| 2026-04-12 | F-TS06 feature plan created | Detailed UI framework & German shell plan: full audit of all 4 screens in app.js (2762 lines), line-by-line keep/change/eliminate dispositions, dead code inventory, bridge elimination mapping, file API migration, confirmation modal migration, CSS audit, component architecture, string catalog porting plan |
| 2026-04-12 | F-TS08 feature plan created; CSV→Excel | Detailed standings/results export plan: PDF via jsPDF+AutoTable, Excel via ExcelJS replacing CSV; projection layer port, Laufübersicht layout, dual Einzel/Paare PDF, layout presets, German formatting; updated milestone M-TS6 and tech stack |
| 2026-04-12 | F-TS09 feature plan created | GitHub Pages deployment + PWA plan: Vite build with base path, vite-plugin-pwa for Workbox service worker with prompt-based updates, GitHub Actions CI/CD (lint/typecheck/test/build/deploy), PWA manifest with German metadata, hash routing for GH Pages, build-time version injection, coexistence with Python Windows workflow |
| 2026-04-13 | F-TS01 implemented | Event-sourced domain foundation: 11 projection handlers, validation engine, workspace lifecycle, IndexedDB storage adapter, JSON serialization, 104 tests passing |
| 2026-04-13 | F-TS02 implemented | Client-side Excel parsing: singles and couples parsers with state machine, SheetJS for OOXML reading, German decimal/club/YOB handling, SHA-256 dedup, 100 new tests (204 total) |
| 2026-04-13 | F-TS04 implemented | Ranking engine: stundenlauf_v1 ruleset (top-4 aggregation), deterministic sorting, exclusion presentation, 46 new tests (409 total) |
| 2026-04-13 | F-TS05 implemented | Import orchestration: phased pipeline (parse→validate→match→review→finalize), progressive state enrichment, review resolution, atomic event batch construction, 55 new tests (464 total); M-TS1–M-TS4 marked Done |
| 2026-04-14 | F-TS05 manual harness added | Dev-only interactive MW1→MW2 orchestration harness with row-level matching diagnostics for pre-GUI validation on real XLSX files |
| 2026-04-14 | Canonical display identity consistency (person+club) | Extended F-TS01 contracts with canonical `display_name` + `name_normalized`, enforced dual-write invariants in validation/projection, aligned import/matching/review consumers, and added replay-compat coverage for legacy person events |
| 2026-04-14 | Added `H-TSxx` hardening planning lane | Separate architecture/reliability enhancements from user-facing features; seeded H-TS01 for team-first matching identity unification |
| 2026-04-14 | Added H-TS02 hardening plan seed | Captured the need for a central validation write barrier so invalid event batches are rejected before persistence/projection |
| 2026-04-14 | H-TS01 implemented | Unified singles matching/review identity flow to team-first semantics (`team_id` only), removed person-id fallback seams, added review linking guardrails, and expanded regression coverage; hardening inventory status updated to Done |
