---
name: F05 Merge Table UX
overview: "Redesign the merge review UI into a simple two-column, human-readable table: incoming participant on the left and ranked existing candidates on the right, with clear guidance and actions to select a candidate or create a new participant."
todos:
  - id: audit-merge-ui
    content: Review current merge UI render path and identify replacement points for two-column table layout.
    status: completed
  - id: build-two-column-ux
    content: Implement incoming-left/candidates-right table with clear German guidance and explicit actions.
    status: completed
  - id: align-api-payload
    content: Adjust review queue/decision payloads only as needed for readable fields and explicit new-participant action.
    status: completed
  - id: verify-tests
    content: Run and update API/frontend checks for ranking order, action flow, and regression behavior.
    status: completed
  - id: update-doc-tracking
    content: Update feature docs, accomplishments, and project plan progress entries tied to R6/R8 and M4/M5.
    status: completed
isProject: false
---

# Merge Review Table Redesign Plan

## Scope And Requirement Mapping
- Supports `R6` (interactive review/override before merge) and `R8` (clear German GUI wording), within milestone `M4` and validation expectations of `M5`.
- In-scope: import-review screen UX for unresolved participant matches.
- Out-of-scope for this increment: full field-level merge editor (left/right/manual per field).

## Current Baseline
- Existing review is a card/list flow in [C:/Users/andre/VSCode_Projects/stundenlauf/frontend/app.js](C:/Users/andre/VSCode_Projects/stundenlauf/frontend/app.js) and [C:/Users/andre/VSCode_Projects/stundenlauf/frontend/index.html](C:/Users/andre/VSCode_Projects/stundenlauf/frontend/index.html).
- Match ranking already exists in backend scoring/workflow: [C:/Users/andre/VSCode_Projects/stundenlauf/backend/matching/workflow.py](C:/Users/andre/VSCode_Projects/stundenlauf/backend/matching/workflow.py) and [C:/Users/andre/VSCode_Projects/stundenlauf/backend/matching/score.py](C:/Users/andre/VSCode_Projects/stundenlauf/backend/matching/score.py).
- Review queue payload currently exposed via [C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/queries.py](C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/queries.py).

## UX Design (Simple And Clear)
- Two-column table layout:
  - Left: exactly one incoming participant row with human-readable fields (e.g. `Name`, `Verein`, optional `Jahrgang`, race context).
  - Right: candidate rows sorted by likelihood descending (top first), each with same comparable fields.
- German guidance copy above actions:
  - Explain user task in one sentence (e.g. choose best match or mark as new participant).
  - Explain confidence in plain language (`hoch/mittel/niedrig`) plus short helper text.
- Action model per incoming participant:
  - `Als bestehende Person übernehmen` (selected candidate).
  - `Als neue Person anlegen` (explicit no-match path).
  - `Überspringen` (optional, keeps item unresolved for later pass).
- Visual clarity:
  - Emphasize incoming row as reference record.
  - Use row highlight for selected candidate.
  - Remove technical UID display from end-user view.

## Implementation Steps
1. **Frontend structure and rendering**
   - Update [C:/Users/andre/VSCode_Projects/stundenlauf/frontend/index.html](C:/Users/andre/VSCode_Projects/stundenlauf/frontend/index.html) with a dedicated table container for merge review.
   - Refactor relevant render path in [C:/Users/andre/VSCode_Projects/stundenlauf/frontend/app.js](C:/Users/andre/VSCode_Projects/stundenlauf/frontend/app.js):
     - render incoming record block,
     - render sorted candidate table,
     - wire explicit actions (choose candidate vs create new).
   - Adjust styling in [C:/Users/andre/VSCode_Projects/stundenlauf/frontend/styles.css](C:/Users/andre/VSCode_Projects/stundenlauf/frontend/styles.css) for readable table hierarchy and selected-state clarity.

2. **API payload tuning for readability (if needed)**
   - Extend/normalize review payload in [C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/queries.py](C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/queries.py) to provide display-ready labels/fields (German-friendly field names handled in frontend copy).
   - Keep backend ranking source unchanged unless gaps are found; preserve descending likelihood ordering from matching workflow.

3. **Decision command handling**
   - Verify `apply_match_decision` contract in [C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/commands.py](C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/commands.py) supports explicit “new participant” decision cleanly from UI.
   - Add/adjust request validation only if the new explicit action requires a distinct decision value.

4. **Copy and guidance pass (German UX)**
   - Replace ambiguous/technical texts in merge view with concise `Sie`-form instructions.
   - Add short contextual helper text near confidence and action buttons.

## Risks And Mitigations
- **Risk:** Too much information in table hurts readability.
  - **Mitigation:** limit to core differentiators (Name, Verein, Jahrgang, optional last-known context), hide secondary details behind subtle secondary text.
- **Risk:** Existing API shape may be coupled to old card UI.
  - **Mitigation:** add backward-compatible fields first; migrate UI rendering; remove old fields only after tests pass.
- **Risk:** Users may misinterpret confidence.
  - **Mitigation:** use language tiers (`hoch/mittel/niedrig`) with one-line explanation instead of raw percentage alone.

## Test Plan
- Backend/API tests (extend existing UI API tests):
  - review queue delivers candidates in descending likelihood,
  - decision payload accepts candidate selection and explicit new-participant path,
  - import->review->apply updates standings as expected.
- Frontend behavior checks (targeted tests/manual QA):
  - incoming row is always visible and distinct from candidates,
  - selecting a candidate changes active state clearly,
  - “new participant” action proceeds without candidate selection,
  - German guidance text appears and is understandable.
- Regression checks:
  - rollback/reimport flow remains intact,
  - no UID shown in merge UI.

## Documentation And Project Tracking
- Update feature doc: [C:/Users/andre/VSCode_Projects/stundenlauf/docs/features/F05-german-ui-and-review-workflow.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/features/F05-german-ui-and-review-workflow.md).
- Add outcome entry to [C:/Users/andre/VSCode_Projects/stundenlauf/docs/ACCOMPLISHMENTS.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/ACCOMPLISHMENTS.md).
- Update progress notes in [C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md](C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md) if milestone/requirement status advances.