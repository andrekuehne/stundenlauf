---
name: GUI strings catalog
overview: Introduce a single frontend module ([frontend/strings.js](frontend/strings.js)) that holds all German end-user copy for the pywebview UI, wire [frontend/index.html](frontend/index.html) and [frontend/app.js](frontend/app.js) to use it, and document the change under F05/R8 with manual verification.
todos:
  - id: add-strings-module
    content: Add frontend/strings.js with nested UIStrings + format helpers (shell, seasonEntry, standings, import, history, status, errors/confirms).
    status: completed
  - id: wire-html-shell
    content: "Update index.html: load strings.js before app.js; ensure shell chrome is applied from strings (applyShellChrome at start of app.js)."
    status: completed
  - id: refactor-app-js
    content: Replace inline German in app.js with UIStrings and formatters; keep API/rationale English; move confidence words to strings.
    status: completed
  - id: docs-accomplishments
    content: Document catalog in F05 feature doc + ACCOMPLISHMENTS entry.
    status: completed
  - id: manual-smoke
    content: "Manual GUI smoke: season workflow, tabs, standings, import/review, history rollback."
    status: completed
isProject: false
---

# Centralized GUI string catalog (frontend only)

## Goal and scope

- **Goal:** One file you can open to review or change **all German text shown in the desktop GUI** (requirement **R8**, feature **[F05](docs/features/F05-german-ui-and-review-workflow.md)**).
- **In scope:** [frontend/index.html](frontend/index.html), [frontend/app.js](frontend/app.js), new [frontend/strings.js](frontend/strings.js).
- **Out of scope:** Python ([backend/ui_app.py](backend/ui_app.py) window title / file dialog), API [`details.message`](backend/ui_api/errors.py) text, and [backend/ui_api/mappers.py](backend/ui_api/mappers.py) category labels. Those stay as-is unless you explicitly want a follow-up to align server-originated copy.

## Current state (baseline)

- Shell copy lives in **HTML** (title, `h1`, tabs, initial header spans).
- Almost everything else is **inline literals** in **app.js**: `innerHTML` templates, `setStatus`, `confirm`/`prompt`, placeholders, table headers, sidebar headings, import/review/history copy, `getApiErrorMessage` overrides, category quick-pick labels (`"1/2 h - M"`, …), confidence buckets (`hoch` / `mittel` / `niedrig`), and matrix row labels (`Einzel` / `Paare`).
- **No bundler:** vanilla scripts loaded via `<script src="...">` ([index.html](frontend/index.html) line 38).

## Design

### 1. New module: `frontend/strings.js`

- Export a **single global object** (e.g. `window.UIStrings` or `var UIStrings`) so you do **not** need ES modules or a build step—only add a second script tag **before** `app.js`.
- Organize by **screen/concern** (flat enough to grep, nested enough to navigate):

  - `shell` — app title, tab labels, switch-season, default header labels.
  - `status` — default ready text, the `"Status: …"` prefix pattern, and every string passed to `setStatus` (errors and success).
  - `seasonEntry` — hints, table headers, buttons, create form, loading/error blocks, delete `confirm`/`prompt` text, fallbacks when API returns errors.
  - `standings` — sidebar headings (`Importierte Läufe`, `Einzel`, `Paare`), empty states, table headers (`Platz`, `Name`, …), “Aktuelle Wertung” hints, load error.
  - `categorySlots` — the fixed quick-select labels for the 10 slot definitions (today in `buildQuickSelectModel` / related arrays).
  - `import` — file row, placeholders, type toggle, race number, inference lines (`Erkannt: …`, `Keine Erkennung …`), matching panel labels, review table copy, buttons, `setStatus` messages for import/match actions.
  - `history` — page title, hint, table headers, empty row, rollback `confirm`, success status.
  - `dialogs` / `errors` — centralize the two long strings in `getApiErrorMessage` plus generic fallbacks (`Desktop-API nicht verfügbar`, etc.).

