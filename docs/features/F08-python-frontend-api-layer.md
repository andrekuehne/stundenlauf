# Feature Plan: Python-Frontend API Layer

## Overview

- Feature name: Python-frontend API layer
- Owner: TBD
- Status: Implemented (v1)
- Related requirement(s): R1, R3, R4, R5, R6, R8
- Related milestone(s): M4, M5

## Problem Statement

Backend capabilities for ingestion, matching, standings, and rollback are implemented in Python, while the planned desktop UI (F05) requires a reliable and testable integration boundary.
Current docs reference a pywebview bridge, but there is no explicit API contract document and no implementation package exposing a stable UI-facing service surface.
Without a formal API layer, frontend work risks tight coupling to internal backend modules, inconsistent payload shapes, and regressions during backend evolution.

## Scope

### In Scope

- Define and implement a versioned UI-facing API contract between Python backend and web frontend.
- Provide pywebview-compatible command/query bridge with typed request/response envelopes.
- Expose read APIs needed by F05 core views:
  - project summary and health,
  - standings snapshot and metadata,
  - category "Gesamtwertung" table view (per-race km/points columns plus cumulative totals),
  - match-review queue and candidate details,
  - race/audit history and UID trace.
- Expose write/command APIs needed by F05 workflows:
  - import race file,
  - apply merge decision (field-level including manual value),
  - rollback race event,
  - reimport corrected race.
- Normalize backend domain errors into user-safe, machine-readable error codes for German UI messaging.
- Add contract, integration, and regression tests for API stability.
- Document API contract in `docs/api/` and link feature dependencies.

### Out of Scope

- Remote/network API deployment (HTTP server, cloud backend, auth).
- Multi-user conflict resolution or collaborative editing semantics.
- Full internationalization framework beyond German UI string needs.
- Replacing backend domain logic in F01-F04 (API layer adapts existing logic).

## Acceptance Criteria

- [x] A dedicated backend API package exists (for example `backend/ui_api/`) with clear module boundaries.
- [x] API methods cover all F05 data/command flows without importing internal backend modules directly from frontend glue code.
- [x] Every API method uses a documented request/response schema with `api_version`, `request_id`, `status`, and typed payload/error.
- [x] A read method returns a category-specific current results table payload (for example "Halbstundenlauf - W") with fixed race columns (`lauf_1` ... `lauf_n`: km + punkte per race, nullable when absent) and Gesamt columns (`distanz_gesamt`, `punkte_gesamt`, `platz`).
- [x] UI-relevant domain errors map to stable error codes (for example `VALIDATION_ERROR`, `MATCH_CONFLICT`, `RACE_NOT_FOUND`) plus contextual details.
- [x] At least one end-to-end pywebview bridge test validates import -> review -> apply -> standings refresh.
- [x] Contract docs are published in repository and referenced by F05.

## Technical Plan

- Architecture/approach:
  - Introduce an explicit application-service boundary: backend domain/repository modules remain internal; `ui_api` is the only supported frontend entrypoint.
  - Use command/query API shape over pywebview bridge:
    - Queries: read-only data retrieval for views.
    - Commands: state-changing actions returning action result and audit metadata.
  - Use envelope protocol for all methods:
    - Request: `{ api_version, request_id, method, payload }`
    - Success: `{ api_version, request_id, status: "ok", payload }`
    - Error: `{ api_version, request_id, status: "error", error: { code, message_key, details } }`
  - Versioning strategy:
    - Start with `api_version = "v1"`.
    - Add backwards-compatible fields only in minor doc revisions.
    - Breaking changes require `v2` namespace and migration notes.

- API surface proposal (v1):
  - `get_project_state`
  - `get_standings(category, ruleset_id?)`
  - `get_category_current_results_table(category_key, max_races?)`
  - `get_review_queue(race_event_uid?)`
  - `get_match_candidate(candidate_uid)`
  - `get_audit_timeline(filters)`
  - `import_race(file_path, race_context)`
  - `apply_match_decision(decision_input)`
  - `rollback_race(race_event_uid, reason?)`
  - `reimport_race(previous_race_event_uid, file_path, race_context)`

