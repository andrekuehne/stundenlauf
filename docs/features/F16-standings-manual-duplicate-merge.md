# Feature Plan: Standings manual merge of duplicate identities

## Overview

- Feature name: Manual merge of duplicate participants/teams from standings (post-import)
- Owner: TBD
- Status: Done
- Related requirement(s): **R3** (track entities across races), **R6** (interactive review/override), **R8** (German GUI)
- Related milestone(s): **M5** (hardening and first production use)
- Builds on: [F03 Participant and team matching](F03-participant-and-team-matching.md) (identity model, audit decisions); [F05 German UI](F05-german-ui-and-review-workflow.md); [F08 API layer](F08-python-frontend-api-layer.md); [F10 Standings identity correction](F10-standings-identity-correction-ui.md) (standings row identity payloads); [F15 Ranking eligibility](F15-ranking-eligibility-exclusions.md) (second table = full grid with per-row actions)

## Problem Statement

Matching during **Lauf hinzufügen** can leave **two canonical identities** for the same real-world person or Paarlauf team (e.g. strict-normalized auto-only, review mistakes, or “neue Person” chosen when linking was correct). Operators notice the split in **cumulative or per-race standings**, not always during import.

Today, **repair** is limited to **F09/F10 identity correction** (edit name/club/YOB on one identity) and re-import/rollback gymnastics. There is **no** supported way to **merge two existing** `Person` or `Couple` records and **repoint** historical `RaceEntry` rows so standings recompute as one entity—without touching raw Excel.

The merge must be **safe**: only allowed when the two identities **never share a race event** (no overlapping participations), so we never collapse two distinct start-list rows from the same Lauf.

## Scope

### In Scope

- **Surface:** Primary workflow lives on the **lower standings card**—**“Laufübersicht je Kategorie”** (`get_category_current_results_table`), where **all** entities in the category appear (including those **Außer Wertung** per F15). This matches operator mental model: duplicates are visible there with per-Lauf cells.
- **Entity kinds:** **Einzel** → merge two `Person` identities; **Paarlauf** → merge two `Couple` identities. **No** cross-kind merge.
- **Hard guard:** Server-side validation that the two selected UIDs have **disjoint sets of race participations** for the **active `series_year` and `category_key`** (or globally within that category’s events—see Technical Plan). Overlap = clear, German error; no partial apply.
- **Operator flow (conceptual):**
  - Enter a dedicated **merge mode** (or wizard) from the same card, analogous to F10 correction mode—normal browsing stays uncluttered.
  - Select **identity A** (Behalten / Ziel) and **identity B** (Zusammenführen / auflösen), with short **preview**: names, clubs/YOB (or team members), and **list of Läufe** each row participated in—highlighting that sets are disjoint.
  - Confirm → single API call → **refresh** standings + Laufübersicht (+ timeline consistency).
- **Canonical outcome:** All `RaceEntry` rows that referenced the **absorbed** UID (`participant_uid` or `team_uid`) are rewritten to reference the **survivor** UID. **Standings recomputed** via existing `recompute_project_standings`.
- **German** copy for all new labels, errors, and confirmations; identifiers and API field names stay English.
- **Audit:** Append an immutable `MatchingDecision` (new `kind` or documented extension—see Technical Plan) recording survivor/absorbed UIDs, `series_year`, optional `rationale`, and merge timestamp—so **Historie** / explainability stay aligned with F03/F09 patterns.

### Out of Scope (initial ship)

- **Fuzzy suggestion** of merge pairs (automatic “these look alike” from standings)—only **explicit two-row selection**.
- Merge across **different categories** (e.g. different `division`/`duration`) even if the same human—out of scope unless product later defines cross-category identity rules.
- **Splitting** one identity back into two (inverse operation).
- **Member-level merge** of two teams with **different** underlying `Person` UIDs without merging whole teams (that is a different problem: replacing one runner on a team).
- Changing **Excel source files** or re-running import pipeline as the only repair path.

## Acceptance Criteria

- [x] User can start merge workflow from **Laufübersicht je Kategorie** for the active category; mode is visibly distinct and can be cancelled without mutation.
- [x] User can pick **two rows** of the **same** `entity_kind` (`participant` vs `team`); selection UI prevents mixed kinds.
- [x] **Confirm** is disabled or server rejects when **any** `race_event_uid` appears on both identities’ entries (non-overlap rule).
- [x] On success, **one** logical entity remains: cumulative distance/points match the **union** of prior results (same scoring rules as today); **Platz** and per-race displays update after refresh.
- [x] Absorbed identity **no longer appears** as its own row; survivor row shows combined history.
- [x] **ranking_exclusions** (F15): **conservative** rule implemented—survivor is excluded if **either** source was excluded; absorbed UID removed from the set; tested in `tests/test_f08_ui_api.py`.
- [x] **Season zip (F12):** merged state round-trips; no dangling UIDs in `ranking_exclusions` after merge (absorbed UID removed from exclusion sets).
- [x] API documented in `docs/api/ui-api-v1.md`; regression tests in `tests/test_f08_ui_api.py` and domain tests in `tests/test_f16_identity_merge.py`.

## Technical Plan

### Architecture / approach

1. **Pure merge precondition**  
   For entities `S` (survivor) and `A` (absorbed), same kind:
   - Collect all `RaceEntry` objects across **active** `RaceEvent`s that belong to the **same `category_key`** as the UI context (or entire project—**decision:** prefer **category-scoped** overlap check so two duplicates in “Herren 60 Einzel” are validated only against events for that category; cross-category duplicate persons are out of scope for v1).
   - Build sets `events(S)` and `events(A)` of `race_event_uid` where the entry references S or A respectively.
   - Require `events(S) ∩ events(A) = ∅`.

