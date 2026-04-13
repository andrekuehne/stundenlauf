# F-TS03: Fuzzy Matching Engine

## Overview

- Feature ID: F-TS03
- Feature name: Participant/team matching engine with configurable modes
- Owner: —
- Status: Planned
- Related requirement(s): R3, R4, R6
- Related milestone(s): M-TS3
- Python predecessor(s): F03 (matching engine), F09 (identity correction workflow), parts of F16 (review queue and replay)

## Problem Statement

When importing a new race result file, each row represents a participant (solo) or team (couple). The same person may appear across multiple race files with slight variations in spelling, missing year of birth, or different club affiliations. The matching engine must decide, for every incoming row, whether it corresponds to an already-known team or is a new identity.

The Python version solves this with:
1. A **fingerprint + replay** system that remembers past manual decisions.
2. A **blocking index** that narrows the candidate pool efficiently.
3. A **weighted composite scorer** combining name similarity, YOB agreement, and club similarity.
4. **Three user-facing matching modes** (Strikt / Fuzzy-Automatik / Manuell) with configurable thresholds.
5. A **review queue** for uncertain matches that blocks further imports until resolved.

The TS port must replicate the scoring logic, mode system, and review workflow, adapted to the event-sourced architecture (F-TS01) where matching is a **workflow module external to the event log**. The matching engine produces resolved events; it does not store its own decisions as domain events.

## Scope

### In Scope

- Name parsing and normalization (diacritics, titles, delimiter handling).
- Identity fingerprinting (SHA-256, order-insensitive for couples).
- Blocking index for efficient candidate retrieval (singles and couples).
- Composite scoring for singles: weighted name similarity + YOB agreement + club similarity.
- Composite scoring for couples: bipartite order-insensitive member pairing.
- Strict identity mode: exact normalized match on name, YOB, club, and gender.
- Three GUI-exposed matching modes with their sub-modes.
- Configurable auto-link and review-minimum thresholds.
- Score-based routing: auto / review / new_identity.
- Safety overrides: strong-name-but-YOB-mismatch → review; same-race candidate reuse → review.
- Replay of past manual decisions via fingerprint lookup.
- Review queue: staging area for uncertain matches, blocking further imports until resolved.
- Review resolution actions: link to existing team, or create new identity.
- Import report: counts of auto-links, review items, new identities, conflicts, replays.

### Out of Scope

- Excel parsing (F-TS02).
- Event emission and event log storage (F-TS01).
- Import orchestration workflow tying parsing → matching → event emission (F-TS05).
- Ranking/standings computation (F-TS04).
- `manual_reject` persistence — the infrastructure exists in the Python code but no GUI path creates `manual_reject` decisions. Not ported.
- Identity merge (Python F16) — out of scope for v1; corrections use `entry.reassigned`.
- PDF/CSV export.
- UI framework and visual design of the review queue (separate UI feature).

## Acceptance Criteria

- [ ] Name parsing produces identical `ParsedName` (given, family, tokens, display_compact) as the Python version for the same inputs, including German names with commas, titles, and diacritics.
- [ ] `identity_fingerprint` and `team_fingerprint` produce the same SHA-256 hashes as the Python version for identical inputs.
- [ ] `score_person_match` produces scores within ±0.001 of the Python version for the same inputs.
- [ ] `score_couple_match` produces scores within ±0.001 of the Python version for the same inputs.
- [ ] Strict mode auto-links only when exactly one candidate matches on all four fields (normalized name key, YOB, normalized club, gender); multiple strict hits route to review.
- [ ] In strict mode, fuzzy-only auto matches (no strict hit) are downgraded to review.
- [ ] The three GUI matching modes (Strikt / Fuzzy-Automatik / Manuell) produce the correct effective `auto_min` values.
- [ ] Fuzzy sub-modes ("Nur 100 %-Ähnlichkeit" / "Ab Schwelle") behave correctly.
- [ ] Replay fires when a fingerprint matches a prior `manual_link` or `replay` decision with a valid target.
- [ ] Strong-name-but-YOB-mismatch safety override routes to review instead of new_identity.
- [ ] Same-race candidate reuse conflict routes to review.
- [ ] Duplicate incoming rows within the same import are rejected.
- [ ] Review resolution (link existing / create new) produces the correct events.
- [ ] Import is blocked while the review queue is non-empty.
- [ ] Matching engine is framework-agnostic (pure TS functions, no UI imports).

---

## Technical Plan

### 1. Name Parsing and Normalization

