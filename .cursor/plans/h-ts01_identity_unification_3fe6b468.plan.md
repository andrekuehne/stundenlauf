---
name: H-TS01 Identity Unification
overview: Implement H-TS01 by removing person-to-team identity seams in the singles matching/review pipeline so every review/staging link uses canonical `team_id` end-to-end, with regression coverage for the reported UUID-row incident.
todos:
  - id: audit-identity-contracts
    content: Trace singles ID flow across resolve/workflow/review and define canonical team-first contract boundaries.
    status: completed
  - id: refactor-resolve-team-first
    content: Refactor singles resolution to emit team IDs only for candidate/top/final link fields and remove person-id fallback.
    status: completed
  - id: refactor-workflow-review-candidates
    content: Update singles review-item builder to consume team-centric candidates without per-candidate remapping seams.
    status: completed
  - id: add-review-resolution-guards
    content: Add link_existing validation so only valid candidate team IDs can be persisted to staged entries.
    status: completed
  - id: add-regression-tests
    content: Add/extend resolve, workflow, review, and pipeline tests for team-id invariants and prior UUID-row failure scenario.
    status: completed
  - id: update-plan-and-accomplishments
    content: After passing tests, update PROJECT_PLAN hardening status and add ACCOMPLISHMENTS entry.
    status: completed
isProject: false
---

# H-TS01 Team-First Identity Unification Plan

Supports requirement(s) **R3/R4/R6** and hardening item **H-TS01** in [packages/stundenlauf-ts/PROJECT_PLAN.md](packages/stundenlauf-ts/PROJECT_PLAN.md).

## Current Seam To Remove

The singles path is still person-centric in key places, then patched to `team_id` late:

- [packages/stundenlauf-ts/src/matching/resolve.ts](packages/stundenlauf-ts/src/matching/resolve.ts) currently tracks candidate usage by person and has fallback behavior that can leak person IDs into `team_id` fields.
- [packages/stundenlauf-ts/src/matching/workflow.ts](packages/stundenlauf-ts/src/matching/workflow.ts) remaps review candidate IDs per item instead of consuming an already team-first candidate contract.
- [packages/stundenlauf-ts/src/import/review.ts](packages/stundenlauf-ts/src/import/review.ts) accepts a `team_id` from review action without validating referential integrity at resolution time.

## Implementation Approach

1. **Make singles resolution team-first at the source**
   - In [packages/stundenlauf-ts/src/matching/resolve.ts](packages/stundenlauf-ts/src/matching/resolve.ts), introduce one canonical helper that builds a `person_id -> solo_team_id` map once per section/state snapshot.
   - Convert singles `candidate_uids`, `top_candidate_uid`, replay hits, conflict tracking, and final `team_id` assignment to operate on team IDs only.
   - Remove the fallback that uses `person_id` as `team_id`; replace with explicit failure/guard in impossible states.

2. **Simplify review item construction to consume team IDs only**
   - Refactor [packages/stundenlauf-ts/src/matching/workflow.ts](packages/stundenlauf-ts/src/matching/workflow.ts) so `buildReviewItemForSingles` no longer performs identity translation and never emits non-team candidates.
   - Keep person-derived fields (`display_name`, `yob`, `club`) as display metadata only.

3. **Add review resolution guardrails**
   - In [packages/stundenlauf-ts/src/import/review.ts](packages/stundenlauf-ts/src/import/review.ts), validate that `link_existing.team_id` is present in review candidates and that staged writes only persist valid team IDs.
   - Ensure error messages clearly indicate invalid identity link attempts.

4. **Preserve replay compatibility while enforcing team IDs**
   - Keep historical replay behavior intact, but ensure replay index application always resolves to existing teams before any staged output is produced.

5. **Regression and contract tests**
   - Expand [packages/stundenlauf-ts/tests/matching/resolve.test.ts](packages/stundenlauf-ts/tests/matching/resolve.test.ts) with cases proving singles candidates/top candidate are team IDs and that missing-solo-team states are rejected.
   - Expand [packages/stundenlauf-ts/tests/matching/workflow.test.ts](packages/stundenlauf-ts/tests/matching/workflow.test.ts) and/or [packages/stundenlauf-ts/tests/matching/review-display.test.ts](packages/stundenlauf-ts/tests/matching/review-display.test.ts) to verify review candidates remain display-correct while identity stays team-first.
   - Expand [packages/stundenlauf-ts/tests/import/review.test.ts](packages/stundenlauf-ts/tests/import/review.test.ts) with failure coverage for invalid `link_existing` team IDs and success coverage for valid mixed singles/couples review resolution.
   - Add/extend import pipeline regression in [packages/stundenlauf-ts/tests/import/pipeline.test.ts](packages/stundenlauf-ts/tests/import/pipeline.test.ts) for the reported “singles review candidate selected -> committed race entry” path.

6. **Close-out docs updates after implementation**
   - Mark H-TS01 status and progress in [packages/stundenlauf-ts/PROJECT_PLAN.md](packages/stundenlauf-ts/PROJECT_PLAN.md) when acceptance criteria are met.
   - Add outcome entry to [packages/stundenlauf-ts/docs/ACCOMPLISHMENTS.md](packages/stundenlauf-ts/docs/ACCOMPLISHMENTS.md) describing the bug class eliminated and verification scope.

## Risks And Mitigations

- **Risk:** strict team-first behavior surfaces latent data inconsistencies where solo team membership is incomplete.
  - **Mitigation:** fail fast with explicit errors and targeted fixtures; avoid silent identity fallback.
- **Risk:** behavior drift in matching outcomes.
  - **Mitigation:** keep scoring/routing unchanged; assert parity in existing matching tests plus new identity-contract assertions.

## Verification Plan

- Run targeted tests first:
  - `tests/matching/resolve.test.ts`
  - `tests/matching/workflow.test.ts`
  - `tests/import/review.test.ts`
  - `tests/import/pipeline.test.ts`
- Then run full package tests (`vitest`) to confirm no cross-feature regressions.
- Optional manual check: import-season harness sequence to confirm rankings never display raw UUID rows for known runners.