2. **Mutation**  
   - **Singles:** For every entry in scope with `participant_uid == A`, set `participant_uid = S`. Remove `Person` A from `document.people` if **unreferenced** after rewrite (scan all entries + couple members).
   - **Teams:** For every entry with `team_uid == A`, set `team_uid = S`. Remove `Couple` A from `document.couples`. Remove **orphaned** `Person` records that were **only** members of couple A (not referenced by any entry or other couple—define a small `collect_referenced_person_uids(document)` helper).

3. **Survivor canonical identity**  
   - **Default:** Keep survivor’s `Person` / `Couple` member rows as-is; absorbed side only moves **entry pointers**.  
   - **Optional v1.1:** Offer the same **field-resolution** pattern as import review (F03) when display strings differ—otherwise operators use F10 after merge.

4. **Historical `MatchingDecision` rows**  
   - Remap `target_participant_uid` / `target_team_uid` from absorbed → survivor wherever they appear, so **replay** on future imports does not resurrect the absorbed UID.  
   - Extend `_matching_decision_in_filtered_year` (or equivalent) if a new `kind` needs year scoping like `identity_correction`.

5. **`MatchingDecision` model**  
   - Add a new literal to `MatchingDecision.kind`, e.g. `"identity_merge"`, with **convention:** `target_*` = survivor UID(s), and encode absorbed UID in `feature_scores` keys or add optional dataclass fields in a follow-up schema bump if cleaner.  
   - Alternatively, overload `identity_correction` with structured `feature_scores`—less clear in **Historie**; prefer explicit `kind`.

6. **UI API**  
   - New command, e.g. `merge_standings_entities`, payload sketch:
     - `series_year` (required)
     - `category_key` (required—for validation scope and UX consistency)
     - `entity_kind`: `"participant"` | `"team"`
     - `survivor_uid` / `absorbed_uid` (names TBD; mirror `entity_uid` patterns from F15)
     - optional `rationale`
   - Response: `status`, `decision_uid`, maybe `entries_updated_count`.

7. **Frontend**  
   - `frontend/app.js`: merge mode on Laufübersicht table; reuse row payload (`entity_kind`, `entity_uid`) already present or align with `get_category_current_results_table` DTO.  
   - `frontend/strings.js`: German strings only.

### Data model / API changes

- `MatchingDecision.kind` extended; optional JSON schema version bump if persisted shape changes.
- No change to `RaceEntry` shape—only UID rewiring.

### Performance / reliability

- Merge is **O(events × entries)** for typical season sizes—acceptable on save path once per operator action.
- **Transactional save:** load → validate → mutate → recompute standings → save (same as other commands).

## Risks and Assumptions

- **Assumption:** Real-world duplicates that operators want to merge **always** have non-overlapping races; if someone started twice under two IDs in the **same** Lauf, merge must remain **blocked**—operator fixes source data or uses a different workflow.
- **Risk:** Paarlauf survivor and absorbed teams have **different member UIDs** (same two humans duplicated as four `Person` rows). Repointing `team_uid` alone is correct for **standings**, but **orphan cleanup** must not delete people still referenced elsewhere.
- **Risk:** **Timeline / counts** queries that summarize decisions by kind need to handle `identity_merge` (display or ignore explicitly).
- **Mitigation:** Unit tests for overlap detection, orphan reference graph, and remapped `matching_decisions`; manual UAT on fixture with intentional duplicate Einzel + duplicate Paar.

## Implementation Steps

1. Domain helper: `non_overlapping_participation(document, category_key, uid_a, uid_b, entity_kind) -> bool` + `merge_identities(...)` (pure function taking/returning `ProjectDocument` for testability).
2. Wire command in `backend/ui_api/commands.py` + `service.py` dispatch; validate category membership of both UIDs (both must appear in that category’s standings or events).
3. Extend `MatchingDecision` + any serialization/validation for new `kind`.
4. Remap existing decisions’ `target_*` fields referencing absorbed UID.
5. F15 integration: update `ranking_exclusions` map for `category_key` (remove absorbed UID; apply chosen rule for survivor).
6. Document API in `docs/api/ui-api-v1.md`.
7. Frontend: merge mode UI + call + refresh pattern (mirror F10 refresh).
8. Tests: overlap rejection, successful merge totals, exclusions behavior, decision replay smoke with merged project.

## Test Plan

- **Unit:** Overlap detection (empty intersection allowed; one shared `race_event_uid` rejects); orphan person removal invariants.
- **Integration (UI API):** Merge two singles with disjoint races → `get_standings` / `get_category_current_results_table` show one row with combined metrics; absorbed UID absent.
- **Integration:** Two teams, disjoint races → same.
- **Negative:** Attempt merge with shared race → stable 4xx + German message via error mapping.
- **Regression:** Import replay after merge does not reference removed UID.
- **Manual:** Operator walkthrough on real fixture; **Historie** shows merge decision.

## Definition of Done

- [x] Code implemented (backend + GUI)
- [x] Tests added/updated and passing (`uv run pytest`)
- [x] `docs/api/ui-api-v1.md` updated
- [x] This feature plan status set to **Done**
- [x] Entry added to `docs/ACCOMPLISHMENTS.md`
- [x] `PROJECT_PLAN.md` current phase / delivery line updated for F16

## Links

- API (to extend): [`docs/api/ui-api-v1.md`](../../docs/api/ui-api-v1.md)
- Commands: [`backend/ui_api/commands.py`](../../backend/ui_api/commands.py)
- Models: [`backend/domain/models.py`](../../backend/domain/models.py)
- F15 second table behavior: [`docs/features/F15-ranking-eligibility-exclusions.md`](F15-ranking-eligibility-exclusions.md)
