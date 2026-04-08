---
name: F02 ingestion implementation
overview: Implement the Excel ingestion and race merge pipeline for M2 (R1, R2, R3) with strict schema validation, deterministic mapping into F01 domain models, and fixture-driven tests using the available `data/2023` example files.
todos:
  - id: create-ingestion-modules
    content: Create backend ingestion package and contracts (types, adapters, validation, mapping, service).
    status: completed
  - id: implement-template-adapters
    content: Implement strict singles/couples adapters with schema fingerprint and marker parsing.
    status: completed
  - id: build-merge-idempotency
    content: Wire mapping into F01 repository merge flow with hash no-op and collision handling.
    status: completed
  - id: add-fixture-driven-tests
    content: Add unit/integration tests using data/2023 fixtures with skip strategy and synthetic fallbacks.
    status: completed
  - id: wire-cli-and-docs
    content: Add CLI entrypoint and update accomplishments/project progress docs.
    status: completed
isProject: false
---

# F02 Implementation Plan: Excel Ingestion + Race Merge

## Requirement and milestone mapping
- Supports **R1** (Excel import), **R2** (all race categories), **R3** (race-by-race history persistence).
- Delivers milestone **M2** from [C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md](C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md).
- Uses detailed feature scope in [C:/Users/andre/VSCode_Projects/stundenlauf/docs/features/F02-excel-ingestion-and-race-merge.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/features/F02-excel-ingestion-and-race-merge.md).

## Known constraints and assumptions
- Fixture Excel files exist locally under `data/2023`, but are ignored by git (`*.xlsx`), so tests must gracefully skip or require local fixtures in CI configuration.
- Canonical persistence and event lifecycle are already available from F01 in:
  - [C:/Users/andre/VSCode_Projects/stundenlauf/backend/domain/models.py](C:/Users/andre/VSCode_Projects/stundenlauf/backend/domain/models.py)
  - [C:/Users/andre/VSCode_Projects/stundenlauf/backend/storage/repository.py](C:/Users/andre/VSCode_Projects/stundenlauf/backend/storage/repository.py)
- Format contract is based on inspected examples in [C:/Users/andre/VSCode_Projects/stundenlauf/docs/features/F02-excel-format-inspection.json](C:/Users/andre/VSCode_Projects/stundenlauf/docs/features/F02-excel-format-inspection.json).

## Implementation steps
1. **Create ingestion module boundaries**
   - Add `backend/ingestion/` package with submodules:
     - `types.py` (import DTOs, validation issues, import result)
     - `adapters/singles.py`
     - `adapters/couples.py`
     - `validation.py`
     - `mapping.py`
     - `service.py` (orchestrates read -> validate -> map -> merge)
   - Keep adapters template-specific and deterministic.

2. **Define import DTOs and result contracts**
   - Implement internal models from F02 spec:
     - `ImportWorkbookMeta`, `ImportRaceContext`, `ImportRowSingles`, `ImportRowCouples`
     - `ValidationIssue(code, message_de, location, severity)`
     - `ImportResult(noop, issues, merged_event_uids, counts)`
   - Add normalized location model (`sheet`, `row`, `column`) for UI-ready errors.

3. **Implement schema fingerprint and section marker parsing**
   - For singles (`8` columns): verify exact header and marker sequence (`1/2 h-Lauf`, `h-Lauf`, `Frauen`, `Männer`).
   - For couples (`11` columns): verify duplicated member header blocks and marker sequence (`Paare Frauen`, `Paare Männer`, `Paare Mix` under both durations).
   - Fail fast with German messages on any drift.

4. **Implement row normalization + validation**
   - Normalize text fields (`trim`, empty-to-None for optional club).
   - Parse decimal comma values to float for `distance_km` and `points`.
   - Validate required fields and numeric constraints (`yob`, non-negative distance/points).
   - Return structured issues with precise row/column location.

5. **Map import rows into F01 domain objects**
   - Convert duration/division markers to canonical F01 enums/category keys.
   - Build `RaceEvent` + `RaceEntry` structures with race-scoped `startnr` preserved.
   - Attach import metadata (`source_file`, `source_sha256`, `imported_at`, `parser_version`, `schema_fingerprint`) to event payload.

6. **Merge + idempotency rules in ingestion service**
   - Compute file hash (`source_sha256`) and no-op on exact re-import.
   - Reject `(category_key, race_no)` collisions unless prior rollback is detected.
   - Persist via existing atomic repository flow.
   - Return merge result for downstream matching/ranking trigger points.

7. **Add runnable entrypoint**
   - Add CLI import command in `main.py` (or dedicated script) with German summary output.
   - Inputs: project path + excel path + optional series year / race number override strategy if needed.

8. **Document and finish workflow artifacts**
   - Update [C:/Users/andre/VSCode_Projects/stundenlauf/docs/ACCOMPLISHMENTS.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/ACCOMPLISHMENTS.md) with outcome entry.
   - Update M2/R1-R3 progress in [C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md](C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md).

## Test plan (with local example Excel files)

### Unit tests
- Adapter parsing for all local fixtures when present:
  - Singles: `data/2023/Ergebnisliste MW Lauf 1.xlsx` ... `Lauf 5.xlsx`
  - Couples: `data/2023/Ergebnisliste MW_Paare Lauf 1.xlsx` ... `Lauf 5.xlsx`
- Decimal comma parsing (`"12,5" -> 12.5`).
- Fingerprint mismatch hard-fail (header mutation).
- Marker-sequence validation for singles and couples.
- Location-aware German validation issue emission.

### Integration tests
- Import single race into empty project.
- Import multiple races accumulates history.
- Singles and couples categories remain isolated.
- Re-import same file returns no-op.
- Category/race-number collision rejected.
- Re-import after rollback accepted with new `race_event_uid` and auditable old event state.

### Fixture handling strategy
- Add a reusable helper that checks local fixture availability under `data/2023`.
- If files are missing, mark fixture-dependent tests as skipped with a clear message.
- Keep a small synthetic workbook path for CI-safe negative tests (schema mismatch / invalid numeric fields) independent of local fixtures.

## Risks and mitigations
- **Schema drift risk**: strict fingerprint check + hard fail + clear German issue text.
- **Duplicate import risk**: `source_sha256` idempotency + collision guard.
- **Fixture availability risk in CI**: skip/marker strategy and synthetic fallback tests.

## Done criteria for this implementation
- Ingestion pipeline code complete and wired.
- Fixture-driven and synthetic tests passing.
- CLI import flow runnable on Windows paths.
- Documentation updated in `PROJECT_PLAN.md` and `docs/ACCOMPLISHMENTS.md`.