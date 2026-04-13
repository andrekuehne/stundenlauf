---
name: F-TS02 Excel parsing
overview: Implement client-side Excel (.xlsx) parsing for the TypeScript port, replicating the Python ingestion adapters as pure browser-side functions using SheetJS. This covers types, helpers, singles/couples parsers, the entry-point auto-detector, and comprehensive tests.
todos:
  - id: install-sheetjs
    content: Install xlsx (SheetJS) as runtime dependency
    status: completed
  - id: types
    content: Create src/ingestion/types.ts with all import/parse output interfaces
    status: completed
  - id: errors
    content: Create src/ingestion/errors.ts with ExcelParseError, ValidationIssue, IssueLocation
    status: completed
  - id: constants
    content: Create src/ingestion/constants.ts with headers, markers, PARSER_VERSION
    status: completed
  - id: helpers
    content: Create src/ingestion/helpers.ts -- toText, parseDecimal, optionalClubFromCell, parseRaceNo, fileSha256, detectSourceType
    status: completed
  - id: parse-singles
    content: Create src/ingestion/parse-singles.ts -- state machine, header validation, row extraction
    status: completed
  - id: parse-couples
    content: Create src/ingestion/parse-couples.ts -- couples schema, YOB sentinel, two-name validation
    status: completed
  - id: parse-workbook
    content: Create src/ingestion/parse-workbook.ts -- entry point with auto-detect, SHA-256, metadata
    status: completed
  - id: barrel-exports
    content: Create src/ingestion/index.ts barrel; update/remove src/import/parser.ts stub
    status: completed
  - id: test-helpers
    content: Write tests/ingestion/helpers.test.ts -- all helper function unit tests
    status: completed
  - id: test-constants
    content: Write tests/ingestion/constants.test.ts -- header and marker parity checks
    status: completed
  - id: test-singles
    content: Write tests/ingestion/parse-singles.test.ts -- integration tests with synthetic XLSX
    status: completed
  - id: test-couples
    content: Write tests/ingestion/parse-couples.test.ts -- integration tests with synthetic XLSX
    status: completed
  - id: test-workbook
    content: Write tests/ingestion/parse-workbook.test.ts -- entry point, auto-detect, metadata
    status: completed
  - id: lint-typecheck-docs
    content: Run lint + typecheck, update ACCOMPLISHMENTS.md and PROJECT_PLAN.md
    status: completed
isProject: false
---

# F-TS02: Client-Side Excel Parsing Implementation

## Context

- **Requirement:** R1, R2, R7 -- import race data from Excel, support all race categories, keep data portable
- **Milestone:** M-TS2 (Excel/CSV ingestion and team/participant registration)
- **Depends on:** F-TS01 (Done) -- domain types `RaceDuration`, `Division` already exist in [`src/domain/types.ts`](packages/stundenlauf-ts/src/domain/types.ts)
- **Python source:** [`backend/ingestion/adapters/`](backend/ingestion/adapters/) (singles.py, couples.py, common.py), [`backend/ingestion/types.py`](backend/ingestion/types.py), [`backend/ingestion/validation.py`](backend/ingestion/validation.py), [`backend/domain/club.py`](backend/domain/club.py)

## Key Decisions

