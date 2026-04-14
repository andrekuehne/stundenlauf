# Accomplishments Log (TS Port)

Track meaningful project progress here. Prefer outcomes over low-level task activity.

## Entry Template

Copy this block for each notable accomplishment:

```md
### YYYY-MM-DD - Short accomplishment title
- Requirement/Milestone: [R# or M-TS#]
- What shipped: one sentence
- Evidence: PR/commit/release/test link or ID
- Impact: metric movement, user value, or reliability gain
- Follow-up: optional next step
```

## Entries

### 2026-04-14 - Legacy season UX decoupled from year input
- Requirement/Milestone: [R8], [M-TS5], [F-TS10]
- What shipped: Updated the legacy frontend season entry workflow to require a single non-empty season name on create (no separate year/secondary label field), display season names in the list, and require typing that season name for reset/delete confirmation.
- Evidence: `public/legacy/app.js`, `public/legacy/strings.js`, `src/legacy/api/runtime.ts`, `tests/legacy/runtime.test.ts`
- Impact: Aligns the reused legacy UI with backend season identity semantics (name-based, not year-coupled) while preserving compatibility aliases for existing legacy API calls.
- Follow-up: Migrate remaining legacy API surfaces from `series_year` alias-first semantics toward canonical `season_id` where feasible.

### 2026-04-14 - F-TS10 legacy frontend API adapter plan created
- Requirement/Milestone: [R1], [R3], [R5], [R6], [R7], [R8], [M-TS5]
- What shipped: Added a dedicated feature plan for rewiring the copied legacy frontend onto the TS port through a browser-local compatibility adapter, including a complete live API inventory from `public/legacy/app.js`, phased rollout order, `series_year` aliasing over canonical `season_id`, staged import-review mapping, and explicit treatment of result reassignment and event-sourced history differences.
- Evidence: `docs/features/F-TS10-legacy-frontend-api-compatibility-adapter.md`, `PROJECT_PLAN.md`
- Impact: Turns the current frontend-only legacy mount into an execution plan for method-by-method backend restoration without regressing the TS event-sourced architecture or reintroducing year-keyed season identity.
- Follow-up: Implement the adapter foundation and wire the season entry / overview methods first.

### 2026-04-14 - Legacy frontend served in frontend-only mode
- Requirement/Milestone: [R8], migration strategy pivot
- What shipped: Wired the copied Python frontend assets under `public/legacy/` into the TS app default route via iframe and added a `pywebview` bridge stub so the old UI starts in browser-only mode while backend calls return a consistent unavailable error response.
- Evidence: `public/legacy/index.html`, `public/legacy/bridge-stub.js`, `src/App.tsx`
- Impact: Enables immediate visual/workflow parity checks on the original frontend surface while backend integration can proceed incrementally API by API.
- Follow-up: Replace stubbed `invoke` responses with a real TS backend adapter method-by-method.

### 2026-04-14 - TS frontend reset to harness-only baseline
- Requirement/Milestone: [M-TS5], migration strategy pivot
- What shipped: Removed the production TS UI shell/views/components and related UI tests, and switched `App.tsx` to a harness-only launcher that preserves only the dev harness entry points (`?harness=import`, `?harness=import-season`, `?harness=legacy-layout`).
- Evidence: `src/App.tsx`, `src/devtools/`, removed `src/components/` view/component files, removed `tests/ui/` shell/view tests, removed UI adapter tests in `tests/history/` and `tests/standings/`
- Impact: Creates a clean, low-risk baseline for reusing the Python frontend and incrementally wiring it onto the TS backend/domain stack without carrying forward partial TS UI implementations.
- Follow-up: Copy the Python frontend into the TS package and add a staged integration layer that binds existing frontend actions to TS backend APIs.