Direct port of `backend/matching/normalize.py`. These are pure string functions.

#### `ParsedName`

```typescript
interface ParsedName {
  given: string;      // normalized given name(s)
  family: string;     // normalized family name
  tokens: string[];   // sorted unique normalized tokens
  display_compact: string;
}
```

#### `parsePersonName(raw: string): ParsedName`

Algorithm:

1. Normalize whitespace (collapse runs, trim).
2. If the string contains a comma: split on the first comma. Left part → family, right part → given (after stripping leading academic titles).
3. If no comma: split on spaces, strip leading titles. Last token → family, everything else → given. Single token → family only, given = "".
4. Normalize each token: strip diacritics (NFD decompose, remove combining marks), lowercase, strip non-word/non-hyphen characters.
5. Build sorted unique token set, build `display_compact` from `"${given} ${family}"`.

#### Title stripping

Known titles (stripped from the leading position of the given-name part):

```
"dr", "dr.", "prof", "prof.", "dipl", "dipl.", "ing", "ing.", "med", "med."
```

Comparison is case-insensitive, dot-insensitive (strip trailing `.` before lookup).

#### `normalizeClub(value: string | null): string`

1. If null/empty → `""`.
2. Strip diacritics, lowercase.
3. Replace non-word/non-space/non-hyphen/non-dot characters with space.
4. Collapse whitespace.

#### `stripDiacritics(value: string): string`

Unicode NFD normalization, then strip all combining mark characters (category `Mn`).

#### `normalizeToken(value: string): string`

Strip diacritics, lowercase, remove all non-word/non-hyphen characters.

### 2. Identity Fingerprinting

Direct port of `backend/matching/decisions.py`. Fingerprints are deterministic hash keys for replay lookup.

#### `nameKey(parsed: ParsedName): string`

```
parsed.tokens.length > 0
  ? parsed.tokens.toSorted().join("|")
  : parsed.display_compact
```

#### `identityFingerprint(parsed: ParsedName, yob: number, gender: Gender): string`

```
SHA-256("{nameKey(parsed)}|{yob}|{gender}")
```

Uses Web Crypto API (`crypto.subtle.digest`), same as F-TS02 for file hashing.

#### `teamFingerprint(parsedA, yobA, genderA, parsedB, yobB, genderB): string`

Order-insensitive: compute each member's `identityFingerprint`, sort the two hashes lexicographically, join with `"|"`, SHA-256 the result.

### 3. Blocking Index (Candidate Retrieval)

Direct port of `backend/matching/candidates.py` (singles) and `backend/matching/teams.py` (couples). The blocking index narrows the candidate pool before expensive scoring.

#### Index structure

For each registered person (same gender) or couple (matching division), generate blocking keys:

```
"fam|{family_prefix_3}|{yob}"
"giv|{given_prefix_3}|{yob}"
"fam|{family_prefix_3}|no_yob"
"giv|{given_prefix_3}|no_yob"
```

Where prefix is the first 3 characters of the normalized given/family name token.

#### `buildPersonBlockIndex(persons, gender) → Map<string, Person[]>`

Filter to same gender, generate keys for each person, build a multimap.

#### `gatherCandidates(incoming, yob, gender, index, config) → Person[]`

Generate keys for the incoming row, look up candidates in order, deduplicate by ID, cap at `max_candidates_per_row` (default: **48**).

#### Couple blocking

Same structure, but keys are generated from both members of each registered couple. `gatherCoupleCandidates` generates keys from both incoming members and looks up in the couple index.

### 4. Scoring: Singles

Direct port of `backend/matching/score.py`.

#### `nameSimilarity(a: ParsedName, b: ParsedName) → [score, features]`

Uses `SequenceMatcher.ratio()` equivalent (Ratcliff/Obershelp). The TS port must use a compatible algorithm — `difflib.SequenceMatcher` is Ratcliff/Obershelp pattern matching. A direct port or a library that implements the same algorithm is required.

```
forward = ratio(a.given, b.given) × 0.45
        + ratio(a.family, b.family) × 0.45
        + ratio(a.display_compact, b.display_compact) × 0.10

swapped = ratio(a.given, b.family) × 0.45
        + ratio(a.family, b.given) × 0.45
        + ratio(a.display_compact, b.display_compact) × 0.10

token_overlap = |tokens_a ∩ tokens_b| / |tokens_a ∪ tokens_b|   (if both non-empty)

base = max(forward, swapped)
```

Features returned: `name_forward`, `name_swapped`, `token_overlap`, `name_base`.

