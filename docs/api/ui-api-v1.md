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
  - `items[]` with `series_year`, `project_file`, `events_total`, `review_queue_count`, `latest_imported_at`, `race_coverage`
    - `latest_imported_at` is an ISO timestamp string (formatting to local display is frontend responsibility)
    - `race_coverage` contains:
      - `singles_race_numbers` (`int[]`, unique/sorted active race numbers for Einzel categories)
      - `couples_race_numbers` (`int[]`, unique/sorted active race numbers for Paare categories)
      - `race_columns` (`int[]`, display columns starting at 1; defaults to 1..5 and extends to max included race number)
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

### `delete_series_year`
- Payload:
  - `series_year` (required)
  - `confirm_series_year` (required, must exactly match `series_year`)
- Deletes the full season dataset directory under workspace storage and returns:
  - `series_year`, `deleted=true`, `deleted_path`
- Safety notes:
  - mismatched confirmation returns `VALIDATION_ERROR`
  - unknown year returns `NOT_FOUND`

### `reset_series_year`
- Payload:
  - `series_year` (required)
  - `confirm_series_year` (required, must exactly match `series_year`)
- Resets the season dataset in place (keeps year directory and `session_project.json` path) and returns:
  - `series_year`, `reset=true`, `project_file`
- Behaviour notes:
  - writes a fresh empty project document (equivalent to a newly created season)
  - prior file content is replaced via repository atomic save, which also writes `session_project.json.bak`
- Safety notes:
  - mismatched confirmation returns `VALIDATION_ERROR`
  - unknown year returns `NOT_FOUND`

### `export_series_year`
- Payload:
  - `series_year` (required)
  - `destination_path` (optional; explicit save location ending in `.stundenlauf-season.zip`)
- Exports one season into a portable archive and returns:
  - `series_year`
  - `export_file` (written path)
  - `bytes_written`
  - `events_total`
  - `sha256_session_project`
- Archive format:
  - filename extension: `.stundenlauf-season.zip`
  - root entries (exactly): `manifest.json`, `session_project.json`
  - `manifest.json` minimum fields:
    - `format_version` (currently `1`)
    - `exported_at` (ISO timestamp)
    - `schema_version`
    - `series_year`
    - `events_total`
    - `sha256_session_project`
  - The embedded `session_project.json` is the full v2 project document (including optional `ranking_exclusions` when present).

### `export_standings_pdf`
- Requires an **active** opened season (`open_series_year`); uses the current `session_project.json` path held by the UI session.
- Payload:
  - `destination_path` (required, non-empty; must end with `.pdf`)
- Renders a **Laufübersicht** PDF for **all categories** present in the project’s events (same declarative spec as the `pdf_export_playground` script: `laufuebersicht_board`, embedded standings, all active races, eligible-only rows, landscape A4, page break before each category after the first).
- Returns:
  - `export_file` (written path)
  - `bytes_written`
- Errors:
  - `VALIDATION_ERROR` when `destination_path` is missing, does not end with `.pdf`, or the season has no events/categories
  - `VALIDATION_ERROR` / `INTERNAL_ERROR` for other export failures (same envelope rules as other methods)

### `import_series_year`
- Payload:
  - `file_path` (required; exported `.stundenlauf-season.zip`)
  - `target_series_year` (optional override; defaults to `manifest.series_year`)
  - `replace_existing` (optional bool, default `false`)
  - `confirm_replace_series_year` (required when replacing; must equal resolved target year)
- Validates archive shape + manifest + payload checksum + schema compatibility before any write.
- Conflict behavior:
  - target year missing: import succeeds
  - target year exists and `replace_existing=false`: returns `VALIDATION_ERROR`
  - target year exists and replace requested without matching confirmation: `VALIDATION_ERROR`
  - target year exists and replace confirmed: atomic replace
- Returns:
  - `series_year` (resolved target year)
  - `project_file`
  - `replaced_existing` (bool)
  - `events_total`
  - `source_file`

### `get_matching_config`
- Payload: none
- Returns current matching configuration for the active UI session (a new `UiApiService` session defaults to fuzzy matching with **100 %-only** auto-link (`auto_merge_enabled=false`, `perfect_match_auto_merge=true`), `strict_normalized_auto_only=false`, `auto_min`/`review_min` both `0.5` for slider defaults; the desktop Import view mirrors this before the first API round-trip):
  - `auto_min` (configured auto-link threshold from UI control)
  - `review_min` (minimum similarity for the review queue vs `new_identity`; session default `0.5`, adjustable via `set_matching_config`; library `MatchingConfig` default remains `0.72` for non-UI callers)
  - `auto_merge_enabled`
  - `perfect_match_auto_merge`
  - `strict_normalized_auto_only` (boolean; when `true`, see below)
  - `effective_auto_min` (actual threshold used for import fuzzy thresholding)