### 2026-04-14 - F-TS06e dev-only legacy layout parity page implemented
- Requirement/Milestone: [R8], [M-TS5]
- What shipped: Added a dedicated dev harness page (`/?harness=legacy-layout`) that mirrors the legacy Python shell/container layout with static placeholders and namespaced parity CSS, including header context, tab affordances, status placement, and season/standings/import/history container scaffolding.
- Evidence: `src/App.tsx`, `src/devtools/LegacyLayoutParityPage.tsx`, `src/theme.css`, `tests/ui/app-shell.test.tsx`, `docs/features/F-TS06e-legacy-layout-parity-page-dev.md`, `docs/features/F-TS06-ui-framework-german-shell.md`, `PROJECT_PLAN.md`
- Impact: Provides a safe visual parity sandbox to validate spacing, typography, and overlap behavior against `frontend/` without disturbing the production UI flows.
- Follow-up: Wire real view data/actions into this structure in a later pass once layout fidelity is accepted.

### 2026-04-14 - Viewport lock and split-panel layout parity with Python GUI
- Requirement/Milestone: [R8], [M-TS5]
- What shipped: Brought the TS port's layout model to parity with the Python app's fixed-viewport, independently-scrollable split-panel design. Body and shell are now locked to 100vh with no document scroll. Standings and Import views use visually distinct panel cards per column (sidebar and content), each with independent `overflow-y: auto` scrolling. History and Season views scroll within the constrained viewport. Large tables are capped at 60vh via `.table-wrap`. Responsive 1200px breakpoint degrades gracefully (columns stack, outer container scrolls).
- Evidence: `src/theme.css`, `src/components/standings/StandingsView.tsx`, `src/components/import/ImportView.tsx`, `src/components/history/HistoryView.tsx`, `src/components/season/SeasonEntryView.tsx`
- Impact: Eliminates the most visible UX drift from the Python app — sidebars are now visually separate cards with their own scroll, matching the desktop app's panel-based interaction model.
- Follow-up: None immediate; further visual polish (shadows, hover states, active category highlight) can be addressed in a future pass.

### 2026-04-14 - F-TS06d Python GUI parity pass implemented
- Requirement/Milestone: [R1], [R2], [R3], [R4], [R5], [R6], [R8], [M-TS5]
- What shipped: Delivered a cross-referenced Python-vs-TS parity pass with shell/header alignment (season + open-review context and switch-season tab affordance), production import orchestration/review workflow in the main app (replacing placeholder import tab), targeted standings/season/history drift fixes, and centralized remaining user-facing copy in the TS string catalog.
- Evidence: `docs/features/F-TS06d-python-gui-parity-pass.md`, `src/App.tsx`, `src/stores/import.ts`, `src/components/import/{ImportView.tsx,ImportControls.tsx,MatchingSettings.tsx,ReviewPanel.tsx,ReviewTable.tsx}`, `src/components/standings/{adapters.ts,StandingsView.tsx}`, `src/components/season/SeasonEntryView.tsx`, `src/components/history/HistoryView.tsx`, `src/components/shared/ImportedRunsMatrix.tsx`, `src/strings.ts`, `src/theme.css`, `tests/ui/{app-shell.test.tsx,import-view.test.tsx}`
- Impact: Reduces early workflow/usability drift from the hand-tuned Python GUI while keeping TS architecture/local-first event-log semantics intact and making M-TS5 behavior more production-realistic for day-to-day use.
- Follow-up: Decide whether F-TS06c should now be closed or split remaining enhancements into a narrower import UX polish slice.

### 2026-04-14 - F-TS06b season/standings/history workflows implemented
- Requirement/Milestone: [R2], [R5], [R8], [M-TS5]
- What shipped: Implemented F-TS06b end-to-end with IndexedDB-backed season lifecycle management (list/create/open/reset/delete), live standings surfaces (category quick-select, imported-run matrix, Gesamtwertung and Laufübersicht), correction and duplicate-merge modal flows, and history/audit screens with per-batch rollback confirmations.
- Evidence: `src/services/season-repository.ts`, `src/stores/season.ts`, `src/stores/standings.ts`, `src/components/season/SeasonEntryView.tsx`, `src/components/standings/{adapters.ts,StandingsView.tsx,StandingsTable.tsx,IdentityModal.tsx}`, `src/components/shared/{CategoryGrid.tsx,ImportedRunsMatrix.tsx}`, `src/components/history/{adapters.ts,HistoryView.tsx,ImportHistoryTable.tsx,AuditTrailTable.tsx}`, `src/components/import/MergeCorrectModal.tsx`, `src/theme.css`, `tests/standings/adapters.test.ts`, `tests/history/adapters.test.ts`, `tests/ui/{app-shell.test.tsx,season-entry-view.test.tsx,standings-view.test.tsx,history-view.test.tsx}`
- Impact: Moves M-TS5 substantially forward by replacing 06a placeholders with operational German workflows over the real event log/projection pipeline while keeping import-review orchestration cleanly scoped to F-TS06c.
- Follow-up: Implement F-TS06c import orchestration + matching review GUI and then mark the umbrella F-TS06 complete.

