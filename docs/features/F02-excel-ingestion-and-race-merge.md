# Feature Plan: Excel Ingestion and Race Merge Pipeline

## Overview

- Feature name: Excel ingestion and race merge pipeline
- Owner: TBD
- Status: Planned
- Related requirement(s): R1, R2, R3
- Related milestone(s): M2

## Problem Statement

Race data arrives race-by-race from fixed-format Excel files.
The system needs a repeatable import pipeline that validates input, converts it into canonical structures, and merges it into the existing series state.

## Scope

### In Scope

- Parse fixed Excel layout into intermediate import model.
- Validate required fields (name, YOB, race type, distance, points) and report actionable errors in German.
- Convert records to canonical race result structures (as defined in F01).
- Append new race to project and emit a merge result suitable for triggering matching + recompute pipeline (implemented in later features).
- Idempotency/duplicate protection (avoid accidentally importing the same file/race twice).
- Strict Excel template validation via header/schema fingerprinting (fail fast on format drift).
- Derive section split rules from legacy `split_race_data` behavior for singles plus verified marker rows from current singles/couples files.
- Support explicit race replacement workflow via F05 orchestration: rollback prior race event, then import corrected file as a new race event UID.

### Out of Scope

- Support for arbitrary/non-standard Excel formats.
- Final matching decision UI internals (handled in dedicated feature).

## Acceptance Criteria

- [ ] Import for known-good files succeeds without manual fixes.
- [ ] Invalid files produce actionable validation error messages.
- [ ] Added race appears in stored project history with import metadata.

## Technical Plan

- Architecture/approach: staged pipeline (**read -> validate -> map -> merge**) with separate adapters per Excel template.
- Excel adapter strategy:
  - Singles template: `Ergebnisliste MW Lauf X.xlsx`
  - Couples template: `Ergebnisliste MW_Paare Lauf X.xlsx`
  - Each adapter implements explicit column mapping and a **schema fingerprint** check (sheet names + header row values + mapped columns). Any mismatch fails import with a clear error.
- Observed file-format contract (from legacy code + inspection script run on Lauf 1 fixtures). Evidence log is captured in `docs/features/F02-excel-format-inspection.json` and should be kept in sync with any spec changes:
  - Common:
    - Data is in first worksheet (`Sheet1` in inspected files).
    - Row 1 is a shared header row.
    - Race blocks are separated by marker rows in column A.
    - Markers are plain text labels in column A, with other cells in marker row empty.
  - Singles (`Ergebnisliste MW Lauf X.xlsx`):
    - Header row (8 columns): `Platz`, `Startnr.`, `Name`, `Jahrg.`, `Verein`, `Distanz`, `Rückstand`, `Punkte`.
    - Section markers in column A:
      - race duration: `1/2 h-Lauf`, `h-Lauf`
      - division: `Frauen`, `Männer`
    - `split_race_data` behavior applies to singles only, assuming duration marker followed by women/men subsections.
  - Couples (`Ergebnisliste MW_Paare Lauf X.xlsx`):
    - Header row (11 columns): `Platz`, `Startnr.`, then duplicated member columns
      - member 1: `Name`, `Jahrg.`, `Verein`
      - member 2: `Name`, `Jahrg.`, `Verein`
      - result: `Distanz`, `Rückstand`, `Punkte`
    - Section markers in column A:
      - race duration: `1/2 h-Lauf`, `h-Lauf`
      - divisions: `Paare Frauen`, `Paare Männer`, `Paare Mix`
    - Couples therefore contain six subsections total per file (3 divisions for each of 2 race durations).
- Intermediate import model (internal, not persisted):
  - `ImportWorkbookMeta`: `source_file`, `source_sha256`, `file_mtime`, `imported_at`, `parser_version`, `schema_fingerprint`
  - `ImportRaceContext`: `series_year`, `race_no`, `duration`, `division`, optional `event_date`
  - `ImportRowSingles`: `startnr`, `name`, `yob`, optional `club`, `distance_km`, `points`
  - `ImportRowCouples`: `startnr`, member1 fields, member2 fields, `distance_km`, `points`
- Validation and errors:
  - Use a structured `ValidationIssue` model: `code`, `message_de`, `location` (sheet/row/column), `severity`.
  - Treat missing required columns/headers and schema fingerprint drift as hard failures (no partial merge).
  - Treat unexpected or missing section marker labels as hard failures (for example missing `Paare Mix` in couples files).
- Mapping:
  - Map import rows into canonical domain structures from F01 (`Person`, `Couple`, `RaceSeriesCategory`, `RaceEvent`, `RaceEntry`, `EntryResult`).
  - Preserve `startnr` at race-entry level (not identity-defining).
  - Do not attempt fuzzy identity merging in this feature (reserved for matching workflow in later features); ingestion focuses on canonical capture + merge boundaries.
- Merge + idempotency:
  - Compute `source_sha256` for idempotency.
  - If the same `source_sha256` was already imported into the project: return a no-op result.
  - Prevent collisions on `(category_key, race_no)` unless an explicit “replace” mode is introduced later.
  - For correction workflow, allow import after rollback of the previous conflicting race event and preserve both events in audit history.
- Data model/API changes:
  - Add import metadata on the stored race event (at minimum `source_file`, `source_sha256`, `imported_at`, `parser_version`, `schema_fingerprint`).
  - Ensure created race event always carries `race_event_uid`.
- Migration needs: none expected beyond base schema support (F01 schema/versioning).
- Performance/reliability concerns:
  - Deterministic parsing; strict schema checks to avoid silent wrong mapping.
  - No persistence on validation failure.
  - Repository should use atomic write semantics (F01).

