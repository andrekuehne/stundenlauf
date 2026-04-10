---
name: Strict normalized auto-match
overview: Add a session-level matching mode that auto-links only when the incoming row is **exactly** equal to a candidate’s normalized identity (name key + YOB + gender + club), never via fuzzy score alone; expose it as a second option in Import matching settings alongside the existing fuzzy threshold controls.
todos:
  - id: strict-helpers
    content: Add strict identity comparison helpers (name_key + singles/couples equality) and unit tests
    status: completed
  - id: workflow-integrate
    content: Extend MatchingConfig + _resolve_person / _resolve_team_row with full-gender/couple scan, auto-only-on-strict, fuzzy-auto downgrade
    status: completed
  - id: ui-api
    content: Persist strict_normalized_auto_only in UiApiService; document ui-api-v1; extend test_f08_ui_api
    status: completed
  - id: gui
    content: "Import panel: second mode control, strings.js copy, disable fuzzy controls when strict on, wire get/set_matching_config"
    status: completed
  - id: docs-ship
    content: Feature doc F11, PROJECT_PLAN + ACCOMPLISHMENTS when complete
    status: completed
isProject: false
---

# Strict normalized auto-match mode (GUI + API + matcher)

## Problem

Today “only perfect fuzzy score” still allows `score == 1.0` via bonuses and clamping ([`backend/matching/score.py`](c:\Users\andre\VSCode_Projects\stundenlauf\backend\matching\score.py)). Operators want an optional mode where **auto** means **byte-for-byte equality of normalized fields**, not similarity.

## Definition of “identical normalized” (singles)

Use one canonical comparison tuple per side so it stays aligned with replay fingerprints and parsing:

- **Name key**: Reuse the same string that feeds `identity_fingerprint` in [`backend/matching/decisions.py`](c:\Users\andre\VSCode_Projects\stundenlauf\backend\matching\decisions.py) — i.e. `token_part` from sorted `parsed.tokens`, else `parsed.display_compact` (same as today’s `identity_fingerprint` pre-hash key, without YOB/gender).
- **YOB**: Integer equality (`incoming_yob == person.yob`), with the same “0 means unknown” semantics you already use in scoring (document explicitly: two zeros match; one zero and one non-zero do not).
- **Gender**: Already fixed by division in [`_resolve_person`](c:\Users\andre\VSCode_Projects\stundenlauf\backend\matching\workflow.py).
- **Club**: Compare `normalize_club(incoming_club_raw)` to `person.club_normalized or normalize_club(person.club)` (treat empty-normalized as `""`).

Equality = same `(name_key, yob, club_norm)` for the same gender slice.

**Paarlauf**: Order-insensitive: multiset of the two per-member tuples `(name_key, yob, club_norm)` must equal the multiset for `team.member_a` / `member_b`, with member genders fixed by division (same as existing couple resolution).

## Matcher behavior (`strict_normalized_auto_only`)

Add a boolean on [`MatchingConfig`](c:\Users\andre\VSCode_Projects\stundenlauf\backend\matching\config.py), e.g. `strict_normalized_auto_only: bool = False` (default preserves current behavior).

### Singles — [`_resolve_person`](c:\Users\andre\VSCode_Projects\stundenlauf\backend\matching\workflow.py)

1. **Replay** block unchanged (explicit prior decision still wins).
2. If `config.strict_normalized_auto_only`:
   - Compute `strict_hits = [p for p in candidate_people if p.gender == gender and strict_person_match(...)]`.
   - **Important:** Scan **all** `candidate_people` of that gender, **not** `gather_candidates` only. Blocking ([`backend/matching/candidates.py`](c:\Users\andre\VSCode_Projects\stundenlauf\backend\matching\candidates.py)) is built from **canonical** names; after identity correction, the true strict match can sit outside the incoming row’s blocks (your real-world case).
   - If `len(strict_hits) == 1`: auto-link that person (subject to existing `used_candidate_uids` conflict → review).
   - If `len(strict_hits) > 1`: route **review** (ambiguous strict collision; include them in candidate set / confidence from fuzzy optional).
   - If `len(strict_hits) == 0`: run existing fuzzy pipeline (gather + `score_person_match` + `route_from_score`), then **if** routed `auto`, **downgrade to `review`** (fuzzy may never auto in this mode).
3. If flag false: current behavior unchanged.