### 2026-04-14 - F-TS06a UI foundation implemented
- Requirement/Milestone: [R8], [M-TS5]
- What shipped: Implemented F-TS06a end-to-end with a production `App.tsx` shell (German tab navigation + status surface), typed string catalog and format helpers, reusable `StatusBar`/`ConfirmModal` primitives, placeholder view roots for 06b/06c, and reduced-motion baseline styling.
- Evidence: `src/App.tsx`, `src/strings.ts`, `src/format.ts`, `src/stores/status.ts`, `src/components/shared/StatusBar.tsx`, `src/components/shared/ConfirmModal.tsx`, `src/components/standings/StandingsView.tsx`, `src/components/import/ImportView.tsx`, `src/components/history/HistoryView.tsx`, `src/components/season/SeasonEntryView.tsx`, `src/theme.css`, `tests/format.test.ts`, `tests/ui/app-shell.test.tsx`, `tests/ui/status-bar.test.tsx`, `tests/ui/confirm-modal.test.tsx`
- Impact: Establishes a stable German UI foundation contract for F-TS06b and F-TS06c while removing shell-level placeholders and browser-native confirm/prompt dependencies from the baseline architecture.
- Follow-up: Implement F-TS06b workflows (season/standings/history) directly against the new shell and shared primitives.

### 2026-04-14 - F-TS06 UI plan split into focused subplans
- Requirement/Milestone: [R1], [R2], [R5], [R6], [R8], [M-TS5]
- What shipped: Replaced the oversized monolithic `F-TS06` feature plan with an umbrella plus three implementation-sized subplans: `F-TS06a` (shell + strings foundation), `F-TS06b` (season/standings/history workflows), and `F-TS06c` (import orchestration + matching review GUI).
- Evidence: `PROJECT_PLAN.md`, `docs/features/F-TS06-ui-framework-german-shell.md`, `docs/features/F-TS06a-ui-shell-layout-and-strings.md`, `docs/features/F-TS06b-season-standings-history-workflows.md`, `docs/features/F-TS06c-import-orchestration-matching-workflow.md`
- Impact: Reduces planning and implementation scope per work package to fit a single context window and explicitly anchors import/review behavior to the existing `?harness=import-season` prototype.
- Follow-up: Build concrete implementation plans and execute 06a, then 06b and 06c in sequence.

### 2026-04-14 - H-TS02 central write barrier validation implemented
- Requirement/Milestone: [R1], [R3], [R5], [R7], [M-TS1]
- What shipped: Implemented a canonical append-time write barrier in the event store that validates each incoming event with `validateEvent` against transient post-apply state, rejects invalid batches atomically before persistence, and surfaces structured failure details (`season_id`, batch index, `seq`, event type, reasons).
- Evidence: `src/storage/event-store.ts`, `tests/storage/event-store.test.ts`, `tests/import/pipeline.test.ts`, `docs/hardening/H-TS02-central-event-validation-write-barrier.md`
- Impact: Prevents producer regressions from silently persisting invalid events, including unknown team references in race entries, and establishes one central semantic enforcement boundary independent of specific import/matching code paths.
- Follow-up: Optional: add equivalent semantic validation to any future non-append event-log ingestion path if introduced.

### 2026-04-14 - H-TS01 team-first matching identity unification implemented
- Requirement/Milestone: [R3], [R4], [R6], [M-TS3]
- What shipped: Completed H-TS01 by making the singles matching/review path team-centric end-to-end (`team_id` for candidate lists, top-candidate identity, conflict tracking, and staged resolution), removing the person-id fallback seam, and adding review guardrails that reject `link_existing` targets outside the candidate set.
- Evidence: `src/matching/resolve.ts`, `src/matching/workflow.ts`, `src/import/review.ts`, `tests/matching/resolve.test.ts`, `tests/matching/workflow.test.ts`, `tests/import/review.test.ts`, `tests/import/pipeline.test.ts`
- Impact: Eliminates the UUID-row bug class caused by leaking `person_id` into team-linking fields, strengthens referential integrity before finalize/commit, and aligns runtime behavior with the universal team-domain model.
- Follow-up: Implement H-TS02 central write-barrier validation to enforce semantic event integrity at append time.