#### `scorePersonMatch(incoming, incomingYob, incomingClubNorm, candidate, config) → [score, features]`

Starting from `base` (name similarity):

| Adjustment | Condition | Effect |
|---|---|---|
| Title exact bonus | `max(base, forward, swapped) ≥ 0.99` | `+ title_exact_bonus` (default **0.02**) |
| Swapped boost | swapped > forward by more than 0.02 | `+ swapped_boost` (default **0.04**) |
| YOB match | both > 0 and equal | `+ yob_match_bonus` (default **0.10**) |
| YOB mismatch | both > 0 and differ | `− yob_mismatch_penalty` (default **0.45**) |
| YOB unknown | either is 0 | `yob_agreement = 0.5` (no score change) |
| Club similarity | always | `+ club_weight × ratio(incoming_club_norm, candidate_club_norm)` (weight default **0.08**) |

Final score clamped to `[0.0, 1.0]`.

#### `routeFromScore(score, config) → "auto" | "review" | "new_identity"`

```
score ≥ auto_min  → "auto"
score ≥ review_min → "review"
else              → "new_identity"
```

Default thresholds: `auto_min = 0.88`, `review_min = 0.72`.

### 5. Scoring: Couples

Direct port of `backend/matching/teams.py`.

#### `scoreCoupleMatch(incA, yobA, clubA, incB, yobB, clubB, team, config) → [score, features]`

Order-insensitive bipartite pairing:

1. Try both member orderings: (A→member0, B→member1) and (A→member1, B→member0).
2. For each ordering, score each pair using `scorePersonMatch`, then:

```
pair_score = min(s0, s1) × 0.65 + mean(s0, s1) × 0.35
```

3. Take the best ordering.
4. **Safety cap**: if `min(s0, s1) < member_mismatch_floor` (default **0.52**), cap `pair_score` at `pair_unsafe_cap` (default **0.78**).

Features returned include both members' `name_base`, `token_overlap`, `yob_agreement`, plus `pair_score`, `member_low`, `member_high`.

### 6. Strict Identity Mode

Direct port of `backend/matching/strict_identity.py`. An alternative matching path activated by the "Strikt" GUI mode.

#### `personMatchesStrictIncoming(incoming, candidate) → boolean`

All four must hold:
- Same gender
- Exact YOB (0 vs non-0 does **not** match)
- `nameKey(parse(incoming.name)) === nameKey(parse(candidate.name))`
- `normalizeClub(incoming.club) === normalizeClub(candidate.club)`

#### `coupleMatchesStrictRow(row, genderA, genderB, couple) → boolean`

Multiset equality of `(nameKey, yob, clubNorm, gender)` for both members (order-insensitive): sort both pairs, compare element-wise.

#### Strict mode behavior in the resolution pipeline

When `strict_normalized_auto_only` is true:
- **1 strict hit** → auto-link with score 1.0, features `{ strict_identity_auto: 1.0 }`.
- **Multiple strict hits** → route to review (pick the one with the best fuzzy score as top candidate).
- **0 strict hits** → even if the fuzzy score would be "auto", downgrade to "review". Only strict matches get auto-linked.

### 7. Resolution Pipeline (Per-Row)

This is the main orchestration per imported row. Direct port of `_resolve_person` and `_resolve_team_row` from `backend/matching/workflow.py`.

#### Flow for singles

```
1. Parse name → ParsedName
2. Normalize club
3. Compute fingerprint

4. REPLAY CHECK
   If fingerprint found in replay index (derived from past entries with
   resolution.method = "manual" or "auto" at confidence 1.0)
   and target team_id exists in registry → auto-link (confidence 1.0, features: {replay: 1.0})

5. CANDIDATE SCORING
   Build blocking index → gather candidates → exclude rejected UIDs →
   score each candidate → sort descending by score

6. STRICT MODE OVERLAY (if enabled)
   Scan all registered persons for strict matches:
   - 1 hit → override top to that person, score = 1.0
   - >1 hits → route = review, pick best-scored strict hit as top
   - 0 hits → if fuzzy route was "auto", downgrade to "review"

7. ROUTE
   route_from_score(top_score, config) → auto / review / new_identity

8. SAFETY OVERRIDES
   a. Strong name + YOB mismatch: if route = new_identity but
      name_base ≥ 0.98 or token_overlap = 1.0, and yob_agreement = 0.0
      → promote to review
   b. Same-race reuse: if route = auto but top candidate already used
      by another row in this import → route = review + conflict flag

9. OUTCOME
   - auto: link to existing team, track used UID
   - review: link provisionally, add to review queue
   - new_identity: create new Person + Team, register in state
```