- **Library:** SheetJS (`xlsx` npm package) -- read-only subset, mature, default `data_only` behavior, no writing needed. Import only `read` + `utils` for minimal bundle.
- **Module location:** Create `src/ingestion/` directory (aligns with Python's `backend/ingestion/` and feature doc specification). The existing `src/import/parser.ts` stub will be replaced with a re-export pointing to the new module, or removed.
- **No Zod:** F-TS01 established hand-written validation; this feature continues that pattern.
- **Distance stays km:** Parser outputs `distance_km: number`; conversion to `distance_m: number` is downstream (F-TS05).

## Module Structure

All new files under `packages/stundenlauf-ts/src/ingestion/`:

```
src/ingestion/
  index.ts              -- public re-exports
  types.ts              -- ImportWorkbookMeta, ImportRaceContext, ImportRow*, ParsedSection*, ParsedWorkbook
  errors.ts             -- ExcelParseError, ValidationIssue, IssueLocation, ValidationIssueCode
  constants.ts          -- EXPECTED_HEADER_SINGLES, EXPECTED_HEADER_COUPLES, DURATION_MARKERS, DIVISION_MARKERS_*
  helpers.ts            -- toText, parseDecimal, optionalClubFromCell, parseRaceNo, fileSha256, detectSourceType
  parse-singles.ts      -- parseSinglesWorkbook()
  parse-couples.ts      -- parseCouplesWorkbook()
  parse-workbook.ts     -- parseWorkbook() entry point (auto-detect + delegate)
```

## Implementation Steps

### Step 1: Install SheetJS

Add `xlsx` as a runtime dependency:

```bash
npm install xlsx
```

Only the read path will be used. Verify tree-shaking by checking that `XLSX.read()` and `XLSX.utils.sheet_to_json()` work with `{ type: "array" }`.

### Step 2: Types (`src/ingestion/types.ts`)

Port all intermediate types from [Python `types.py`](backend/ingestion/types.py). Key differences from Python:
- No `series_year` on `ImportRaceContext` (the TS event model handles season context differently)
- `event_date` is always `null` from current parsers (forward-compat field)
- Rows use `readonly` arrays

```typescript
interface ImportWorkbookMeta {
  source_file: string;
  source_sha256: string;
  parser_version: string;       // "f-ts02-v1"
  schema_fingerprint: string;
  file_mtime: number;           // File.lastModified (ms)
  imported_at: string;          // ISO 8601
}

interface ImportRaceContext {
  race_no: number;
  duration: RaceDuration;       // from src/domain/types.ts
  division: Division;           // from src/domain/types.ts
  event_date: string | null;
}

interface ImportRowSingles { startnr, name, yob, club, distance_km, points }
interface ImportRowCouples { startnr, name_a, yob_a, club_a, name_b, yob_b, club_b, distance_km, points }
interface ParsedSection<R> { context: ImportRaceContext; rows: readonly R[] }
interface ParsedWorkbook { meta: ImportWorkbookMeta; singles_sections, couples_sections }
```

### Step 3: Errors (`src/ingestion/errors.ts`)

Port from [Python `validation.py`](backend/ingestion/validation.py):

- `IssueLocation { sheet, row, column }`
- `ValidationIssue { code, message_de, location, severity }`
- `ValidationIssueCode` union type (5 codes)
- `ExcelParseError extends Error` with `issues` array
- `makeIssue()` helper (mirrors Python's `make_issue`)

### Step 4: Constants (`src/ingestion/constants.ts`)

Port exact marker dictionaries from [Python `singles.py` line 26-28](backend/ingestion/adapters/singles.py) and [Python `couples.py` line 26-44](backend/ingestion/adapters/couples.py):

- `EXPECTED_HEADER_SINGLES`: 8-element tuple matching `("Platz", "Startnr.", "Name", "Jahrg.", "Verein", "Distanz", "Rückstand", "Punkte")`
- `EXPECTED_HEADER_COUPLES`: 11-element tuple with repeated Name/Jahrg./Verein columns
- `DURATION_MARKERS`: `{"1/2 h-Lauf": "half_hour", "h-Lauf": "hour"}`
- `DIVISION_MARKERS_SINGLES`: `{"Frauen": "women", "Männer": "men"}`
- `DIVISION_MARKERS_COUPLES`: `{"Paare Frauen": "couples_women", "Paare Männer": "couples_men", "Paare Mix": "couples_mixed"}`
- `PARSER_VERSION = "f-ts02-v1"`

### Step 5: Helpers (`src/ingestion/helpers.ts`)

Direct 1:1 port from [Python `common.py`](backend/ingestion/adapters/common.py) and [Python `club.py`](backend/domain/club.py):

- **`toText(value)`** -- `null/undefined -> ""`; else `String(value).trim()`
- **`parseDecimal(value)`** -- replace `,` with `.`, parseFloat, throw on empty/NaN
- **`optionalClubFromCell(value)`** -- null if empty or punctuation-only (use `[\p{L}\p{N}]` Unicode regex)
- **`parseRaceNo(fileName)`** -- regex cascade: `Lauf\s+(\d+)` first, then single isolated digit, else 0
- **`fileSha256(buffer)`** -- `crypto.subtle.digest("SHA-256", buffer)` -> hex string
- **`detectSourceType(fileName)`** -- `"paare"` in lowercase -> `"couples"`, else `"singles"`

### Step 6: Singles Parser (`src/ingestion/parse-singles.ts`)

Port the state machine from [Python `singles.py`](backend/ingestion/adapters/singles.py) lines 31-136:

1. Read first sheet with `XLSX.read(buffer, { type: "array" })`
2. Extract header from row 0 (0-indexed in SheetJS `sheet_to_json({ header: 1 })`) -- validate against `EXPECTED_HEADER_SINGLES`
3. Walk rows 1..N with the two-level state machine:
   - Duration marker -> flush + reset division
   - Division marker -> flush + set division
   - Data row (non-empty Name col C) -> validate context set, parse fields, buffer
4. Final flush; raise `no_rows` if empty
5. Build `ImportWorkbookMeta` with SHA-256, fingerprint, timestamps
6. Return `ParsedWorkbook` with `singles_sections`

Key parity details:
- Column indices: A=0, B=1, C=2, D=3, E=4, F=5, G=6(skip), H=7
- YOB: `parseInt(toText(cell), 10)` -- empty/NaN -> `invalid_number`
- Distance/Points: `parseDecimal()` -- handles German commas
- Club: `optionalClubFromCell()`
- `ValueError` catch wraps as `invalid_number` issue

### Step 7: Couples Parser (`src/ingestion/parse-couples.ts`)

Same structure as singles, ported from [Python `couples.py`](backend/ingestion/adapters/couples.py) lines 47-176:

- Different header (11 cols), different division markers
- Two-name validation: both empty -> skip; exactly one -> `invalid_couple_members`
- Couples YOB sentinel: empty -> `1900`; non-empty non-numeric -> error
- Columns: C=name_a, D=yob_a, E=club_a, F=name_b, G=yob_b, H=club_b, I=distance, K=points

### Step 8: Entry Point (`src/ingestion/parse-workbook.ts`)

```typescript
async function parseWorkbook(
  file: File | ArrayBuffer,
  fileName: string,
  options?: { raceNoOverride?: number; sourceType?: "singles" | "couples" }
): Promise<ParsedWorkbook>
```

1. Read `ArrayBuffer` from `File` if needed
2. Compute SHA-256
3. Detect source type (filename heuristic or explicit override)
4. Delegate to `parseSinglesWorkbook()` or `parseCouplesWorkbook()`
5. Attach metadata (sha256, mtime from `File.lastModified`, `imported_at`)

### Step 9: Update Stubs and Exports

- Create `src/ingestion/index.ts` barrel with public exports
- Update or remove existing `src/import/parser.ts` stub (redirect to ingestion module)
- Ensure `src/import/orchestrator.ts` stub stays (F-TS05 scope)

### Step 10: Tests -- Helpers

File: `tests/ingestion/helpers.test.ts`

Port test cases from feature doc's test plan:
- `toText`: null, undefined, number, whitespace string
- `parseDecimal`: integer, float, German comma `"12,5"` -> 12.5, empty throws, `"abc"` throws
- `optionalClubFromCell`: null, `""`, `"---"` (punct-only), `"TSV Süd"` (valid)
- `parseRaceNo`: `"Ergebnisliste MW Lauf 3.xlsx"` -> 3, `"results_5.xlsx"` -> 5, `"nodigit.xlsx"` -> 0, multi-digit -> 0
- `fileSha256`: known ArrayBuffer -> known hex digest
- `detectSourceType`: `"Ergebnisliste MW_Paare Lauf 1.xlsx"` -> `"couples"`, `"Ergebnisliste MW Lauf 1.xlsx"` -> `"singles"`

### Step 11: Tests -- Constants

File: `tests/ingestion/constants.test.ts`

- Verify header tuples match Python's exact strings (including `Rückstand`, `Startnr.`)
- Verify marker dictionaries have correct keys and values

### Step 12: Tests -- Singles Parser (Integration)

File: `tests/ingestion/parse-singles.test.ts`

Build synthetic XLSX workbooks in-memory using SheetJS `XLSX.utils.aoa_to_sheet()` + `XLSX.write()`:
- Valid workbook: 2 duration blocks x 2 divisions -> 4 sections, correct contexts and row values
- German comma in distance/points -> correct float
- Empty name rows -> silently skipped
- Wrong header -> `excel_schema_mismatch` with row 1 location
- Data row before markers -> `missing_section_marker`
- Non-numeric YOB -> `invalid_number`
- Zero data rows -> `no_rows`

### Step 13: Tests -- Couples Parser (Integration)

File: `tests/ingestion/parse-couples.test.ts`

Same synthetic workbook approach:
- Valid workbook with 3 divisions (Paare Frauen/Männer/Mix) -> 3 sections per duration
- Empty YOB -> sentinel 1900
- One-sided name -> `invalid_couple_members`
- All error paths from singles also tested for couples variant

### Step 14: Tests -- parseWorkbook Entry Point

File: `tests/ingestion/parse-workbook.test.ts`

- Auto-detect singles from filename
- Auto-detect couples from `"paare"` in filename
- Explicit `sourceType` override
- Race number override via `raceNoOverride`
- SHA-256 and metadata fields populated correctly

### Step 15: Lint, Typecheck, Documentation

- Run `npm run lint` and `npm run typecheck` -- fix any issues
- Update `docs/ACCOMPLISHMENTS.md` with F-TS02 entry
- Update `PROJECT_PLAN.md`: mark F-TS02 as Done, M-TS2 as In Progress

## Risks and Mitigations

- **SheetJS cell value differences from openpyxl:** Mitigated by testing with synthetic workbooks that mirror real file structure. SheetJS reads computed values by default (no `data_only` flag needed).
- **German Unicode in markers (`Männer`, `Rückstand`):** SheetJS preserves Unicode correctly from OOXML. Test with exact strings.
- **Bundle size:** Only import `read` and `utils` from SheetJS. Measure after install; document if over 200KB gzipped.
- **`crypto.subtle` in test env:** Vitest uses jsdom which may not have `crypto.subtle`. Will need to polyfill or mock in `tests/setup.ts` if missing.

## Verification

After implementation, all of the following must pass:

```bash
cd packages/stundenlauf-ts
npm run typecheck
npm run lint
npm test
```

Expected: 104 existing tests still pass + ~50-60 new ingestion tests.