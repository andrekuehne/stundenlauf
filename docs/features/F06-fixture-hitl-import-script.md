# Feature Plan: Fixture human-in-the-loop import and standings export

## Overview

- Feature name: Fixture HITL import session script
- Owner: TBD
- Status: Done (script + tests)
- Related requirement(s): R1, R5 (validation against ground truth); supports M5 KPI work
- Related milestone(s): M5

## Problem Statement

Before the German GUI exists, we need a repeatable way to import real Excel fixtures in a defined order, pause for human verification of uncertain matches, and export cumulative standings for comparison with external ground-truth spreadsheets.

## Scope

### In Scope

- Discover `*.xlsx` under a configurable directory; order by `Lauf <n>` from filename, then singles before couples (`paare` in filename = couples).
- Call existing `import_excel_into_project` sequentially; print matching summary and review/conflict details for entries from the just-imported events.
- Export full standings as CSV (category, place, display name, points, distance) to stdout or per-step files under `--out-dir`.
- Optional stdin pause between files unless `--no-pause`.
- Unit tests for ordering and CSV helpers without committing binary Excel.

### Out of Scope

- Automated diff against a golden CSV file.
- Rollback/reimport wizard for incorrect links.
- Synthetic typo injection for negative tests.

## Acceptance Criteria

- [x] Script runs via `uv run python scripts/fixture_import_session.py` with documented arguments.
- [x] Import order is deterministic and rejects ambiguous duplicate filenames per Lauf.
- [x] Standings export matches persisted project state after each import step.
- [x] Tests cover ordering rules and CSV serialization helpers.

## Technical Plan

- Shared helpers live in `backend/tools/fixture_session.py` (ordering, CSV, display labels).
- CLI driver: `scripts/fixture_import_session.py`.
- Tests: `tests/test_fixture_session.py`.

## Test Plan

- `uv run pytest tests/test_fixture_session.py`
- Manual: place organizer `.xlsx` under `example/`, run with `--series-year` and compare CSV outputs to legacy spreadsheets.

## Assumptions

- Fixture filenames include `Lauf <n>` and couples files use `paare` in the name (same convention as production import).
- `*.xlsx` may remain gitignored; fixtures stay local or distributed out-of-band.

## Risks

- Large `stdout` dumps when many categories are present; use `--out-dir` for full runs.

## Related

- **Roadmap**: [PROJECT_PLAN.md](../../PROJECT_PLAN.md) — validation tooling (F06/F07) shipped before the F05 desktop GUI.
- **Gesamtwertung Excel vs merged standings** (side-by-side comparison workbook, all four Einzel blocks): [F07](F07-gesamtwertung-ground-truth-comparison.md).