- **Dynamic text:** implement as **small functions** next to the object (same file), e.g. `formatSeasonLabel(year)`, `formatReviewOpen(count)`, `formatStatusLine(message)`, `formatDeleteSeasonWarning(year)`, `formatReviewProgress(index, total)`, `formatRollbackConfirm(count)`, so translators/editors see the full sentence pattern in one place. Keep **technical tokens** (e.g. `"km"`, `"P"`, `"Jg."**) either in those formatters or in a `units` subsection.

- **Confidence:** keep the numeric thresholds in `app.js` (`confidenceLabel`), but move the three returned words (`hoch` / `mittel` / `niedrig`) into `strings.js` (e.g. `confidence.high` / `.medium` / `.low`) so wording changes do not touch logic.

### 2. Wire `index.html`

- Add: `<script src="./strings.js"></script>` **before** `<script src="./app.js"></script>`.
- **Single source for shell chrome:** at the very start of the IIFE in `app.js`, call something like `applyShellChrome(UIStrings)` that sets:
  - `document.title`
  - `document.querySelector("h1")` (or give `h1` an `id` if needed)
  - each tab button’s `textContent` (query `.tab[data-view]` and `#switchSeasonBtn`)
  - `#seasonLabel` and `#reviewLabel` initial text (or match current defaults)

This avoids maintaining German in both HTML and `strings.js` for the header/tabs.

### 3. Refactor `app.js`

- Replace **every user-visible German literal** with `UIStrings…` references or the small formatters from `strings.js`.
- Preserve behavior: no API contract changes, no selector/`data-*` attribute changes except where needed for `applyShellChrome` (minimal).
- **`getApiErrorMessage`:** read the two code-specific overrides from `UIStrings.errors` (or `dialogs.apiErrors`).
- **Matrix / imported runs:** move `"x"` / `"—"` display characters if they are considered copy (or leave as symbols in a `symbols` key).
- **Rationale strings** passed to `api(..., { rationale: "..." })** — these are **not** user-visible; leave in English in `app.js` per [PROJECT_PLAN.md](PROJECT_PLAN.md) (“implementation … remain English”).

### 4. Documentation and completion checklist

Per [.cursor/rules/project-workflow.mdc](.cursor/rules/project-workflow.mdc):

- Add a short subsection to [docs/features/F05-german-ui-and-review-workflow.md](docs/features/F05-german-ui-and-review-workflow.md) describing the `strings.js` catalog and the rule: **German UI copy lives in `frontend/strings.js`;** `app.js` holds logic and English identifiers.
- Add an outcome-focused entry to [docs/ACCOMPLISHMENTS.md](docs/ACCOMPLISHMENTS.md).
- [PROJECT_PLAN.md](PROJECT_PLAN.md): optional one-line note under Current Phase / delivery if you track copy-hardening there; otherwise accomplishments alone is enough.

### 5. Testing

- No dedicated frontend test harness in-repo was found; **manual smoke** after change:
  - Launch GUI (`uv run python main.py --gui` or your usual path), verify season list/create/delete, open season, three tabs, standings with/without data, import flow + review block text, history rollback confirm.
  - Quick grep: ensure no accidental leftover German literals in `app.js` (optional sanity check).

## Risk and mitigation

| Risk | Mitigation |
|------|------------|
| Large touch surface in `app.js` | One focused PR; replace by section (shell → season → standings → import → history); run smoke after each chunk if preferred. |
| Typos in template strings | Prefer format functions over many concatenations; keep `${}` placeholders minimal. |
| Flash of wrong language on load | Run `applyShellChrome` as first step in `app.js` IIFE (before other UI); optional `lang` on `<html>` already `de`. |

## Files to add/change

| Action | File |
|--------|------|
| Add | [frontend/strings.js](frontend/strings.js) |
| Edit | [frontend/index.html](frontend/index.html) — script order; optional strip duplicate text if fully driven by `applyShellChrome` |
| Edit | [frontend/app.js](frontend/app.js) — consume `UIStrings` / formatters throughout |
| Edit | [docs/features/F05-german-ui-and-review-workflow.md](docs/features/F05-german-ui-and-review-workflow.md) |
| Edit | [docs/ACCOMPLISHMENTS.md](docs/ACCOMPLISHMENTS.md) |
