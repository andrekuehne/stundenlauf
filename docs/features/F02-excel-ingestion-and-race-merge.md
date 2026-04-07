# Feature Plan: Excel Ingestion and Race Merge Pipeline

## Overview

- Feature name: Excel ingestion and race merge pipeline
- Owner: TBD
- Status: Planned
- Related requirement(s): R1, R2, R3
- Related milestone(s): M2

## Problem Statement

Race data arrives race-by-race from fixed-format Excel files.
The system needs a repeatable import pipeline that validates input, converts it into canonical structures, and merges it into the existing series state.

## Scope

### In Scope

- Parse fixed Excel layout into intermediate import model.
- Validate required fields (name, YOB, race type, distance, points).
- Convert records to canonical race result structures.
- Append new race to project and trigger matching + recompute pipeline.

### Out of Scope

- Support for arbitrary/non-standard Excel formats.
- Final matching decision UI internals (handled in dedicated feature).

## Acceptance Criteria

- [ ] Import for known-good files succeeds without manual fixes.
- [ ] Invalid files produce actionable validation error messages.
- [ ] Added race appears in stored project history with import metadata.

## Technical Plan

- Architecture/approach: staged pipeline (read -> validate -> map -> merge).
- Data model/API changes: Add import metadata (`source_file`, `imported_at`, version).
- Migration needs: none expected beyond base schema support.
- Performance/reliability concerns: deterministic parsing and idempotency guard for duplicate imports.

## Risks and Assumptions

- Assumption: Source files remain close to current structure.
- Risk: Hidden format drift causes silent wrong mapping.
  - Mitigation: strict header checks and schema fingerprinting.

## Implementation Steps

1. Build parser for current Excel template with explicit column mapping.
2. Implement validation and error reporting model.
3. Integrate merge trigger and persistence into import workflow.

## Test Plan

- Unit: parser mapping tests and validation branch coverage.
- Integration: import multiple races with overlapping and non-overlapping participants.
- Manual checks: import representative historical files and compare totals.
- Rollback strategy: abort merge on parse/validation failure before persistence.

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
