# Feature Plan: German UI and Match Review Workflow

## Overview

- Feature name: German UI and match review workflow
- Owner: TBD
- Status: Implemented (v1 desktop workflow shipped)
- Related requirement(s): R1, R3, R4, R6, R8
- Related milestone(s): M4, M5

## Delivery order note

F01–F04 were implemented first. **F06** (fixture HITL import) and **F07** (Gesamtwertung comparison) were added to tighten test-driven validation and CLI workflows before investing in the pywebview desktop shell.
F05 v1 is now implemented with a full-screen German frontend (`frontend/index.html`, `frontend/app.js`, `frontend/styles.css`) and pywebview launcher wiring (`backend/ui_app.py`, `main.py --gui`).

Backend integration boundary prerequisite is now available via `backend/ui_api/` and documented in `docs/api/ui-api-v1.md` (F08 implementation).
The API now also includes year-level workspace reads (`list_categories`, `get_year_overview`, `get_year_timeline`) and optional `series_year` filters for `get_project_state` / `get_audit_timeline`, plus optional `source_type` in `import_race`.

## UI/API alignment baseline (v1)

- Season workspace bootstrap:
  - `get_year_overview(series_year)` for year header metrics, category list, and grouped race history.
  - `list_categories(series_year)` for category cards/filter options when a lighter payload is preferred.
- Category-specific standings:
  - `get_standings(category_key)` and `get_category_current_results_table(category_key, max_races?)`.
- Add-race and review workflow:
  - `import_race(file_path, series_year, source_type?)`
  - `get_review_queue(race_event_uid?)`
  - `get_match_candidate(candidate_uid)`
  - `apply_match_decision(...)`
- History and correction workflow:
  - `get_year_timeline(series_year, limit?)` and/or `get_audit_timeline(series_year?, race_event_uid?, limit?)`
  - `rollback_race(race_event_uid, reason?)`
  - `reimport_race(previous_race_event_uid, file_path, series_year)`
- Season entry/startup workflow:
  - `list_series_years()`
  - `create_series_year(series_year, display_name?)`
  - `open_series_year(series_year)`

## Increment 2026-04-09: Merge review table redesign

- Merge review in `Lauf hinzufügen` now uses a two-column table for faster visual comparison:
  - left side shows the single incoming entry as reference,
  - right side shows ranked existing candidates in descending likelihood.
- The action flow is explicit and simple:
  - choose a candidate and confirm `Als bestehende Person übernehmen`, or
  - use `Als neue Person anlegen` to create a separate identity from review.
- Technical IDs are removed from the main review surface; guidance is plain German (`Sie` form) with confidence buckets (`hoch/mittel/niedrig`).
- API alignment updates:
  - `get_review_queue` now returns `confidence_label` and is sorted by confidence descending.
  - `apply_match_decision` now supports `decision_action: "create_new_identity"` in addition to linking an existing target.

## Increment 2026-04-09: Matching threshold control in GUI

- `Lauf hinzufügen` now contains a compact matching settings control:
  - checkbox to enable/disable automatic merge,
  - slider + numeric input for auto-merge threshold.
- Default behavior is now strict review mode (`Auto-Merge aus`), so imports do not auto-link by default.
- Session-level API support added:
  - `get_matching_config`
  - `set_matching_config`
- Import commands now consume the active session matching config.

## Increment 2026-04-09: Season delete safeguard

- Season entry table now includes a red delete action per year (`🗑 Saison löschen`).
- Deletion requires two explicit safeguards:
  - warning confirmation prompt about permanent data loss,
  - typed year confirmation that must exactly match the selected season year.
- API alignment update:
  - `delete_series_year(series_year, confirm_series_year)` added to `ui-api-v1` with strict confirmation validation and `NOT_FOUND` handling for unknown years.

## Problem Statement

Users need a clear German-language interface to import races, inspect standings, and resolve uncertain participant/team matches.
This review flow is critical for trust in cumulative results and for correcting data safely when new information arrives after races were already merged.

## Scope

### In Scope