### 2026-04-14 - H-TS02 hardening seed for validation write barrier
- Requirement/Milestone: [R1], [R3], [R5], [R7], [M-TS1]
- What shipped: Added a second hardening plan (`H-TS02`) for a central event validation write barrier so invalid event batches are rejected before persistence/projection, and registered it in the project hardening inventory.
- Evidence: `PROJECT_PLAN.md`, `docs/hardening/H-TS02-central-event-validation-write-barrier.md`
- Impact: Establishes defense-in-depth beyond producer-side fixes by ensuring semantic event integrity is enforced at the storage boundary.
- Follow-up: Implement sequential batch validation in the canonical append path and add atomic-failure regression tests.

### 2026-04-14 - Hardening planning lane (`H-TSxx`) introduced
- Requirement/Milestone: [R3], [R4], [R6], [M-TS3]
- What shipped: Added a dedicated hardening planning track (`H-TSxx`) to separate cross-cutting architecture/reliability work from user-facing features, updated `PROJECT_PLAN.md` with a hardening inventory and working agreement, and created `docs/hardening/H-TS01-team-first-matching-identity-unification.md`.
- Evidence: `PROJECT_PLAN.md`, `docs/hardening/H-TS01-team-first-matching-identity-unification.md`
- Impact: Bug-class elimination and architecture-alignment work can now be tracked explicitly without overloading feature scope, improving planning clarity and execution discipline for emergent reliability improvements.
- Follow-up: Execute H-TS01 implementation steps and add regression coverage for singles/couples team-identity consistency in matching and review flows.

### 2026-04-14 - Full-season import walkthrough harness added
- Requirement/Milestone: [R1], [R3], [R4], [R6], [M-TS2]
- What shipped: Added a second dev harness (`/?harness=import-season`) for practical season-by-season import validation: sequential file loading, review queue decisions via simple radio buttons, cumulative season state projection across imports, and an accumulated points-descending ranking table.
- Evidence: `src/App.tsx`, `src/devtools/ImportSeasonWalkthroughHarness.tsx`, `docs/features/F-TS05-import-orchestration-workflow.md`
- Impact: Enables direct end-to-end manual comparison against the Python import workflow over many race files without needing the future full GUI.
- Follow-up: Add optional export/import of harness session state for long parity runs across multiple days.

### 2026-04-14 - Harness matching modes and thresholds exposed
- Requirement/Milestone: [R4], [R6], [M-TS2]
- What shipped: Extended the F-TS05 manual import harness with Python-comparable matching controls (Strikt / Fuzzy-Automatik / Manuell) plus live auto/review threshold sliders, and wired these settings into both trace generation and orchestration matching runs.
- Evidence: `src/devtools/ImportOrchestrationHarness.tsx`, `docs/features/F-TS05-import-orchestration-workflow.md`
- Impact: Enables direct, repeatable manual parity comparisons against the current Python GUI matching behavior during MW1→MW2 harness sessions.
- Follow-up: Add a compact per-cycle diff view to compare route changes when only thresholds/mode change.

### 2026-04-14 - Canonical person/club display invariants added
- Requirement/Milestone: [R3], [R4], [R8], [M-TS1]
- What shipped: Extended person identity contracts with canonical display name fields (`display_name`, `name_normalized`), enforced dual-write consistency (split name, display name, normalized key, and club pair) in event validation/projection, and aligned import/review/matching consumers to use canonical display values.
- Evidence: `src/domain/types.ts`, `src/domain/events.ts`, `src/domain/person-identity.ts`, `src/domain/projection.ts`, `src/domain/validation.ts`, `src/matching/normalize.ts`, `src/matching/workflow.ts`, `src/import/review.ts`, `src/import/run-matching.ts`, `tests/domain/projection.test.ts`, `tests/domain/validation.test.ts`, `tests/storage/serialization.test.ts`, `tests/matching/*`
- Impact: Names and clubs now have a robust human-display representation attached to every person while preserving normalization-consistent identity behavior and replay determinism (including legacy payload compatibility).
- Follow-up: Thread canonical person display through F-TS06 standings/race UIs as they are built.

