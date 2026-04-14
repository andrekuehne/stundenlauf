# F-TS10: Legacy Frontend API Compatibility Adapter

## Overview

- Feature ID: F-TS10
- Feature name: Legacy frontend API compatibility adapter
- Owner: —
- Status: Planned
- Related requirement(s): R1, R3, R5, R6, R7, R8
- Related milestone(s): M-TS5
- Python predecessor(s): F05 German UI, F08 API layer, F12 season import/export, F20 export

## Problem Statement

The copied legacy frontend under `public/legacy/` currently renders in the browser, but its
entire workflow still assumes the old pywebview API boundary:

- `window.pywebview.api.invoke(...)`
- year-keyed seasons (`series_year`)
- path-based file picking and saving
- review items stored on already-committed race events
- audit/history rows backed by `matching_decisions`
- identity merge semantics instead of explicit result reassignment

The TS port already has the real domain building blocks for most workflows:

- event-sourced season state and IndexedDB persistence (F-TS01)
- browser-side import parsing and orchestration (F-TS02, F-TS05)
- ranking and standings projection (F-TS04)
- mutation events for correction, reassignment, rollback, and ranking eligibility

What is missing is a compatibility adapter that lets the legacy frontend call those TS modules
through a stable legacy request/response contract, without reintroducing Python storage or
regressing the TS architecture.

This plan defines that adapter surface, the rollout order, and the places where the new TS
backend intentionally differs from the Python backend.

## Scope

### In Scope

- A browser-side compatibility implementation of `window.pywebview.api.invoke`.
- Legacy API request envelope parsing and legacy-style `ok` / `error` responses.
- A `legacyApi` method table covering every method still used by `public/legacy/app.js`.
- Query adapters that map TS `SeasonState` / event log data into the payload shapes expected by
  the legacy frontend.
- Command adapters that translate legacy mutation requests into TS event batches or import-session
  mutations.
- A compatibility alias layer that maps legacy numeric `series_year` values to canonical TS
  `season_id` values.
- Browser file-handle shims for `pick_file` / `pick_save_file`.
- Explicit handling of backend semantic changes:
  - seasons are keyed by `season_id`, not by year
  - duplicate "merge teams" becomes explicit `entry.reassigned`
  - audit log / `matching_decisions` becomes timeline synthesis from the event log

### Out of Scope

- Reintroducing the Python backend or JSON snapshot storage.
- Porting already-audited dead API methods (`get_project_state`, `list_categories`,
  `get_match_candidate`, `get_audit_timeline`, `rollback_race`, `reimport_race`).
- A full redesign of the legacy UI into new React components.
- Server APIs or any non-local-first architecture.

## Acceptance Criteria

- [ ] Every API method still called by `public/legacy/app.js` has a documented disposition:
      existing TS backing, new adapter work, blocked dependency, or intentional UI patch.
- [ ] The compatibility adapter keeps the legacy request envelope (`api_version`, `request_id`,
      `method`, `payload`) and returns legacy-style response envelopes.
- [ ] `series_year` is treated as a compatibility alias only; no TS domain/storage layer regains
      year-based identity.
- [ ] Import-review flow is documented against the TS staged `ImportSession` model rather than the
      Python committed-review model.
- [ ] Timeline/history flow is documented against the TS event log rather than the removed
      `matching_decisions` audit structure.
- [ ] The plan defines a safe rollout order so methods can be wired back sequentially without
      blocking already-working screens.

## Technical Plan

### 1. Compatibility Boundary

Keep the legacy transport contract, but replace the Python service with a browser-local adapter:

```ts
interface LegacyApiRequest {
  api_version: "v1";
  request_id: string;
  method: string;
  payload: Record<string, unknown>;
}

interface LegacyApiContext {
  activeSeasonId: string | null;
  seasonAliases: LegacySeasonAliasRegistry;
  pendingImportSession: ImportSession | null;
  selectedFiles: LegacyFileSelectionRegistry;
  saveTargets: LegacySaveTargetRegistry;
  matchingConfig: LegacyMatchingConfigState;
}

async function invokeLegacyApi(request: LegacyApiRequest): Promise<LegacyApiResponse> {
  // parse -> dispatch -> map result/error -> envelope
}
```

Implementation notes:

- Expose the adapter as `window.pywebview.api.invoke` so `public/legacy/app.js` stays the caller.
- Preserve the legacy envelope format and error DTOs for minimum frontend churn.
- Keep adapter state outside the domain model. Pending review queues, file handles, and season
  aliases are compatibility concerns, not domain events.

### 2. Season Identity Compatibility

The largest intentional drift is season identity:

- Python/legacy frontend: `series_year: number`
- TS port: `season_id: string`, `label: string`

Do **not** revert the TS backend to year identity. Instead add a compatibility registry:

```ts
interface LegacySeasonAlias {
  season_id: string;
  series_year: number;
}
```

Rules:

1. The adapter resolves every legacy request `series_year -> season_id` before touching the
   repository/event store.
2. Creating a season from the legacy UI uses:
   - `series_year` as the requested compatibility alias
   - `display_name` (if present) as the real TS season label
   - fallback label: `Stundenlauf ${series_year}`
3. Existing TS seasons that were not created through the legacy adapter receive generated aliases
   in the registry. The alias is compatibility-only metadata.
4. If a future React/native TS UI opens the same season, it still uses `season_id` directly.

This preserves the new domain model while allowing the legacy UI to keep its numeric season
selectors and confirmation prompts.

### 3. Browser File Capability Shims

Legacy frontend calls still pass filesystem-like paths:

- `pick_file()` returns `payload.file_path`
- `pick_save_file()` returns `payload.file_path`
- later calls pass those strings back into `import_race`, `import_series_year`,
  `export_series_year`, `export_standings_pdf`

In the browser we cannot rely on real file paths. Use tokenized compatibility handles:

- `pick_file`:
  - open hidden `<input type="file">`
  - cache the chosen `File` in a registry
  - return a synthetic path such as `legacy://file/<token>/<name>`
- `pick_save_file`:
  - if the File System Access API is available, cache a `FileSystemFileHandle`
  - otherwise cache a download intent
  - return `legacy://save/<token>/<suggestedName>`

Every adapter method that receives `file_path` / `destination_path` resolves the token back to the
cached browser object. The path string is only a compatibility token, not a real path.

### 4. Query Adapters

Most read-only API methods can be built as pure view-model adapters on top of `SeasonState`,
ranking helpers, and event-log projection.

| Legacy method | New adapter method | TS backing | Notes |
|---|---|---|---|
| `list_series_years` | `legacyApi.listSeriesYears()` | `SeasonRepository.listSeasons()`, projected snapshots | Map `season_id` -> `series_year` alias, compute `review_queue_count`, and build `race_coverage`. |
| `open_series_year` | `legacyApi.openSeriesYear()` | alias registry only | Resolve alias, set `activeSeasonId`, return `{ series_year, active: true }`. |
| `get_year_overview` | `legacyApi.getYearOverview()` | projected `SeasonState`, ranking category helpers | Return category cards, race history groups, totals, and pending review count. Include pending staged reviews from the current `ImportSession`. |
| `get_standings` | `legacyApi.getStandings()` | F-TS04 ranking engine | Build legacy row shape from TS standings projection. |
| `get_category_current_results_table` | `legacyApi.getCategoryCurrentResultsTable()` | `SeasonState.race_events`, F-TS04 standings detail helpers | Return full table rows including excluded rows and `race_headers`. |
| `get_review_queue` | `legacyApi.getReviewQueue()` | active `ImportSession` | Read from staged review entries, not committed race events. Must emit legacy-compatible candidate preview payloads. |
| `get_year_timeline` | `legacyApi.getYearTimeline()` | event log scan + synthetic timeline builders | Synthesize legacy-like import/audit rows from events. See Section 7 for semantic differences. |
| `get_matching_config` | `legacyApi.getMatchingConfig()` | adapter-local config state | Keep the legacy UI controls stable while using TS matching config types internally. |
| `list_pdf_export_layout_presets` | `legacyApi.listPdfExportLayoutPresets()` | F-TS08 export config | Blocked on F-TS08 implementation; response shape can stay legacy-compatible. |

### 5. Command Adapters

Mutations split into three categories:

- direct event-appends
- staged import-session mutations
- feature-dependent export/portability actions

