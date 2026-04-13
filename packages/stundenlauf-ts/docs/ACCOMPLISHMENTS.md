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
