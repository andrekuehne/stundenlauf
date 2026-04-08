# Implementation plan for Excel ingestion and race merge
_Exported on 4/8/2026 at 09:00:16 GMT+2 from Cursor (3.0.12)_

---

**User**

Read PROJECT_PLAN.md and docs/features/F02-excel-ingestion-and-race-merge.md and produce a detailed implementation plan with tasks and test cases. There are example datasets under data/2023 with the singles races in "Ergebnisliste MW Lauf x.xlsx" and the couples in "Ergebnisliste MW_Paare Lauf x.xlsx"

---

**Cursor**

Got it. I’ll read `PROJECT_PLAN.md` and the F02 feature spec, then turn that into a concrete, step-by-step implementation plan (tasks + acceptance criteria) and a focused set of test cases using the `data/2023` Excel examples as fixtures.

Next I’ll quickly scan the repository structure (where the ingestion code should live, what the current domain/storage layer looks like), then I’ll draft a detailed task breakdown for M2/R1–R3 including concrete parser/validator/merge steps and a fixture-driven test matrix based on the `data/2023` Excel files.

I’m going to inspect `main.py` and `pyproject.toml` to understand the current package layout and dependencies, then I’ll enumerate the available Excel fixtures under `data/` so the plan can name specific test files.

## What I read (context + constraints)

- `PROJECT_PLAN.md` ties this work to **R1–R3** and **Milestone M2** and emphasizes **deterministic parsing, strict validation, idempotency guards, and portable file-based storage**.
- `docs/features/F02-excel-ingestion-and-race-merge.md` defines the pipeline shape: **read → validate → map → merge**, plus import metadata (`source_file`, `imported_at`, version) and strict header/schema checks.
- `docs/features/F01-domain-model-and-storage.md` defines the **canonical targets** F02 must produce: `Person`, `Couple`, `RaceSeriesCategory` (year+duration+division), `RaceEvent`, `RaceEntry` (+ `startnr`), result metrics (`distance_km`, `points`), and a **JSON project file** with versioning + atomic save.

You also have fixture Excel files under `data/2023/`:
- Singles: `Ergebnisliste MW Lauf 1.xlsx` … `Lauf 5.xlsx`
- Couples: `Ergebnisliste MW_Paare Lauf 1.xlsx` … `Lauf 5.xlsx`

---

## Detailed implementation plan (tasks)

### A) Decide/lock the import contract (intermediate model + errors)
- **A1. Define “intermediate import model” types**
  - `ImportWorkbookMeta`: `source_path`, `source_sha256`, `file_mtime`, `imported_at`, `parser_version`, `schema_fingerprint`
  - `ImportRaceContext`: `series_year`, `race_no`, `duration` (`half_hour|hour`), `division` (`men|women|couples_*`), optional `event_date`
  - `ImportRowSingles`: `startnr`, `name`, `yob`, optional `club`, `distance_km`, `points`
  - `ImportRowCouples`: `startnr`, member1 fields, member2 fields, `distance_km`, `points`
- **A2. Standardize validation + error reporting**
  - `ValidationIssue`: `code`, `message_de` (German user text), `location` (sheet/row/column), `severity`
  - Ensure failures are **actionable** (e.g., “Spalte ‘Punkte’ fehlt” vs “KeyError”).
- **A3. Define idempotency + duplicate import behavior**
  - Compute `source_sha256` over file bytes.
  - Merge policy:
    - If `source_sha256` already imported into same project → **no-op** with a clear message.
    - If file path matches but hash differs → import allowed, stored as a new race *only if* it doesn’t collide on `(year, duration, division, race_no)`; otherwise flagged for review.

### B) Implement Excel adapters (fixed templates)
Create a dedicated adapter per template to keep drift isolated.

