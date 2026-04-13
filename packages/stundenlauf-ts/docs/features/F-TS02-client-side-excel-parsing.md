# F-TS02: Client-Side Excel Parsing

## Overview

- Feature ID: F-TS02
- Feature name: Client-side Excel (.xlsx) parsing for race result files
- Owner: —
- Status: Planned
- Related requirement(s): R1, R2, R7
- Related milestone(s): M-TS2
- Python predecessor(s): F02 (Excel ingestion adapters, `backend/ingestion/`)

## Problem Statement

Race organizers distribute results as `.xlsx` files with a fixed but idiosyncratic layout: a single worksheet containing interleaved **section markers** (duration blocks, division blocks) and **data rows**. Two file variants exist — one for singles (Einzellauf) and one for couples (Paarlauf) — each with a different column schema.

The Python version parses these files server-side with `openpyxl`. The TS port must replicate this parsing entirely **in the browser**, producing the same structured output that feeds into the matching engine and ultimately the event log. No server round-trip; the user drags or picks a file, and parsing happens client-side in JavaScript.

This feature covers **only the parsing and structural validation** of the Excel file into typed intermediate representations. It does **not** cover:

- The matching engine (deciding which team an entry belongs to).
- Event emission (writing to the event log).
- Name normalization or fuzzy scoring (consumed downstream).

The parser's job ends when it delivers a `ParsedWorkbook` — an array of typed sections, each containing typed rows and a race context — to the caller.

## Scope

### In Scope

- Read `.xlsx` files client-side using a JavaScript xlsx library (SheetJS or ExcelJS).
- Validate the fixed header row against expected column tuples (singles and couples schemas).
- Implement the section-marker state machine that detects duration and division blocks.
- Extract typed row data for singles and couples, including all columns.
- Parse race number from the filename (regex, same logic as Python).
- Compute file SHA-256 for duplicate-import detection.
- Produce structured validation errors with sheet/row/column location.
- Handle German decimal format (comma as decimal separator).
- Handle club-cell normalization (empty/punctuation-only → null).
- Handle missing YOB for couples (sentinel value 1900).
- Produce a `ParsedWorkbook` with metadata and typed sections.
- Auto-detect singles vs. couples from the filename (`"paare"` in lowercase name → couples).

### Out of Scope

