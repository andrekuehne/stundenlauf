---
name: Matching GUI Overhaul
overview: Replace the side-by-side two-column matching review layout with a single unified comparison table. The incoming entry becomes a visually distinct header row; candidates appear as ranked rows below with per-field diff highlighting in red for mismatching values.
todos:
  - id: css-unified-table
    content: Replace two-column grid CSS with unified single-table layout, add .merge-diff-cell and .merge-incoming-separator styles
    status: completed
  - id: strings-update
    content: "Update strings.js: change reviewHintLeftRight, add incomingRangLabel, simplify section headings"
    status: completed
  - id: render-unified-table
    content: "Rewrite renderImportView merge-review section: single table with incoming row + candidate rows, shared columns"
    status: completed
  - id: diff-highlighting
    content: Add diffClass/diffClassYob helpers and apply red diff styling to candidate cells that differ from incoming
    status: completed
  - id: verify-interactions
    content: "Verify all review interactions still work: candidate selection, merge accept, new identity, skip"
    status: completed
  - id: accomplishments
    content: Update ACCOMPLISHMENTS.md and PROJECT_PLAN.md changelog
    status: completed
isProject: false
---

# Matching GUI Overhaul -- Unified Comparison Table

## Problem

The current review layout uses a **two-column grid** ([styles.css](frontend/styles.css) line 441-446, `.merge-review-layout`) with the incoming entry on the left and candidates on the right. This forces horizontal eye movement and uses **different column sets** for each side (incoming: Name, Club, Startnr, Wertung; candidates: Rang, Name, Club, Treffer%, Action), making visual comparison exhausting.

## Design

Replace with a **single stacked table** where:

1. **Row 0 (incoming)** -- visually prominent reference row with the incoming entry's Name (Jg.), Club, Startnr., and Wertung. Spans additional styling to make it the clear "anchor" the user compares against.
2. **Rows 1..N (candidates)** -- ranked by decreasing confidence. Same Name (Jg.) and Club columns, aligned directly beneath the incoming row for instant visual scanning. Additional columns for Rang, Treffer%, and a select/action button.
3. **Diff highlighting** -- for each candidate row, cells whose values differ from the incoming entry get a red-tinted background and red text. Matching values stay neutral. This is done via simple frontend string comparison (normalized, case-insensitive).

### Proposed Column Layout

| Column | Incoming Row | Candidate Rows |
|--------|--------------|----------------|
| Rang | -- (label: "Neu") | 1, 2, 3... |
| Name (Jg.) | incoming name + year | candidate name + year, **red if differs** |
| Verein | incoming club | candidate club, **red if differs** |
| Treffer % | -- or overall confidence | per-candidate confidence % |
| Startnr. | incoming startnr | -- (not applicable) |
| Wertung | incoming distance/points | -- (not applicable) |
| Aktion | -- | select button (checkbox/checkmark) |

### Visual Styling

- **Incoming row**: Keep existing `#eef6ff` blue background with `font-weight: 600`, add a thicker bottom border to visually separate it as the reference
- **Selected candidate row**: Keep existing `#e9f7ee` green background
- **Diff cells**: New CSS class `.merge-diff-cell` with `background: #fff0f0` (light red tint) and `color: #c0392b` (red text) to draw attention to mismatches
- **Match cells**: No special styling (inherit default) -- visually calm to let differences pop out
- **Confidence column**: Consider a subtle color gradient (green for high, yellow for medium, red for low) for at-a-glance confidence reading

### Hint Text Updates

- Remove the "Links sehen Sie... Rechts sehen Sie..." spatial hint (no longer applicable)
- Replace with: "Oben sehen Sie den eingehenden Eintrag. Darunter die vorhandenen Kandidaten in absteigender Treffersicherheit. Abweichende Felder sind rot hervorgehoben."

## Files to Change

### [frontend/app.js](frontend/app.js)

- **`renderImportView()`** (line ~1384-1419): Replace the two `<section class="merge-review-column">` blocks with a single `<table>` containing one incoming header row and candidate body rows
- **`renderIncomingTableRow()`** (line 1224): Adapt to new column layout (add Rang cell with "Neu" label, remove separate table wrapper)
- **`renderCandidateTableRows()`** (line 1233): Adapt to new column layout, add diff-detection logic per cell
- **New helper `diffClass(incoming, candidate)`**: Compare two string values (trimmed, lowercased) and return `"merge-diff-cell"` if they differ, empty string if they match. Apply to name and club cells.
- **New helper `diffClassYob(incomingYob, candidateYob)`**: Compare year-of-birth values numerically.

### [frontend/styles.css](frontend/styles.css)

- **Remove** `.merge-review-layout` two-column grid (line 441-446)
- **Remove** column-specific widths for `--incoming` and `--candidates` colgroups (line 470-497)
- **Add** unified `.merge-review-table--unified` column widths
- **Add** `.merge-diff-cell` styling (red tint background + red text)
- **Add** `.merge-incoming-separator` (thick bottom border on incoming row)
- **Adjust** `.merge-review-column` to be a single container (no grid)

### [frontend/strings.js](frontend/strings.js)

- **Update** `reviewHintLeftRight` to describe the new vertical layout with diff highlighting
- **Add** `incomingRangLabel` string: `"Neu"` (label shown in Rang column for incoming row)
- **Remove or simplify** `incomingHeading` / `candidatesHeading` (no longer separate sections)

### Backend -- No changes required

The `get_review_queue` API already provides all necessary data: `entry_preview`, `candidate_previews` (with `display_name`, `yob`, `club` per candidate), `candidate_confidences`, and `startnr`/`result_preview` for the incoming entry.

## Interaction Model (unchanged)

- Click select button on a candidate row to choose it
- "Mit ausgewaehlter Person/Team zusammenfuehren" to accept
- "Keine passt: neue Person anlegen" to create new
- "Ueberspringen" to skip
- Action buttons remain above the table for easy access

## Risks and Mitigations

- **Narrow screens**: The unified table has 7 columns. Mitigation: Startnr. and Wertung are narrow; use `table-layout: fixed` with tight widths. Consider collapsing Startnr + Wertung into a single "Info" column if space is tight.
- **Teams (Paarlauf)**: Names are joined with " / " and can be long. Mitigation: Already handled by `overflow-wrap: break-word`; no regression expected.
- **Empty candidate list**: Already handled by colspan row "Keine Kandidaten vorhanden" -- just update colspan count from 5 to 7.
