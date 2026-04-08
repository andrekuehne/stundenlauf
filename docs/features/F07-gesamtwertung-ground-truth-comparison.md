# Feature Plan: Gesamtwertung ground-truth comparison (Excel)

## Overview

- Feature name: Gesamtwertung Excel vs merged project standings
- Owner: TBD
- Status: Done (library + CLI + tests)
- Related requirement(s): R1, R5 (validation against organizer totals); supports M5 KPI work
- Related milestone(s): M5

## Problem Statement

Organizers publish cumulative totals in a **Gesamtwertung** workbook (per category: half-hour vs hour, women vs men). After importing per-Lauf Excel files into a project, we need a **repeatable side-by-side report** (Platz, name, YOB, Punkte, Distanz) against that ground truth, plus visibility into **HITL `review`** rows that should not be accepted as correct merges.

## Scope

### In Scope

- Parse Gesamtwertung-style blocks from column A section titles (`Halbstundenlauf - W/M`, `Einstundenlauf - W/M`).
- Recompute per-row **Gesamt** Punkte/Distanz using the same **top-4** rule as the app (`v1_legacy_top4`).
- Merge duplicate ground-truth rows for the same person when the sheet lists them twice (e.g. spelling variants or split rows).
- Align rows to persisted **StandingsSnapshot** by canonical **(name, YOB)** matching (with a small equivalence list for known spelling variants).
- Export **one `.xlsx`** with one comparison sheet per category, optional **`HITL_review`** sheet.
- CLI: single-section mode and **all-sections** mode (four Einzel blocks in one run).
- Unit tests without requiring committed binary Excel for core logic; optional integration parse when local `data/` fixtures exist.

### Out of Scope

- Automatic pass/fail CI gate on the comparison (manual approval first).
- Couples/Paare Gesamtwertung layout (this iteration targets **Einzel** singles layout).

## Acceptance Criteria

- [x] Documented CLI for single-section and all-sections flows (this file + examples below).
- [x] `uv run pytest tests/test_gesamtwertung_compare.py` passes.
- [x] Helpers live in `backend/tools/gesamtwertung_compare.py`; drivers under `scripts/`.

## Technical Plan

- **Parsing**: `parse_gesamtwertung_section` reads Platz / name / Jg / per-Lauf (km, Punkte) pairs; `aggregate_row_like_standings` mirrors ranking aggregation.
- **Multi-block**: `EINZEL_GESAMTWERTUNG_SECTION_SPECS` defines four sections; `load_all_einzel_gesamtwertung_sections` opens the workbook once.
- **Sheets**: Short labels via `sheet_label_for_category_key` (e.g. `hh_W`, `h_M`).
- **Review metadata**: `collect_review_route_entries` lists entries with `match_meta.route == "review"`.

## CLI reference

Use **`uv`** so commands run in the project virtual environment (see `.cursor/rules/python-uv-execution.mdc`).

Examples below use **cmd.exe** line continuation (`^`). In **PowerShell**, run the same arguments on one line, or continue lines with `` ` `` instead of `^`.

### All four Einzel blocks (recommended for 2023 fixture)

Writes `gesamtwertung_compare_all.xlsx` with sheets `hh_W`, `hh_M`, `h_W`, `h_M`, and `HITL_review` when applicable.

```bash
uv run python scripts/compare_gesamtwertung.py ^
  --ground-truth data/2023/einzel/ground_truth/Gesamtwertung_Einzel.xlsx ^
  --project data/2023/einzel/session_project.json ^
  --all-sections --series-year 2023 ^
  --output data/2023/einzel/exports/gesamtwertung_compare_all.xlsx
```

Optional: recompute standings from events before comparing (ignores persisted snapshot):

```bash
uv run python scripts/compare_gesamtwertung.py ^
  --ground-truth data/2023/einzel/ground_truth/Gesamtwertung_Einzel.xlsx ^
  --project data/2023/einzel/session_project.json ^
  --all-sections --series-year 2023 ^
  --recompute-standings ^
  --output data/2023/einzel/exports/gesamtwertung_compare_all.xlsx
```

**Convenience wrapper** (same defaults, adds a fixture policy note for the known 2023 `review` row):

```bash
uv run python scripts/compare_2023_einzel_halbstunden_w.py
```

Override output path:

```bash
uv run python scripts/compare_2023_einzel_halbstunden_w.py --output data/2023/einzel/exports/my_compare.xlsx
```

### Single category

Use when you only need one block (e.g. women half-hour):

```bash
uv run python scripts/compare_gesamtwertung.py ^
  --ground-truth data/2023/einzel/ground_truth/Gesamtwertung_Einzel.xlsx ^
  --project data/2023/einzel/session_project.json ^
  --section-substring "Halbstundenlauf - W" ^
  --category-key 2023:half_hour:women ^
  --output data/2023/einzel/exports/gesamtwertung_compare_W.xlsx
```

**Category keys** follow `RaceSeriesCategory.key`: `{year}:{duration}:{division}` with `duration` = `half_hour` | `hour` and `division` = `women` | `men`.

### Optional flags

| Flag | Meaning |
|------|--------|
| `--recompute-standings` | Recompute standings from `events` before comparing. |
| `--no-merge-gt-duplicates` | Do not merge duplicate (name, YOB) rows in the ground-truth sheet (debug). |
| `--fixture-hint TEXT` | Extra row on `HITL_review` (e.g. policy for a known fixture). |

## Output workbook layout

- **Comparison sheets**: columns `GT_*` vs `Merged_*`, plus `Punkte_delta` and `matched`.
- **`HITL_review`**: one row per `review` route entry (category, Lauf, Startnr, linked participant, confidence, source file); optional **Fixture policy** row from `--fixture-hint` or the 2023 wrapper.

## Assumptions

- Gesamtwertung Einzel layout matches the 2023 sample: section title in column A, header rows, then data rows until the next section or blank row.
- Standings in the project use the same ruleset as ground-truth aggregation (`v1_legacy_top4`).

## Risks

- Organizer typos or duplicate listings for the same athlete can diverge until equivalence rules or manual HITL fixes are applied.
- Men half-hour 2023 sample may show **unmatched** or **punkte_mismatch** where matching or review decisions differ from ground truth; the report is for inspection, not automatic pass.

## Test Plan

```bash
uv run pytest tests/test_gesamtwertung_compare.py
```

## Related

- **Roadmap**: [PROJECT_PLAN.md](../../PROJECT_PLAN.md) — F06/F07 validation track before F05 GUI.
- Import pipeline and per-step CSV: [F06](F06-fixture-hitl-import-script.md)
- Ranking rules: [F04](F04-ranking-rules-and-standings.md)

## Implementation notes (file map)

| Artifact | Role |
|----------|------|
| `backend/tools/gesamtwertung_compare.py` | Parse, merge GT duplicates, compare, Excel writers, review listing |
| `scripts/compare_gesamtwertung.py` | Generic CLI (single or `--all-sections`) |
| `scripts/compare_2023_einzel_halbstunden_w.py` | 2023 Einzel defaults + fixture hint |
| `tests/test_gesamtwertung_compare.py` | Unit tests |
