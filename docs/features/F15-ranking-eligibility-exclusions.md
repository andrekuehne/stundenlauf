# Feature Plan: Ranking eligibility (exclude from final placement)

## Overview

- Feature name: Ranking eligibility exclusions (“Endwertung” / final placement)
- Owner: TBD
- Status: Shipped
- Related requirement(s): **R5** (configurable rankings and transparent standings), **R8** (German GUI)
- Related milestone(s): **M5** (hardening and first production use)

## Problem Statement

Organizers sometimes need to **show** everyone’s per-race and cumulative results in the category overview, but **exclude specific participants or teams from the official final ranking** (placement / `Platz`)—for example guests, trial runners, or rule exceptions.

Today, both the cumulative table and the per-race overview derive `Platz` directly from the stored standings snapshot, so there is no operator-controlled exclusion layer.

## Scope

### In Scope

- Add a **small checkbox column** on the **second** standings card: **“Laufübersicht je Kategorie”** (data from `get_category_current_results_table` in `frontend/app.js`).
- **UX convention:** column **“Außer Wertung”** (or short header **“a. W.”** with full term in tooltip/`aria-label`). **Checked** = excluded from final `Platz`; **unchecked** = included. **Default for every row: unchecked** (almost everyone stays in the Endwertung).
- **Persist** eligibility choices in the project document so reopening the app keeps the same exclusions until data changes.
- **Reset exclusions to default (all eligible)** when a **new race is successfully imported** for the workspace (after a successful merge in `import_excel_into_project` that saves the project).
- **Two-table UX:** **“Aktuelle Wertung”** lists only ranking-eligible entities (excluded rows are **hidden**). **“Laufübersicht je Kategorie”** lists **everyone** with per-race and cumulative data; **Außer Wertung** checkboxes exist **only** on this second table. Eligible `Platz` is sequential among eligible rows in both API surfaces; excluded rows in the overview show `platz: null` (UI: **“—”**).
- **German** UI labels and accessibility (checkbox + column header); implementation identifiers remain English.

### Out of Scope (initial ship)

- Changing **scoring math** (points/distance totals, “best 4” aggregation) for excluded rows—only **placement / `Platz`** and optional visual hint for excluded rows.
- Excluding someone from **only** one race while keeping them in the cumulative ranking (this feature is **category-wide per entity**).
- Separate export formats / PDF—unless an existing export already consumes `get_standings`; if so, align in a follow-up.
- **F12** season zip: `ranking_exclusions` is part of `session_project.json` and is **included** in export/import (restored with the backup).

## Acceptance Criteria

- [x] Second table shows a checkbox per row (**“a. W.”** header, full **Außer Wertung** in tooltip/`aria-label`); **checked** = excluded from **final** `Platz`; **unchecked** = included (default).
- [x] Eligible rows receive sequential `Platz` **among eligible only**, preserving deterministic tie-break (same order as full standings, then re-number).
- [x] Ineligible rows still show cumulative and per-race numbers; overview `Platz` uses JSON `null`; GUI shows **“—”**.
- [x] First table (**Aktuelle Wertung**) shows **only** eligible entities (excluded rows do not appear).
- [x] Default: all eligible; persisted across app restarts.
- [x] After successful **new race import**, all `ranking_exclusions` for the project file are cleared.
- [x] API contract in `docs/api/ui-api-v1.md`; tests in `tests/test_f08_ui_api.py`, `tests/test_f15_ranking_display.py`, `tests/test_f02_ingestion.py`, `tests/test_f01_storage.py`.

## Technical Plan

### Architecture / approach

1. **Canonical standings stay unchanged**  
   Keep storing the full `StandingsSnapshot` as today (`compute_standings_snapshot` / `recompute_project_standings`). Exclusions are a **thin overlay** used when building UI DTOs so totals remain explainable and stable.

2. **Persist exclusions on `ProjectDocument`**  
   Add an optional structure, e.g. `ranking_exclusions: Mapping[category_key, frozenset[entity_uid]]` (or equivalent JSON-friendly `dict[str, list[str]]` at rest), meaning **“these entity UIDs are excluded from final placement in this category.”**  
   - Empty / missing → no exclusions.  
   - Validate UIDs against people/teams present in the project when toggling (ignore unknown UIDs on load with optional warning in logs only).

3. **Derive display rows in the UI API**  
   Centralize a pure helper (e.g. in `backend/ui_api/queries.py` or a small `backend/ui_api/ranking_display.py`):

   - Input: ordered standings rows for the category (from `_table_by_category_key`), plus exclusion set for `category_key`.
   - Split into eligible vs ineligible **preserving the original relative order** (the snapshot sort is already points/distance/tie-break stable).
   - Assign `platz` `1..n` only to eligible rows; assign `platz_display = null` or a string sentinel for ineligible rows.
   - Expose in each row:
     - `entity_uid`, `entity_kind` (already on standings rows internally; **also add to `get_category_current_results_table` rows**—F10 already noted this gap).
     - `ausser_wertung: bool` (**true** when the UI checkbox is checked / excluded from final ranking) **or** `ranking_eligible: bool` (**false** when excluded)—pick one and map clearly from the checkbox (checked ⇒ excluded).

4. **Wire `get_standings` and `get_category_current_results_table`**  
   Shared overlay helper; `get_standings` returns **eligible rows only**; `get_category_current_results_table` returns **all** rows with `ausser_wertung` and effective `platz`.

5. **Mutation API**  
   New command, e.g. `set_ranking_eligibility` with payload aligned to the UI:

   - `category_key` (required)
   - `entity_uid` (required)
   - Prefer **`ausser_wertung`** (required boolean): **`true`** = same as checkbox checked (excluded from final ranking), **`false`** = included.  
   - Alternative: `eligible` with `true` = included / `false` = excluded—document the mapping so implementers do not invert by mistake.

   Implementation: load document, update the exclusion map, save. No standings recompute required.