### 2026-04-14 - F-TS05 manual MW1→MW2 harness added
- Requirement/Milestone: [R1], [R3], [R4], [R6], [M-TS2]
- What shipped: Added a dev-only import orchestration harness (`/?harness=import`) that runs a real two-file cycle (MW1 then MW2), projects season state between files, and exposes row-level matching diagnostics (pool snapshot, route, candidates, scores, flags, placement).
- Evidence: `src/App.tsx`, `src/devtools/ImportOrchestrationHarness.tsx`, `src/devtools/import-harness-trace.ts`, `tests/import/import-harness-trace.test.ts`, `docs/features/F-TS05-import-orchestration-workflow.md`
- Impact: Enables high-confidence manual validation/debugging of orchestration behavior on real organizer XLSX files without waiting for the full F-TS06 GUI workflow.
- Follow-up: If needed, extend the harness with configurable matching thresholds for side-by-side tuning sessions.

### 2026-04-12 - Project plan scaffold and F-TS01 feature spec created
- Requirement/Milestone: [M-TS1]
- What shipped: Created `packages/stundenlauf-ts/` planning directory with project plan, feature template, accomplishments log, and detailed F-TS01 event-sourced architecture feature plan derived from analysis of the Python backend.
- Evidence: `packages/stundenlauf-ts/PROJECT_PLAN.md`, `packages/stundenlauf-ts/docs/features/FEATURE_TEMPLATE.md`, `packages/stundenlauf-ts/docs/ACCOMPLISHMENTS.md`, `packages/stundenlauf-ts/docs/features/F-TS01-event-sourced-command-architecture.md`
- Impact: Establishes the planning foundation and core architectural direction for the TS port.
- Follow-up: Implement F-TS01 domain types and command/event definitions in TypeScript.

### 2026-04-13 - F-TS01 event-sourced architecture implemented
- Requirement/Milestone: [M-TS1], [R1], [R2], [R3], [R5], [R7]
- What shipped: Complete event-sourced domain foundation — 11 projection handlers (`applyEvent` for all event types), full validation engine (per-event-type rules, cross-field consistency, team-shape checks), workspace season lifecycle (create/delete/rename/list), IndexedDB storage adapter (event log persistence via `idb`), JSON serialization/deserialization for season archives, and `UnknownEventTypeError` for strict forward-compatibility. 104 tests passing across 6 test files.
- Evidence: `src/domain/projection.ts`, `src/domain/validation.ts`, `src/domain/workspace.ts`, `src/storage/db.ts`, `src/storage/event-store.ts`, `src/storage/serialization.ts`, `tests/domain/projection.test.ts` (32 tests), `tests/domain/validation.test.ts` (42 tests), `tests/domain/workspace.test.ts` (14 tests), `tests/storage/serialization.test.ts` (10 tests), `tests/helpers/event-factories.ts`
- Impact: The core domain layer is now fully operational — all season data mutations are expressible as events, projection rebuilds state deterministically, and the storage layer supports both IndexedDB persistence and JSON export/import. This unblocks M-TS2 (Excel ingestion) and M-TS3 (matching engine).
- Follow-up: Implement F-TS02 (client-side Excel parsing) and F-TS05 (import orchestration workflow).

