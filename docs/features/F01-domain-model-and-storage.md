# Feature Plan: F01 Domain Model and Portable Storage

## Overview

- Feature name: Domain model and portable storage
- Owner: TBD
- Status: Implemented (Python backend; extended via schema v2 migrations in F03/F04)
- Related requirement(s): R2, R3, R7
- Related milestone(s): M1

## Implementation notes (2026-04-08)

Shipped in the backend repository layer (`backend/domain/`, `backend/storage/`). See `docs/ACCOMPLISHMENTS.md` (F01 entry). Later features bump `schema_version` and add migrations without changing this document’s domain concepts.

## Problem Statement

The app needs a canonical, durable model for individuals, couples, race categories, race instances, and accumulated standings.
The model must preserve race input details (including race-specific start numbers), support reliable season-long accumulation, and stay extensible for future gender options.
Storage must remain local, file-based, portable, and versioned.

## Scope

### In Scope

- Define core entities and value objects for:
  - Person identity: name, year of birth, gender, optional club.
  - Couple/team identity as an ordered-insensitive pair of two persons.
  - Race type and category definitions for:
    - `half_hour` (1/2h lauf)
    - `hour` (h-lauf)
    - divisions: men, women, couples men, couples women, couples mixed.
  - Race event entry with race-specific start number (`startnr`) retained for completeness.
  - Result metrics for both individuals and couples: distance (km), points.
  - Season/series category bucket (for example "Stundenlauf Männer 2026").
- Define invariants and validation rules for category composition and gender constraints.
- Define JSON project file schema with versioning and migration hooks.
- Define repository interface and atomic file save/load semantics.
- Define stable UIDs for auditable entities (`participant_uid`, `team_uid`, `race_event_uid`, `decision_uid`).
- Define race event lifecycle state to support rollback (`active`, `rolled_back`) without deleting history.

### Out of Scope

- Excel ingestion/parsing implementation (F02).
- Participant/team matching heuristics and review workflow (F03/F05).
- Ranking rules and standings calculation logic details (F04), except data shapes required for future computation.

## Domain Decisions

1. **Person model**
   - Required: `name: string`, `yob: int`, `gender: enum`.
   - Optional: `club: string | null`.
   - Gender enum initially includes `M`, `F`, `X`.
   - Individual race categories currently allow `M` and `F` only by configuration, not by hardcoded schema limits.

2. **Couple model**
   - Couple identity is exactly two members.
   - Each member keeps full person attributes independently (`name`, `gender`, `yob`, `club`).
   - Clubs may differ between members.
   - Couple identity is based on both members together; replacing one member creates a new couple.
   - Member order must not affect identity (`A+B == B+A`).

3. **Category model**
   - Canonical category key: `series_year + race_duration + division`.
   - Examples:
     - `2026:hour:men`
     - `2026:half_hour:couples_mixed`
   - Human-readable German labels are stored/derived for UI display.

4. **Start number handling**
   - `startnr` is stored at race-entry level, not person/couple master entity.
   - The same person or couple can have different `startnr` values across races.

5. **Future gender diversity support**
   - Keep person gender enum extensible.
   - Keep division eligibility in configuration metadata so new individual divisions can be introduced without schema redesign.

6. **Stable UID policy**
   - Every participant/team master entity has an immutable UID.
   - Every imported race event has an immutable UID, independent of race number.
   - Every manual merge/review action is persisted with a decision UID.

7. **Rollback-safe race event lifecycle**
   - Race rollback marks an event as `rolled_back` instead of deleting it.
   - Rolled-back events remain available for audit views and trace reconstruction.
   - Computation consumers (matching/ranking) must ignore non-active race events by default.

## Acceptance Criteria

- [x] Canonical schema documented for person, couple, category, race entry, and season bucket.
- [x] All required categories for half-hour and hour races are representable.
- [x] Couple identity stability guaranteed across races with order-insensitive member matching.
- [x] Race-specific start numbers are persisted without affecting identity resolution.
- [x] Project file can be saved/loaded on another machine with schema version validation.
- [x] Invalid schema/data combinations fail with clear validation errors.
- [x] Stable UIDs persist unchanged across save/load cycles.
- [x] Rolled-back races remain auditable and excluded from active computations.

## Technical Plan

- Architecture/approach:
  - Python domain entities + validators + repository abstraction.
  - JSON file repository with atomic write and backup-on-write.
- Data model/API changes:
  - Add entity types: `Person`, `Couple`, `RaceSeriesCategory`, `RaceEvent`, `RaceEntry`, `EntryResult`.
  - Add identity helpers for normalized person/couple keys.
  - Add category configuration describing allowed compositions and labels.
- Migration strategy:
  - `schema_version` at root.
  - Migration dispatcher for future version transforms.
- Reliability concerns:
  - Atomic write via temp file + replace.
  - Pre-write validation and post-load validation.

## Risks and Assumptions

- Assumption: one project file represents one race year/series set, but can contain multiple categories.
- Assumption: points are imported as provided and stored raw; ranking logic is handled later in F04.
- Risk: ambiguous names may collapse distinct persons.
  - Mitigation: identity includes more than name where possible (yob, gender, optional club), with later manual review in F03/F05.
