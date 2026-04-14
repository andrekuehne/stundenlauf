# H-TS02 Central Event Validation Write Barrier

## Overview

- Hardening ID: H-TS02
- Hardening name: Central event validation write barrier
- Owner: TBD
- Status: Planned
- Related requirement(s): R1, R3, R5, R7
- Related milestone(s): M-TS1
- Related feature(s): F-TS01, F-TS05
- Triggering incident: Import flow admitted a race entry whose `team_id` did not resolve to a registered team, causing downstream UUID fallback in ranking/harness views.

## Problem Statement

Event validation logic exists (`validateEvent` and per-event validators), but the current write path does not enforce it as a mandatory gate before appending and replaying event batches. This allows producer-side bugs to persist invalid events and only surface later in derived views.

## Scope

### In Scope

- Enforce semantic validation (`validateEvent`) at a central boundary before event persistence.
- Validate batch events in sequence against projected intermediate state.
- Fail fast with actionable validation errors; do not partially append invalid batches.
- Add tests covering invalid references (for example unknown `team_id` in `race.registered` entries).

### Out of Scope

- Redesigning domain event schemas.
- Replacing feature-level preventive hardening (H-TS01).
- UI changes beyond surfacing existing import failure messages.

## Invariants to Enforce

- No event is persisted unless it passes `validateEvent` against current state.
- Batch validation is sequential and stateful (event N+1 validates against state after applying valid event N).
- Invalid batches are atomic failures (all-or-nothing append semantics).
- Referential checks in validators (person/team/race linkage) are always active in production write paths.

## Acceptance Criteria

- [ ] Event append APIs enforce domain validation before writing to storage.
- [ ] Invalid `race.registered` with unknown `team_id` is rejected before persistence.
- [ ] Multi-event batch append fails atomically if any event is invalid.
- [ ] Error payloads identify event type/seq and validation reason.
- [ ] Existing valid import pipelines remain compatible and passing.

## Technical Plan

- Architecture/approach:
  - Add a central validation gate in the event write path (event store facade / orchestrator boundary).
  - Reuse existing validators from `src/domain/validation.ts`.
- Data model changes:
  - None expected.
- Event/command definitions:
  - No new event types expected.
- Storage impact:
  - Write path behavior changes from permissive append to validated append.
- Migration needs:
  - No data migration; historical logs remain readable. Optionally add a diagnostic tool to scan existing logs for invalid historical events.
- Performance/reliability concerns:
  - Validation cost on append is acceptable versus integrity gain; monitor large batch import latency.

## Mapping from Current TS Implementation

- Current approach:
  - `validateEvent` exists but append path (`event-store`) mainly enforces seq continuity and duplicate batch IDs.
- Target approach:
  - Append path enforces full semantic validation for every new event in sequence.
- Reusable logic:
  - Keep current per-event validators and projection apply functions; integrate them centrally.

## Risks and Assumptions

- Assumption: Existing valid event producers already satisfy current validator rules.
- Risk: Stricter gate may expose latent producer bugs and fail imports that previously "worked."
  - Mitigation: Improve error context and add targeted regression tests in import pipeline.
- Risk: Duplicate validation in multiple layers can create inconsistent behavior.
  - Mitigation: Define one canonical validation gate and treat other checks as optional preflight hints.

## Implementation Steps

1. Choose canonical write boundary (event store append facade vs orchestration commit layer).
2. Validate candidate batch sequentially against projected intermediate state.
3. Abort append on first invalid event with structured error details.
4. Add tests for happy path + invalid reference path + atomic failure semantics.
5. Verify import/review/finalize pipeline still passes end-to-end tests.

## Test Plan

- Unit:
  - Validation gate rejects invalid single event append.
  - Validation gate rejects invalid event in middle of batch and keeps storage unchanged.
- Integration:
  - Import pipeline append with valid batch succeeds.
  - Corrupted batch (unknown team reference) fails before persistence.
- Fixture-based:
  - Replay realistic import batches and inject one invalid event for failure behavior assertions.
- Manual checks:
  - Trigger known invalid event scenario and confirm user-facing error path without state corruption.

## Definition of Done

- [ ] Code implemented in TypeScript
- [ ] Tests added/updated and passing (Vitest)
- [ ] Types are strict (no `any` escapes without justification)
- [ ] Docs updated
- [ ] Entry added to `packages/stundenlauf-ts/docs/ACCOMPLISHMENTS.md`
- [ ] Requirement/milestone status updated in `packages/stundenlauf-ts/PROJECT_PLAN.md` where applicable

## Links

- Existing validator:
  - `packages/stundenlauf-ts/src/domain/validation.ts`
- Current append path:
  - `packages/stundenlauf-ts/src/storage/event-store.ts`
- Related hardening:
  - `packages/stundenlauf-ts/docs/hardening/H-TS01-team-first-matching-identity-unification.md`
