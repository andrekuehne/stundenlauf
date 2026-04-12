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
- **Event-sourced core** – the domain state is rebuilt deterministically from an append-only command log. Snapshots are optional caches, never the source of truth.
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
| UI Framework | TBD (React, Preact, Svelte, or vanilla) | Decide in F-TS02 |
| State Management | Event-sourced command log | Core architecture; see F-TS01 |
| Storage | IndexedDB (via idb or Dexie) + JSON export | Offline persistence |
| Excel Parsing | SheetJS (xlsx) or ExcelJS | Client-side .xlsx reading |
| Fuzzy Matching | Custom port or fuse.js + custom scoring | Port Python matching logic |
| PDF Export | jsPDF or pdfmake | Client-side PDF generation |
| Testing | Vitest | Unit + integration |
| Linting | ESLint + Prettier | Consistent code style |
| Deployment | GitHub Pages via GitHub Actions | Static build output |

## Milestones

| Milestone | Description | Status |
|---|---|---|
| M-TS1 | Event-sourced domain foundation and storage | Planned |
| M-TS2 | Excel/CSV ingestion and team/participant registration | Planned |
| M-TS3 | Matching engine and review workflow | Planned |
| M-TS4 | Ranking engine and standings computation | Planned |
| M-TS5 | German UI shell and core workflows | Planned |
| M-TS6 | Export (PDF, CSV) and season portability | Planned |
| M-TS7 | GitHub Pages deployment, PWA, polish | Planned |

## Feature Inventory

Features are prefixed `F-TS` to distinguish from the Python version's `F` prefix.

| Feature | Description | Milestone | Status |
|---|---|---|---|
| F-TS01 | Event-sourced command architecture | M-TS1 | Planned |
| F-TS02 | UI framework and build scaffold | M-TS1 | Planned |
| | *(additional features to be added as planning progresses)* | | |

## Mapping from Python Features

The following maps Python features to their TS-port equivalents or notes on approach changes:

| Python Feature | TS Port Approach |
|---|---|
| F01 Domain model & storage | F-TS01 event-sourced model replaces snapshot-based ProjectDocument |
| F02 Excel ingestion | New feature: client-side xlsx parsing, same adapter pattern |
| F03 Matching engine | Port scoring/normalization logic to TS; same fingerprint + scoring approach |
| F04 Ranking engine | Direct port of v1_legacy_top4 ruleset |
| F05 German UI | New UI framework; same German copy catalog |
| F08 API layer | Eliminated – UI calls domain directly (no pywebview bridge) |
| F09–F19 Identity/matching/review features | Subsumed into TS matching + review features |
| F20 Export | Client-side PDF/CSV generation |
| F22 Windows packaging | Eliminated – replaced by GitHub Pages + PWA |

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
- Each feature requires a plan document in `ts_port/docs/features/`.
- "Done" means code + tests + docs + accomplishments entry.
- All end-user UI text is German; internal identifiers stay English.
- Domain logic must be framework-agnostic (pure TS functions, no UI imports).

## Change Log

| Date | Change | Why |
|---|---|---|
| 2026-04-12 | Initial project plan scaffold | Begin TS port planning |
