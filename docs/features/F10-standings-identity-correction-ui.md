# Feature Plan: Standings identity correction (GUI)

## Overview

- Feature name: Standings identity correction (German GUI)
- Owner: TBD
- Status: Done
- Related requirement(s): R6 (interactive correction), R8 (German GUI)
- Related milestone(s): M5 (hardening / first production use)
- Depends on: [F09 Canonical participant identity correction](F09-canonical-identity-correction.md) (`update_participant_identity`); [F05 German UI](F05-german-ui-and-review-workflow.md) (standings view, `strings.js` patterns)

## Problem Statement

Canonical name, club, and year of birth can already be corrected via the UI API (F09), but operators still lack a discoverable, standings-driven workflow. Typos in **Aktuelle Wertung** should be fixable where users notice them—without importing a new file or using ad-hoc tools—while preserving points/distance and recording an auditable `identity_correction` decision for the active season.

## Scope

### In Scope

- A dedicated **correction mode** in the **Aktuelle Wertung** (standings) view: clear on/off affordance so normal browsing is not cluttered (e.g. toggle button or explicit “Korrekturmodus” in the standings card).
- **Row activation** in that mode (click on a standings row) opens a **German** correction surface (modal, slide-over, or inline panel—implementation choice) with fields:
  - **Name** (`name`)
  - **Verein** (`club`, optional; empty allowed to clear)
  - **Jahrgang** (`yob`, required integer in backend-validated range)
- **Singles** (`entity_kind === "participant"`): one form bound to `participant_uid` from the row payload.
- **Paarlauf** (`entity_kind === "team"`): correct **one member at a time** with explicit **Läufer A / Läufer B** (or equivalent German labels) using `team_uid` + `member` (`a` | `b`) per F09. Pre-fill each member’s name, club, and YOB.
- Submit calls `update_participant_identity` with `series_year` from the active session (`state.seriesYear` or equivalent) and optional `rationale` (hidden advanced field or omitted in v1).
- On success: close panel, show a short success status, **refresh standings** (and per-race results table if shown) so labels update immediately.
- Surface API errors via existing `getApiErrorMessage` patterns and German strings for validation failures where codes are known.
- Copy and chrome: new strings live in [`frontend/strings.js`](../../frontend/strings.js); avoid inline German literals in [`frontend/app.js`](../../frontend/app.js).

### Out of Scope

- Editing **gender** (immutable per F09).
- Bulk rename / spreadsheet-style multi-row edit.
- Rewriting Excel source files.
- A separate “display name” model (still canonical identity only).
- Full undo stack beyond existing audit timeline (operators use **Historie** for traceability, not revert).
- CLI-only workflows (already satisfied by API tests).

## Acceptance Criteria

- [x] User can enter correction mode from **Aktuelle Wertung**, see that mode is active, and exit without losing category selection.
- [x] Clicking a standings row in correction mode opens the correction UI with current **Name / Verein / Jahrgang** pre-filled for singles.
- [x] For Paarlauf rows, user sees two stacked sub-forms (Läufer A / B) and each **Speichern** maps to `team_uid` + `member`.
- [x] Successful save calls `update_participant_identity` and leaves **Platz**, **Distanz**, and **Punkte** unchanged for that entity (regression covered at API level; spot-check in GUI).
- [x] After save, standings and per-race table reflect new text without app restart.
- [x] Identity corrections appear in the season timeline / counts as today (F09 contract unchanged).
- [x] All new user-visible labels and messages are German per project rules.

## Technical Plan

### Architecture / approach

- **Frontend** (`frontend/app.js`, `frontend/styles.css`):
  - Extend `renderStandingsView` so standings `<tr>` elements carry **data attributes** or a small JS registry mapping row index → identity payload (see API below). Plain row HTML today omits `entity_kind` / `entity_uid`; the GUI needs them for targeting.
  - Add `state.standingsCorrectionMode` (boolean) and optional `state.standingsCorrectionDraft` for the open panel.
  - On submit, `api("update_participant_identity", { series_year, name, yob, club, ... })` then `renderStandingsView()` (and any shared refresh used by the results table).
