# F-TS06c: Import Orchestration and Matching Review Workflow

## Overview

- Feature ID: F-TS06c
- Parent feature: F-TS06
- Status: Planned
- Related requirement(s): R1, R3, R4, R6, R8
- Related milestone(s): M-TS5
- Depends on: F-TS06a, F-TS05, F-TS03, F-TS04

## Goal

Implement the production GUI for import orchestration and human-in-the-loop matching review in a focused slice that maps directly to the existing dev prototype (`npm run dev` + `?harness=import-season`).

## Why this is its own slice

Import + matching review is the highest-complexity UI workflow in the port. It includes staged processing, confidence thresholds, pending review queues, manual decisions, and finalization into events. Keeping this isolated prevents it from overwhelming broader shell/standings work.

## Prototype baseline (current harness)

The existing walkthrough harness (`src/devtools/ImportSeasonWalkthroughHarness.tsx`) already demonstrates the core orchestration semantics that this feature should preserve:

1. `startImport(file, seasonState)`
2. `runMatching(session, matchingConfig)`
3. If phase is `reviewing`: render pending queue and apply decisions via `resolveReviewEntry`
4. If phase is `committing`: finalize via `finalizeImport` and project next season state

Additional observed harness behavior to carry over:

- Matching mode switch: `strict` / `fuzzy_automatik` / `manuell`
- Threshold controls: `auto_min`, `review_min`, and derived `effectiveAutoMin`
- Pending review sorted by confidence
- Decision set includes linking existing team or creating new identity
- Import is blocked while open reviews exist

## Scope

### In scope

- Import view UI and state lifecycle:
  - file selection via browser `File` input
  - source type + race number inference/selection
  - import readiness guards
- Matching settings panel:
  - mode tabs
  - threshold controls with clamping and bidirectional consistency
  - clear German explainer text per mode
- Review workflow UI:
  - queue/progress indicators
  - incoming identity details
  - candidate list and selection
  - actions: link existing / create new identity
- Merge-correct affordance for ambiguous records where editable correction is needed.
- Commit path:
  - finalize import when reviews are complete
  - update season projections and user-visible status

### Out of scope

- New matching score algorithm changes.
- End-user redesign of domain review semantics.
- History screen and season management baseline (F-TS06b).

## Acceptance criteria

- [ ] User can import XLSX from browser file input (no desktop bridge assumptions).
- [ ] UI executes orchestration phases equivalent to harness behavior (`startImport` -> `runMatching` -> review/commit).
- [ ] Matching mode and threshold controls map to domain config and show effective threshold semantics.
- [ ] Review queue is visible, ordered, and actionable; decisions persist through queue advancement.
- [ ] User can choose existing candidate or create new identity for each pending review item.
- [ ] Finalization emits events and refreshes downstream season/standings projections.
- [ ] Import button/action is guarded while unresolved review items remain.
- [ ] Error states are surfaced with actionable German messages.

## Data and state contracts

Define explicit view-model boundaries between domain sessions and UI components:

- `ImportDraftViewModel` (selected file, inferred type/race no, readiness)
- `MatchingConfigViewModel` (mode, auto/review thresholds, derived effective auto)
- `ReviewQueueViewModel` (ordered pending items, selected decision per entry, remaining count)
- `ImportCommitResultViewModel` (rows imported, review count, events emitted, source file)

These should be serializable/testable and avoid directly mutating domain objects from component internals.

## Risks and mitigations

- Risk: scope creep by re-implementing domain semantics in UI.
  - Mitigation: UI only orchestrates domain APIs and renders typed view models.
- Risk: review decision state loss across rerenders.
  - Mitigation: key decisions by stable `entry_id` in store state.
- Risk: mismatch between harness and production UX behavior.
  - Mitigation: add parity tests referencing harness-observed phase transitions and guardrails.

## Implementation steps

1. Build import draft store and file/type/race controls.
2. Implement matching settings component with mode + threshold logic.
3. Wire orchestration calls (`startImport`, `runMatching`) and phase transitions.
4. Implement review queue UI and decision state (`resolveReviewEntry` loop).
5. Integrate merge-correct modal path for review adjustments.
6. Implement finalize/commit handling and projection refresh hooks.
7. Add component and integration tests mirroring harness flow.

## Test plan

- Unit tests:
  - threshold clamping and effective auto-min logic
  - file-name inference helpers for type/race defaults
- Component tests:
  - mode switching and threshold UI behavior
  - review queue rendering and candidate decision interactions
  - import guard while pending reviews exist
- Integration tests:
  - import file -> reviewing phase -> resolve all reviews -> committing phase -> updated projection tables
  - no-review path that commits immediately
- Parity check:
  - compare production phase behavior against documented harness semantics.

## Definition of done

- [ ] Import orchestration GUI behavior is production-ready and test-covered.
- [ ] Manual review path is complete and bounded to this feature slice.
- [ ] Behavior matches harness baseline unless intentional deviations are documented.
