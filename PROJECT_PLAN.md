# Project Plan

## Vision

Build a local-first desktop app to import, normalize, analyze, and present Stundenlauf race series results across multiple events.
The app must reliably aggregate individual and team performance over time, even with inconsistent manually entered participant data.
Users should be able to review uncertain participant matches interactively and produce transparent rankings based on configurable scoring rules.
All end-user UI text is German, while implementation and code artifacts remain English.

## Core Requirements

- [ ] R1: Import race data from fixed-structure Excel files and persist race-by-race history.
- [ ] R2: Support race categories: 30-minute and 60-minute races for men, women, and Paarlauf teams.
- [ ] R3: Track participants and teams across non-consecutive races and partial participation.
- [ ] R4: Implement robust participant/team matching with typo tolerance, name-order handling, and optional title handling.
- [x] R5: Compute cumulative distance/points and produce ranking tables using configurable rules.
- [ ] R6: Provide interactive review and override for suggested matches before merge.
- [ ] R7: Keep data portable with file-based storage (no background server or remote DB).
- [ ] R8: Provide German-language GUI for display and user workflows.

## Non-Goals

- Multi-user online synchronization between computers.
- Cloud-hosted backend, background service deployment, or external managed database.
- Arbitrary file format ingestion beyond the defined Excel structure (initial phase).
- Full OCR or scanned document extraction.

## Milestones

| Milestone | Description | Target Date | Status |
|---|---|---|---|
| M1 | Domain foundation and portable storage | 2026-05-15 | In progress (F01 domain/storage shipped) |
| M2 | Excel ingestion and merge pipeline | 2026-06-15 | In progress (F02 backend ingestion implemented) |
| M3 | Matching workflow and ranking engine | 2026-07-15 | In progress (F03 matching + F04 ranking backend shipped; UI review workflow pending) |
| M4 | German UI integration in desktop shell | 2026-08-15 | Planned (implementation-ready) |
| M5 | Hardening, validation, and first production use | 2026-09-15 | Planned (implementation-ready) |

## Current Phase

- Phase: Build preparation complete, implementation phase starts next.
- Planning status: Detailed feature plans completed and aligned across `F01` through `F05`.
- Delivery status: F01 domain/storage implemented; F02 ingestion/merge backend and CLI path implemented with tests; F04 standings (`v1_legacy_top4`) computed on import and after rollback; persisted in project JSON.
- Immediate next step: KPI tuning on fixture set; German review UI for match queue (F05); golden-master standings vs legacy spreadsheets when sample data is available.

## Success Metrics (KPIs)

| Metric | Baseline | Target | Notes |
|---|---|---|---|
| Import success rate for valid Excel files | 0% | >= 99% | Batch test set of representative files |
| Auto-match precision (without manual override) | 0% | >= 95% | Measured against curated truth set |
| Auto-match recall (candidate suggestion coverage) | 0% | >= 98% | True match appears in top candidate set |
| Time to merge one new race | Unknown | < 5 min | Includes human review of uncertain matches |
| Ranking recalculation latency | Unknown | < 2 s | Typical dataset size for one season |
| Data portability reliability | 0% | 100% | Open/save across at least 2 machines |

## Risks and Dependencies

- Risk: Ambiguous participant identities produce wrong cumulative standings.
  - Mitigation: Confidence scores, manual review queue, immutable audit log of merge decisions.
- Risk: Excel source format changes silently.
  - Mitigation: Schema validation with explicit import errors and versioned import adapters.
- Risk: Ranking rules evolve during season.
  - Mitigation: Versioned ruleset configuration and reproducible recalculation.
- Dependency: Clarified official scoring/ranking rules ("tbd rules").
  - Owner: Product/domain owner.
- Dependency: Sample historical Excel files for realistic test coverage.
  - Owner: Data provider/event organizer.

## Working Agreements

- Every feature must map to at least one requirement or milestone.
- Each feature requires a plan document in `docs/features/`.
- "Done" means code + tests + docs + accomplishments entry.
- For matching and scoring changes, keep decision traces so results are explainable.
- GUI labels and user-visible text are German; internal identifiers stay English.

## Change Log

| Date | Change | Why |
|---|---|---|
| 2026-04-07 | Replaced placeholders with v1 project plan | Captured domain, milestones, and measurable goals |
| 2026-04-08 | Marked feature planning as implementation-ready | Reflected completed detailed plans for F01-F05 and transition to build stage |
| 2026-04-08 | Updated M1 status after F01 Python backend implementation | Reflected shipped domain/storage foundation and next-step shift to F02 |
| 2026-04-08 | Updated M2 status after F02 ingestion implementation | Reflected shipped Excel ingestion, merge/idempotency flow, CLI import, and tests |
| 2026-04-08 | Updated M3 after F03 matching backend | Reflected schema v2, matching pipeline, decision log, and tests |
| 2026-04-08 | Shipped F04 ranking engine (backend) | Standings snapshot, ruleset id, import + rollback recompute, tests |
