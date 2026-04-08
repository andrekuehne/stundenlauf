# Feature Plan: Participant and Team Matching Engine

## Overview

- Feature name: Participant and team matching engine
- Owner: TBD
- Status: Implemented (backend matching, schema v2, import integration); interactive German review UI deferred to M4/F05
- Related requirement(s): R3, R4, R6
- Related milestone(s): M3

## Problem Statement

Manually entered participant data includes typos, alternate formatting, and swapped name orders.
Without robust matching and human review support, cumulative rankings become unreliable.

## Data Quality Failure Modes (Target Cases)

- Person-level typos in first name, last name, or both (`Jonas` vs `Jonaas`, `Schmidt` vs `Schmid`).
- Switched first/last name (`Meyer Anna` vs `Anna Meyer`), including mixed delimiter styles.
- Optional or inconsistent academic titles (`Dr.`, `Dr`, no title), titles attached to either side of name.
- Combined errors in one record (title variation + typo + swapped names).
- Pair-level ambiguity where both member order and typos vary between races.
- Club name mismatch from abbreviations or partial strings (`TSV Musterstadt` vs `TSV Musterst.` vs `Musterstadt`).
- Missing optional fields (YOB absent, club absent) that reduce confidence and require fallback logic.

## Scope

### In Scope

- Candidate generation for possible identity matches using normalized names and YOB.
- Similarity scoring with support for swapped first/last names and optional title removal.
- Team (Paarlauf) matching including member order insensitivity.
- Confidence thresholds and uncertain-match review queue.
- Manual override decisions persisted with audit trail.
- Field-level merge resolution payloads for UI:
  - choose source A/B value per field,
  - allow manual replacement value when both source values are incorrect.

### Out of Scope

- Fully automatic merge without any human-in-the-loop safeguards.
- Advanced ML model training in v1.

## Acceptance Criteria

- [x] Known typo and swapped-name scenarios are resolved or surfaced as review candidates (backend scoring + `match_meta.route`).
- [x] Pair teams match regardless of participant order where appropriate (bipartite alignment in team scorer).
- [x] Manual decision overrides persist and are reapplied on recalculation (fingerprint index + `MatchingDecision` replay; UI to author decisions still pending).
- [x] Title/no-title variants do not create separate identities by default (title stripping in normalization).
- [x] Club similarity contributes to scoring without forcing false merges (low-weight club feature).
- [x] Records with multiple simultaneous errors are still surfaced with useful top candidates (blocking + ranked candidates + review band).

## Technical Plan

- Architecture/approach: normalization + rule-based matching + configurable scoring weights.
- Data model/API changes: add `identity_clusters`, `match_candidates`, and decision log entries.
- Data model/API changes: add immutable decision identifiers and structured field-level merge actions.
- Migration needs: compatible with base project schema through version bump if required.
- Performance/reliability concerns: avoid O(n^2) blowups with indexing/blocking strategy.

### Matching Strategy (v1)

- Preprocess every imported row into canonical tokens before candidate search.
- Generate candidates with blocking keys to limit comparisons:
  - normalized last-name prefix + YOB (when present)
  - normalized first-name prefix + YOB
  - fallback to name-only blocks when YOB missing
- Score each candidate with weighted features:
  - name similarity (first, last, full)
  - swapped-name match boost
  - title-insensitive exact/near-exact bonus
  - club similarity soft signal
  - YOB agreement bonus / disagreement penalty
- Apply thresholds:
  - auto-merge for high confidence
  - review queue for medium confidence
  - no-link for low confidence
- For Paarlauf teams, compute team score as:
  - best member-to-member bipartite alignment (order-insensitive)
  - aggregate of both member scores + optional team-name/club signal

## Risks and Assumptions

- Assumption: YOB is frequently present and improves disambiguation.
- Risk: False positive merges damage trust.
  - Mitigation: conservative auto-merge threshold and mandatory review for low confidence.
- Risk: Club strings are noisy and can overfit matching.
  - Mitigation: keep club as low-weight evidence only and never a sole auto-merge reason.
- Assumption: title handling should be default-insensitive (`Dr.` optional).
- Risk: pair matching can produce combinatorial ambiguity.
  - Mitigation: prune candidates via member-level blocking before team scoring.

## Implementation Steps

1. Define and lock canonical normalization spec.
   - Name cleanup rules (whitespace, punctuation, casefold, umlaut handling if applicable).
   - Title dictionary and stripping policy (`Dr`, `Dr.`; extensible list).
   - Club normalization helpers (abbreviation expansion and token-based normalization).
   - Deliverable: documented normalization contract + fixtures.
