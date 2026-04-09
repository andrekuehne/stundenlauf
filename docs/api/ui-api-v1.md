# UI API v1 Contract

This document defines the frontend-facing Python API contract for the pywebview bridge.

## Envelope

- Request:
  - `api_version` (required, must be `v1`)
  - `request_id` (required, caller-generated)
  - `method` (required)
  - `payload` (optional object)
- Success response:
  - `api_version`
  - `request_id`
  - `status` = `ok`
  - `payload` (method-specific object)
- Error response:
  - `api_version`
  - `request_id`
  - `status` = `error`
  - `error.code`
  - `error.message_key`
  - `error.details`

## Methods

### `list_series_years`
- Payload: none
- Returns available season datasets discovered under local workspace storage:
  - `items[]` with `series_year`, `project_file`, `events_total`, `review_queue_count`, `latest_imported_at`
  - top-level `count`

### `create_series_year`
- Payload:
  - `series_year` (required)
  - `display_name` (optional)
- Creates a new empty season dataset and returns:
  - `series_year`, `display_name`, `project_file`

### `open_series_year`
- Payload:
  - `series_year` (required)
- Sets the active dataset in the UI API session and returns:
  - `series_year`, `project_file`, `active=true`

### `get_project_state`
- Payload:
  - `series_year` (optional filter)
- Returns project uid/schema and high-level counts (`people`, `teams`, `events_total`, `events_active`, `matching_decisions`, `review_queue`).

### `get_standings`
- Payload:
  - `category_key` (required)
- Returns standings metadata (`ruleset_version`, `calculated_at`) and rows (`platz`, `display_name`, `punkte_gesamt`, `distanz_gesamt`, UID fields).

### `get_category_current_results_table`
- Payload:
  - `category_key` (required)
  - `max_races` (optional)
- Returns:
  - `meta.category_key`, `meta.category_label`, `meta.race_headers`, `meta.max_races`
  - `rows[]` with identity columns (`platz`, `display_name`, `yob`, `club`)
  - `rows[].race_cells[]` with `{ race_no, race_event_uid, distance_km|null, points|null, counts_toward_total }`
  - `rows[].distanz_gesamt`, `rows[].punkte_gesamt`

### `list_categories`
- Payload:
  - `series_year` (required)
- Returns year-scoped category cards with:
  - `category_key`, `category_label`, `duration`, `division`
  - `events_total`, `events_active`, `review_queue_count`, `latest_imported_at`
  - top-level `count` and `events_active_total`.

### `get_year_overview`
- Payload:
  - `series_year` (required)
- Returns:
  - `series_year`
  - `totals` (`categories`, `events_total`, `events_active`, `review_queue`)
  - `health` (`has_active_events`, `has_review_queue`)
  - `categories[]` (same compact cards as `list_categories`)
  - `race_history_groups[]` grouped by category with compact race identities.

### `get_year_timeline`
- Payload:
  - `series_year` (required)
  - `limit` (optional, default 200)
- Returns a season-wide merged timeline (`race_import`, `race_rolled_back`, `rollback`, `matching_decision`) scoped to the requested year.

### `get_review_queue`
- Payload:
  - `race_event_uid` (optional)
- Returns open review entries based on `match_meta.route == "review"`, including:
  - technical IDs (`entry_uid`, `race_event_uid`, `candidate_uids`, `top_candidate_uid`)
  - human-readable previews for direct UI rendering (`entry_preview`, `top_candidate_preview`, `candidate_previews[]` with display name / year / club and team member details)
  - confidence and explainability fields (`confidence`, `features`, `conflict_flags`)
  - compact race metadata under `event` and imported result metrics under `result_preview`.

### `get_match_candidate`
- Payload:
  - `candidate_uid` (required)
- Returns participant or team detail data for queue dialogs.

### `get_audit_timeline`
- Payload:
  - `series_year` (optional filter)
  - `race_event_uid` (optional filter)
  - `limit` (optional, default 200)
- Returns import/rollback/matching decision timeline entries.

### `import_race`
- Payload:
  - `file_path` (required)
  - `series_year` (required)
  - `source_type` (optional, `singles` or `couples`; defaults to filename-based detection)
- Returns import summary (`noop`, `rows_imported`, `merged_event_uids`, matching report).

### `apply_match_decision`
- Payload:
  - `race_event_uid` (required)
  - `entry_uid` (required)
  - `row_fingerprint` (optional but recommended)
  - `target_participant_uid` or `target_team_uid` (one required)
  - `rationale` (optional)
  - `field_resolutions[]` (optional)
- Returns decision result (`decision_uid`, target UID, status).

### `rollback_race`
- Payload:
  - `race_event_uid` (required)
  - `reason` (optional)
- Returns updated state marker for the race event.

### `reimport_race`
- Payload:
  - `previous_race_event_uid` (required)
  - `file_path` (required)
  - `series_year` (required)
- Behavior:
  - rolls back previous race event, then imports replacement file
- Returns import summary payload.

## Error Code Catalog

- `VALIDATION_ERROR`: malformed envelope/payload or invalid parameters.
- `SOURCE_FILE_NOT_FOUND`: import source file path is invalid.
- `MATCH_CONFLICT`: domain conflict during import/apply flow.
- `RACE_NOT_FOUND`: referenced race event UID does not exist.
- `NOT_FOUND`: generic entity lookup miss.
- `INTERNAL_ERROR`: unhandled backend exception.

## Compatibility Policy

- `api_version=v1` is the stable namespace.
- Additive fields may be introduced in responses within v1.
- Breaking payload changes require a new namespace (`v2`).