- Risk: future category expansion breaks hardcoded rules.
  - Mitigation: rule-driven category eligibility config from day one.

## Implementation Tasks

1. **Define canonical vocabulary and enums**
   - Finalize race duration enum: `half_hour`, `hour`.
   - Finalize division enum: `men`, `women`, `couples_men`, `couples_women`, `couples_mixed`.
   - Finalize gender enum with current values `M`, `F`, `X`.

2. **Create core entities and value objects**
   - Implement `Person` with required/optional fields.
   - Implement `Couple` as two `PersonRef` members with order-insensitive normalized identity.
   - Implement `RaceSeriesCategory` key object (`year`, `duration`, `division`).
   - Implement `RaceEvent` and `RaceEntry` holding `startnr`, participant reference, and result metrics.

3. **Implement validation rules**
   - Validate individual entries belong to individual divisions only.
   - Validate couple entries have exactly two members.
   - Validate division-gender constraints using configurable rules.
   - Validate distance and points numeric constraints.

4. **Design JSON schema and examples**
   - Define root document structure and `schema_version`.
   - Include canonical examples for:
     - Individual man/woman entry.
     - Couple men/women/mixed entries with different clubs.
     - Same couple across two races with different start numbers.
     - Near-identical couple where one member differs (must serialize as distinct team).

5. **Build repository and persistence behavior**
   - Implement load/save API.
   - Add atomic write strategy and backup snapshot before replace.
   - Add structured error mapping for invalid files/version mismatch.

6. **Add migration scaffold**
   - Implement migration registry from `v1` onward.
   - Add no-op migration tests for current version.

7. **Prepare integration points for F02/F03/F04**
   - Expose stable IDs and lookup interfaces used by ingestion/matching/ranking.
   - Document which fields are identity-defining versus race-instance-only metadata.

8. **Implement rollback-safe repository semantics**
   - Add lifecycle state handling for race events and rollback metadata (who/when/why).
   - Expose active-only and include-rolled-back query modes.

9. **Documentation updates**
   - Update model documentation with glossary and German display label mapping.
   - Add accomplishment entry after implementation.
   - Update milestone progress in `PROJECT_PLAN.md` when delivered.

## Detailed Test Cases

### Unit Tests (Domain)

1. `person_requires_name_yob_gender`
   - Given missing required fields, creation fails with explicit error.

2. `person_allows_optional_club`
   - Person with `club = null` is valid.

3. `couple_identity_is_order_insensitive`
   - Couple `(A,B)` equals `(B,A)` for identity key generation.

4. `couple_with_one_member_changed_is_different_identity`
   - `(A,B)` and `(A,C)` generate different team identities.

5. `couple_members_keep_independent_clubs`
   - Two member clubs can differ and are both persisted.

6. `startnr_not_part_of_person_or_couple_identity`
   - Same person/couple in two races with different start numbers maps to same identity.

7. `category_key_separates_year_duration_division`
   - `2026:hour:men` and `2026:half_hour:men` are distinct.

8. `category_validation_rejects_invalid_division_for_entry_type`
   - Couple entry in `men` division fails validation.

9. `distance_and_points_must_be_numeric_and_non_negative`
   - Negative or non-numeric values fail validation.

10. `gender_enum_supports_x_but_rules_can_disable_for_specific_divisions`
    - Schema accepts `X`; current individual division eligibility config can disallow it without schema error.

### Unit Tests (Serialization)

11. `serialize_deserialize_person_roundtrip`
12. `serialize_deserialize_couple_roundtrip`
13. `serialize_deserialize_race_entry_with_startnr_roundtrip`
14. `serialize_preserves_schema_version`
15. `deserialize_rejects_unknown_schema_version`

### Integration Tests (Repository)

16. `save_load_roundtrip_preserves_all_categories_and_results`
17. `atomic_write_does_not_corrupt_on_interrupted_save`
18. `backup_created_before_overwrite`
19. `load_from_other_machine_path_encoding_works`
20. `invalid_file_returns_user_friendly_error`
21. `uid_roundtrip_remains_stable`
22. `rollback_marks_event_rolled_back_without_data_loss`
23. `active_queries_exclude_rolled_back_events_by_default`

### Scenario Tests (Business Semantics)

24. **Season accumulation bucket separation**
    - Results in `Stundenlauf Männer 2026` do not mix with `Stundenlauf Männer 2025`.

25. **Duration separation**
    - Half-hour and hour results for same person stay in distinct category buckets.

26. **Couple stability across races**
    - Same pair over multiple races accumulates as one couple.

27. **Couple member change**
    - One-member replacement starts a new couple accumulation bucket.

28. **Mixed couple categorization**
    - One `M` + one `F` is valid in `couples_mixed`.

## Definition of Done

- [x] Domain entities and validators implemented.
- [x] JSON schema v1 and repository implemented with atomic save.
- [x] Test suite for domain, serialization, and repository passing.
- [x] Feature docs updated with examples and invariants.
- [x] Entry added to `docs/ACCOMPLISHMENTS.md`.
- [x] Relevant progress reflected in `PROJECT_PLAN.md` (R2/R3/R7, M1).

## Links

- PR(s): TBD
- Related issue(s): TBD
- Release notes: TBD
