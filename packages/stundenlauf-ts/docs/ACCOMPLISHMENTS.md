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