### 2026-04-13 - F-TS02 client-side Excel parsing implemented
- Requirement/Milestone: [M-TS2], [R1], [R2], [R7]
- What shipped: Complete client-side .xlsx parser replicating the Python ingestion adapters — singles and couples parsers with two-level section-marker state machine, header validation, German decimal comma handling, club normalization, race number extraction from filenames, SHA-256 via Web Crypto API, auto-detection of singles vs. couples from filename, and structured German-language validation errors. 100 new tests (39 helper unit tests, 16 constant parity checks, 18 singles integration tests, 17 couples integration tests, 10 entry-point tests) bringing total to 204 passing tests across 11 test files.
- Evidence: `src/ingestion/types.ts`, `src/ingestion/errors.ts`, `src/ingestion/constants.ts`, `src/ingestion/helpers.ts`, `src/ingestion/parse-singles.ts`, `src/ingestion/parse-couples.ts`, `src/ingestion/parse-workbook.ts`, `src/ingestion/index.ts`, `tests/ingestion/helpers.test.ts`, `tests/ingestion/constants.test.ts`, `tests/ingestion/parse-singles.test.ts`, `tests/ingestion/parse-couples.test.ts`, `tests/ingestion/parse-workbook.test.ts`
- Impact: Excel files can now be parsed entirely in the browser with behavioral parity to the Python openpyxl-based parsers. The `ParsedWorkbook` output structure feeds directly into the import orchestration workflow (F-TS05) and matching engine (F-TS03). SheetJS (`xlsx` package) handles the OOXML reading.
- Follow-up: Implement F-TS05 (import orchestration: parse -> validate -> match -> review -> emit) and F-TS03 (fuzzy matching engine).

### 2026-04-13 - F-TS03 fuzzy matching engine implemented
- Requirement/Milestone: [M-TS3], [R3], [R4], [R6]
- What shipped: Complete fuzzy matching engine ported from Python — 13 TypeScript modules implementing name normalization (Unicode-aware), Ratcliff/Obershelp string similarity (direct port of Python difflib.SequenceMatcher.ratio()), SHA-256 identity fingerprinting (Web Crypto API), blocking indexes for efficient candidate retrieval, composite scoring (singles + couples with bipartite pairing), strict identity mode, per-row resolution pipeline (replay, scoring, strict overlay, safety overrides, same-race conflict detection), section-level workflow (processSinglesSection/processCouplesSection), matching reports, and review display helpers. 147 new tests across 12 test files including cross-language parity tests verifying identical output to Python for normalization, fingerprinting, and scoring. Total project tests: 363 passing across 24 test files.
- Evidence: `src/matching/` (types.ts, config.ts, normalize.ts, ratcliff-obershelp.ts, fingerprint.ts, score.ts, candidates.ts, teams.ts, strict-identity.ts, resolve.ts, workflow.ts, report.ts, review-display.ts, index.ts), `tests/matching/` (12 test files), barrel export at `src/matching/index.ts`
- Impact: The matching engine is the core differentiator for participant tracking across races. All scoring thresholds, normalization rules, and matching modes are now available in TypeScript with verified behavioral parity to the Python reference implementation. This unblocks F-TS05 (import orchestration) which will wire the matching engine into the event-sourced import workflow.
- Follow-up: Implement F-TS05 (import orchestration: parse → validate → match → review → emit events).

### 2026-04-13 - Optional local Excel fixture tests (tests/data/xlsx)
- Requirement/Milestone: [M-TS2], [F-TS02]
- What shipped: Vitest suites and `npm run inspect:excel-fixtures` scan `tests/data/xlsx/` recursively for `.xlsx` files when present (skipped in CI / clean checkouts). Couples fixtures match production `detectSourceType` (“paare” in basename); singles are non-paare basenames matching `MW[_\s]` (covers `Ergebnisliste MW_1.xlsx` and “MW Lauf” style names). `parseWorkbook` receives relative paths from the xlsx root. Shared discovery in `tests/ingestion/local-xlsx-fixture-discovery.ts`; tracked `tests/data/xlsx/.gitkeep`; `@types/node` for fs in tests; fixtures stay untracked via root `*.xlsx` gitignore.
- Evidence: `tests/ingestion/local-excel-examples.test.ts`, `tests/ingestion/local-xlsx-fixture-discovery.ts`, `tests/data/xlsx/.gitkeep`, `scripts/dump-local-excel-fixtures.ts`, `package.json` (devDependency `@types/node`)
- Impact: Local regression checks against organizer exports without bloating the repo or breaking automated runs.
- Follow-up: None required; optionally add golden row-count assertions per known file if desired.