- **B1. Singles adapter** for `Ergebnisliste MW Lauf X.xlsx`
  - Load workbook (prefer `openpyxl` directly; optionally use `pandas.read_excel` only if layout is cleanly tabular).
  - Identify:
    - Which sheets contain relevant tables.
    - Where the header row starts.
    - Column mapping (explicit names → canonical fields).
  - Extract rows into `ImportRowSingles[]` + `ImportRaceContext`.
  - Produce a **schema fingerprint**: `(sheet names + header row values + mapped columns)` and hard-fail if it changes unexpectedly.

- **B2. Couples adapter** for `Ergebnisliste MW_Paare Lauf X.xlsx`
  - Similar, but extract two-member structures and ensure member order is irrelevant later (F01 rule).
  - Explicitly map member columns (e.g., `Name1`, `Jg1`, `Name2`, `Jg2`, …).

- **B3. Robustness features**
  - Trim whitespace, normalize decimal commas (`"12,34"` → `12.34`), tolerate empty club.
  - Hard validation on required fields: name, yob, distance, points; and for couples: exactly 2 members.

### C) Map import model → canonical domain structures (F01 shapes)
- **C1. Build mapping functions**
  - `import_row_to_person(...)` and `import_row_to_couple(...)` (do not dedupe identities here; that’s F03/F05 territory—F02 should produce canonical records ready for matching).
  - `import_context_to_category_key(year, duration, division)`
  - `import_rows_to_race_event(...)` creating:
    - `RaceEvent` with metadata (race number, source metadata)
    - `RaceEntry[]` with `startnr` and `EntryResult(distance_km, points)`
- **C2. Store import metadata**
  - Attach `source_file`, `source_sha256`, `imported_at`, `parser_version`, `schema_fingerprint` on the `RaceEvent` (or dedicated `ImportRecord` attached to it).

### D) Merge into project storage (append + trigger downstream)
- **D1. Load project file**
  - Use the repository layer from F01 (JSON + schema_version + atomic save).
- **D2. Merge strategy**
  - Append new `RaceEvent` under the correct `RaceSeriesCategory`.
  - Guard against duplicates:
    - Same `(category_key, race_no)` exists → reject with clear error unless explicitly “replace” (optional later).