- **Backend / API contract**:
  - **Reuse** `update_participant_identity` as specified in [`docs/api/ui-api-v1.md`](../../docs/api/ui-api-v1.md) (F09).
  - **Recommended additive change** (small, read-only enrichment): include a `team_members` array on standings rows when `entity_kind === "team"`, each item `{ "member": "a"|"b", "name", "yob", "club" }`, built in `backend/ui_api/queries.py` alongside `display_name` / `yob` / `club`. This avoids an extra round-trip and matches how composite YOB/club strings are already derived in [`backend/ui_api/mappers.py`](../../backend/ui_api/mappers.py).
  - **Optional consistency**: add `entity_kind` and `entity_uid` to `get_category_current_results_table` rows if row-level actions should eventually apply there too; F10 can ship standings-only first and document this as a follow-up.

### Data model / persistence

- No schema migration; mutations remain F09’s `Person` / `Couple` member update + audit row.

### Performance / reliability

- Single-row save = one API call (two calls only if user edits both Paarlauf members sequentially, which is acceptable).

## Risks and Assumptions

- **Assumption**: Operators understand that correcting canonical identity while Excel still shows old text may affect **future** import matching (documented in F09); GUI copy may add a one-line hint in the panel footer.
- **Risk**: Paarlauf composite display (`" / "`) is ambiguous if members share formatting; mitigated by explicit A/B labels and per-member fields in the panel.
- **Risk**: Row click conflicts with text selection or mobile/touch; mitigated by requiring explicit correction mode and visible row affordance (e.g. hover cursor, row highlight).

## Implementation Steps

1. Add German strings for mode toggle, panel title, labels, buttons, success/error toasts, and Paarlauf member labels in `frontend/strings.js`.
2. (Recommended) Extend `get_standings` row mapping for team entities with `team_members[...]` in `backend/ui_api/queries.py`; document the additive fields in `docs/api/ui-api-v1.md`.
3. Thread `entity_kind`, `entity_uid`, and optional `team_members` into standings table rendering; guard clicks so they only apply in correction mode.
4. Implement correction panel UI and validation (client-side: non-empty name, integer YOB; align with server `yob_bounds()` messaging where possible).
5. Wire `update_participant_identity` and refresh standings on success.
6. Manual UAT on one Einzel and one Paar category; verify timeline shows correction for the open year.

## Test Plan

- **Unit / API**: Existing F09 tests in `tests/test_f08_ui_api.py` remain the source of truth for mutation behavior; no duplicate backend logic tests required unless new query fields need snapshot assertions.
- **Integration (optional)**: If the project adds GUI automation later, assert that a mocked bridge receives `update_participant_identity` with expected payload after a scripted click path.
- **Manual checks**:
  - Einzel: change name only; change club to empty; change YOB within allowed range; attempt invalid YOB and confirm German error path.
  - Paar: edit member A only, then B; confirm standings string and per-race header names update.
  - Toggle correction mode off: rows no longer open the panel.
- **Rollback strategy**: Same as F09 (file backup / VCS); GUI does not add a new undo command.

## Definition of Done

- [x] Code implemented (frontend + API row enrichment)
- [x] Tests added/updated and passing (`uv run pytest` for backend changes)
- [x] `docs/api/ui-api-v1.md` updated for `team_members` on team rows
- [x] This feature plan status **Done**
- [x] Entry added to `docs/ACCOMPLISHMENTS.md`
- [x] `PROJECT_PLAN.md` current phase / delivery line updated for F10

## Links

- API: [`docs/api/ui-api-v1.md`](../../docs/api/ui-api-v1.md) — `update_participant_identity`, `get_standings`
- Backend: [`backend/ui_api/commands.py`](../../backend/ui_api/commands.py), [`backend/ui_api/queries.py`](../../backend/ui_api/queries.py)
- Frontend: [`frontend/app.js`](../../frontend/app.js), [`frontend/strings.js`](../../frontend/strings.js)
- Prior feature: [F09-canonical-identity-correction.md](F09-canonical-identity-correction.md)