- Data model/API changes:
  - Define DTOs decoupled from internal domain models:
    - `StandingsRowDTO`, `CategoryCurrentResultsRowDTO`, `RaceCellDTO`, `ReviewCandidateDTO`, `DecisionTraceDTO`, `RaceHistoryDTO`.
  - Define command result DTOs:
    - `ImportResultDTO`, `DecisionResultDTO`, `RollbackResultDTO`, `ReimportResultDTO`.
  - Add explicit error-code catalog and mapping layer.
  - Add API schema docs with field-level examples and required/optional markers.
  - `get_category_current_results_table` payload shape:
    - table metadata: `category_key`, `category_label`, `race_headers[]` (for example `1. Lauf`, `2. Lauf`, ...), `max_races`.
    - row identity columns: `platz`, `display_name`, `yob`, `club`.
    - row race cells: `race_cells[]` where each item is `{ race_no, distance_km | null, points | null, counts_toward_total }`.
    - row totals: `distanz_gesamt`, `punkte_gesamt`.

- Migration needs:
  - No storage schema migration required for initial API layer.
  - If API uncovers missing persisted metadata for UI traces, add targeted schema v2 extension with migration doc.

- Performance/reliability concerns:
  - Avoid full project reload on each query; cache loaded project state per session with invalidation after commands.
  - Guarantee command idempotency where possible (especially import/reimport retries).
  - Ensure atomic command execution and deterministic standings recompute after rollback/reimport.
  - Provide structured logging with `request_id` correlation for troubleshooting.

## Risks and Assumptions

- Assumption: pywebview bridge is the chosen desktop integration mechanism for v1.
- Assumption: frontend can consume JSON-like payloads and render German text via message keys.
- Risk: DTO drift between docs and code causes frontend/backend breakage.
  - Mitigation: contract tests generated from canonical fixtures and schema assertions in CI.
- Risk: API leaks backend internals, making refactors expensive.
  - Mitigation: strict DTO layer and explicit mapping functions.
- Risk: Command retries create duplicate race imports.
  - Mitigation: idempotency token support and duplicate-detection checks before commit.
- Risk: Error responses are too generic for UI guidance.
  - Mitigation: stable error taxonomy + granular `details` and `message_key`.

## Implementation Steps

1. Align cross-feature contract
   - Reconcile F05/F03/F04 required payloads and command semantics.
   - Freeze v1 method list and DTO ownership.
2. Create backend API package
   - Add `backend/ui_api/` with modules for envelopes, DTOs, mappers, queries, commands, and errors.
   - Add one pywebview bridge adapter module that delegates to `ui_api`.
3. Implement read/query methods
   - Project state, standings, category current-results table, review queue, candidate detail, audit timeline.
4. Implement command methods
   - Import, apply decision, rollback, reimport with deterministic result payloads.
5. Add validation and error mapping
   - Input validation layer per method.
   - Domain exception to API error-code mapper with message keys for German UI.
6. Add tests
   - DTO schema tests, command/query unit tests, integration tests against sample project files, pywebview bridge contract test.
7. Publish docs
   - Add `docs/api/ui-api-v1.md` with endpoint/method reference and examples.
   - Cross-link from F05 and `PROJECT_PLAN.md` next-step notes.
8. Prepare frontend handoff
   - Provide fixture payloads and a small mock harness for frontend development before full UI integration.

## Test Plan

### Unit Tests

- Envelope validation (`requires_api_version_and_request_id`)
- DTO mapping (`domain_to_standings_row_dto`)
- DTO mapping (`domain_to_category_current_results_row_dto`)
- Error mapping (`domain_conflict_maps_to_match_conflict_code`)
- Input validation (`apply_match_decision_rejects_missing_required_fields`)
- Idempotency helpers (`duplicate_import_token_returns_existing_result`)

### Integration Tests

- `import_race_returns_review_queue_and_audit_event`
- `apply_match_decision_updates_queue_and_decision_trace`
- `rollback_race_recomputes_standings_snapshot`
- `reimport_after_rollback_links_audit_chain_correctly`
- `get_standings_matches_backend_reference_ruleset_v1`
- `get_category_current_results_table_returns_per_race_cells_and_gesamt`

### Contract Tests (Backend <-> Frontend)

- JSON schema conformance for each method response.
- Golden fixtures for expected payload keys and value types.
- Backward-compatibility check for additive-only changes within v1.

### Manual Checks

- Smoke test pywebview call path from a minimal frontend page.
- Verify German UI message lookup works via returned `message_key`.
- Validate request tracing via `request_id` across logs.

### Rollback Strategy

- API layer rollout is additive and can be disabled by feature flag routing frontend back to CLI/manual workflows during stabilization.
- If severe issues are found, keep API package isolated so backend domain services remain unaffected.

## Definition of Done

- [x] Code implemented
- [x] Tests added/updated and passing
- [x] Docs updated
- [x] Entry added to `docs/ACCOMPLISHMENTS.md`
- [x] Requirement/milestone status updated in `PROJECT_PLAN.md`

## Links

- PR(s): TBD
- Related issue(s): TBD
- Release notes: TBD