#### Flow for couples

Same structure, substituting:
- `teamFingerprint` for fingerprinting
- `scoreCoupleMatch` for scoring
- `coupleMatchesStrictRow` for strict overlay
- `shouldReviewStrongCoupleYobMismatch` for the safety override
- Team reuse conflict tracking instead of person reuse

### 8. GUI-Exposed Matching Modes

The GUI exposes **three primary modes** and, under Fuzzy, **two sub-modes**. These map to five boolean/numeric config fields.

#### Config fields

| Field | Type | Description |
|---|---|---|
| `auto_min` | `number` | User-set auto-link threshold (0.00–1.00); only active when "Ab Schwelle" |
| `review_min` | `number` | Minimum score to land in review instead of new_identity (0.00–1.00) |
| `auto_merge_enabled` | `boolean` | Whether the "Ab Schwelle" sub-mode is active |
| `perfect_match_auto_merge` | `boolean` | Whether the "Nur 100 %" sub-mode is active |
| `strict_normalized_auto_only` | `boolean` | Whether strict mode is active |

#### Mode → config mapping

| Mode | `strict_normalized_auto_only` | `auto_merge_enabled` | `perfect_match_auto_merge` | Effective `auto_min` |
|---|---|---|---|---|
| **Strikt** | `true` | *(preserved)* | *(preserved)* | *(ignored — strict path decides)* |
| **Fuzzy → Nur 100 %** | `false` | `false` | `true` | **1.0** |
| **Fuzzy → Ab Schwelle** | `false` | `true` | *(preserved)* | user slider value |
| **Manuell** | `false` | `false` | `false` | **1.01** (nothing auto-links by score) |

The **effective auto_min** determines what `MatchingConfig.auto_min` is set to at runtime:

```
if auto_merge_enabled → effective = auto_min (user slider)
elif perfect_match_auto_merge → effective = 1.0
else → effective = 1.01
```

Constraint: `review_min ≤ effective_auto_min`.

#### German UI labels

| Concept | German label |
|---|---|
| Settings panel | "Matching-Einstellungen" |
| Strikt | "Strikt" |
| Fuzzy-Automatik | "Fuzzy-Automatik" |
| Manuell | "Manuell" |
| Fuzzy sub: 100% | "Nur 100 %-Ähnlichkeit" |
| Fuzzy sub: threshold | "Ab Schwelle" |
| Auto threshold label | "Ähnlichkeit ab der automatisch zugeordnet wird" |
| Review threshold label | "Mindest-Ähnlichkeit für Prüfliste" |
| Strikt hint | "Automatische Zuordnung nur, wenn Name (normalisiert), Jahrgang, Verein und Geschlecht exakt einem bestehenden Datensatz entsprechen und genau ein Treffer möglich ist. Kein stiller Fuzzy-Auto-Merge." |
| Fuzzy 100% hint | "Automatische Zuordnung nur, wenn der Fuzzy-Ähnlichkeitswert den höchsten Wert (100 %) erreicht – unabhängig von Tippfehlern in der Anzeige, aber nach Gewichtung und Normierung des Systems." |
| Fuzzy threshold hint | "Automatische Zuordnung ab dem eingestellten Mindest-Ähnlichkeitswert. Darunter bleiben Einträge in der Prüfung oder werden als neue Person geführt." |
| Manuell hint | "Keine automatische Zuordnung über Ähnlichkeit: alle unsicheren Fälle landen in der Prüfung." |
| Import blocked | "Solange offene Zusammenführungs-Prüfungen bestehen, kann kein weiterer Lauf importiert werden. Bitte zuerst alle Prüfungen abschließen." |

### 9. Replay Mechanism

When a previous import resolved a fingerprint via `manual_link` or `replay`, subsequent imports of the same fingerprint reuse that decision automatically.

#### Derivation from the event log (TS port)

In the Python version, replay state is stored in a separate `matching_decisions` table. In the TS port, matching decisions are **not domain events** (per F-TS01). Instead, replay hints are derived at import time by scanning the event log:

1. For each past `race.registered` event, examine entries and their `ResolutionInfo`.
2. Build a fingerprint index: for each entry's `incoming` data, recompute the fingerprint from the raw display name, YOB, and gender.
3. If `resolution.method` is `"manual"` or `"auto"` (with confidence = 1.0 and the entry is effective), record `fingerprint → team_id` as a replay hint.

