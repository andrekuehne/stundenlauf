# Feature Plan: German UI and Match Review Workflow

## Overview

- Feature name: German UI and match review workflow
- Owner: TBD
- Status: Planned
- Related requirement(s): R6, R8
- Related milestone(s): M4

## Problem Statement

Users need a clear German-language interface to import races, inspect standings, and resolve uncertain participant/team matches.
This review flow is critical for trust in cumulative results.

## Scope

### In Scope

- German UI labels/messages for primary app workflows.
- Views for race history, current standings, and pending match reviews.
- Interactive match resolution (accept/reject/manual-link) and audit visibility.
- Desktop embedding in pywebview with reactive frontend architecture.

### Out of Scope

- Full multilingual localization framework beyond German in v1.
- Remote collaboration/commenting features.

## Acceptance Criteria

- [ ] All end-user visible strings in core workflows are German.
- [ ] Users can resolve uncertain matches without editing raw files.
- [ ] Match decision history is visible and understandable in UI.

## Technical Plan

- Architecture/approach: frontend in modern reactive JS with Python backend API via pywebview bridge.
- Data model/API changes: endpoints/commands for match candidate retrieval and decision submission.
- Migration needs: none expected.
- Performance/reliability concerns: responsive filtering/sorting in review lists for larger datasets.

## Risks and Assumptions

- Assumption: Desktop runtime setup for pywebview is acceptable on target machines.
- Risk: Inconsistent terminology in German UI confuses users.
  - Mitigation: maintain a glossary and central string catalog.

## Implementation Steps

1. Define UI information architecture and German terminology glossary.
2. Implement standings and import screens, then match review screen.
3. Connect decision actions to backend and verify audit visibility.

## Test Plan

- Unit: frontend state and input validation behavior.
- Integration: end-to-end flow (import -> review -> recalc standings).
- Manual checks: terminology review with domain users in German.
- Rollback strategy: keep reversible decision actions where possible.

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