Set `match_meta.features` e.g. `strict_identity_auto: 1.0` when auto came from strict equality (helps support and timeline reading).

### Couples — [`_resolve_team_row`](c:\Users\andre\VSCode_Projects\stundenlauf\backend\matching\workflow.py)

Mirror the same pattern: after replay, optional full scan of `couples` for the division, then fuzzy path with auto-downgrade when flag is on.

### Shared helper

New small module e.g. [`backend/matching/strict_identity.py`](c:\Users\andre\VSCode_Projects\stundenlauf\backend\matching\strict_identity.py) (or functions next to `decisions.py`) exporting:

- `name_key(parsed: ParsedName) -> str` (shared with fingerprint logic to avoid drift)
- `person_strict_tuple(incoming_parsed, yob, club_norm, gender, person) -> bool` or equivalent
- `couple_strict_match(row, division, couple) -> bool`

Unit-test these helpers in isolation (table-driven: same tokens different order, club empty, yob 0).

## Session / UI API

[`backend/ui_api/service.py`](c:\Users\andre\VSCode_Projects\stundenlauf\backend\ui_api\service.py):

- Persist `_strict_normalized_auto_only` (default `False`) alongside existing `_auto_min_setting`, `_auto_merge_enabled`, `_perfect_match_auto_merge`.
- `get_matching_config` / `set_matching_config`: add `strict_normalized_auto_only` to payload (bool).
- `_build_matching_config`: pass `strict_normalized_auto_only` into `MatchingConfig` (other fields unchanged; `effective_auto_min` logic stays as today for fuzzy review boundaries).

Document in [`docs/api/ui-api-v1.md`](c:\Users\andre\VSCode_Projects\stundenlauf\docs\api\ui-api-v1.md): semantics, interaction with `auto_merge_enabled` / `perfect_match_auto_merge` (when strict mode is on, fuzzy auto is disabled; threshold sliders only affect review vs new_identity for non-strict rows).

Extend [`tests/test_f08_ui_api.py`](c:\Users\andre\VSCode_Projects\stundenlauf\tests\test_f08_ui_api.py) for get/set and optionally a mocked import asserting `MatchingConfig.strict_normalized_auto_only` is passed through (similar to existing matching config tests).

Add focused matcher tests in [`tests/test_f03_matching.py`](c:\Users\andre\VSCode_Projects\stundenlauf\tests\test_f03_matching.py) or a new `tests/test_matching_strict_identity.py`:

- Strict on: incoming equals canonical → auto; one letter off → review (not auto) even if fuzzy would be 1.0.
- Strict on: two people collide on strict tuple → review.
- Strict off: existing behavior unchanged.

## German GUI — [`frontend/app.js`](c:\Users\andre\VSCode_Projects\stundenlauf\frontend\app.js) + [`frontend/strings.js`](c:\Users\andre\VSCode_Projects\stundenlauf\frontend\strings.js)

In the Import **Matching-Einstellungen** panel:

- Add a **second mode** control: e.g. radio pair or checkbox **“Nur exakt normalisierte Identität automatisch”** (copy in `importView` strings) that maps to `strict_normalized_auto_only`.

UX details:

- When strict mode is **on**: disable (or grey out) **Auto-Merge** checkbox, **Perfekte Treffer** checkbox, and **Schwelle** slider/number (they do not apply to auto in strict mode); show a short hint that Schwelle nur für **Prüfung** vs **neue Person** gilt.
- When strict mode is **off**: current layout unchanged.
- `loadMatchingConfig` / save handler: read/write the new field with `set_matching_config`.

## Docs / traceability

- Add a short feature note in [`docs/features/`](c:\Users\andre\VSCode_Projects\stundenlauf\docs\features\) (e.g. `F11-strict-normalized-auto-match.md`) mapping to R4/R6/M5, assumptions (club included), and test plan.
- Update [`PROJECT_PLAN.md`](c:\Users\andre\VSCode_Projects\stundenlauf\PROJECT_PLAN.md) delivery line and [`docs/ACCOMPLISHMENTS.md`](c:\Users\andre\VSCode_Projects\stundenlauf\docs\ACCOMPLISHMENTS.md) when shipped.

## Risks

- **Strict collisions** (two distinct UIDs with identical normalized tuple): rare but possible; forcing **review** is the safe default.
- **Club normalization** surprises: document that typos in Verein prevent strict auto until file or canonical club matches.
