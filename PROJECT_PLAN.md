# Project Plan

## Vision

Build a local-first desktop app to import, normalize, analyze, and present Stundenlauf race series results across multiple events.
The app must reliably aggregate individual and team performance over time, even with inconsistent manually entered participant data.
Users should be able to review uncertain participant matches interactively and produce transparent rankings based on configurable scoring rules.
All end-user UI text is German, while implementation and code artifacts remain English.

## Core Requirements

Checkboxes mark **product-level** satisfaction. Capabilities delivered only via CLI/backend (no desktop GUI yet) still count toward R1–R5 and R7. **R6** (interactive review) and **R8** (German GUI) stay open until F05 ships.

- [x] R1: Import race data from fixed-structure Excel files and persist race-by-race history.
- [x] R2: Support race categories: 30-minute and 60-minute races for men, women, and Paarlauf teams.
- [x] R3: Track participants and teams across non-consecutive races and partial participation.
- [x] R4: Implement robust participant/team matching with typo tolerance, name-order handling, and optional title handling.
- [x] R5: Compute cumulative distance/points and produce ranking tables using configurable rules.
- [x] R6: Provide interactive review and override for suggested matches before merge.
- [x] R7: Keep data portable with file-based storage (no background server or remote DB).
- [x] R8: Provide German-language GUI for display and user workflows.

## Non-Goals

- Multi-user online synchronization between computers.
- Cloud-hosted backend, background service deployment, or external managed database.
- Arbitrary file format ingestion beyond the defined Excel structure (initial phase).
- Full OCR or scanned document extraction.

## Milestones

| Milestone | Description | Target Date | Status |
|---|---|---|---|
| M1 | Domain foundation and portable storage | 2026-05-15 | Complete (F01 shipped) |
| M2 | Excel ingestion and merge pipeline | 2026-06-15 | Complete (F02 backend + CLI shipped) |
| M3 | Matching workflow and ranking engine | 2026-07-15 | In progress (F03/F04 backend shipped; F05 interactive review deferred; F06/F07 validation tooling landed first) |
| M4 | German UI integration in desktop shell | 2026-08-15 | Complete (F05 desktop frontend shell + workflows shipped on top of F08 API) |
| M5 | Hardening, validation, and first production use | 2026-09-15 | In progress (F06/F07 tooling and F08 API contract/regression tests landed) |

## Current Phase

- Phase: Backend stack F01–F04, validation tooling F06/F07, API layer F08, and desktop GUI F05 are shipped; current focus is hardening for first production use.
- Planning status: Feature plans `F01`–`F08` are implemented; continue KPI-grounded hardening, usability validation with organizers, and fixture coverage expansion.
- Delivery status: **F01** domain/storage; **F02** Excel ingestion, merge, CLI import; **F03** matching pipeline, audit, and decision replay; **F04** standings (`v1_legacy_top4`) on import and rollback; **F06** sequential fixture import + standings export; **F07** organizer-vs-project comparison workbooks; **F08** versioned Python frontend API layer (`backend/ui_api`, `docs/api/ui-api-v1.md`, pywebview bridge + tests) with additive year-level workspace methods; **F05** German reactive pywebview frontend (`frontend/`) including season entry/open/create workflow, standings tables, import/review flow, and history rollback UX.
- Immediate next step: Run focused UAT with non-technical end users, tune copy/contrast/interaction friction, and broaden automated GUI contract coverage around real fixture datasets.

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
| 2026-04-08 | Added F07 Gesamtwertung ground-truth comparison | Excel report comparing organizer totals to merged project standings; documented CLI |
| 2026-04-07 | Replaced placeholders with v1 project plan | Captured domain, milestones, and measurable goals |
| 2026-04-08 | Marked feature planning as implementation-ready | Reflected completed detailed plans for F01-F05 and transition to build stage |
| 2026-04-08 | Updated M1 status after F01 Python backend implementation | Reflected shipped domain/storage foundation and next-step shift to F02 |
| 2026-04-08 | Updated M2 status after F02 ingestion implementation | Reflected shipped Excel ingestion, merge/idempotency flow, CLI import, and tests |
| 2026-04-08 | Updated M3 after F03 matching backend | Reflected schema v2, matching pipeline, decision log, and tests |
| 2026-04-08 | Shipped F04 ranking engine (backend) | Standings snapshot, ruleset id, import + rollback recompute, tests |
| 2026-04-08 | Added F06 fixture HITL import script | Sequential fixture import + standings CSV export for manual ground-truth comparison vs GUI |
| 2026-04-08 | Doc sync: requirements, milestones, F01/F02 status, delivery order F01–04 then F06/07 before F05 GUI | Align plan and feature docs with shipped backend and validation tooling |
| 2026-04-09 | Shipped F08 Python frontend API layer (v1) | Added `backend/ui_api`, pywebview bridge adapter, API contract docs, and backend API tests to unblock F05 UI |
| 2026-04-09 | Extended ui-api-v1 with year-level workspace methods | Added season-wide query surface and optional year filters to support fluid all-dataset UI workflows |
| 2026-04-09 | Shipped F05 German desktop frontend workflows | Added pywebview full-screen UI shell (`frontend/`), season open/create entrypoint, standings/results tables, import/review actions, and timeline rollback UX |
| 2026-04-09 | Moved default workspace storage to user Documents folder | Default `workspace_dir` now resolves to `~/Documents/Stundenlauf`, keeping series data outside the app directory while preserving explicit overrides |
| 2026-04-09 | Simplified merge review with side-by-side candidate table | Redesigned `Lauf hinzufügen` review UX to separate incoming entry vs ranked existing candidates, added confidence labels, and introduced explicit `create_new_identity` action in `apply_match_decision` with regression tests |
| 2026-04-09 | Hardened safe reimport policy for source batches | Duplicate active imports now return explicit errors, reimport rolls back all active events sharing source hash, and API/UI/tests/docs were aligned for deterministic rollback/reimport behavior |
| 2026-04-09 | Clarified review decision wording (existing link vs new identity) | Updated German review copy and action labels to explicitly distinguish linking to an existing candidate from intentionally creating a new person/team |
| 2026-04-09 | Added GUI control for auto-merge threshold | Added session-level matching config API and `Lauf hinzufügen` slider/number + toggle; default is strict review mode without auto-merge |
| 2026-04-09 | Added safeguarded season delete workflow | Added red season delete action in the startup view with warning + typed-year confirmation, plus `delete_series_year` API and regression tests to reduce accidental data loss |
| 2026-04-09 | Added imported-runs matrix in standings and import views | Replaced text-only imported race summary with a two-row `Einzel`/`Paare` Lauf matrix (default columns 1–5, auto-extend beyond), improving quick season coverage visibility in both primary GUI workflows |
| 2026-04-09 | Linked GUI rollback to imported-file batches | Added `rollback_source_batch` API + grouped `Historie` action so one click rolls back all active races from the same imported source hash, preventing partial correction states |