Alternatively, the matching engine can maintain its own lightweight replay cache outside the event log (e.g. in a separate IndexedDB store or in-memory), populated from the event log on season open. This is a UI/workflow concern, not domain state.

#### Replay behavior

If a replay hint exists for the current row's fingerprint and the target team still exists:
- Auto-link with confidence 1.0, features: `{ replay: 1.0 }`.
- Resolution method in the emitted event: `"auto"` (the replay is transparent to the event log).

### 10. Safety Overrides

Two guard rails prevent silent bad outcomes:

#### Strong name + YOB mismatch → review

When the top candidate's score falls below `review_min` (would be `new_identity`), but:
- `name_base ≥ 0.98` or `token_overlap ≥ 1.0`, **and**
- `yob_agreement = 0.0` (both YOBs present and different)

→ Override to `review`. This catches the case where the same person appears with a typo in their year of birth — the name is essentially identical but the YOB penalty dropped the score below the review threshold.

For couples, the same logic applies per-member: if both members have strong names and at least one has a YOB clash, override to review.

#### Same-race candidate reuse → review

If the top auto-linked candidate was already used by another row in the same import batch, the entry is flagged with a conflict and routed to review. This prevents silently assigning two different rows to the same person within one race.

### 11. Review Queue

The review queue is a **UI workflow staging area**, not part of the event log (per F-TS01's eager resolution model).

#### Lifecycle

1. After parsing and scoring, entries with route = `"review"` are placed in a staging queue.
2. The user must resolve all review items before the import batch can be committed to the event log.
3. **Imports are blocked** while review items are pending.
4. Resolution actions:
   - **Link to existing team**: user picks from the candidate list → entry gets the selected `team_id`.
   - **Create new identity**: user confirms this is a new person/team → new person/team entities + assignment.

#### Review display data

Each review item provides:
- The incoming row data (display name, YOB, club).
- A ranked list of candidates with confidence scores.
- Per-field diff highlights (given name, family name, YOB, club) comparing incoming vs. each candidate.
- For couples: order-aligned display (best-fit member alignment for readability).

#### Resolution → events

Once all review items are resolved, the import workflow emits the full event batch atomically (as described in F-TS01 §5): `import_batch.recorded`, `person.registered`, `team.registered`, `race.registered` with all entries carrying definitive `team_id` values, and `ranking.eligibility_set` events to clear prior exclusions.

### 12. Import Report

After matching completes, a structured report summarizes the run:

```typescript
interface MatchingReport {
  auto_links: number;
  review_queue: number;
  new_identities: number;
  conflicts: number;
  replay_overrides: number;
  candidate_counts: number[];   // per-row candidate pool sizes
}
```

Multiple section reports (one per parsed section) are aggregated into a single report for the import run.

### 13. Matching Config Defaults

All scoring weights and thresholds, with their default values:

```typescript
interface MatchingConfig {
  // GUI mode fields (user-facing, control effective auto_min — see §8)
  auto_merge_enabled: boolean;         // false — "Ab Schwelle" sub-mode active
  perfect_match_auto_merge: boolean;   // false — "Nur 100 %" sub-mode active
  strict_normalized_auto_only: boolean; // false — "Strikt" mode active

  // Thresholds (auto_min is user-facing via slider; review_min is user-facing)
  auto_min: number;                  // 0.88 — user slider value (only active when auto_merge_enabled)
  review_min: number;                // 0.72

  // Scoring weights (internal tuning constants)
  yob_match_bonus: number;           // 0.10
  yob_mismatch_penalty: number;      // 0.45
  club_weight: number;               // 0.08
  swapped_boost: number;             // 0.04
  title_exact_bonus: number;         // 0.02
  max_candidates_per_row: number;    // 48
  member_mismatch_floor: number;     // 0.52
  pair_unsafe_cap: number;           // 0.78
}
```

The resolution pipeline computes the **effective auto_min** from the GUI mode fields (see §8 mode → config mapping) and uses that for routing. `review_min` is always used directly.

### 14. SequenceMatcher Porting Strategy

The Python `difflib.SequenceMatcher.ratio()` implements the Ratcliff/Obershelp algorithm. The TS port needs a compatible implementation to ensure scoring parity.

Options:
1. **Direct port**: translate the Python `SequenceMatcher` algorithm to TypeScript. The algorithm is well-documented and relatively compact (~100 lines). This guarantees identical scores.
2. **Use a library**: e.g. `fastest-levenshtein` or `string-similarity` — but these implement **different algorithms** (Levenshtein, Dice coefficient) and would produce different scores. Not suitable.

**Recommendation**: Direct port of the Ratcliff/Obershelp algorithm. The matching engine's scoring thresholds and weights were tuned against this specific similarity metric. Switching algorithms would require re-tuning all thresholds.

### 15. Module Structure

```
src/
  matching/
    normalize.ts          // ParsedName, parsePersonName, normalizeClub, normalizeToken, stripDiacritics
    fingerprint.ts        // nameKey, identityFingerprint, teamFingerprint
    candidates.ts         // buildPersonBlockIndex, gatherCandidates, candidatePersonKeys
    score.ts              // nameSimilarity, scorePersonMatch, routeFromScore, safety overrides
    teams.ts              // buildCoupleBlockIndex, gatherCoupleCandidates, scoreCoupleMatch
    strict-identity.ts    // personMatchesStrictIncoming, coupleMatchesStrictRow
    config.ts             // MatchingConfig interface and defaults
    resolve.ts            // resolvePerson, resolveTeamRow (per-row orchestration)
    workflow.ts           // processSinglesSection, processCouplesSection (section-level orchestration)
    report.ts             // MatchingReport, aggregateMatchingReports
    review-display.ts     // field highlights, couple member alignment for review UI
    ratcliff-obershelp.ts // SequenceMatcher.ratio() port
    types.ts              // shared types (resolution info, review item, etc.)
```

All exports are pure functions with no side effects and no framework dependencies.

---

## Mapping from Python Implementation

### Python approach

- `MatchingConfig` is a frozen dataclass with scoring weights, thresholds, and the strict mode flag.
- `normalize.py`: `ParsedName` dataclass, `parse_person_name`, `normalize_club`, `strip_diacritics`, `normalize_token`, `KNOWN_TITLES`.
- `decisions.py`: `name_key`, `identity_fingerprint`, `team_fingerprint`, `latest_decisions_by_fingerprint`, `rejected_participant_uids`, `rejected_team_uids`.
- `candidates.py`: `build_person_block_index`, `gather_candidates`, `candidate_person_keys`.
- `score.py`: `_ratio` (wraps `difflib.SequenceMatcher`), `name_similarity`, `score_person_match`, `route_from_score`, `should_review_strong_name_yob_mismatch`.
- `teams.py`: `build_couple_block_index`, `gather_couple_candidates`, `score_couple_match`.
- `strict_identity.py`: `person_matches_strict_incoming`, `couple_matches_strict_row`.
- `workflow.py`: `process_singles_section`, `process_couples_section`, `_resolve_person`, `_resolve_team_row`. These take a `ProjectDocument` and return a mutated document + `MatchingReport`.
- `report.py`: `MatchingReport` dataclass, `aggregate_matching_reports`.
- `review_display.py`: per-field diff highlights and couple member alignment for the review UI.
- Seven `MatchingDecision.kind` values stored in `ProjectDocument.matching_decisions`.
- Replay index built from the decisions table using `latest_decisions_by_fingerprint`.

### TS port differences

| Aspect | Python | TS Port |
|---|---|---|
| Matching state storage | `matching_decisions` table on `ProjectDocument` | No persistent matching state. Replay derived from event log entries' `ResolutionInfo`. |
| Decision kinds | 7 kinds: auto, manual_accept, manual_reject, manual_link, replay, identity_correction, identity_merge | None as domain concepts. Resolution method on entries: `auto`, `manual`, `new_identity`. |
| Rejection tracking | `rejected_participant_uids` / `rejected_team_uids` from `manual_reject` decisions | Not ported — no GUI path creates rejections. |
| Review queue | Entries with `match_meta.route = "review"` stored on committed `RaceEntry` objects | Pre-commit staging area. Entries never enter the event log unresolved (eager resolution). |
| Import blocking | Review queue checked at import time | Same behavior, but the review queue is ephemeral UI state. |
| Workflow output | Mutated `ProjectDocument` with new decisions appended | Event batch: `import_batch.recorded`, `person.registered`, `team.registered`, `race.registered`, `ranking.eligibility_set` (to clear prior exclusions). No decision events. |
| Couple model | `Couple` with `member_a`, `member_b` (embedded `Person`) | `Team { member_person_ids: [id1, id2] }` referencing `PersonIdentity` by ID |
| Singles model | `Person` with `participant_uid` on entries | `Team { member_person_ids: [id] }` — solo is a team of size 1 |
| SequenceMatcher | Python stdlib `difflib` | Direct port of Ratcliff/Obershelp algorithm |

### Reusable logic (direct port)

- `parsePersonName`: identical algorithm, different syntax.
- `normalizeClub`, `stripDiacritics`, `normalizeToken`: trivial 1:1 port.
- `nameKey`, `identityFingerprint`, `teamFingerprint`: identical (SHA-256 via Web Crypto API).
- `buildPersonBlockIndex`, `gatherCandidates`, `candidatePersonKeys`: identical blocking logic.
- `nameSimilarity`, `scorePersonMatch`: identical formula with ported SequenceMatcher.
- `scoreCoupleMatch`: identical bipartite pairing formula.
- `personMatchesStrictIncoming`, `coupleMatchesStrictRow`: identical equality logic.
- `routeFromScore`, safety overrides: identical threshold logic.
- Strict mode overlay (workflow): identical branching logic.
- `MatchingReport`, `aggregateMatchingReports`: identical aggregation.

### Not ported

- `rejected_participant_uids` / `rejected_team_uids`: no GUI path creates `manual_reject` decisions; the infrastructure exists in Python but is not exposed.
- `MatchingDecision` as a persisted domain model: eliminated by the event-sourced architecture.
- `identity_correction` / `identity_merge` decision kinds: out of scope for v1.

---

## Risks and Assumptions

- **Assumption:** A direct port of Python's `difflib.SequenceMatcher.ratio()` (Ratcliff/Obershelp) produces identical scores for identical inputs. Must verify with cross-language fixture tests.
- **Assumption:** SHA-256 via Web Crypto API produces identical hex digests to Python's `hashlib.sha256` for the same UTF-8 byte inputs.
- **Assumption:** Unicode NFC/NFD normalization behaves identically in JavaScript (`String.prototype.normalize`) and Python (`unicodedata.normalize`).
- **Risk:** Matching performance for large seasons (many registered persons/teams) in the browser.
  - Mitigation: The blocking index limits candidates to ~48 per row. For a typical season (≤200 persons), scoring is trivial. Profile early; consider Web Workers for heavy computation if needed.
- **Risk:** Replay derivation from the event log may be slower than the Python version's pre-built decision index.
  - Mitigation: Build the replay index once on season open and cache it. Typical season has <800 events — scanning is fast.
- **Risk:** Floating-point differences between Python and JavaScript could cause score divergence beyond ±0.001.
  - Mitigation: Both languages use IEEE 754 double precision. Verify with fixture-based cross-language tests using the same inputs and expected outputs.

## Implementation Steps

1. Port `normalizeToken`, `stripDiacritics`, `normalizeWhitespace`, `normalizeClub`, `KNOWN_TITLES` to `normalize.ts`.
2. Port `ParsedName` interface and `parsePersonName` to `normalize.ts`.
3. Implement Ratcliff/Obershelp `ratio()` in `ratcliff-obershelp.ts`.
4. Port `nameKey`, `identityFingerprint`, `teamFingerprint` to `fingerprint.ts`.
5. Port `MatchingConfig` interface and defaults to `config.ts`.
6. Port `buildPersonBlockIndex`, `gatherCandidates`, `candidatePersonKeys` to `candidates.ts`.
7. Port `nameSimilarity`, `scorePersonMatch`, `routeFromScore`, safety overrides to `score.ts`.
8. Port `buildCoupleBlockIndex`, `gatherCoupleCandidates`, `scoreCoupleMatch` to `teams.ts`.
9. Port `personMatchesStrictIncoming`, `coupleMatchesStrictRow` to `strict-identity.ts`.
10. Implement `resolvePerson` and `resolveTeamRow` in `resolve.ts`.
11. Implement `processSinglesSection`, `processCouplesSection` in `workflow.ts`.
12. Port `MatchingReport` and `aggregateMatchingReports` to `report.ts`.
13. Port review display helpers (`fieldHighlightsForPersonLine`, `alignCoupleMembersForDisplay`) to `review-display.ts`.
14. Write cross-language fixture tests for scoring parity.
15. Write unit tests for all normalization, fingerprinting, blocking, scoring, and routing functions.
16. Write integration tests for the full resolution pipeline (singles and couples, all modes).

## Test Plan

- **Unit (normalize.ts):**
  - `parsePersonName`: comma-delimited names, space-delimited, single token, titles (Dr., Prof.), German characters (ä, ö, ü, ß), empty input.
  - `normalizeClub`: null, empty, punctuation-only, valid club with diacritics.
  - `stripDiacritics`: German umlauts, accented characters, already-ASCII strings.

- **Unit (fingerprint.ts):**
  - `nameKey`: multi-token sorted output, single-token fallback to display_compact.
  - `identityFingerprint`: deterministic for same inputs, different for different YOB/gender.
  - `teamFingerprint`: order-insensitive (A+B = B+A).

- **Unit (ratcliff-obershelp.ts):**
  - Known input/output pairs matching Python's `difflib.SequenceMatcher.ratio()`.
  - Edge cases: empty strings, identical strings, completely different strings.

- **Unit (candidates.ts):**
  - Blocking keys generated correctly for names with/without YOB.
  - Candidate retrieval respects gender filter and max cap.

- **Unit (score.ts):**
  - `scorePersonMatch`: exact match → ~1.0; complete mismatch → ~0.0; YOB bonus/penalty; club weight; swapped boost; title exact bonus.
  - `routeFromScore`: boundary values at `auto_min` and `review_min`.
  - Strong-name-YOB-mismatch override: correctly triggers/does not trigger.

- **Unit (teams.ts):**
  - `scoreCoupleMatch`: order-insensitive (swapping members gives same score).
  - Safety cap when one member is a weak match.

- **Unit (strict-identity.ts):**
  - Exact match → true; name mismatch → false; YOB mismatch → false; club mismatch → false; gender mismatch → false.
  - Couple: order-insensitive multiset equality.

- **Integration (resolve.ts / workflow.ts):**
  - Full pipeline: parse → fingerprint → replay check → blocking → scoring → strict overlay → routing → outcome.
  - Strict mode: 0 hits → review; 1 hit → auto; >1 hits → review.
  - Replay: matching fingerprint → auto at confidence 1.0.
  - Safety overrides: strong name + YOB mismatch → review; reuse conflict → review.
  - Duplicate row detection → error.

- **Cross-language fixture tests:**
  - Same name/YOB/club inputs → verify Python and TS produce scores within ±0.001.
  - Same inputs → verify identical fingerprint hashes.
  - Same name strings → verify identical `ParsedName` output.

- **Mode integration:**
  - Strikt mode → only exact matches auto-link.
  - Fuzzy 100% → only score = 1.0 auto-links.
  - Fuzzy threshold → slider value controls auto boundary.
  - Manuell → nothing auto-links; everything goes to review or new_identity.

## Definition of Done

- [ ] Code implemented in TypeScript
- [ ] Tests added/updated and passing (Vitest)
- [ ] Types are strict (no `any` escapes without justification)
- [ ] Cross-language scoring parity verified with fixture tests
- [ ] Docs updated
- [ ] Entry added to `packages/stundenlauf-ts/docs/ACCOMPLISHMENTS.md`
- [ ] Requirement/milestone status updated in `packages/stundenlauf-ts/PROJECT_PLAN.md`

## Links

- Python source reference(s):
  - `backend/matching/config.py` — `MatchingConfig` (thresholds, weights, strict flag)
  - `backend/matching/normalize.py` — `ParsedName`, `parse_person_name`, `normalize_club`, `strip_diacritics`, `KNOWN_TITLES`
  - `backend/matching/decisions.py` — `name_key`, `identity_fingerprint`, `team_fingerprint`, `latest_decisions_by_fingerprint`
  - `backend/matching/candidates.py` — `build_person_block_index`, `gather_candidates`, `candidate_person_keys`
  - `backend/matching/score.py` — `name_similarity`, `score_person_match`, `route_from_score`, safety overrides
  - `backend/matching/teams.py` — `build_couple_block_index`, `gather_couple_candidates`, `score_couple_match`
  - `backend/matching/strict_identity.py` — `person_matches_strict_incoming`, `couple_matches_strict_row`
  - `backend/matching/workflow.py` — `process_singles_section`, `process_couples_section`, `_resolve_person`, `_resolve_team_row`
  - `backend/matching/report.py` — `MatchingReport`, `aggregate_matching_reports`
  - `backend/matching/review_display.py` — per-field diff highlights, couple member alignment
  - `backend/ui_api/service.py` — `_get_matching_config`, `_set_matching_config`, `_build_matching_config` (mode → effective threshold mapping)
  - `frontend/app.js` — matching mode tabs, threshold sliders, review queue UI, import blocking
  - `frontend/strings.js` — German labels for matching UI