- German UI labels/messages for primary app workflows.
- Two primary workflow views:
  - **Aktuelle Wertung** (current rankings): category-aware standings with transparent totals.
  - **Lauf hinzufügen** (add race): import + validation + merge review entrypoint.
- Interactive merge-candidate resolution with highlighted likely matches.
- User-controlled field resolution for duplicates:
  - choose value to keep from candidate A/B per field (`Name`, `Verein`, optional `Jahrgang`),
  - optionally enter a new manual value when both source values contain typos.
- Stable UID visibility and traceability for participants/teams and race events.
- Audit timeline for imports, merge decisions, recalculations, and rollbacks.
- Race rollback/reapply workflow (revert one race and re-import corrected results).
- Desktop embedding in pywebview with reactive frontend architecture.

### Out of Scope

- Full multilingual localization framework beyond German in v1.
- Remote collaboration/commenting features.
- Arbitrary historical undo across many races in one click (v1 supports explicit race-level rollback actions).

## Acceptance Criteria

- [ ] All end-user visible strings in core workflows are German.
- [ ] Users can switch between **Aktuelle Wertung** and **Lauf hinzufügen** without losing draft review work.
- [ ] Users can resolve uncertain matches without editing raw files.
- [ ] In merge resolution, users can choose A/B field values or enter a manual replacement value.
- [ ] Every participant/team and every race event has a stable UID visible in detailed views.
- [ ] Match decision history is visible and understandable in UI.
- [ ] User can roll back race `N` (for example race 3), and standings and audit trail reflect that rollback deterministically.
- [ ] Corrected race `N` can be re-imported and re-reviewed with full audit trace continuity.

## Technical Plan

- Architecture/approach:
  - frontend in modern reactive JS with Python backend API via pywebview bridge.
  - event-driven UI state model for import, review, rollback, and standings recalculation status.
- UI modules:
  - `StandingsView` (Aktuelle Wertung): standings table, category selector, per-entry detail drawer.
  - `AddRaceView` (Lauf hinzufügen): file import, validation summary, candidate review queue, apply action.
  - `MergeResolutionDialog`: side-by-side field chooser + manual override input.
  - `RaceHistoryPanel`: imported races, UIDs, timestamps, rollback/reapply actions.
- Data model/API changes:
  - query year-level workspace snapshot (`series_year` totals, category cards, race-history groups).
  - query current standings snapshot and trace metadata (`ruleset_version`, recalculated_at, source races).
  - retrieve match candidates with explanation details and confidence buckets.
  - submit merge decisions including field-level picks and optional manual values.
  - expose stable ids: `participant_uid`, `team_uid`, `race_event_uid`, `decision_uid`.
  - execute `rollback_race(race_event_uid)` and `reimport_race(...)` commands with audit outputs.
- Migration needs:
  - if older datasets lack stable UIDs, add one-time UID backfill migration.
- Performance/reliability concerns:
  - responsive filtering/sorting in review lists for larger datasets.
  - optimistic UI with safe command retries and clear conflict messaging.
  - rollback and reapply must be atomic and produce deterministic recalculation.

## Risks and Assumptions

- Assumption: Desktop runtime setup for pywebview is acceptable on target machines.
- Risk: Inconsistent terminology in German UI confuses users.
  - Mitigation: maintain a glossary and central string catalog.
- Risk: User accidentally confirms wrong merge candidate.
  - Mitigation: preview + explicit confirmation + visible audit + reversible race-level rollback.
- Risk: Rollback of one race leaves stale derived standings.
  - Mitigation: enforce full recomputation from persisted event history after rollback/reapply.

## Implementation Steps

1. Define German information architecture and terminology
   - lock navigation terms (`Aktuelle Wertung`, `Lauf hinzufügen`, `Zusammenführen prüfen`, `Rückgängig`).
   - define user-safe language for confidence and conflict states.
2. Implement shell navigation and shared app state
   - add top-level route/state switcher between the two primary views.
   - preserve unsaved review progress when switching views.
3. Build `Aktuelle Wertung` view
   - initialize season context from `get_year_overview(series_year)`.
   - category selector (from year categories) + standings table with points/distance totals.
   - row detail drawer with UID, source races, and decision trace snippets.
