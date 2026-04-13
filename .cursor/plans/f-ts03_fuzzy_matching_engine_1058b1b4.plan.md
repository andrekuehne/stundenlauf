---
name: F-TS03 Fuzzy Matching Engine
overview: Port the Python fuzzy matching engine to TypeScript under `packages/stundenlauf-ts/src/matching/`, implementing name normalization, Ratcliff/Obershelp string similarity, identity fingerprinting, blocking indexes, composite scoring (singles + couples), strict identity mode, the per-row resolution pipeline, and the section-level workflow -- all as pure framework-agnostic functions with comprehensive Vitest tests.
todos:
  - id: types-config
    content: Create src/matching/types.ts (shared types) and src/matching/config.ts (MatchingConfig + defaults)
    status: completed
  - id: normalize
    content: Implement src/matching/normalize.ts (ParsedName, parsePersonName, normalizeClub, stripDiacritics, normalizeToken) with Unicode-correct regex
    status: completed
  - id: ratcliff
    content: Implement src/matching/ratcliff-obershelp.ts (direct port of Python difflib.SequenceMatcher.ratio)
    status: completed
  - id: fingerprint
    content: Implement src/matching/fingerprint.ts (nameKey, identityFingerprint, teamFingerprint via Web Crypto SHA-256)
    status: completed
  - id: score
    content: Implement src/matching/score.ts (personParsed, nameSimilarity, scorePersonMatch, routeFromScore, safety overrides)
    status: completed
  - id: candidates
    content: Implement src/matching/candidates.ts (blocking index, key generation, candidate gathering)
    status: completed
  - id: teams
    content: Implement src/matching/teams.ts (couple blocking, gathering, scoreCoupleMatch bipartite pairing)
    status: completed
  - id: strict
    content: Implement src/matching/strict-identity.ts (personMatchesStrictIncoming, coupleMatchesStrictRow)
    status: completed
  - id: resolve
    content: Implement src/matching/resolve.ts (resolvePerson, resolveTeamRow per-row orchestration with replay, strict overlay, safety overrides)
    status: completed
  - id: workflow
    content: Implement src/matching/workflow.ts (processSinglesSection, processCouplesSection section-level orchestration)
    status: completed
  - id: report-review
    content: Implement src/matching/report.ts and src/matching/review-display.ts
    status: completed
  - id: unit-tests
    content: "Write unit tests: normalize, ratcliff-obershelp, fingerprint, candidates, score, teams, strict-identity"
    status: completed
  - id: integration-tests
    content: "Write integration tests: resolve.test.ts, workflow.test.ts, cross-language-parity.test.ts"
    status: completed
  - id: finalize
    content: Create barrel exports, clean stubs, run lint+typecheck+tests, update ACCOMPLISHMENTS.md and PROJECT_PLAN.md
    status: completed
isProject: false
---

# F-TS03: Fuzzy Matching Engine Implementation Plan

## Context

- **Requirements:** R3 (track across races), R4 (fuzzy matching with thresholds), R6 (review and override)
- **Milestone:** M-TS3 (Matching engine and review workflow)
- **Depends on:** F-TS01 (Done -- domain types, `SeasonState`, `PersonIdentity`, `Team`), F-TS02 (Done -- `ParsedWorkbook`, import row types)
- **Python source:** 10 files under `backend/matching/` (~1300 lines) + mode config in `backend/ui_api/service.py`
- **Existing stubs:** `src/matching/fingerprint.ts`, `src/matching/scoring.ts`, `src/matching/workflow.ts`, `src/lib/normalization.ts` (all empty `export {}`)

## Key Architectural Adaptation

The Python version works with mutable `ProjectDocument` containing `Person`/`Couple` models and a `matching_decisions` table. The TS port must adapt to:

- **`PersonIdentity`** (has `given_name`/`family_name` instead of `canonical_given`/`canonical_family`) replaces `Person`
- **`Team`** (with `member_person_ids: string[]`) replaces both solo `Person` references and `Couple`
- **No `matching_decisions` table** -- replay is derived from event log entries' `ResolutionInfo`
- **`SeasonState`** (immutable maps `persons`, `teams`, `race_events`) replaces mutable `ProjectDocument`
- Workflow output is an **event batch** (arrays of event payloads), not a mutated document
- `person_parsed()` in Python uses `canonical_given`/`canonical_family`; TS equivalent uses `PersonIdentity.given_name`/`family_name`