- Matching engine (F-TS03 or later): name parsing, fingerprinting, fuzzy scoring, candidate ranking.
- Event emission: translating parsed rows into `race.registered` / `person.registered` / `team.registered` events (that is the import workflow, which consumes this parser's output).
- Name normalization beyond raw `trim()` — the parser stores the raw name string exactly as it appears in the cell; canonical parsing (`parse_person_name`) belongs to the matching layer.
- Legacy `.xls` (BIFF) format support — the Python version also only supports `.xlsx` via openpyxl despite the file picker advertising `.xls`.
- UI for file selection or drag-and-drop (UI feature covers that).
- CSV ingestion (possible future extension, not part of this feature).

## Acceptance Criteria

- [ ] Singles workbook with valid header and section markers produces the correct number of `ParsedSectionSingles` with the right `ImportRaceContext` and `ImportRowSingles` values.
- [ ] Couples workbook with valid header and section markers produces the correct number of `ParsedSectionCouples` with the right `ImportRaceContext` and `ImportRowCouples` values.
- [ ] Header mismatch raises a structured `ParseError` with code `excel_schema_mismatch` and location pointing to row 1.
- [ ] Data row appearing before any duration/division marker raises `missing_section_marker`.
- [ ] Non-numeric or empty distance/points/yob raises `invalid_number` with row and column location.
- [ ] Couples row with only one of two names filled raises `invalid_couple_members`.
- [ ] Workbook with no parseable sections/rows raises `no_rows`.
- [ ] German decimal comma (`12,5`) is parsed correctly as `12.5`.
- [ ] Club cells that are empty, null, or contain only punctuation yield `null`.
- [ ] Couples YOB: empty cell yields sentinel `1900`; non-empty non-numeric raises error.
- [ ] Race number is extracted from the filename using the same regex as Python.
- [ ] SHA-256 of the file content is computed for deduplication.
- [ ] Output types are strict TypeScript interfaces with no `any`.
- [ ] Parser logic is framework-agnostic (pure functions, no UI imports).
- [ ] Parsing the same fixture files used in Python tests produces equivalent structured output.

---

## Technical Plan

### 1. Library Choice

The Python version uses `openpyxl`. For client-side `.xlsx` reading, two main options:

| Library | Pros | Cons |
|---|---|---|
| **SheetJS (xlsx)** | Mature, widely used, handles edge cases, small bundle for read-only | Community Edition license; large full bundle (tree-shake to read-only) |
| **ExcelJS** | MIT license, streaming support | Larger bundle, slower for read-only use case |

**Recommendation:** SheetJS (read-only subset). The parser only needs to read cell values from the first sheet — no writing, no formatting, no formulas. SheetJS's `read` with `{ type: "array" }` covers this. Evaluate bundle size during M-TS1 scaffold; switch to ExcelJS if licensing is a concern.

The parser must handle `data_only` semantics (read computed values from formula cells, not formulas themselves). SheetJS does this by default when reading.

### 2. File Input

The parser receives a `File` object (from `<input type="file">` or drag-and-drop) or an `ArrayBuffer`. It does **not** manage the file picker UI — that is a UI-layer concern.

```typescript
async function parseWorkbook(
  file: File | ArrayBuffer,
  fileName: string,
  options?: { raceNoOverride?: number; sourceType?: "singles" | "couples" }
): Promise<ParsedWorkbook>
```

### 3. Excel Layout: Singles (Einzellauf)

The organizer's singles file uses the first (and only relevant) worksheet. Row 1 is a fixed header. Subsequent rows are either section markers or data rows.

#### Header (row 1, columns A–H)

Must match exactly after trimming:

```
("Platz", "Startnr.", "Name", "Jahrg.", "Verein", "Distanz", "Rückstand", "Punkte")
```

#### Section markers (column A of data rows)

Parsing uses a **state machine** with two levels of nesting:

1. **Duration marker** — column A matches one of:
   - `"1/2 h-Lauf"` → `RaceDuration.HALF_HOUR` (30-minute race)
   - `"h-Lauf"` → `RaceDuration.HOUR` (60-minute race)

   Encountering a duration marker **flushes** any buffered rows into a section and **resets** the current division to null.

2. **Division marker** — column A matches one of:
   - `"Frauen"` → `Division.WOMEN`
   - `"Männer"` → `Division.MEN`

   Encountering a division marker **flushes** buffered rows.

A valid section requires both a duration and a division to be set before data rows appear.

#### Data rows

A row is a data row if column A is not a marker and column C (Name) is non-empty. Empty-name rows are skipped silently.

| Column | Header | Field | Type | Notes |
|---|---|---|---|---|
| A | Platz | *(not imported)* | — | Rank; only used as section marker check |
| B | Startnr. | `startnr` | `string` | Raw text, not parsed as number |
| C | Name | `name` | `string` | Raw trimmed text; no semantic parsing here |
| D | Jahrg. | `yob` | `number` | `parseInt`; error if empty or NaN |
| E | Verein | `club` | `string \| null` | Via club-cell normalization (see §7) |
| F | Distanz | `distance_km` | `number` | `parseDecimal`; German comma supported |
| G | Rückstand | *(not imported)* | — | Gap to leader; ignored |
| H | Punkte | `points` | `number` | `parseDecimal` |

#### Example sheet layout

```
Row 1:  Platz | Startnr. | Name         | Jahrg. | Verein    | Distanz | Rückstand | Punkte
Row 2:  1/2 h-Lauf
Row 3:  Frauen
Row 4:  1     | 12       | Meyer, Anna  | 1990   | TSV Süd   | 5,2     | 0,0       | 100
Row 5:  2     | 15       | Koch, Lisa   | 1985   |           | 4,8     | 0,4       | 95
Row 6:  Männer
Row 7:  1     | 3        | Schmidt, Jan | 1988   | SV Nord   | 6,1     | 0,0       | 100
...
Row N:  h-Lauf
Row N+1: Frauen
...
```

### 4. Excel Layout: Couples (Paarlauf)

Same structural principles, different column schema and different section markers.

#### Header (row 1, columns A–K)

Must match exactly after trimming:

```
("Platz", "Startnr.", "Name", "Jahrg.", "Verein", "Name", "Jahrg.", "Verein", "Distanz", "Rückstand", "Punkte")
```

Note the repeated `Name`, `Jahrg.`, `Verein` columns — one set for each member of the couple.

#### Section markers (column A)

Same two-level state machine:

1. **Duration markers** — identical to singles: `"1/2 h-Lauf"`, `"h-Lauf"`.
2. **Division markers** — couples-specific:
   - `"Paare Frauen"` → `Division.COUPLES_WOMEN`
   - `"Paare Männer"` → `Division.COUPLES_MEN`
   - `"Paare Mix"` → `Division.COUPLES_MIXED`

#### Data rows

A row is a data row when both column C (Name A) and column F (Name B) are non-empty. If exactly one is filled and the other is empty, raise `invalid_couple_members`.

| Column | Header | Field | Type | Notes |
|---|---|---|---|---|
| A | Platz | *(not imported)* | — | |
| B | Startnr. | `startnr` | `string` | |
| C | Name | `name_a` | `string` | Member A name, raw trimmed |
| D | Jahrg. | `yob_a` | `number` | Empty → `1900` sentinel; non-numeric → error |
| E | Verein | `club_a` | `string \| null` | Club-cell normalization |
| F | Name | `name_b` | `string` | Member B name, raw trimmed |
| G | Jahrg. | `yob_b` | `number` | Same rules as `yob_a` |
| H | Verein | `club_b` | `string \| null` | |
| I | Distanz | `distance_km` | `number` | `parseDecimal` |
| J | Rückstand | *(not imported)* | — | |
| K | Punkte | `points` | `number` | `parseDecimal` |

### 5. Section Marker State Machine

Both parsers follow the same algorithm (parameterized by their marker dictionaries):

```
state = { currentDuration: null, currentDivision: null, rowsBuffer: [] }
sections = []

for each row after header:
    marker = trimmed text of column A
    if marker in DURATION_MARKERS:
        flush(state, sections)
        state.currentDuration = DURATION_MARKERS[marker]
        state.currentDivision = null          // reset division on new duration block
        continue
    if marker in DIVISION_MARKERS:
        flush(state, sections)
        state.currentDivision = DIVISION_MARKERS[marker]
        continue
    if row has name(s):                       // non-empty Name column(s)
        if state.currentDuration == null || state.currentDivision == null:
            error: missing_section_marker
        parse and buffer the data row
flush(state, sections)                        // final flush
if sections is empty: error: no_rows
```

`flush()` appends a typed section (with `ImportRaceContext` carrying `raceNo`, `duration`, `division`, `event_date`) to the sections list and clears the buffer. It is a no-op if the buffer is empty or duration/division are unset.

### 6. Race Number from Filename

Extracted via the same regex cascade as Python:

```typescript
function parseRaceNo(fileName: string): number {
  const laufMatch = fileName.match(/Lauf\s+(\d+)/i);
  if (laufMatch) return parseInt(laufMatch[1], 10);

  const isolated = fileName.match(/(?<!\d)\d(?!\d)/g);
  if (isolated && isolated.length === 1) {
    const n = parseInt(isolated[0], 10);
    return n >= 1 ? n : 0;
  }
  return 0;
}
```

The caller can override with `raceNoOverride`.

### 7. Helper Functions

#### `toText(value: unknown): string`

```typescript
function toText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}
```

#### `parseDecimal(value: unknown): number`

Handles German comma-as-decimal-separator:

```typescript
function parseDecimal(value: unknown): number {
  const text = toText(value).replace(",", ".");
  if (!text) throw new ParseError("empty");
  const n = parseFloat(text);
  if (isNaN(n)) throw new ParseError("not a number");
  return n;
}
```

#### `optionalClubFromCell(value: unknown): string | null`

```typescript
function optionalClubFromCell(value: unknown): string | null {
  const text = toText(value);
  if (!text) return null;
  if (![...text].some(ch => /[\p{L}\p{N}]/u.test(ch))) return null;  // punctuation-only → null
  return text;
}
```

#### `fileSha256(buffer: ArrayBuffer): Promise<string>`

Uses the Web Crypto API (`crypto.subtle.digest("SHA-256", buffer)`) to produce a hex digest. This replaces the Python `hashlib.sha256` and requires no additional library.

### 8. Output Types

```typescript
interface ImportWorkbookMeta {
  source_file: string;           // original filename
  source_sha256: string;         // hex digest of file content
  parser_version: string;        // e.g. "f-ts02-v1"
  schema_fingerprint: string;    // "{sheetTitle}|{headers}|sections={n}" — diagnostic, not persisted in event log
  file_mtime: number;            // File.lastModified (ms since epoch)
  imported_at: string;           // ISO 8601 timestamp of when the parse occurred
}

interface ImportRaceContext {
  race_no: number;
  duration: RaceDuration;        // "half_hour" | "hour"
  division: Division;            // "men" | "women" | "couples_men" | "couples_women" | "couples_mixed"
  event_date: string | null;     // ISO 8601 date if available; null from current Excel parsers
}

interface ImportRowSingles {
  startnr: string;
  name: string;
  yob: number;
  club: string | null;
  distance_km: number;
  points: number;
}

interface ImportRowCouples {
  startnr: string;
  name_a: string;
  yob_a: number;
  club_a: string | null;
  name_b: string;
  yob_b: number;
  club_b: string | null;
  distance_km: number;
  points: number;
}

interface ParsedSection<R> {
  context: ImportRaceContext;
  rows: R[];
}

type ParsedSectionSingles = ParsedSection<ImportRowSingles>;
type ParsedSectionCouples = ParsedSection<ImportRowCouples>;

interface ParsedWorkbook {
  meta: ImportWorkbookMeta;
  singles_sections: ParsedSectionSingles[];
  couples_sections: ParsedSectionCouples[];
}
```

### 9. Validation Error Types

```typescript
interface IssueLocation {
  sheet: string;
  row: number;
  column: string;
}

interface ValidationIssue {
  code: ValidationIssueCode;
  message_de: string;
  location: IssueLocation;
  severity: "error" | "warning";
}

type ValidationIssueCode =
  | "excel_schema_mismatch"
  | "missing_section_marker"
  | "invalid_number"
  | "invalid_couple_members"
  | "no_rows";

class ExcelParseError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(issues[0]?.message_de ?? "Import validation failed.");
  }
}
```

German-language `message_de` values match the Python version for consistency:

| Code | message_de |
|---|---|
| `excel_schema_mismatch` | `"Excel-Format stimmt nicht: Kopfzeile für Einzellauf ist unerwartet."` (singles) / `"...Paarlauf..."` (couples) |
| `missing_section_marker` | `"Abschnittsmarker fehlt vor Ergebniszeile."` / `"...Paarlauf-Ergebniszeile."` |
| `invalid_number` | `"Ungültiger Zahlenwert in Einzellauf-Zeile."` / `"...Paarlauf-Zeile."` |
| `invalid_couple_members` | `"Paarlauf-Zeile muss genau zwei Namen enthalten."` |
| `no_rows` | `"Keine Ergebniszeilen im Einzellauf gefunden."` / `"...Paarlauf..."` |

### 10. Singles vs. Couples Detection

The same heuristic as Python:

```typescript
function detectSourceType(fileName: string): "singles" | "couples" {
  return fileName.toLowerCase().includes("paare") ? "couples" : "singles";
}
```

The caller can override via an explicit `sourceType` option.

### 11. Distance Units: km (float), Not Meters

The Python version stores distance as `distance_km: float` throughout the ingestion pipeline. The organizer's Excel files express distance in kilometers with decimal fractions (e.g. `12,5` = 12.5 km).

The parser preserves this as `distance_km: number`. **Conversion to integer meters** (`distance_m`) happens downstream when the import workflow constructs `RaceEntryInput` for the event log (as specified in F-TS01). This feature does not perform that conversion.

### 12. Metadata Fields

Both `file_mtime` and `imported_at` are now part of the `ImportWorkbookMeta` type definition (§8). `file_mtime` comes from `File.lastModified` (milliseconds since epoch). `imported_at` is set to `new Date().toISOString()` at parse time.

`event_date` is carried on `ImportRaceContext` (§8) for forward compatibility. Current Excel parsers always set it to `null` because the organizer's files do not contain a date field.

`schema_fingerprint` is diagnostic metadata for debugging parser/layout issues. It is not persisted in the event log — the event log captures `source_file`, `source_sha256`, and `parser_version` on `import_batch.recorded` (F-TS01), which is sufficient for provenance.

### 13. Module Structure

```
src/
  ingestion/
    parse-singles.ts       // parseSinglesWorkbook()
    parse-couples.ts       // parseCouplesWorkbook()
    parse-workbook.ts      // parseWorkbook() — entry point, auto-detects type
    helpers.ts             // toText, parseDecimal, optionalClubFromCell, parseRaceNo, fileSha256
    types.ts               // all interfaces and enums for parsed output
    errors.ts              // ExcelParseError, ValidationIssue, IssueLocation
    constants.ts           // EXPECTED_HEADER_*, DURATION_MARKERS, DIVISION_MARKERS
```

All exports are pure functions with no side effects, no framework dependencies, no DOM access (except `crypto.subtle` for SHA-256, which is available in Web Workers too).

---

## Mapping from Python Implementation

### Python approach

- `openpyxl.load_workbook(path, data_only=True)` opens the `.xlsx` file from the filesystem.
- `singles.py` and `couples.py` in `backend/ingestion/adapters/` implement the two parsers.
- `common.py` provides `to_text`, `parse_decimal`, `file_sha256`, `parse_race_no`, `PARSER_VERSION`.
- `club.py` provides `optional_club_from_cell`.
- `types.py` defines `ImportRowSingles`, `ImportRowCouples`, `ParsedSectionSingles`, `ParsedSectionCouples`, `ParsedWorkbook`, `ImportWorkbookMeta`, `ImportRaceContext`.
- `validation.py` defines `ImportValidationError` with `ValidationIssue` and `IssueLocation`.
- `service.py` orchestrates: picks singles vs. couples parser, checks for duplicate imports (by SHA-256), checks for race-number/category conflicts, then delegates to the matching workflow.

### TS port differences

| Aspect | Python | TS Port |
|---|---|---|
| Library | `openpyxl` (server-side) | SheetJS or ExcelJS (client-side, in-browser) |
| File input | `Path` on filesystem | `File` / `ArrayBuffer` from browser |
| SHA-256 | `hashlib.sha256` | `crypto.subtle.digest` (Web Crypto API) |
| `file_mtime` | `Path.stat().st_mtime` | `File.lastModified` (ms since epoch) |
| Distance unit | `float` km throughout | `float` km in parser; converted to integer meters downstream (F-TS01) |
| `imported_at` | `datetime.now(UTC).isoformat()` | `new Date().toISOString()` |
| Error type | `ImportValidationError(ValueError)` with tuple of issues | `ExcelParseError(Error)` with array of issues |
| Couples YOB sentinel | `1900` for empty cells | Same: `1900` |
| Club empty | `None` if empty or punctuation-only | `null` if empty or punctuation-only |
| Parser version | `"f02-v1"` | `"f-ts02-v1"` |

### Reusable logic (direct port)

- Section marker state machine: identical algorithm, just different syntax.
- `toText`, `parseDecimal`: trivial 1:1 port.
- `optionalClubFromCell`: same logic with JS regex for alphanumeric check.
- `parseRaceNo`: same regex patterns.
- Header validation: exact string tuple comparison.
- All validation issue codes and German messages: identical strings.

### Not ported here (downstream concerns)

- `import_excel_into_project` (service orchestration): becomes the import workflow that calls this parser, then feeds results to matching, then emits events.
- `map_singles_section` / `map_couples_section` (mapping.py): delegation to the matching workflow; not part of parsing.
- `process_singles_section` / `process_couples_section` (workflow.py): matching + event creation; separate feature.

---

## Risks and Assumptions

- **Assumption:** SheetJS (or ExcelJS) reads the same cell values as openpyxl for the file layouts used by the organizer. Edge cases: merged cells, formula-only cells, date-formatted cells.
  - Mitigation: fixture-based testing with the same Excel files used in Python tests.
- **Assumption:** `crypto.subtle` is available in all target browsers (latest two major releases of Chrome, Firefox, Safari, Edge) and in Web Workers.
  - Mitigation: this is a baseline Web Crypto API feature, universally available since 2015+.
- **Risk:** SheetJS bundle size may be large if not tree-shaken properly.
  - Mitigation: import only `read` and the minimal sheet-reading utilities; measure bundle size during scaffold (M-TS1).
- **Risk:** German characters (umlauts, ß) in header strings or section markers may be affected by encoding issues if the xlsx library returns unexpected Unicode normalization.
  - Mitigation: normalize comparison strings with NFC if needed; test with real fixture files containing `Männer`, `Rückstand`, `Startnr.`.
- **Risk:** The Excel file layout may evolve (organizer changes columns or markers).
  - Mitigation: strict header validation catches this immediately; parser version is tracked in metadata.
- **Assumption:** Only `.xlsx` (Office Open XML) files need to be supported. Legacy `.xls` (BIFF) is out of scope, consistent with the Python version's actual behavior.

## Implementation Steps

1. Set up `src/ingestion/` module structure and TypeScript interfaces for all output types (`types.ts`, `errors.ts`, `constants.ts`).
2. Implement `helpers.ts`: `toText`, `parseDecimal`, `optionalClubFromCell`, `parseRaceNo`, `fileSha256`.
3. Implement `parse-singles.ts`: header validation, state machine, row extraction, section flushing, metadata construction.
4. Implement `parse-couples.ts`: same structure with couples column schema and markers.
5. Implement `parse-workbook.ts`: auto-detect singles/couples from filename, delegate to the correct parser.
6. Write unit tests for all helper functions (decimal parsing, club normalization, race number extraction, SHA-256).
7. Write integration tests for singles and couples parsers using synthetic workbook fixtures (build minimal `.xlsx` in tests or use JSON sheet representations).
8. Port key Python fixture-based tests to verify behavioral parity.
9. Test error paths: wrong header, missing markers, invalid numbers, one-sided couple names, empty workbook.
10. Measure bundle size of the xlsx library import; document in ADR if relevant.

## Test Plan

- **Unit (helpers.ts):**
  - `toText`: null, undefined, number, string with whitespace → trimmed string.
  - `parseDecimal`: integer, float, German comma, empty, non-numeric → correct value or error.
  - `optionalClubFromCell`: null, empty, punctuation-only, valid club → correct output.
  - `parseRaceNo`: `"Ergebnisliste MW Lauf 3.xlsx"` → 3; `"results_5.xlsx"` → 5; `"nodigit.xlsx"` → 0; `"multi12.xlsx"` → 0.
  - `fileSha256`: known input → known hex digest.

- **Unit (constants):**
  - Header tuples match Python's `EXPECTED_HEADER` exactly.
  - Duration and division marker dictionaries match Python's dictionaries.

- **Integration (parse-singles):**
  - Valid workbook with two duration blocks × two division blocks → 4 sections with correct contexts.
  - Single section with multiple data rows → correct row count and field values.
  - German comma in Distanz/Punkte → correct float values.
  - Empty name rows → silently skipped.

- **Integration (parse-couples):**
  - Valid workbook with three division markers (Paare Frauen/Männer/Mix) → 3 sections per duration block.
  - Empty YOB cell → sentinel 1900.
  - One-sided name → `invalid_couple_members` error.

- **Error paths:**
  - Wrong header → `excel_schema_mismatch`.
  - Data row before markers → `missing_section_marker`.
  - Non-numeric distance → `invalid_number` with correct row/column.
  - Zero sections → `no_rows`.

- **Fixture-based:**
  - Create synthetic `.xlsx` files that mirror the structure of the organizer's real files.
  - Verify that parsing them produces the same section count, row count, and field values as the Python parser does for equivalent input.

- **Cross-library:**
  - If evaluating both SheetJS and ExcelJS, run the same test suite against both to verify consistent cell-value reading.

## Definition of Done

- [ ] Code implemented in TypeScript
- [ ] Tests added/updated and passing (Vitest)
- [ ] Types are strict (no `any` escapes without justification)
- [ ] Docs updated
- [ ] Entry added to `packages/stundenlauf-ts/docs/ACCOMPLISHMENTS.md`
- [ ] Requirement/milestone status updated in `packages/stundenlauf-ts/PROJECT_PLAN.md`

## Links

- Python source reference(s):
  - `backend/ingestion/adapters/singles.py` — singles parser (header, markers, state machine, row extraction)
  - `backend/ingestion/adapters/couples.py` — couples parser (wider column schema, YOB sentinel, couple-member validation)
  - `backend/ingestion/adapters/common.py` — shared helpers (`to_text`, `parse_decimal`, `file_sha256`, `parse_race_no`, `PARSER_VERSION`)
  - `backend/ingestion/types.py` — all intermediate types (`ImportRowSingles`, `ImportRowCouples`, `ParsedWorkbook`, `ImportWorkbookMeta`, etc.)
  - `backend/ingestion/validation.py` — `ImportValidationError`, `ValidationIssue`, `IssueLocation`
  - `backend/ingestion/mapping.py` — thin delegation to matching workflow (boundary between parsing and matching)
  - `backend/ingestion/service.py` — orchestration: parser selection, duplicate/conflict checks, matching invocation
  - `backend/domain/club.py` — `optional_club_from_cell` (club normalization for raw cell values)
  - `backend/domain/enums.py` — `RaceDuration`, `Division` (referenced by section markers)
  - `tests/test_f02_ingestion.py` — Python test suite (fixture-based and synthetic workbook tests)
