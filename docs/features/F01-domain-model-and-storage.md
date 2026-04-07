# Feature Plan: Domain Model and Portable Storage

## Overview

- Feature name: Domain model and portable storage
- Owner: TBD
- Status: Planned
- Related requirement(s): R2, R3, R7
- Related milestone(s): M1

## Problem Statement

The project needs a stable core model for races, participants, teams, and results before ingestion, matching, and ranking logic can be implemented safely.
Storage must be file-based and portable across computers without additional services.

## Scope

### In Scope

- Define canonical entities for participant, team, race, race result, and season/series aggregate.
- Define stable identifiers and metadata fields (including club optionality and YOB).
- Design file format for save/load (JSON-based, versioned schema).
- Add migration/version marker strategy for future format updates.

### Out of Scope

- Excel parsing logic.
- Matching heuristics and review UI.

## Acceptance Criteria

- [ ] Canonical domain schema documented with examples.
- [ ] App can save and load a full project file on another computer.
- [ ] Schema version field exists and invalid files fail with clear messages.

## Technical Plan

- Architecture/approach: Python domain layer + repository abstraction backed by local file.
- Data model/API changes: Introduce typed models for all race categories and team compositions.
- Migration needs: Include `schema_version` and migration entry points.
- Performance/reliability concerns: Use atomic write strategy to avoid corruption.

## Risks and Assumptions

- Assumption: One project file represents one race series/season.
- Risk: Future rule changes require model reshaping.
  - Mitigation: Keep model extensible and versioned from day one.

## Implementation Steps

1. Draft canonical entity diagram and sample serialized document.
2. Implement models and file repository with validation.
3. Add tests for load/save portability and schema compatibility checks.

## Test Plan

- Unit: serialization/deserialization and validation edge cases.
- Integration: open-save-open cycle on second machine/environment.
- Manual checks: inspect generated project file readability and consistency.
- Rollback strategy: preserve previous file snapshot before overwrite.

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