## Module Structure

All new/modified files under `packages/stundenlauf-ts/`:

```
src/matching/
  types.ts              -- shared types (MatchRoute, ReviewItem, ResolvedEntry, etc.)
  config.ts             -- MatchingConfig interface and defaults
  normalize.ts          -- ParsedName, parsePersonName, normalizeClub, etc.
  ratcliff-obershelp.ts -- SequenceMatcher.ratio() direct port
  fingerprint.ts        -- nameKey, identityFingerprint, teamFingerprint
  candidates.ts         -- buildPersonBlockIndex, gatherCandidates
  score.ts              -- nameSimilarity, scorePersonMatch, routeFromScore, safety overrides
  teams.ts              -- buildCoupleBlockIndex, gatherCoupleCandidates, scoreCoupleMatch
  strict-identity.ts    -- personMatchesStrictIncoming, coupleMatchesStrictRow
  resolve.ts            -- resolvePerson, resolveTeamRow (per-row orchestration)
  workflow.ts           -- processSinglesSection, processCouplesSection
  report.ts             -- MatchingReport, aggregateMatchingReports
  review-display.ts     -- field highlights, couple member alignment
  index.ts              -- barrel exports

src/lib/
  normalization.ts      -- (rename target -- may move content to matching/normalize.ts)

tests/matching/
  normalize.test.ts
  ratcliff-obershelp.test.ts
  fingerprint.test.ts
  candidates.test.ts
  score.test.ts
  teams.test.ts
  strict-identity.test.ts
  resolve.test.ts
  workflow.test.ts
  report.test.ts
  review-display.test.ts
  cross-language-parity.test.ts
```

## Implementation Steps

### Phase 1: Foundation (no cross-module deps)

**Step 1 -- `types.ts` and `config.ts`**

Port `MatchingConfig` as a plain interface with a `defaultMatchingConfig()` factory (frozen dataclass in Python becomes a const default object). Add `MatchRoute` (`"auto" | "review" | "new_identity"`), `MatchingFeatures` (record of score breakdown), `ResolvedEntry` (per-row outcome), `ReviewItem`, and `MatchingReport` interface.

Key reference: [config.py](backend/matching/config.py) -- 10 numeric fields + 1 boolean.

**Step 2 -- `normalize.ts`**

Direct port of [normalize.py](backend/matching/normalize.py). Functions:
- `stripDiacritics(value)` -- `value.normalize("NFD").replace(/\p{M}/gu, "")`
- `normalizeWhitespace(value)` -- `value.trim().split(/\s+/).join(" ")`
- `normalizeToken(value)` -- strip diacritics, lowercase, remove `[^\w-]`
- `normalizeClub(value)` -- null-safe, strip diacritics, lowercase, replace non-word except space/hyphen/dot
- `KNOWN_TITLES` -- Set of title strings
- `parsePersonName(raw)` -- comma-delimited vs space-delimited, title stripping, sorted unique tokens

`ParsedName` interface:
```typescript
interface ParsedName {
  given: string;
  family: string;
  tokens: string[];   // sorted unique normalized tokens
  display_compact: string;
}
```

Critical parity detail: Python `re.sub(r"[^\w\-]", "", ...)` with `re.UNICODE` flag -- in JS use `/[^\w-]/gu` but note JS `\w` does NOT match Unicode letters (only `[a-zA-Z0-9_]`). Must use `/[^\p{L}\p{N}_-]/gu` to match Python's Unicode `\w` behavior.

**Step 3 -- `ratcliff-obershelp.ts`**

Direct port of Python's `difflib.SequenceMatcher.ratio()`. The Ratcliff/Obershelp algorithm:
1. Find longest common substring (LCS)
2. Recursively find LCS in left and right fragments
3. `ratio = 2.0 * matching_chars / total_chars`

Implement `sequenceMatcherRatio(a: string, b: string): number`. Edge cases: both empty -> 1.0, one empty -> 0.0.

This is the most critical parity function -- all scoring thresholds were tuned against this metric. Will verify with known Python `difflib.SequenceMatcher` input/output pairs.

### Phase 2: Fingerprinting and Scoring

**Step 4 -- `fingerprint.ts`**

