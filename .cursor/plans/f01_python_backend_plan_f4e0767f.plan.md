---
name: F01 Python backend plan
overview: Implement Milestone M1 by building a Python domain model, validation layer, and portable JSON repository for race data with stable identities and rollback-safe event lifecycle.
todos:
  - id: define-domain-types
    content: Create Python enums and domain models for person/couple/category/race event/entry/result with stable UID fields
    status: completed
  - id: identity-and-validation
    content: Implement normalized identity helpers and configurable validation rules for division and gender eligibility
    status: completed
  - id: json-schema-repository
    content: Build schema_version v1 serialization and JSON repository with atomic save, backup, and lifecycle-aware queries
    status: completed
  - id: migration-scaffold
    content: Add migration dispatcher and v1 no-op migration path with explicit version handling errors
    status: completed
  - id: tests-f01
    content: Implement unit and integration tests covering F01 acceptance criteria and scenario behavior
    status: completed
  - id: docs-progress-updates
    content: Update accomplishments and project plan status after implementation is complete
    status: completed
isProject: false
---

# F01 Implementation Plan (Python Backend)

## Goal and Requirement Mapping
- Deliver `M1` (Domain foundation and portable storage) from [C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md](C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md).
- Satisfy `R2` (race categories), `R3` (cross-race participant/team tracking), and `R7` (file-based portability).
- Use Python backend modules as the implementation target.

## Scope to Implement Now
- Build canonical domain objects for persons, couples, categories, race events/entries/results, and stable UIDs.
- Enforce invariants: category composition, entry type compatibility, gender/division eligibility, and numeric result constraints.
- Implement JSON `schema_version` v1 persistence with strict load validation, migration scaffold, and atomic save semantics.
- Add event lifecycle support (`active`, `rolled_back`) and default active-only query behavior.

## Proposed File/Module Structure
- `backend/domain/enums.py` for `Gender`, `RaceDuration`, `Division`, `RaceEventState`.
- `backend/domain/models.py` for `Person`, `Couple`, `RaceSeriesCategory`, `RaceEvent`, `RaceEntry`, `EntryResult`.
- `backend/domain/identity.py` for normalized keys and order-insensitive couple identity helpers.
- `backend/domain/validation.py` for rule checks and user-facing validation error mapping.
- `backend/storage/schema_v1.py` for JSON serialization contracts.
- `backend/storage/repository.py` for load/save, atomic write, backup-on-write, and active/rolled-back query API.
- `backend/storage/migrations.py` for version dispatcher and no-op v1 migration.
- `tests/domain/` and `tests/storage/` for unit/integration coverage.

## Implementation Steps
1. Define enums and value object contracts (durations, divisions, genders, lifecycle states).
2. Implement core dataclasses/Pydantic models with immutable UID fields and explicit identity-defining vs race-instance fields.
3. Add normalized identity helpers (`person_key`, `couple_key`) with member-order-insensitive couple semantics.
4. Implement configurable division eligibility rules (schema can include `X`, config determines current allowed divisions).
5. Implement JSON schema v1 serializer/deserializer with root `schema_version` and clear version mismatch errors.
6. Implement repository with temp-write + atomic replace and pre-overwrite backup file.
7. Implement rollback semantics by state transition, not deletion; provide default active-only retrieval.
8. Add migration registry scaffolding and tests for v1 no-op path.
9. Add and pass tests from F01 acceptance/test lists, prioritizing identity stability and save/load roundtrip integrity.
10. Update delivery docs after implementation: [C:/Users/andre/VSCode_Projects/stundenlauf/docs/ACCOMPLISHMENTS.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/ACCOMPLISHMENTS.md) and milestone/requirement progress in [C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md](C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md).

## Risks and Mitigations
- Ambiguous identity collisions: include yob/gender/(optional club) in normalized identity and keep UIDs immutable once created.
- Future division expansion breaking logic: centralize eligibility in config-driven rules, not hardcoded conditionals.
- File corruption risk: use atomic replace plus backup snapshot and fail-fast validation.

## Test Plan
- Domain tests: required field validation, couple order insensitivity, division-entry compatibility, numeric constraints.
- Serialization tests: roundtrip for all core entities, version preservation, unknown version rejection.
- Repository tests: atomic write behavior, backup creation, stable UID roundtrip, active-only exclusion of rolled-back events.
- Scenario tests: season/year separation, duration separation, couple continuity across races, member-change creates new team identity.

## Deliverables
- Python domain + storage implementation for F01.
- Automated tests validating acceptance criteria.
- Documentation/progress updates in accomplishments + project plan.