4. Build `Lauf hinzufügen` view
   - file picker/import trigger + validation summary in German (`import_race` with optional `source_type`).
   - candidate queue with confidence groups (hoch/mittel/niedrig).
5. Build merge resolution interaction
   - side-by-side values from candidate A/B per field.
   - per-field controls: keep left, keep right, manual value.
   - apply decision and update queue immediately.
6. Integrate audit timeline
   - display import, decision, recalculation, rollback, and reimport events (`get_year_timeline` by default).
   - support filtering by UID (participant/team/race).
7. Implement rollback and reapply flow
   - race history list with rollback action for a selected race event.
   - confirmation dialog with impact summary (entities affected).
   - after rollback: recompute standings and keep immutable audit record.
   - reimport corrected race file and restart merge review flow.
   - on reimport, rollback all active events sharing the same import source hash before importing replacement data.
8. Harden UX edge cases
   - stale data conflicts, duplicate submits, and command retry behavior.
   - loading/empty/error states across both primary views.
9. Final integration and documentation
   - verify API contracts with F01-F04 outputs.
   - document screenshots/workflow notes for domain users.

## Test Plan

### Unit Tests (Frontend State + Components)

- `navigation_preserves_add_race_draft_state`
  - switching from `Lauf hinzufügen` to `Aktuelle Wertung` and back keeps unresolved queue and form state.
- `standings_view_renders_category_specific_rows`
  - selected category changes table content deterministically.
- `season_workspace_loads_year_summary_and_categories`
  - `get_year_overview`/`list_categories` populate dashboard metrics and category navigation.
- `merge_dialog_supports_left_right_manual_per_field`
  - for each field, left/right/manual selection updates the pending decision payload.
- `manual_value_validation_blocks_empty_required_name`
  - manual override enforces required constraints before submit.
- `audit_list_filters_by_uid`
  - filtering by participant/team/race UID narrows events correctly.

### Integration Tests (UI + API Contracts)

- `import_review_apply_updates_current_rankings`
  - flow: import (`source_type` optional) -> candidate review -> decisions submit -> standings refresh.
- `year_timeline_shows_cross_category_season_events`
  - `get_year_timeline(series_year)` returns imports/decisions/rollbacks across singles and couples categories.
- `candidate_highlighting_prioritizes_best_match_first`
  - best confidence candidate is pre-highlighted but not auto-applied when review required.
- `field_level_manual_correction_persists_in_identity_cluster`
  - manual typo fix is persisted and reflected in subsequent races.
- `rollback_race_recomputes_standings_and_marks_event_reverted`
  - rollback of race N removes its contribution and marks event state in history.
- `reimport_corrected_race_after_rollback_restarts_review`
  - corrected race can be imported again with a new event UID and linked audit trail.
- `decision_and_race_uid_trace_is_visible_in_ui`
  - user can inspect UIDs tied to a standing entry and originating race actions.

### End-to-End Scenarios (Critical User Journeys)

1. **Baseline season workflow**
   - import races 1..3, resolve medium-confidence matches, verify standings in `Aktuelle Wertung`.
2. **Typo correction with manual merge value**
   - both candidate names contain typo; user enters corrected name manually; future imports reuse corrected identity.
3. **Race 3 correction workflow**
   - rollback race 3, verify standings drop race-3 effects, import corrected race 3 file, resolve candidates, verify recomputed standings.
4. **Pair/team ambiguity workflow**
   - team candidate list shows member-level uncertainty; user selects field-level values and confirms result with team UID continuity.

### Manual/UAT Checks

- German terminology review with organizers for all major buttons/messages/dialog titles.
- Time-to-complete check: import + review + apply should remain aligned with KPI target (< 5 min typical case).
- Auditability check: for any ranking row, user can trace to participant/team UID and race event history.

### Rollback Strategy

- Rollback is race-event scoped for manual actions and append-only in audit history (no destructive deletion of audit records).
- Reimport uses source-batch rollback semantics (all active events sharing the same source hash) before replacement import.
- Recalculation always runs from remaining active race events to guarantee deterministic recovery.

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
