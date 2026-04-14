# H-TS01 Team-First Matching Identity Unification

## Overview

- Hardening ID: H-TS01
- Hardening name: Team-first matching identity unification
- Owner: TBD
- Status: Done
- Related requirement(s): R3, R4, R6
- Related milestone(s): M-TS3
- Related feature(s): F-TS03, F-TS05
- Triggering incident: Import-season harness exposed review resolutions where singles candidates used `person_id` in a `team_id` field, producing UUID-only rows in rankings.

## Problem Statement

The domain model is team-centric (a single runner is a solo team), but the singles matching/review path still carries person-centric candidate identifiers in parts of the pipeline. This creates translation seams (`person_id` -> `team_id`) that can leak invalid IDs into staged race entries and violate team-level referential integrity.

## Scope

### In Scope

- Unify matching/review candidate identity contracts so all candidate references are `team_id`.
- Remove person/team identifier translation seams in singles review and replay paths.
- Add invariants/tests that reject non-team IDs in team-linking paths.
- Keep couples and singles behavior functionally equivalent from user perspective.

### Out of Scope

- Replacing scoring heuristics themselves (weights, thresholds, fuzzy features).
- UI redesign of the review flow.
- Large domain model changes outside matching/review contracts.

## Invariants to Enforce

- Any field named `team_id` must always reference an existing team.
- Review queue candidate references (`ReviewCandidate.team_id`) are always team IDs.
- Resolved staged entries never persist person IDs into `StagedEntry.team_id`.
- Replay index and strict/manual override resolution operate on team IDs.

## Acceptance Criteria

- [x] Singles and couples review candidates both use `team_id` identity end-to-end.
- [x] No code path in matching/review writes a raw `person_id` into team-linking fields.
- [x] Referential-integrity checks show zero missing team references after multi-file import sequences.
- [x] Regression tests cover the previously failing scenario (singles review candidate selected -> committed race entry).
- [x] Existing matching outcomes remain behaviorally stable aside from bug fix.

## Technical Plan

- Architecture/approach:
  - Introduce/standardize team-centric candidate modeling at the matching boundary.
  - Keep person-level features as attributes used for scoring/display only.
- Data model changes:
  - Tighten candidate/result contracts where needed to distinguish display identity from link identity.
- Event/command definitions:
  - No new domain event types expected.
- Storage impact:
  - None (event schema unchanged).
- Migration needs:
  - No data migration expected; replay logic must remain compatible with historical events.
- Performance/reliability concerns:
  - Avoid repeated O(n) person-to-team lookups by caching solo team mapping during section processing.

## Mapping from Current TS Implementation

- Current approach:
  - Singles pipeline resolves/scans persons first, then maps to solo teams later.
  - Couples pipeline is already team-centric.
- Target approach:
  - Both pipelines expose team-centric candidate identities at review/staging boundaries.
- Reusable logic:
  - Existing scoring/fingerprint modules remain reusable; only identifier plumbing is unified.

## Risks and Assumptions

- Assumption: Every valid single-runner identity has exactly one solo team in current state.
- Risk: Hidden call sites may still assume singles candidate IDs are person IDs.
  - Mitigation: Add contract tests and type-level guards around review candidate creation and resolution.
- Risk: Replay/strict matching paths could regress if mapping is applied inconsistently.
  - Mitigation: Add replay-focused regression fixtures across mixed singles/couples seasons.

## Implementation Steps

1. Audit matching/review types and call sites for identifier semantics (`person_id` vs `team_id`).
2. Standardize singles review candidate generation to emit team IDs only.
3. Add guardrails in review resolution to reject/flag non-team IDs.
4. Consolidate/centralize person->solo-team mapping helper to avoid drift.
5. Expand tests for mixed import sequences that previously produced UUID-only ranking rows.
6. Run full Vitest suite and targeted harness verification.

## Test Plan

- Unit:
  - Matching candidate identity mapping helpers (person-to-solo-team mapping).
  - Review resolution guards for invalid team references.
- Integration:
  - `runMatching -> review -> finalize -> projectState` for singles-heavy imports.
  - Mixed singles/couples season import with manual review selections.
- Fixture-based:
  - Realistic MW sequence reproduction fixture from import-season harness scenario.
- Manual checks:
  - `?harness=import-season` multi-file import; verify rankings never show raw UUID for known runner names.

## Definition of Done

- [x] Code implemented in TypeScript
- [x] Tests added/updated and passing (Vitest)
- [x] Types are strict (no `any` escapes without justification)
- [x] Docs updated
- [x] Entry added to `packages/stundenlauf-ts/docs/ACCOMPLISHMENTS.md`
- [x] Requirement/milestone status updated in `packages/stundenlauf-ts/PROJECT_PLAN.md` where applicable

## Links

- Related feature docs:
  - `packages/stundenlauf-ts/docs/features/F-TS03-fuzzy-matching-engine.md`
  - `packages/stundenlauf-ts/docs/features/F-TS05-import-orchestration-workflow.md`
- Triggering bug area:
  - `packages/stundenlauf-ts/src/matching/workflow.ts`
  - `packages/stundenlauf-ts/src/matching/resolve.ts`
  - `packages/stundenlauf-ts/src/import/review.ts`
