---
name: clarify-match-review-flow
overview: Clarify the merge-review workflow so users understand that candidate selection links to an existing identity, while creating a new identity duplicates the incoming entry as a new participant/team.
todos:
  - id: clarify-review-copy
    content: Revise German helper text in frontend review section to explicitly explain left=incoming, right=existing candidates.
    status: completed
  - id: rename-review-actions
    content: Rename review action buttons to unambiguous intent-focused labels without changing backend behavior.
    status: completed
  - id: add-inline-decision-note
    content: Add one concise explanatory note near action buttons clarifying link-vs-new semantics.
    status: completed
  - id: verify-review-flows
    content: Run manual GUI checks for both actions and confirm no API/behavior regression.
    status: completed
  - id: update-project-docs
    content: Record outcome in ACCOMPLISHMENTS and PROJECT_PLAN changelog if scope accepted.
    status: completed
isProject: false
---

# Clarify Review Workflow Semantics

## Goal
Remove ambiguity in the review step by making the two actions explicit:
- **Link to existing identity** (right table selection)
- **Create a new identity despite suggestions** (left incoming entry)

This supports requirement **R6** (interactive review override) and keeps F05 German UX understandable for non-technical users.

## Current Behavior (to preserve)
- Review rows are generated only when `match_meta.route == "review"` in [C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/queries.py](C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/queries.py).
- Right table displays `candidate_uids` / `candidate_previews` (existing DB identities), ordered best-first.
- `Als bestehende Person übernehmen` applies `manual_link` to selected candidate.
- `Als neue Person anlegen` calls `decision_action: "create_new_identity"`, creating a new identity from the incoming entry snapshot in [C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/commands.py](C:/Users/andre/VSCode_Projects/stundenlauf/backend/ui_api/commands.py).

## Clarification Changes
- Update review helper copy in [C:/Users/andre/VSCode_Projects/stundenlauf/frontend/app.js](C:/Users/andre/VSCode_Projects/stundenlauf/frontend/app.js):
  - Explicitly state: right side are **existing persons/teams already in the dataset**.
  - Explicitly state: creating a new identity is for the case “none of these candidates is the same real person/team”.
- Rename button labels to reduce cognitive overlap:
  - `Als bestehende Person übernehmen` -> `Mit ausgewählter Person zusammenführen`
  - `Als neue Person anlegen` -> `Keine passt: neue Person anlegen`
- Add a short inline note above action buttons:
  - “Auswahl rechts verknüpft mit bestehender Person; neue Person legt einen zusätzlichen Datensatz an.”
- Keep backend command names/API unchanged (copy-only UX clarification, no behavior change).

## Validation
- Manual smoke test in GUI review screen:
  - Scenario A: choose candidate from right table -> confirm entry links to existing identity and queue item disappears.
  - Scenario B: click new-identity action -> confirm new identity is created and queue item disappears.
- Confirm no API contract changes needed in [C:/Users/andre/VSCode_Projects/stundenlauf/docs/api/ui-api-v1.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/api/ui-api-v1.md).

## Docs/Tracking
- Add a brief note in [C:/Users/andre/VSCode_Projects/stundenlauf/docs/ACCOMPLISHMENTS.md](C:/Users/andre/VSCode_Projects/stundenlauf/docs/ACCOMPLISHMENTS.md) once implemented.
- If accepted as F05 UX hardening, add a progress note in [C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md](C:/Users/andre/VSCode_Projects/stundenlauf/PROJECT_PLAN.md) changelog.