6. **Reset on import**  
   Hook where the project is saved after a successful merge, e.g.:

   - `backend/ui_api/commands.py` → `import_race` / pipeline behind `import_excel_into_project`, **or**
   - Inside the merge/save path used by import (single place that persists the doc after new events).

   **Recommended default behavior:** clear **all** `ranking_exclusions` for the **imported `series_year`** (simple, matches “new data ⇒ fresh operator decisions”). Alternative: clear only categories touched by `merged_event_uids`; document if you choose the narrower scope.

7. **Frontend**  
   - `frontend/app.js` — `renderStandingsView`: add checkbox column **only** on the per-race table; **`checked` when `ausser_wertung`** (or when API marks excluded); on change, call the new API, then refresh the view (or optimistically update).  
   - `frontend/strings.js` — column header **“Außer Wertung”** (or **“a. W.”** + `title`/`aria-label` with the full phrase); per-row `aria-label` e.g. “Außer Wertung: {Name}”.  
   - `frontend/styles.css` — narrow first column, align checkbox; optional muted row style when checked (excluded).

### Data model / storage

- **`backend/domain/models.py`** — extend `ProjectDocument` with optional exclusions field (default empty).
- **`backend/storage/schema_v2.py`** — serialize/deserialize under a new top-level key (e.g. `ranking_exclusions`). Backward compatible: missing key ⇒ empty map.

### API surface

- **`backend/ui_api/service.py`** — register the new method.
- **`docs/api/ui-api-v1.md`** — document payload, semantics, and reset behavior.

### Performance / reliability

- O(n) per category for re-numbering; trivial at expected dataset sizes.
- Avoid recomputing full standings on each checkbox toggle.

## Risks and Assumptions

- **Assumption:** “Final ranking” for operators means **displayed `Platz`** in the GUI tables, not a separate published artifact—until exports are explicitly updated.
- **Risk:** Drift between GUI and any CLI/export that reads raw snapshot `platz`.  
  - **Mitigation:** Document that official placement for exports may still be full snapshot unless/until exporters call the same overlay; optionally add a follow-up to share one code path.
- **Risk:** Season backup (F12) might restore stale exclusions.  
  - **Mitigation:** Include `ranking_exclusions` in export/import with version, or explicitly strip on import and document.

## Implementation Steps

1. Add `ranking_exclusions` to domain + `schema_v2` round-trip (fixtures / small test).
2. Implement pure “effective platz” helper + unit tests (ordering, ties, all excluded edge case).
3. Extend `get_standings` and `get_category_current_results_table` to return `entity_uid`, `entity_kind`, `ranking_eligible`, and effective `platz` (or separate `platz` vs `platz_raw`—prefer one field if breaking change is acceptable internally only).
4. Add `set_ranking_eligibility` command + persistence.
5. Clear exclusions on successful import (per chosen scope).
6. Frontend: checkbox column, strings, styles, API wiring.
7. Update API docs and accomplishments when done.

## Test Plan

- **Unit:** Effective placement with 0 / 1 / many exclusions; stable ordering among equals; unknown UID in stored map ignored.
- **Integration / UI API:** `get_standings` vs `get_category_current_results_table` return matching `platz` for same category; toggle eligibility flips placement; import clears map.
- **Manual:** Select category, set **Außer Wertung** for a mid-ranked runner (checkbox checked), confirm both tables update; import new Lauf, confirm all **Außer Wertung** checkboxes reset to unchecked.

## Definition of Done

- [x] Code implemented
- [x] Tests added/updated and passing (`uv run pytest`)
- [x] `docs/api/ui-api-v1.md` updated
- [x] Entry added to `docs/ACCOMPLISHMENTS.md`
- [x] Requirement/milestone progress updated in `PROJECT_PLAN.md` if needed

## Identity correction (F10) note

Excluded athletes appear only in **Laufübersicht**. To use **Aktuelle Wertung** identity correction for them, **uncheck Außer Wertung** first so the row appears in the Endwertung table.

## Links

- UI tables: `frontend/app.js` (`renderStandingsView`, second `<table>` under `st.perRaceTitle`)
- Backend queries: `backend/ui_api/queries.py` (`get_standings`, `get_category_current_results_table`, `_table_by_category_key`)
- Import entrypoint: `backend/ui_api/commands.py` (`import_race` → `import_excel_into_project`)
- Storage: `backend/storage/schema_v2.py`
- Related prior note: `docs/features/F10-standings-identity-correction-ui.md` (optional `entity_uid` on per-race rows—this feature should implement that consistently)

## Code Touch List (summary)

| Area | Files (expected) |
|------|-------------------|
| Domain | `backend/domain/models.py` |
| Persistence | `backend/storage/schema_v2.py` |
| UI API | `backend/ui_api/queries.py`, `backend/ui_api/ranking_display.py`, `backend/ui_api/commands.py`, `backend/ui_api/service.py` |
| Import pipeline | `import_excel_into_project` implementation module (called from `commands.import_race`) — add reset side effect when save succeeds |
| Docs | `docs/api/ui-api-v1.md`, `docs/features/F15-ranking-eligibility-exclusions.md` (this file) |
| Tests | `tests/test_f08_ui_api.py` and/or new focused test file |
| Frontend | `frontend/app.js`, `frontend/strings.js`, `frontend/styles.css` |
| Plan / changelog | `PROJECT_PLAN.md`, `docs/ACCOMPLISHMENTS.md` (on delivery) |
