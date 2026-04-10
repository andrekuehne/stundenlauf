---
name: F08 API Implementation Plan
overview: Implement F08 as a stable, versioned Python UI API boundary for the desktop frontend, covering read/query and write/command workflows required by F05 while preserving backend modularity. The plan maps F08 to M4/M5 and includes contract-first DTOs, error taxonomy, bridge adapter wiring, tests, docs, and project tracking updates.
todos:
  - id: f08-contract-freeze
    content: Finalize v1 method list, envelopes, DTO schema ownership, and error-code catalog based on F08 acceptance criteria.
    status: completed
  - id: f08-ui-api-package
    content: Create backend/ui_api package with envelopes, DTOs, mappers, queries, commands, errors, and service entrypoint modules.
    status: completed
  - id: f08-read-apis
    content: Implement and validate all query methods required by F05, including category current-results table payload contract.
    status: completed
  - id: f08-write-apis
    content: Implement command methods (import/apply/rollback/reimport) with deterministic outputs and idempotency safeguards.
    status: completed
  - id: f08-bridge-adapter
    content: Wire pywebview bridge adapter to ui_api service only, including request_id-correlated structured logging.
    status: completed
  - id: f08-tests
    content: Add unit, integration, and contract regression tests, including end-to-end bridge workflow coverage.
    status: completed
  - id: f08-docs-sync
    content: Publish docs/api/ui-api-v1.md and update feature cross-links/dependencies with final contract details.
    status: completed
  - id: f08-project-tracking
    content: Update docs/ACCOMPLISHMENTS.md and PROJECT_PLAN.md progress entries after implementation completion.
    status: completed
isProject: false
---

# F08 Implementation Plan: Python-Frontend API Layer

## Requirement and Milestone Mapping

- Supports requirements: **R1, R3, R4, R5, R6, R8** from [c:\Users\andre\VSCode_Projects\stundenlauf\PROJECT_PLAN.md](c:\Users\andre\VSCode_Projects\stundenlauf\PROJECT_PLAN.md).
- Advances milestones:
  - **M4** by enabling frontend integration boundary for German GUI workflows.
  - **M5** by adding contract/regression safety and integration reliability.
- Fits current sequencing where F05 UI is next and depends on a stable backend-facing contract.

## Implementation Strategy (Contract-First)

1. **Freeze v1 contract before wiring UI**
   - Finalize F08 method list and request/response envelope shape defined in [c:\Users\andre\VSCode_Projects\stundenlauf\docs\features\F08-python-frontend-api-layer.md](c:\Users\andre\VSCode_Projects\stundenlauf\docs\features\F08-python-frontend-api-layer.md).
   - Standardize envelope fields for every method:
     - request: `api_version`, `request_id`, `method`, `payload`
     - response success: `api_version`, `request_id`, `status="ok"`, `payload`
     - response error: `api_version`, `request_id`, `status="error"`, `error.{code,message_key,details}`
   - Define one canonical error-code catalog used across all commands/queries.

2. **Create explicit API package boundary**
   - Add `backend/ui_api/` modules for:
     - `envelopes.py` (request/response validation and builders)
     - `dto.py` (typed payload contracts)
     - `mappers.py` (domain -> DTO mapping)
     - `queries.py` (read-only API methods)
     - `commands.py` (state-changing methods)
     - `errors.py` (error taxonomy + mapper)
     - `service.py` (single entrypoint exposed to bridge)
   - Keep existing F01-F04 domain/repository modules internal; only `ui_api` is frontend-consumable.

3. **Implement read/query surface first (frontend unblock priority)**
   - Implement and test:
     - `get_project_state`
     - `get_standings`
     - `get_category_current_results_table`
     - `get_review_queue`
     - `get_match_candidate`
     - `get_audit_timeline`
   - For `get_category_current_results_table`, enforce stable race-cell payload with nullable per-race fields and aggregate totals (`distanz_gesamt`, `punkte_gesamt`, `platz`).