Port from [decisions.py](backend/matching/decisions.py):
- `nameKey(parsed)` -- `tokens.toSorted().join("|")` or `display_compact` fallback
- `identityFingerprint(parsed, yob, gender)` -- SHA-256 of `"{nameKey}|{yob}|{gender}"` via Web Crypto API (reuse pattern from `src/ingestion/helpers.ts:fileSha256`)
- `teamFingerprint(...)` -- order-insensitive: sort two member fingerprints, join, SHA-256

Note: These are **async** functions (Web Crypto returns Promises). Python uses synchronous `hashlib.sha256`.

**Step 5 -- `score.ts`**

Port from [score.py](backend/matching/score.py):
- `personParsed(person: PersonIdentity): ParsedName` -- uses `given_name`/`family_name` (equivalent to Python's `canonical_given`/`canonical_family`)
- `nameSimilarity(a, b)` -- forward/swapped/token_overlap using `sequenceMatcherRatio`
- `scorePersonMatch(incoming, incomingYob, incomingClubNorm, candidate, config)` -- base + adjustments (title exact bonus, swapped boost, YOB match/mismatch, club similarity), clamp [0, 1]
- `routeFromScore(score, config)` -- threshold routing
- `shouldReviewStrongNameYobMismatch(topScore, feats, config)` -- safety override
- `shouldReviewStrongCoupleYobMismatch(topScore, feats, config)` -- couples variant

**Step 6 -- `candidates.ts`**

Port from [candidates.py](backend/matching/candidates.py):
- `candidatePersonKeys(incoming, yob)` -- generate blocking keys with 3-char prefixes
- `buildPersonBlockIndex(persons: PersonIdentity[], gender)` -- filter by gender, generate keys, build `Map<string, PersonIdentity[]>`
- `gatherCandidates(incoming, yob, gender, index, config)` -- lookup, dedupe by `person_id`, cap at `max_candidates_per_row`

Adaptation: Python iterates `tuple[Person, ...]`; TS takes `PersonIdentity[]` or iterates `SeasonState.persons` values.

**Step 7 -- `teams.ts`**

Port from [teams.py](backend/matching/teams.py):
- `coupleDivisionOk(team, memberPersons, division)` -- check gender compatibility (need to look up members from persons map)
- `buildCoupleBlockIndex(teams, persons, division)` -- keys from both members
- `gatherCoupleCandidates(parsedA, yobA, parsedB, yobB, index, config)`
- `scoreCoupleMatch(incA, yobA, clubA, incB, yobB, clubB, teamMembers, config)` -- bipartite pairing, safety cap

Key adaptation: Python's `Couple` embeds `member_a`/`member_b` directly. TS's `Team` has `member_person_ids` so we must resolve to `PersonIdentity` via a lookup map or pass members explicitly.

**Step 8 -- `strict-identity.ts`**

Port from [strict_identity.py](backend/matching/strict_identity.py):
- `personMatchesStrictIncoming({incoming_parsed, incoming_yob, incoming_club_norm, gender, person})`
- `coupleMatchesStrictRow(row, genderA, genderB, teamMembers)` -- multiset equality of `(nameKey, yob, clubNorm, gender)`

### Phase 3: Resolution Pipeline

**Step 9 -- `resolve.ts`**

Port `_resolve_person` and `_resolve_team_row` from [workflow.py](backend/matching/workflow.py) lines 149-590. This is the core orchestration per-row. Key adaptation:

- **Input:** `SeasonState` (read-only) + accumulators for new persons/teams/entries
- **Replay derivation:** Instead of `decision_index` from `matching_decisions` table, build replay hints from `SeasonState.race_events` entries' `ResolutionInfo` (method = `"auto"` with confidence 1.0 or method = `"manual"`)
- **Output:** `ResolvedEntry` (team_id, resolution info, new person/team payloads if created)
- **Fingerprinting is async** (SHA-256) -- `resolvePerson` and `resolveTeamRow` must be async
- **No `MatchingDecision` objects** -- resolution outcomes are captured in the returned `ResolvedEntry.resolution`
- **New identity creation:** return `PersonRegisteredPayload` + `TeamRegisteredPayload` to be emitted as events (not mutating a document)

**Step 10 -- `workflow.ts`**

Port `process_singles_section` and `process_couples_section` from [workflow.py](backend/matching/workflow.py) lines 593-780:
- Takes `SeasonState`, `ParsedSectionSingles`/`ParsedSectionCouples`, `MatchingConfig`
- Iterates rows, calls `resolvePerson`/`resolveTeamRow`
- Tracks duplicate incoming rows (name/yob/club/startnr tuple)
- Tracks used candidate UIDs for same-race conflict detection
- Returns: `{ resolvedEntries, newPersonPayloads, newTeamPayloads, report, reviewItems }`

The caller (F-TS05 import orchestration) will convert these into domain events.

**Step 11 -- `report.ts` and `review-display.ts`**

- `report.ts`: `MatchingReport` interface + `aggregateMatchingReports()` -- trivial summing
- `review-display.ts`: `fieldHighlightsForPersonLine()` and `alignCoupleMembersForDisplay()` from [review_display.py](backend/matching/review_display.py) -- display-only helpers for the review UI

### Phase 4: Tests

**Step 12 -- Unit tests** (one test file per module)

| Test file | Key coverage |
|-----------|-------------|
| `normalize.test.ts` | parsePersonName (comma, space, titles, umlauts, empty), normalizeClub, stripDiacritics, normalizeToken |
| `ratcliff-obershelp.test.ts` | Known input/output pairs from Python `difflib.SequenceMatcher.ratio()`, edge cases |
| `fingerprint.test.ts` | nameKey, identityFingerprint determinism, teamFingerprint order-invariance |
| `candidates.test.ts` | Blocking key generation, gender filtering, max cap |
| `score.test.ts` | scorePersonMatch (exact/typo/yob bonus/penalty/club), routeFromScore boundaries, safety overrides |
| `teams.test.ts` | scoreCoupleMatch order invariance, safety cap, member feature keys |
| `strict-identity.test.ts` | Exact match positive/negative, YOB mismatch, club mismatch, couple multiset equality |

**Step 13 -- Integration tests**

| Test file | Key coverage |
|-----------|-------------|
| `resolve.test.ts` | Full per-row pipeline: replay, blocking, scoring, strict overlay, routing, safety overrides |
| `workflow.test.ts` | Section-level: duplicate row detection, same-race reuse conflict, strict mode integration (0/1/>1 hits), Fuzzy/Manual mode auto_min behavior |

**Step 14 -- Cross-language parity tests**

`cross-language-parity.test.ts`: Fixed input/output pairs extracted from Python test runs:
- Same name strings -> identical `ParsedName` output
- Same inputs -> identical fingerprint SHA-256 hashes
- Same person match inputs -> scores within +/-0.001
- Same `SequenceMatcher.ratio()` inputs -> identical ratios

### Phase 5: Finalize

**Step 15 -- Barrel exports, lint, typecheck, docs**

- Create `src/matching/index.ts` barrel with public API exports
- Remove stub content from existing files (`src/lib/normalization.ts` redirect or remove)
- Run `npm run lint`, `npm run typecheck`, `npm test`
- Update `docs/ACCOMPLISHMENTS.md` and `PROJECT_PLAN.md` (F-TS03 -> Done, M-TS3 -> In Progress)

## Risks and Mitigations

- **JS `\w` vs Python `\w`:** JS `\w` is ASCII-only (`[a-zA-Z0-9_]`); Python `\w` with `re.UNICODE` matches Unicode letters. Must use `\p{L}\p{N}` character classes in JS regex. Verify with German names (Müller, Böhm, Straße).
- **Async fingerprinting:** Web Crypto `crypto.subtle.digest` is async. The resolution pipeline must be async. This is a structural difference from Python's synchronous `hashlib`. Impacts: `resolvePerson`, `resolveTeamRow`, `processSinglesSection`, `processCouplesSection` are all async.
- **Ratcliff/Obershelp parity:** Direct port of the algorithm; verify with 10+ known Python `difflib.SequenceMatcher.ratio()` pairs.
- **Floating point:** Both use IEEE 754 doubles. Verify scores within +/-0.001 tolerance.
- **`\w` in normalizeToken:** Python `re.sub(r"[^\w\-]", "", cleaned, flags=re.UNICODE)` keeps Unicode letters; JS equivalent is `cleaned.replace(/[^\p{L}\p{N}_-]/gu, "")`.

## Estimated Test Count

~120-150 new tests across 12 test files, bringing the project total from 204 to ~320-350.