### `set_matching_config`
- Payload:
  - `auto_min` (required, 0.0..1.0 from UI control)
  - `review_min` (optional, 0.0..1.0; when omitted, the previous session value is kept; default for a new UI session is `0.5`)
  - `auto_merge_enabled` (optional, default `true`)
  - `perfect_match_auto_merge` (optional, default `true`)
  - `strict_normalized_auto_only` (optional, default `false`)
- Updates matching configuration for subsequent imports in the active UI session.
- `review_min` must be less than or equal to the **effective** auto threshold implied by this payload (`auto_min` when `auto_merge_enabled=true`, else `1.0` when `perfect_match_auto_merge=true`, else `1.01`).
- If `auto_merge_enabled=false` and `perfect_match_auto_merge=true`, only fuzzy scores `>= 1.0` (after weighting and clamping) can auto-link.
- If both are false, auto-linking is effectively disabled (internal threshold is set above 1.0).
- If `strict_normalized_auto_only=true`, **automatic** linking only occurs when the incoming row matches exactly one existing participant/team on **normalized** name (same parsing as fingerprints), YOB, gender, and normalized club; fuzzy similarity never produces auto by itself (it only affects review vs new identity). Multiple identical normalized hits go to review. The `auto_merge_enabled` / `perfect_match_auto_merge` / `auto_min` sliders do not change that strict-auto rule; `effective_auto_min` still applies to fuzzy routing for non-strict matches (review vs new identity).

### `get_project_state`
- Payload:
  - `series_year` (optional filter)
- Returns project uid/schema and high-level counts (`people`, `teams`, `events_total`, `events_active`, `matching_decisions`, `review_queue`).

### `get_standings`
- Payload:
  - `category_key` (required)
- Returns standings metadata (`ruleset_version`, `calculated_at`, `category_key`) and `rows[]` for the **official Endwertung** (ranking-eligible participants/teams only):
  - Entities marked **Außer Wertung** for this category are **omitted** from `rows` (they still appear in `get_category_current_results_table`).
  - `platz` is sequential `1..n` over returned rows (among eligible only), preserving the snapshot tie order.
  - `entity_kind` (`participant` | `team`), `entity_uid`
  - `display_name`, `yob`, `club` (for teams, composite strings with `" / "` between members where applicable)
  - `punkte_gesamt`, `distanz_gesamt`, `contribution_by_race` (map of `race_event_uid` → counts toward total)
  - `team_members` (only when `entity_kind` is `team`): `[{ "member": "a"|"b", "name", "yob", "club" }]` — per-member canonical fields for identity correction UIs (`club` is `""` when unset).

### `get_category_current_results_table`
- Payload:
  - `category_key` (required)
  - `max_races` (optional)
- Returns:
  - `meta.category_key`, `meta.category_label`, `meta.race_headers`, `meta.max_races`
  - `rows[]` for **all** entities in the category standings table (including Außer Wertung), with:
    - `platz` — integer rank among **eligible** rows only, or `null` when `ausser_wertung` is true
    - `entity_uid`, `entity_kind` (`participant` | `team`)
    - `ausser_wertung` (bool) — `true` when excluded from Endwertung / final `platz` (matches the Laufübersicht checkbox)
    - `display_name`, `yob`, `club`
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
- Import/rollback timeline rows include both:
  - `source_sha256` (stable import-batch key)
  - `source_file` (human-readable source path/name where available)
- `matching_decision` rows additionally include (when present): `target_participant_uid`, `target_team_uid`, `merged_absorbed_uid` (for `identity_merge`), `scope_series_year`.
- For `kind` `identity_merge` and `identity_correction`, `identity_timeline` (when present) carries human-readable snapshots for Historie-style UIs:
  - **`identity_merge`**: `{ "kind": "identity_merge", "category_key", "survivor": actor, "absorbed": actor }` where each `actor` is `{ "entity_kind", "uid", "display_name", "yob", "club", "team_members"?: [...] }` (team rows mirror standings `team_members`: `{ "member", "name", "yob", "club" }`).
  - **`identity_correction`**: `{ "kind": "identity_correction", "member": null|"a"|"b", "team_uid", "team_display_name", "before": { "name", "yob", "club" }, "after": { "name", "yob", "club" } }` (`team_*` set only for Paarlauf member edits). Older project files may omit `identity_timeline`; clients can fall back to UIDs.