| Legacy method | New adapter method | TS backing | Notes |
|---|---|---|---|
| `create_series_year` | `legacyApi.createSeriesYear()` | `SeasonRepository.createSeason()` | Create real season by label, then register the requested alias. |
| `delete_series_year` | `legacyApi.deleteSeriesYear()` | `SeasonRepository.deleteSeason()` | Resolve alias to `season_id`; confirmation stays frontend-side. |
| `reset_series_year` | `legacyApi.resetSeriesYear()` | `SeasonRepository.clearEventLog()` | Clears the event log for the resolved `season_id`. |
| `set_matching_config` | `legacyApi.setMatchingConfig()` | adapter-local config state + TS matching config mapper | Persist legacy knobs in adapter state/local storage. |
| `set_ranking_eligibility` | `legacyApi.setRankingEligibility()` | append `ranking.eligibility_set` | Translate `ausser_wertung` to `eligible = !ausser_wertung`. |
| `update_participant_identity` | `legacyApi.updateParticipantIdentity()` | append `person.corrected` | For team edits, resolve `member: "a" | "b"` to the underlying `person_id`. |
| `merge_standings_entities` | `legacyApi.reassignStandingsResults()` | append `entry.reassigned` events | Do not reintroduce identity merge. Reassign affected race entries from absorbed team to survivor team where valid. |
| `rollback_source_batch` | `legacyApi.rollbackSourceBatch()` | append `race.rolled_back` + `import_batch.rolled_back` | Resolve by `source_sha256` / anchor event to the real `import_batch_id`. |
| `import_race` | `legacyApi.importRace()` | `startImport()`, `runMatching()`, `finalizeImport()`, `appendEvents()` | If no reviews remain, finalize and append immediately. If reviews remain, keep `pendingImportSession` open and return success so the legacy UI can fetch the queue. |
| `apply_match_decision` | `legacyApi.applyMatchDecision()` | `resolveReviewEntry()`, `finalizeImport()`, `appendEvents()` | Operates on staged review items. When the last review is resolved, finalize and append the event batch atomically. |
| `export_series_year` | `legacyApi.exportSeriesYear()` | F-TS07 | Blocked on season portability implementation. |
| `import_series_year` | `legacyApi.importSeriesYear()` | F-TS07 | Blocked on season portability implementation plus alias-conflict handling. |
| `export_standings_pdf` | `legacyApi.exportStandingsPdf()` | F-TS08 | Blocked on PDF export implementation and save-target shim. |

### 6. Sequential Rollout Order

Wire methods back in this order:

1. **Adapter foundation**
   - request/response envelopes
   - error mapping
   - active season tracking
   - alias registry
   - file/save registries
2. **Season entry + shell context**
   - `list_series_years`
   - `create_series_year`
   - `open_series_year`
   - `delete_series_year`
   - `reset_series_year`
   - `get_matching_config`
   - `set_matching_config`
   - `get_year_overview`
3. **Standings screen**
   - `get_standings`
   - `get_category_current_results_table`
   - `set_ranking_eligibility`
   - `update_participant_identity`
4. **History screen**
   - `get_year_timeline`
   - `rollback_source_batch`
5. **Import screen**
   - `pick_file`
   - `import_race`
   - `get_review_queue`
   - `apply_match_decision`
6. **Deferred portability/export**
   - `pick_save_file`
   - `export_series_year`
   - `import_series_year`
   - `list_pdf_export_layout_presets`
   - `export_standings_pdf`

This order restores the highest-value read flows first, then safe single-event mutations, then the
more stateful staged import workflow, and only afterwards the export/portability endpoints that
depend on still-planned features.

### 7. Known Semantic Differences That Must Stay Different

#### Seasons are no longer year-keyed

- Legacy API payloads may keep `series_year` for compatibility.
- Real storage and projections must keep `season_id` as the canonical key.
- The alias registry is allowed to be messy or synthetic; the domain model is not.

#### Team merge became result reassignment

Python `merge_standings_entities` mutates identity-level relationships and stores a
`matching_decisions` merge record.

The TS port already models the safer primitive:

- `entry.reassigned`

Compatibility rule:

- the legacy method name may stay `merge_standings_entities`
- the implementation must execute reassignment semantics
- history/timeline should describe what actually happened

If the current legacy history UI cannot represent reassignment clearly, prefer a small targeted UI
patch over faking an identity merge in the backend adapter.

#### Audit log became event timeline synthesis

Python history reads `matching_decisions` plus imported race events.

TS history must synthesize rows from the event log:

- `import_batch.recorded` / `race.registered` -> import history rows
- `person.corrected` -> identity correction audit rows
- `entry.reassigned` -> reassignment audit rows
- `race.rolled_back` / `import_batch.rolled_back` -> rollback history rows
- `ranking.eligibility_set` may remain hidden unless the legacy UI needs it

This may require one small legacy UI patch:

- add support for a new audit/timeline kind such as `result_reassignment`

That is preferable to pretending the event-sourced timeline is the old `matching_decisions` table.

## Mapping from Python Implementation

### Python approach

- `UiApiService._dispatch()` exposes a pywebview request table over a mutable project document.
- Review items live on already-committed `RaceEvent.entries[*].match_meta`.
- Season identity is baked into filesystem layout and request payloads via `series_year`.
- Timeline/audit is partly backed by `matching_decisions`.
- Merge semantics mutate identities directly.

### TS port differences