### 2026-04-13 - Adversarial parity validation against Python
- Requirement/Milestone: [M-TS3], [R4], [R6]
- What shipped: Independently re-ran Python matching primitives on the exact golden-value cases used by TS cross-language parity tests (Ratcliff/Obershelp ratios, `parse_person_name`, `name_key`, `identity_fingerprint`, and selected `score_person_match` examples) to verify expected values were not derived from TS output.
- Evidence: `uv run python -c "<independent parity probe>"` in repo root; outputs matched `tests/matching/cross-language-parity.test.ts` constants, including known SHA-256 fingerprints and score=1.0 clamp cases.
- Impact: Increases confidence that parity assertions are anchored to real Python behavior and resistant to circular self-validation in TS tests.
- Follow-up: Optional: automate this as a reproducible Python-vs-TS differential check script for future regressions.

### 2026-04-13 - F-TS04 ranking engine and standings computation implemented
- Requirement/Milestone: [M-TS4], [R5]
- What shipped: Complete ranking engine ported from Python — `stundenlauf_v1` ruleset with top-4 aggregation, deterministic sorting (points desc, distance desc, team_id asc), per-team race contribution tracking with selected/dropped flags, distance rounding, and exclusion presentation layer (eligible-only filtering with rank renumbering, full view with exclusion markers). Universal team model eliminates entity_kind branching from Python version. All logic is pure functions over `SeasonState` with no I/O or framework dependencies. 46 new tests across 4 test files (aggregation unit tests, engine unit tests, exclusion unit tests, integration tests with realistic season fixtures and cross-version parity checks). Total project tests: 409 passing across 28 test files.
- Evidence: `src/ranking/types.ts`, `src/ranking/rules.ts`, `src/ranking/aggregation.ts`, `src/ranking/engine.ts`, `src/ranking/exclusions.ts`, `src/ranking/index.ts`, `tests/ranking/aggregation.test.ts` (13 tests), `tests/ranking/engine.test.ts` (15 tests), `tests/ranking/exclusions.test.ts` (11 tests), `tests/ranking/integration.test.ts` (7 tests)
- Impact: Standings can now be computed on demand from any `SeasonState` — the core R5 requirement for cumulative rankings is fulfilled. The engine reuses `isEffectiveRace` and `categoryKey` from the F-TS01 projection layer, and the exclusion functions integrate with the event-projected `SeasonState.exclusions` map. This unblocks F-TS08 (PDF/Excel export of standings) and F-TS06 (standings display in the UI).
- Follow-up: Implement F-TS05 (import orchestration) and F-TS06 (UI framework and German shell with standings display).

### 2026-04-13 - F-TS05 import orchestration workflow implemented
- Requirement/Milestone: [M-TS2], [R1], [R3], [R4], [R6], [R7]
- What shipped: Complete import orchestration module wiring together Excel parsing (F-TS02), fuzzy matching (F-TS03), review staging, and event batch construction (F-TS01) into a phased pipeline. Phased public API: `startImport()` (parse + validate), `runMatching()` (section iteration with progressive state enrichment), `resolveReviewEntry()` (link existing or create new identity), `finalizeImport()` (atomic event batch construction). Pre-import validation: SHA-256 duplicate detection, category/race-no conflict checking, intra-file duplicate row detection. Distance conversion (km→m), IncomingRowData construction, eligibility clearing, person/team deduplication, immutable session management, and import blocking. 55 new tests across 5 test files (validate, convert, review, finalize unit tests plus full pipeline integration tests). Total project tests: 464 passing across 33 test files.
- Evidence: `src/import/types.ts`, `src/import/validate.ts`, `src/import/convert.ts`, `src/import/session.ts`, `src/import/report.ts`, `src/import/start-import.ts`, `src/import/run-matching.ts`, `src/import/review.ts`, `src/import/finalize.ts`, `src/import/orchestrator.ts`, `tests/import/validate.test.ts`, `tests/import/convert.test.ts`, `tests/import/review.test.ts`, `tests/import/finalize.test.ts`, `tests/import/pipeline.test.ts`
- Impact: The full import pipeline is now operational — files can be parsed, validated, matched, reviewed, and committed as atomic event batches. This completes M-TS2 (Excel/CSV ingestion and team/participant registration) and unblocks F-TS06 (UI framework with import workflow screens).
- Follow-up: Implement F-TS06 (German UI shell and core workflows) and F-TS07 (season data portability).