### `get_review_queue`
- Payload:
  - `race_event_uid` (optional)
- Returns open review entries based on `match_meta.route == "review"`, including:
  - technical IDs (`entry_uid`, `race_event_uid`, `candidate_uids`, `top_candidate_uid`)
  - per-candidate fuzzy scores aligned with `candidate_uids` order (`candidate_confidences[]`, same length as `candidate_uids`)
  - human-readable previews for direct UI rendering (`entry_preview`, `top_candidate_preview`, `candidate_previews[]` with display name / year / club and team member details)
  - `candidate_review_displays[]` (same length and order as `candidate_uids`): display-only diff hints for the import review table. Each item has:
    - `kind`: `"participant"` | `"team"` | `"unknown"`
    - `member_order_swapped` (bool, teams only): when `true`, the two candidate rows are shown in the order that best aligns with the incoming Excel pair (visual only; linking is unchanged).
    - `lines[]`: one object for singles; two for teams (aligned with `member_order_swapped`). Each line has:
      - `name_segments[]`: `{ text, diff }` fragments in reading order (given name, space, family name, or a single segment fallback). `diff` means the normalized part differs from the incoming row.
      - `yob`: `{ text, diff }` — `diff` only if both incoming and candidate years are present and disagree.
      - `club`: `{ text, diff }` — compared with normalized club strings; empty vs empty counts as match.
  - confidence and explainability fields (`confidence`, `confidence_label`, `features`, `conflict_flags`)
  - compact race metadata under `event` and imported result metrics under `result_preview`.
- Items are sorted by `confidence` descending.

### `get_match_candidate`
- Payload:
  - `candidate_uid` (required)
- Returns participant or team detail data for queue dialogs.

### `get_audit_timeline`
- Payload:
  - `series_year` (optional filter)
  - `race_event_uid` (optional filter)
  - `limit` (optional, default 200)
- Returns import/rollback/matching decision timeline entries (same `matching_decision` fields as `get_year_timeline`, including optional `identity_timeline` for identity merge/correction).

### `import_race`
- Payload:
  - `file_path` (required)
  - `series_year` (required)
  - `source_type` (optional, `singles` or `couples`; defaults to filename-based detection)
  - `race_no` (optional integer `>= 1`; when set, overrides the Laufnummer normally inferred from the filename via `Lauf <n>` in the basename)
- Returns import summary (`noop`, `rows_imported`, `merged_event_uids`, matching report).
- Uses the active session matching configuration from `set_matching_config`.
- On successful merge and save, **clears** all `ranking_exclusions` for the project (fresh operator decisions after new data).
- Duplicate/reimport safety behavior:
  - if the same source hash is already active, returns `IMPORT_DUPLICATE` error (no silent noop).
  - if the same source hash is partially rolled back (mixed active + rolled back), returns `REIMPORT_PARTIAL_ROLLBACK_REQUIRED`.
  - if all prior events for the source hash are rolled back, import is allowed.

### `apply_match_decision`
- Payload:
  - `race_event_uid` (required)
  - `entry_uid` (required)
  - `row_fingerprint` (optional but recommended)
  - `decision_action` (optional; `link_existing` default, or `create_new_identity`)
  - `target_participant_uid` or `target_team_uid` (required when `decision_action=link_existing`)
  - `rationale` (optional)
  - `field_resolutions[]` (optional)
- **Client note:** for Paarlauf review rows, the selected candidate UID is a **team** (`Couple.uid`); send `target_team_uid`, not `target_participant_uid`. Sending a team UID as `target_participant_uid` would corrupt the entry. The import GUI (F19) routes this from `candidate_previews[].kind === "team"`.
- Returns decision result (`decision_uid`, target UID, status).

### `update_participant_identity`
- Payload:
  - `series_year` (required; season the correction belongs to for audit/timeline scoping)
  - `name` (required, non-empty)
  - `yob` (required integer; validated to a reasonable year range)
  - `club` (optional string; empty clears the club)
  - Exactly one targeting mode:
    - `participant_uid` (singles), or
    - `team_uid` + `member` (`a` or `b`) for Paarlauf team members
  - `rationale` (optional)