- No backend service process: the adapter runs in-browser.
- No JSON snapshot document: requests read/write the IndexedDB-backed event log.
- Review items live in an ephemeral `ImportSession` until fully resolved and committed.
- Season identity is `season_id`; `series_year` is only an adapter alias.
- Timeline/audit is synthesized from domain events.
- "Merge" is implemented as explicit result reassignment via `entry.reassigned`.

### Reusable logic

- Matching config semantics can be preserved even if storage moves to adapter-local state.
- Category, standings, and imported-runs tables can be rebuilt from TS projections without changing
  the legacy screen structure.
- Rollback remains batch-oriented.
- Import flow can reuse the existing F-TS05 staged orchestration almost directly; only the legacy
  response shape needs adaptation.

## Risks and Assumptions

- **Assumption:** The legacy frontend may need a few narrow API-adjacent patches where semantics
  have intentionally changed (season labels, reassignment timeline wording, browser file save UX).
- **Assumption:** The adapter may keep ephemeral compatibility state (pending import session,
  file-handle registry, alias registry) outside the event log.
- **Risk:** Synthetic `series_year` aliases confuse users for seasons not originally created from a
  numeric year.
  - Mitigation: keep aliases stable, expose real `display_name` in follow-up UI polish if needed,
    and never let aliasing leak into domain/storage.
- **Risk:** Browser save flows cannot perfectly mimic pywebview path selection.
  - Mitigation: use handle tokens where supported and fall back to downloads; keep the legacy API
    contract stable even if the UX differs slightly.
- **Risk:** Trying to preserve old merge/audit semantics too literally would distort the TS model.
  - Mitigation: prefer truthful adapter payloads plus tiny frontend patches over semantic lies.
- **Risk:** Import-review flow can drift if we try to emulate Python's committed-review model.
  - Mitigation: expose staged review data from `ImportSession` directly and document the difference
    clearly.

## Implementation Steps

1. Create a `src/legacy/api/` adapter package with envelope parsing, dispatch, and error mapping.
2. Add a persisted compatibility registry for `season_id <-> series_year` aliases.
3. Implement query adapters for season entry, overview, standings, and current results tables.
4. Implement direct event mutation adapters for ranking eligibility, person correction,
   reassignment, and rollback.
5. Implement `pick_file` and `pick_save_file` browser token registries.
6. Implement staged import adapters around F-TS05 (`import_race`, `get_review_queue`,
   `apply_match_decision`).
7. Add timeline synthesis helpers that map event-log history into legacy history payloads.
8. Wire `window.pywebview.api.invoke` to the real adapter instead of the current unavailable stub.
9. Add focused legacy compatibility tests per workflow phase.
10. Reassess whether a small legacy-UI patch is needed for display-name season labels and
    reassignment history wording before wiring deferred export methods.

## Test Plan

- **Unit:**
  - request envelope validation and error mapping
  - `series_year <-> season_id` alias resolution
  - tokenized file/save handle resolution
  - per-method payload mapping for standings, overview, and review queue
- **Integration:**
  - season create/open/delete/reset via legacy adapter over IndexedDB-backed repository
  - standings/history queries over projected event logs
  - ranking eligibility, correction, reassignment, and rollback append the expected events
  - import flow: `import_race` -> `get_review_queue` -> `apply_match_decision` -> event append
- **Fixture-based:**
  - run legacy frontend workflows against real organizer `.xlsx` files through the adapter
  - compare import/review outcomes against the existing F-TS05 harness behavior
- **Manual checks:**
  - open `public/legacy/` frontend, create/open a season, inspect standings/history, run an import,
    resolve a review, and verify UI state updates without page reloads

## Definition of Done

- [ ] Compatibility adapter implemented in TypeScript
- [ ] Legacy frontend can complete season entry, standings, history, and import-review workflows
      through the adapter
- [ ] Export/portability methods are either implemented or explicitly gated behind F-TS07/F-TS08
- [ ] Tests added/updated and passing (Vitest)
- [ ] Types are strict (no `any` escapes without justification)
- [ ] Docs updated
- [ ] Entry added to `packages/stundenlauf-ts/docs/ACCOMPLISHMENTS.md`
- [ ] Requirement/milestone status updated in `packages/stundenlauf-ts/PROJECT_PLAN.md`

## Links

- Python source reference(s):
  - `backend/ui_api/service.py`
  - `backend/ui_api/workspace.py`
  - `backend/ui_api/commands.py`
  - `backend/ui_api/queries.py`
  - `packages/stundenlauf-ts/public/legacy/app.js`
  - `packages/stundenlauf-ts/docs/features/F-TS05-import-orchestration-workflow.md`
  - `packages/stundenlauf-ts/docs/features/F-TS07-season-data-portability.md`
