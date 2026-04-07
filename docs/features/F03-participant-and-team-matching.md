# Feature Plan: Participant and Team Matching Engine

## Overview

- Feature name: Participant and team matching engine
- Owner: TBD
- Status: Planned
- Related requirement(s): R3, R4, R6
- Related milestone(s): M3

## Problem Statement

Manually entered participant data includes typos, alternate formatting, and swapped name orders.
Without robust matching and human review support, cumulative rankings become unreliable.

## Scope

### In Scope

- Candidate generation for possible identity matches using normalized names and YOB.
- Similarity scoring with support for swapped first/last names and optional title removal.
- Team (Paarlauf) matching including member order insensitivity.
- Confidence thresholds and uncertain-match review queue.
- Manual override decisions persisted with audit trail.

### Out of Scope

- Fully automatic merge without any human-in-the-loop safeguards.
- Advanced ML model training in v1.

## Acceptance Criteria

- [ ] Known typo and swapped-name scenarios are resolved or surfaced as review candidates.
- [ ] Pair teams match regardless of participant order where appropriate.
- [ ] Manual decision overrides persist and are reapplied on recalculation.

## Technical Plan

- Architecture/approach: normalization + rule-based matching + configurable scoring weights.
- Data model/API changes: add `identity_clusters`, `match_candidates`, and decision log entries.
- Migration needs: compatible with base project schema through version bump if required.
- Performance/reliability concerns: avoid O(n^2) blowups with indexing/blocking strategy.

## Risks and Assumptions

- Assumption: YOB is frequently present and improves disambiguation.
- Risk: False positive merges damage trust.
  - Mitigation: conservative auto-merge threshold and mandatory review for low confidence.

## Implementation Steps

1. Implement canonical normalization rules and tokenization.
2. Build candidate generation and scoring engine for individuals and teams.
3. Add persistence for match decisions and rerun-safe behavior.

## Test Plan

- Unit: normalization/scoring cases (titles, commas, swaps, typos).
- Integration: import sequence with repeated and non-consecutive participants.
- Manual checks: review queue quality on real historical data.
- Rollback strategy: decision log allows reverting specific merges.

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