2. Implement participant preprocessing pipeline.
   - Produce canonical fields + provenance (raw value, normalized value, transforms applied).
   - Persist canonical fields for deterministic reruns.
   - Deliverable: pure functions and schema updates for canonical columns.
3. Build candidate generation with blocking.
   - Create deterministic blocking keys for full and fallback modes.
   - Add safety limits for candidate set size per row.
   - Deliverable: candidate generator module with metrics (candidates per row).
4. Implement participant scoring engine.
   - Add weighted components (name, swap detection, title-insensitive matching, YOB, club).
   - Externalize weights/thresholds in config for tuning.
   - Deliverable: scoring module returning score + feature breakdown for explainability.
5. Implement pair (Paarlauf) matching engine.
   - Member-level candidate search and order-insensitive alignment.
   - Handle simultaneous typos + participant order swaps in pair records.
   - Deliverable: team matcher with confidence and explanation trace.
6. Add decision workflow persistence.
   - Persist accepted/rejected/manual-link decisions with timestamp and rationale.
   - Ensure re-import/recalculation reuses prior decisions deterministically.
   - Deliverable: decision log API and replay logic.
   - Persist field resolution details (`kept_from`, `manual_value`) for name/club/yob where applicable.
7. Build uncertain-match review queue contract.
   - Return ranked candidates with feature explanations for UI integration.
   - Include conflict flags (same candidate suggested for multiple new rows).
   - Deliverable: review queue data contract and sorting strategy.
8. Add observability and safeguards.
   - Track precision proxy metrics, review rate, and unresolved rows.
   - Add guardrails to prevent auto-merge when critical fields conflict strongly.
   - Deliverable: structured matching report per import run.
9. Validate with curated historical dataset.
   - Build truth set for known participants/pairs across races.
   - Tune thresholds to hit KPI targets in `PROJECT_PLAN.md`.
   - Deliverable: validation report and tuned defaults.

## Test Plan

### Unit Tests

- Normalization
  - Remove/ignore titles consistently (`Dr. Anna Meyer`, `Dr Anna Meyer`, `Anna Meyer` -> same base identity tokens).
  - Handle swapped order and delimiters (`Meyer, Anna`, `Anna Meyer`, `Meyer Anna`).
  - Normalize club variants (`TSV Musterstadt`, `TSV Musterst.`, `Musterstadt`) into close token sets.
  - Preserve audit data: raw and normalized forms both available.
- Participant scoring
  - Single-typo and double-typo tolerance for common edit distances.
  - Boost on swapped first/last when token sets match.
  - Penalty on YOB mismatch strong enough to avoid unsafe auto-merge.
  - Club contributes as weak signal; cannot independently cross auto-merge threshold.
- Pair scoring
  - Same pair in reversed order matches with equivalent score.
  - Pair match still succeeds when both members have minor typos.
  - Pair with one member overlap and one different member stays below auto threshold.

### Integration Tests

- Multi-race merge flow
  - Import race A then B where same participant appears with typo + title variation.
  - Import non-consecutive races with missing YOB in middle race.
  - Verify identity cluster continuity and deterministic replay.
- Pair flow
  - Import pair records with swapped member order and club abbreviation changes.
  - Verify pair mapping is stable across three or more races.
  - Verify ambiguous pair cases enter review queue with top-N candidates.
- Decision persistence
  - Manual accept/reject in race N remains applied after race N+1 import and full recalculation.
  - Rejected candidate is not re-proposed unless source data materially changes.
  - Field-level manual correction values are reused in later candidate generation and scoring.

### Edge-Case/Regression Suite

- Combined-noise records: title variation + swapped names + typo + partial club.
- Near-collision identities: two different participants with very similar names and same club.
- Missing-field stress: absent YOB + absent club with only noisy names available.
- Large batch performance: ensure blocking keeps runtime bounded on season-sized imports.

### Manual/UAT Scenarios

- Review queue usability check with real historical files:
  - top candidate is usually correct for medium-confidence cases,
  - explanation is sufficient for fast human decision.
- Auditability check:
  - for any merged participant/team, user can inspect decision reason and source records.
  - audit view includes decision UID and related participant/team UID references.

### Exit Criteria for F03

- Test suite green for all unit/integration/edge-case scenarios above.
- Validation report shows candidate coverage and precision aligned with KPI trajectory.
- No high-severity false-positive merges in curated historical verification set.

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