## Risks and Assumptions

- Assumption: Source files remain close to current structure.
- Risk: Hidden format drift causes silent wrong mapping.
  - Mitigation: strict header checks and schema fingerprinting (hard failure on mismatch).
- Risk: Accidental duplicate imports inflate standings.
  - Mitigation: `source_sha256` idempotency guard + `(category_key, race_no)` collision detection.

## Implementation Steps

1. **Define intermediate import model + results**
   - Create internal types for `ImportWorkbookMeta`, `ImportRaceContext`, and row models for singles/couples.
   - Define `ValidationIssue` and `ImportResult` (counts, issues, merged event ids, no-op status).

2. **Implement Excel adapters (fixed templates)**
   - Singles adapter for `Ergebnisliste MW Lauf X.xlsx`:
     - Locate table + header row; perform explicit column mapping.
     - Parse rows with normalization (trim strings; decimal comma to float; optional club).
    - Split sections by singles markers in column A (`1/2 h-Lauf`/`h-Lauf` + `Frauen`/`Männer`).
     - Compute and verify schema fingerprint.
   - Couples adapter for `Ergebnisliste MW_Paare Lauf X.xlsx`:
     - Explicitly map member1/member2 fields.
     - Enforce exactly two members per row.
    - Split sections by couples markers in column A (`Paare Frauen`, `Paare Männer`, `Paare Mix`) under each duration block.
     - Compute and verify schema fingerprint.

3. **Implement validation**
   - Required fields present; numeric coercion for `yob`, `distance_km`, `points`.
   - Non-negative numeric constraints for distance/points.
   - Fail fast on missing required columns or schema mismatch.
   - Produce German, location-aware messages suitable for UI display later.

4. **Map import model to canonical domain**
   - Build mappers into F01 domain entities/value objects.
   - Attach import metadata at `RaceEvent` level.
   - Ensure `startnr` is persisted per race entry.

5. **Merge into project + idempotency**
   - Load project via repository (F01).
   - If `source_sha256` already present: return no-op result.
   - Otherwise append new event into the appropriate category bucket.
   - Reject `(category_key, race_no)` collisions.
   - Save project atomically (repository responsibility).

6. **Correction flow support (rollback + reimport)**
   - If collision exists because of corrected results, require prior race rollback before accepting replacement import.
   - Emit merge response with old/new race event references for audit timeline.

7. **Add a runnable entrypoint**
   - Provide a CLI/script entrypoint (German output) to import a given excel file into a project file.
   - Ensure correct Windows path handling (spaces in filenames).

## Test Plan

### Fixtures

Use the example datasets under `data/2023`:
- Singles: `Ergebnisliste MW Lauf 1.xlsx` ... `Ergebnisliste MW Lauf 5.xlsx`
- Couples: `Ergebnisliste MW_Paare Lauf 1.xlsx` ... `Ergebnisliste MW_Paare Lauf 5.xlsx`

### Unit Tests (Adapters + Validation)

- `singles_adapter_parses_known_good_files`
  - For each of the 5 singles fixtures: parse succeeds, yields non-empty rows, and required fields are populated.
- `couples_adapter_parses_known_good_files`
  - For each of the 5 couples fixtures: parse succeeds, yields non-empty rows, and each row has exactly two members.
- `decimal_comma_is_parsed_correctly`
  - Values like `"12,5"` are parsed to `12.5` for distance/points.
- `schema_fingerprint_mismatch_fails_fast`
  - Modified header causes hard failure with `excel_schema_mismatch` and a clear German message naming the missing/changed header.
- `singles_markers_match_expected_sequence`
  - Validate singles file markers include both duration markers and both division markers.
- `couples_markers_match_expected_sequence`
  - Validate couples file markers include both duration markers and all three couple-division markers for each duration.
- `validation_reports_location_aware_messages`
  - Missing/invalid `name`, `yob`, `distance_km`, or `points` produces issues including sheet + row/column location.

### Integration Tests (Merge + Idempotency)

- `import_single_race_into_empty_project`
  - Import one singles fixture into a new project file; verify event is persisted with import metadata.
- `import_multiple_races_accumulates_history`
  - Import singles Lauf 1..5; verify 5 events exist and are uniquely identified by race number.
- `import_singles_and_couples_do_not_collide`
  - Import singles Lauf 1 and couples Lauf 1; verify they land in separate category buckets.
- `reimport_same_file_is_noop`
  - Import a fixture twice; second import returns no-op and project contents are unchanged.
- `category_race_number_collision_is_rejected`
  - Attempt to import a different file that maps to same `(category_key, race_no)`; import fails with an actionable error.
- `reimport_after_rollback_is_accepted_and_auditable`
  - Roll back existing race event, then import corrected file for same race number; verify new `race_event_uid` is persisted and old event remains in rolled-back state.

### Manual Checks

- Import all 10 fixtures and verify the German summary output (rows imported, issues count, stored races).
- Spot-check that `startnr` is stored per race entry and may differ across races.

### Rollback strategy

- Abort merge on parse/validation failure before persistence.
- Repository atomic save should ensure no corruption on interrupted write (tested in F01).

## Definition of Done

- [ ] Code implemented
- [ ] Tests added/updated and passing
- [ ] Docs updated
- [ ] Entry added to `docs/ACCOMPLISHMENTS.md`
- [ ] Requirement/milestone status updated in `PROJECT_PLAN.md`

## Links

- PR(s): TBD
- Related issue(s): TBD
- Release notes: TBD