4. **Implement command surface with deterministic outcomes**
   - Implement and test:
     - `import_race`
     - `apply_match_decision`
     - `rollback_race`
     - `reimport_race`
   - Enforce deterministic and auditable command outputs with race event identifiers and decision trace metadata.
   - Ensure idempotency/duplicate protection where feasible for import and reimport retries.

5. **Bridge adapter integration**
   - Add a single pywebview bridge adapter that delegates to `ui_api.service` and never directly invokes domain internals.
   - Add request correlation (`request_id`) into structured logs for troubleshooting end-to-end calls.

6. **Testing pyramid and stability gates**
   - Unit:
     - envelope validation
     - DTO mapping
     - error mapping
     - command/query input validation
     - idempotency behavior
   - Integration:
     - import -> review queue
     - apply decision -> queue/trace updates
     - rollback -> standings recompute
     - reimport -> audit chain continuity
     - standings parity against current backend ruleset expectations
   - Contract:
     - schema/key/type conformance for each method response
     - golden fixtures to catch payload drift
     - additive-only compatibility checks within `v1`
   - Manual smoke:
     - minimal pywebview call path
     - `message_key` lookup path for German UI
     - request traceability by `request_id`

7. **Documentation and cross-feature alignment**
   - Create `docs/api/ui-api-v1.md` containing:
     - method reference
     - request/response examples
     - error-code catalog
     - compatibility/versioning policy
   - Cross-link docs:
     - update [c:\Users\andre\VSCode_Projects\stundenlauf\docs\features\F08-python-frontend-api-layer.md](c:\Users\andre\VSCode_Projects\stundenlauf\docs\features\F08-python-frontend-api-layer.md) with final method/DTO decisions
     - add dependency note in F05 feature doc to consume `ui-api-v1`
   - Keep all user-visible strings German via `message_key` mapping in frontend.

8. **Project workflow completion updates (required by workspace rule)**
   - Add implementation outcome entry to `docs/ACCOMPLISHMENTS.md`.
   - Update milestone/requirement progress in `PROJECT_PLAN.md` if F08 completion changes status tracking.
   - Confirm “done” with code + tests + docs + accomplishments entry.

## Execution Order (Small Verifiable Steps)

- Step 1: Contract freeze and DTO/error-catalog decisions.
- Step 2: `backend/ui_api` skeleton + envelope primitives.
- Step 3: Query methods + query unit tests.
- Step 4: Command methods + command unit tests.
- Step 5: pywebview adapter wiring.
- Step 6: Integration + contract regression tests.
- Step 7: API docs and feature cross-links.
- Step 8: accomplishments/project-plan status updates.

## Assumptions

- pywebview remains the approved desktop bridge for v1.
- Existing backend services from F01-F04 already expose sufficient domain operations for mapping to UI DTOs without major storage redesign.
- No immediate storage schema migration is required unless audit/trace metadata gaps are discovered during command API implementation.

## Risks and Mitigations

- **DTO drift between docs and implementation**
  - Mitigation: golden contract fixtures + schema assertions in CI.
- **Backend internals leaking through API surface**
  - Mitigation: strict DTO/mapping layer and a single service entrypoint.
- **Duplicate or inconsistent imports on retry**
  - Mitigation: idempotency checks/tokens and deterministic command result rules.
- **Insufficient UI-facing error granularity**
  - Mitigation: stable error taxonomy with contextual `details` and German `message_key` mapping.

## Test Plan (Acceptance-Driven)

- Acceptance criteria from F08 become explicit test targets:
  - API package boundary exists and is used as frontend entrypoint.
  - Every method returns envelope-compliant response.
  - Category table response shape is stable and complete.
  - Error mapping emits stable codes (`VALIDATION_ERROR`, `MATCH_CONFLICT`, `RACE_NOT_FOUND`, etc.).
  - At least one end-to-end bridge path test (`import -> review -> apply -> standings refresh`).
  - API docs published and linked.

## Out-of-Scope Guardrails

- No network/server deployment.
- No multi-user sync semantics.
- No rewrite of existing domain logic; this is an adaptation/boundary layer.
- No broad i18n framework expansion beyond message-key based German UI support.