- Updates canonical `Person` fields (and derived name/club normalization used for matching). Gender is not editable.
- Returns `decision_uid`, `status` (`applied`), `participant_uid` (edited person, including team member UID), `team_uid` (set for team edits), `scope_series_year`.
- Appends a `matching_decisions` entry with `kind=identity_correction` (visible in `get_year_timeline` / `get_audit_timeline` for the same `series_year`).

### `set_ranking_eligibility`
- Payload:
  - `category_key` (required)
  - `entity_uid` (required)
  - `ausser_wertung` (required bool) — `true` = excluded from Endwertung (same as checkbox checked in the Laufübersicht)
- Validates that `entity_uid` appears in the category standings snapshot; otherwise `VALIDATION_ERROR`.
- Persists under `ProjectDocument.ranking_exclusions` (per category). Does **not** recompute standings.
- Returns `category_key`, `entity_uid`, `ausser_wertung`.

### `merge_standings_entities`
- Payload:
  - `series_year` (required; must match the year encoded in `category_key`)
  - `category_key` (required)
  - `entity_kind` (required): `participant` or `team`
  - `survivor_uid` (required) — canonical identity to keep (`Person.uid` or `Couple.uid`)
  - `absorbed_uid` (required) — identity to dissolve; all `RaceEntry` pointers and relevant audit targets are rewired to `survivor_uid`
  - `rationale` (optional)
- Validation:
  - both UIDs must appear in the **current category standings** snapshot (same rule surface as `set_ranking_eligibility`);
  - **no overlapping active races in that category**: if both identities have a result row in the same `race_event_uid` for this `category_key`, returns `VALIDATION_ERROR` (German operator message).
- Effects:
  - rewrites matching `RaceEntry` rows project-wide, remaps `matching_decisions` targets (and match-meta candidate UIDs where applicable), removes the absorbed `Person` / `Couple`, prunes orphaned `Person` rows after team merges;
  - **ranking exclusions (F15)**: conservative merge — for this `category_key`, the survivor is excluded if **either** UID was excluded before; the absorbed UID is removed from the exclusion set;
  - appends `matching_decisions` with `kind=identity_merge`, `scope_series_year`, `target_*` = survivor, `merged_absorbed_uid` = absorbed;
  - recomputes standings and saves the project (same transactional pattern as `update_participant_identity`).
- Returns: `status` (`applied`), `decision_uid`, `entries_updated_count`, `survivor_uid`, `absorbed_uid`, `category_key`.

### `rollback_race`
- Payload:
  - `race_event_uid` (required)
  - `reason` (optional)
- Returns updated state marker for the race event.

### `rollback_source_batch`
- Payload:
  - `race_event_uid` (optional anchor, used to resolve file batch hash)
  - `source_sha256` (optional explicit batch hash)
  - `reason` (optional)
- Validation:
  - either `race_event_uid` or `source_sha256` is required.
- Behavior:
  - resolves batch hash (`source_sha256`) from anchor event when only `race_event_uid` is provided
  - rolls back all active events sharing that source hash
- Returns:
  - `source_sha256`
  - `rolled_back_event_count`
  - `rolled_back_event_uids[]`
  - `state` (`rolled_back`)

### `reimport_race`
- Payload:
  - `previous_race_event_uid` (required)
  - `file_path` (required)
  - `series_year` (required)
  - `source_type` (optional; same semantics as `import_race`)
  - `race_no` (optional; same semantics as `import_race`)
- Behavior:
  - resolves the source hash from `previous_race_event_uid`
  - rolls back all active events sharing that source hash
  - imports replacement file
- Returns import summary payload with additional `reimport` metadata:
  - `source_sha256`
  - `rolled_back_event_count`
  - `rolled_back_event_uids[]`

## Error Code Catalog

- `VALIDATION_ERROR`: malformed envelope/payload or invalid parameters.
- `SOURCE_FILE_NOT_FOUND`: import source file path is invalid.
- `MATCH_CONFLICT`: domain conflict during import/apply flow.
- `IMPORT_DUPLICATE`: same source file/hash is already active in the season.
- `REIMPORT_PARTIAL_ROLLBACK_REQUIRED`: same source hash is only partially rolled back; full source-batch rollback is required before reimport.
- `RACE_NOT_FOUND`: referenced race event UID does not exist.
- `NOT_FOUND`: generic entity lookup miss.
- `UNSUPPORTED_IMPORT_FORMAT`: import archive format version or schema is not supported by this build.
- `INTERNAL_ERROR`: unhandled backend exception.

## Compatibility Policy

- `api_version=v1` is the stable namespace.
- Additive fields may be introduced in responses within v1.
- Breaking payload changes require a new namespace (`v2`).