- **D3. Trigger downstream pipeline hooks**
  - Emit a “merge completed” result containing:
    - new race IDs/events
    - summary counts (#rows imported, #skipped, #issues)
    - placeholder hook outputs for matching/recompute (actual internals in later features, but the call boundary is defined here).

### E) CLI or script entrypoint for importing fixtures
- **E1. Create a simple command**
  - `uv run python -m stundenlauf.import_excel --project <path> --excel <path>`
  - Output a German summary and a machine-readable JSON result (useful for tests/CI).
- **E2. Ensure Windows path handling** (spaces in filenames like `MW_Paare` and `MW Lauf`).

### F) Documentation + project tracking
- **F1. Update `docs/features/F02...md`** with:
  - exact adapter responsibilities
  - idempotency rules
  - schema fingerprint mechanism
- **F2. Update `PROJECT_PLAN.md`** progress for **R1** and **M2** once implemented.
- **F3. Add outcome entry** to `docs/ACCOMPLISHMENTS.md` after completion.

---

## Test plan (detailed test cases)

### 1) Unit tests: parsing + mapping
Use the real fixture files under `data/2023/` as “golden inputs” wherever deterministic.

- **T1. Singles file parses without errors (each Lauf 1–5)**
  - Input: `data/2023/Ergebnisliste MW Lauf 1.xlsx` (repeat for 2–5)
  - Assert:
    - adapter returns non-empty rows
    - all rows have `name`, `yob`, `distance_km`, `points`
    - no unknown columns were silently ignored (only mapped set allowed)

- **T2. Couples file parses without errors (each Lauf 1–5)**
  - Input: `data/2023/Ergebnisliste MW_Paare Lauf 1.xlsx` (repeat for 2–5)
  - Assert:
    - each row yields exactly two members with required fields
    - distance/points parsed as numeric

- **T3. Decimal comma handling**
  - If fixtures contain comma decimals: assert values parse correctly.
  - Otherwise: construct a minimal in-memory sheet (or a tiny synthetic xlsx fixture) to validate `"12,5"` → `12.5`.

- **T4. Header/schema fingerprint check**
  - Create a modified copy fixture (or synthetic workbook) where a required header is renamed.
  - Assert import fails with:
    - `ValidationIssue.code = "excel_schema_mismatch"`
    - German message naming the missing/renamed header.

- **T5. Validation branches**
  - Synthetic workbook rows to cover:
    - missing `name`
    - invalid `yob` (non-int / out-of-range)
    - negative distance/points
    - couples row missing member2

### 2) Integration tests: merge + idempotency + persistence
- **T6. Import a single race into an empty project**
  - Given a new project file (temp path)
  - When importing `MW Lauf 1`
  - Then project contains:
    - 1 `RaceEvent` stored
    - import metadata recorded
    - counts match adapter output

- **T7. Import multiple races (1→5)**
  - Import `MW Lauf 1..5`
  - Assert:
    - 5 events in the correct category bucket(s)
    - each event has unique race_no
    - deterministic ordering or stable IDs (whichever the repository specifies)

- **T8. Import couples after singles (and vice versa)**
  - Import `MW Lauf 1` then `MW_Paare Lauf 1`
  - Assert they land in distinct `RaceSeriesCategory` divisions and don’t collide.

- **T9. Idempotency: re-import same file is no-op**
  - Import `MW Lauf 1` twice
  - Assert second run returns a result like:
    - `status = "already_imported"`
    - project file unchanged (hash/mtime compare or re-load and compare events)

- **T10. Duplicate race_no collision**
  - Import `MW Lauf 1`
  - Attempt to import a different file that maps to same `(year, duration, division, race_no=1)`
  - Assert: hard failure with clear error message.

- **T11. Atomic write behavior**
  - Simulate a failure during save (e.g., repository injected fault / write to read-only directory).
  - Assert original project remains readable and unchanged.

### 3) Manual verification (fast checklist)
- **M1. Run import on all 10 fixtures**
  - Confirm output summary in German: rows imported per file, issues count, stored race count.
- **M2. Spot-check one athlete/team across races**
  - Ensure `startnr` is stored per race entry (can differ across races).

---

## Deliverables checklist (what “done” looks like for F02)
- **Parser/adapters** for singles + couples templates with strict schema checks.
- **Validation model** with German user-facing messages.
- **Mapping + merge** into project JSON with import metadata + idempotency guard.
- **CLI/script** to run imports against `data/2023` quickly.
- **Tests**: unit + integration covering the cases above.
- **Docs updates**: F02 refreshed; accomplishments + project plan progress updated after implementation.

If you want, I can turn this plan into an implementation PR starting with the adapters + a minimal CLI, then add merge/persistence once the F01 repository layer is in place (or scaffold a temporary repository if F01 isn’t implemented yet).

---

**User**

update the feature plan accordingly 

---

**Cursor**

I’ll update `docs/features/F02-excel-ingestion-and-race-merge.md` to reflect the more detailed pipeline: intermediate import model, strict schema fingerprinting, adapter split (singles vs couples), idempotency/duplicate handling, merge boundaries, and a concrete fixture-driven test matrix using `data/2023` files.

## Updated feature plan

I updated `docs/features/F02-excel-ingestion-and-race-merge.md` with the detailed implementation plan and test matrix you asked for.

### What changed in the doc
- **Pipeline detail**: concrete staged flow (**read → validate → map → merge**) with clear boundaries.
- **Adapters**: explicit split between **singles** (`Ergebnisliste MW Lauf X.xlsx`) and **couples** (`Ergebnisliste MW_Paare Lauf X.xlsx`).
- **Format drift protection**: added **schema fingerprinting** and strict header checks (hard-fail on mismatch).
- **Intermediate import model**: specified internal types (`ImportWorkbookMeta`, `ImportRaceContext`, row models).
- **Validation**: structured `ValidationIssue` with **German** messages and row/column locations.
- **Idempotency**: `source_sha256` guard + `(category_key, race_no)` collision rejection.
- **Test plan**: fixture-driven cases explicitly referencing `data/2023` **all 10 Excel files**, plus negative tests for schema mismatch and validation.

If you want, next step would be updating `docs/features/FEATURE_TEMPLATE.md`-style checkboxes or adding a small “Open Questions” section (e.g., where to derive `series_year`/`race_no` from—filename vs sheet).

---

**User**

Under features/deprecated_code/stundenlauf.py, there is remnant code of an initial implementation. Get details on the excel format to read and split up into the races from that ONLY, no further info on how to structure code shall be carried here. the split_race_data is only for singles. Couples have a similar file structure with Paare Frauen, Paare Männer and Paare Mix results. Write a python script to inspect one data file from data/2023 each from singles and couples and execute it; log the results so you can read them. Update the specs of the data format accordingly if issues arise or new info comes up. You are not supposed to write a full parser here; only gather sufficient info to tighten the specs.

---

**Cursor**

I’ll only mine `docs/features/deprecated_code/stundenlauf.py` for Excel-format clues, then write a small inspection script (not a parser), run it on one singles and one couples file from `data/2023`, and use those findings to tighten the F02 spec.

I found the relevant legacy clues in `split_race_data` (`1/2 h-Lauf`, `h-Lauf`, `Frauen`, `Männer`, and headers like `Name/Jahrg./Verein/Distanz/Punkte`). Next I’ll add a small inspection-only script to print workbook structure for one singles and one couples file, run it with `uv`, and then update the F02 spec strictly with observed format details.

I’ve executed the inspection and captured concrete markers/header layout from real files. I’ll now tighten `F02` with only these format findings (including couples section markers and repeated member columns), without adding parser architecture beyond format-spec adjustments.

Updated and verified.

### What I did

- Read only `docs/features/deprecated_code/stundenlauf.py` for legacy format clues (not for implementation structure).
- Wrote an **inspection-only** script: `scripts/inspect_excel_format.py`
- Executed it with `uv` on one singles and one couples file:
  - `data/2023/Ergebnisliste MW Lauf 1.xlsx`
  - `data/2023/Ergebnisliste MW_Paare Lauf 1.xlsx`
- Logged results to:
  - `docs/features/F02-excel-format-inspection.json`

### Command run

- `uv run python scripts/inspect_excel_format.py --singles "data/2023/Ergebnisliste MW Lauf 1.xlsx" --couples "data/2023/Ergebnisliste MW_Paare Lauf 1.xlsx" --out "docs/features/F02-excel-format-inspection.json"`

### New confirmed format details (from the log)

- **Singles header (8 cols)**: `Platz`, `Startnr.`, `Name`, `Jahrg.`, `Verein`, `Distanz`, `Rückstand`, `Punkte`
- **Singles markers in col A**: `1/2 h-Lauf`, `h-Lauf`, `Frauen`, `Männer`
- **Couples header (11 cols)**: `Platz`, `Startnr.`, `Name`, `Jahrg.`, `Verein`, `Name`, `Jahrg.`, `Verein`, `Distanz`, `Rückstand`, `Punkte`
- **Couples markers in col A**: `1/2 h-Lauf`, `h-Lauf`, `Paare Frauen`, `Paare Männer`, `Paare Mix`
- Couples has 3 pair divisions per duration block (total 6 subsections per file).

### Spec updates made

I tightened `docs/features/F02-excel-ingestion-and-race-merge.md` to reflect those findings:

- Added explicit “observed file-format contract” section.
- Clarified that legacy `split_race_data` applies to **singles only**.
- Added couples marker expectations and duplicated member-column shape.
- Added validation requirement for missing/unexpected section markers.
- Added test cases for singles/couples marker sequences.

No full parser was implemented.

