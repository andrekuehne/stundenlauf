# Feature Plan: Import review — merge and correct identity

## Overview

- Feature name: Import review merge with canonical identity correction
- Status: Implemented
- Related requirement(s): R6, R8
- Related milestone(s): M5
- Depends on: [F09 Canonical identity correction](F09-canonical-identity-correction.md), [F05 German UI](F05-german-ui-and-review-workflow.md), [F17 Merge review display](F17-merge-review-display-polish.md) (optional; comparison uses previews)

## Problem Statement

During **Lauf importieren** review, operators compare the incoming Excel row with ranked candidates. They often see typos in the canonical record or wish to align name/year/club before finishing. Standings-driven correction (F10) is the wrong screen; they need one action on the import review table.

## Scope

### In scope

- New button **Zusammenführen und Daten korrigieren** next to the existing accept / new-identity actions on the import review card.
- Reuse `#identityCorrectionModal`: read-only side-by-side comparison (incoming vs selected candidate), editable fields prefilled from the **existing** canonical candidate, single primary **Zusammenführen und speichern**.
- Submit sequence: `apply_match_decision` (`link_existing`) then one or more `update_participant_identity` calls only when edited values differ from the initial snapshot (reduces redundant audit rows).
- **Couples:** `apply_match_decision` must use `target_team_uid` when the selected candidate is a team; the plain accept button uses the same rule (fixes incorrect `target_participant_uid` for Paarlauf).

### Out of scope

- Atomic single backend transaction combining link + identity.
- **Neue Person anlegen** combined with correction in one dialog.

## Risks

- If linking succeeds but identity update fails, the entry is already linked; operator can correct via **Aktuelle Wertung** (F10) or repeat from standings context.

## Test plan

- API: `test_apply_match_decision_team_review_uses_target_team_uid` in `tests/test_f08_ui_api.py`.
- Manual: open review item, choose candidate, open merge+correct, edit YOB, save; queue advances and standings reflect corrected canonical fields.

## Definition of done

- [x] GUI + strings + minimal CSS
- [x] Regression test for `target_team_uid` on team review
- [x] API doc note and accomplishments entry
