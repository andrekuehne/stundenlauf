# Accomplishments Log

Track meaningful project progress here. Prefer outcomes over low-level task activity.

## Entry Template

Copy this block for each notable accomplishment:

```md
### YYYY-MM-DD - Short accomplishment title
- Requirement/Milestone: [R# or M#]
- What shipped: one sentence
- Evidence: PR/commit/release/test link or ID
- Impact: metric movement, user value, or reliability gain
- Follow-up: optional next step
```

## Entries

### 2026-04-12 - Compact PDF preset: portrait, minimal margins, denser table rows
- Requirement/Milestone: [R5, R7; M5 / F20]
- What shipped: `layout_preset: compact` now targets **minimum page count**: A4 **portrait**, ~0.45 cm page margins, small section/cover/footer typography, **5 pt** table type with **`table_plain_leading_extra_pt` 1** so line height clears horizontal rules, **`lauf_result_leading_extra_pt` 0**, tight cell padding, **narrower** km/Pkt./Punkte/km totals so **Name & Verein** flex wider, reduced `table_width_extra_margin_cm`, and configurable **`table_cell_*_padding_pt`** on all tables. GUI Laufübersicht uses **portrait when compact** is selected (default export stays landscape).
- Evidence: `backend/export/spec.py` (`PDF_LAYOUT_PRESETS["compact"]`, new padding fields on `PdfStyleSpec`), `backend/export/pdf_layout_tokens.py`, `backend/export/pdf_renderer.py`, `backend/export/gui_pdf_spec.py`, `docs/api/ui-api-v1.md`, `tests/test_f20_export.py`; `uv run pytest`
- Impact: Organizers who pick **Kompakt** get fewer printed pages at the cost of readability.
- Follow-up: none

### 2026-04-12 - PDF export: centralized layout tokens and named layout presets
- Requirement/Milestone: [R5, R7; M5 / F20]
- What shipped: Visual PDF parameters (margins, section/cover typography, logo size, table line weights, Laufübersicht colors, column width scale, zebra/podium RGB) live on `PdfStyleSpec` and resolve through `backend/export/pdf_layout_tokens.py` for `pdf_renderer`. Export JSON may set `pdf.layout_preset` (`default`, `compact`, …) merged with per-export overrides; `laufuebersicht_result_font_extra_pt` now scales Laufübersicht body/result text.
- Evidence: `backend/export/pdf_layout_tokens.py`, `backend/export/spec.py` (`PDF_LAYOUT_PRESETS`), `backend/export/pdf_renderer.py`, `tests/test_f20_export.py`; `uv run pytest`
- Impact: Organizers can add or switch print styles without touching projection or table data; defaults match the previous hard-coded look.
- Follow-up: none

### 2026-04-12 - Desktop GUI: PDF layout preset for Laufübersicht export
- Requirement/Milestone: [R5, R8; M5 / F20]
- What shipped: **Aktuelle Wertung** sidebar **Export** includes a **PDF-Layout** dropdown (German labels from `pdf_layout_preset_catalog`); choice is persisted in `localStorage` and passed as `layout_preset` to `export_standings_pdf`. New API `list_pdf_export_layout_presets` returns the catalog; `gui_pdf_spec` threads the preset into both Einzel/Paare specs.
- Evidence: `backend/export/spec.py` (`pdf_layout_preset_catalog`, `PDF_LAYOUT_PRESET_LABELS_DE`), `backend/export/gui_pdf_spec.py`, `backend/ui_api/service.py`, `frontend/app.js`, `frontend/strings.js`, `frontend/styles.css`, `docs/api/ui-api-v1.md`, `tests/test_f08_ui_api.py`; `uv run pytest`
- Impact: Organizers pick a print style in-app without editing JSON or CLI.
- Follow-up: Optional advanced panel for raw layout fields if needed later.

### 2026-04-11 - GUI Laufübersicht: dual PDF (Einzel/Paare), continuous numbering, save-dialog filters
- Requirement/Milestone: [R5, R7; M5]
- What shipped: `export_standings_pdf` writes `{base}_einzel.pdf` and `{base}_paare.pdf` from a user-chosen base path; Paare section titles continue the Einzel numbering; year + Hinweis appear on both; first category table follows the Hinweis on the same page (no forced page break after the cover). `pick_save_file` accepts `dialog_kind` (`season_zip` vs `pdf`) so the season export keeps a `.zip` filter and the PDF flow uses PDF / all-files filters. API returns `export_files` plus total `bytes_written`.
- Evidence: `backend/export/gui_pdf_spec.py`, `backend/export/spec.py` (`split_category_keys_einzel_paare`, `laufuebersicht_section_number_start`), `backend/ui_api/service.py`, `backend/ui_app.py`, `frontend/app.js`, `docs/api/ui-api-v1.md`, `tests/test_f08_ui_api.py`, `tests/test_f20_export.py`; `uv run pytest tests/test_f08_ui_api.py tests/test_f20_export.py`
- Impact: Organizers get separate printouts for singles and couples without resetting section numbers; file dialogs match the export type.
- Follow-up: none

### 2026-04-11 - F20 Laufübersicht PDF: cover page, numbered sections, board styling
- Requirement/Milestone: [R5, R7; M5]
- What shipped: Laufübersicht PDF opens with a **cover** (large blue calendar year, centered **Hinweis** with Pokal-/Gesamtwertung copy, then page break). Per-category titles default to **export order numbering** plus `Halbstundenlauf/Stundenlauf - {division}` (`pdf.title` still overrides all sections). Tables use a **green-tint** header block, **red** top-row run/Gesamt labels, **double** rule below the header, **thick** vertical after Verein, **dashed** verticals between Str./Wertung pairs, **double** vertical before Gesamt, and **blue** podium row tint. Optional `pdf.laufuebersicht_show_cover` / `pdf.laufuebersicht_notice` in `PdfStyleSpec`.
- Evidence: `backend/export/pdf_renderer.py`, `backend/export/projection.py`, `backend/export/spec.py`, `backend/standings_display.py`, `tests/test_f20_export.py`, `docs/features/F20-standings-multi-format-export.md`; `uv run pytest`
- Impact: Printed Laufübersicht matches organizer-facing bulletin styling expectations.
- Follow-up: none

### 2026-04-11 - F20 Laufübersicht PDF: three-row run headers (Laufstr. / Wertung / units)
- Requirement/Milestone: [R5, R7; M5]
- What shipped: Laufübersicht PDF/CSV header is three rows: merged Platz/Name/Verein; per run and Gesamt a spanned `n. Lauf` / `Gesamt` label over **Laufstr.** | **Wertung** and **(km)** | **(Punkte)**; PDF vertical spans use middle alignment for merged header cells.
- Evidence: `backend/export/projection.py`, `backend/export/pdf_renderer.py`, `tests/test_f20_export.py`; `uv run pytest tests/test_f20_export.py`
- Impact: Run columns read clearly as distance vs scoring at a glance.
- Follow-up: none

### 2026-04-11 - F20 Laufübersicht PDF: split Str. (km) / Pkt. columns
- Requirement/Milestone: [R5, R7; M5]
- What shipped: Laufübersicht export uses separate **Str. (km)** and **Pkt.** columns per race and for Gesamt (equal fixed widths); **Pkt.** body text is bold; top header row spans each Lauf/Gesamt over both subcolumns; projection defers `ranking_display` import to avoid export↔`ui_api` circular imports on test collection.
- Evidence: `backend/export/projection.py`, `backend/export/pdf_renderer.py`, `backend/export/spec.py`, `tests/test_f20_export.py`; `uv run pytest tests/test_f20_export.py`
- Impact: Printed overview matches the emphasis on points as the ranking criterion; layout uses width from the former combined race columns.
- Follow-up: none

### 2026-04-11 - F22 Windows PyInstaller onedir build + bootloader splash
- Requirement/Milestone: [R7, R8; M5]
- What shipped: `win_bundle/stundenlauf_windows.spec` and `win_bundle/gui_entry.py` produce `win_bundle/dist/Stundenlauf/Stundenlauf.exe` (onedir); frozen `project_root_dir()` uses `sys._MEIPASS`; `pyi_splash.close()` on pywebview `loaded`; `dependency-groups` dev includes PyInstaller; README build instructions; feature plan `docs/features/F22-windows-pyinstaller-packaging.md`.
- Evidence: `backend/app_paths.py`, `backend/ui_app.py`, `win_bundle/stundenlauf_windows.spec`, `tests/test_app_paths_frozen.py`; `uv run pytest tests/test_app_paths_frozen.py`; `uv run pyinstaller --workpath win_bundle/build --distpath win_bundle/dist win_bundle/stundenlauf_windows.spec`
- Impact: Organizers can run the desktop app without a Python install; splash covers cold start while the WebView loads.
- Follow-up: optional onefile spec, installer, CI, code signing

### 2026-04-11 - F20 GUI: Laufübersicht PDF export from Aktuelle Wertung
- Requirement/Milestone: [R5, R7, R8; M4, M5]
- What shipped: UI API `export_standings_pdf` writes the playground-equivalent Laufübersicht PDF for the active season; **Aktuelle Wertung** sidebar **Export** section with “Laufübersicht als PDF speichern” (`pick_save_file` + export). Shared spec builder `backend/export/gui_pdf_spec.py`.
- Evidence: `backend/export/gui_pdf_spec.py`, `backend/ui_api/service.py`, `docs/api/ui-api-v1.md`, `frontend/app.js`, `frontend/strings.js`, `tests/test_f08_ui_api.py`; `uv run pytest tests/test_f08_ui_api.py -k export_standings_pdf`
- Impact: Organizers can save the multi-category overview PDF without leaving the desktop app.
- Follow-up: optional CSV or per-category export from the same section

### 2026-04-11 - F20 PDF: Laufübersicht table layout (per-race km/Pkt, team split rows)
- Requirement/Milestone: [R5, R7; M5]
- What shipped: `pdf.table_layout: laufuebersicht` with `columns: ["laufuebersicht_board"]` builds a two-row grouped header, **Str. (km)** / **Pkt.** columns per race and Gesamt (see newer entry for split-column detail), `Name (Jg.)` for eligible rows, and two PDF body rows per team with ReportLab `SPAN` on Platz and numeric columns; CSV duplicates team numerics on the second line. Optional `pdf.table_font_size` / `table_header_font_size` override layout defaults (7/8 pt).
- Evidence: `backend/export/spec.py`, `backend/export/projection.py`, `backend/export/pdf_renderer.py`, `backend/export/csv_renderer.py`, `tests/test_f20_export.py`, `scripts/pdf_export_playground.py`; `uv run pytest tests/test_f20_export.py`
- Impact: Printable race overview closer to GUI “Aktuelle Wertung” while respecting eligible-only (non–a.W.) export semantics.
- Follow-up: none

### 2026-04-11 - Merge review GUI: club display uses no-affiliation normalization
- Requirement/Milestone: [R6, R8; M4]
- What shipped: `get_review_queue` previews and granular `candidate_review_displays` normalize club strings (including Paarlauf `a / b`) so punctuation-only values show like empty; `optional_club_composite_from_field` in `backend/domain/club.py`.
- Evidence: `backend/domain/club.py`, `backend/ui_api/queries.py`, `backend/matching/review_display.py`, `tests/test_domain_club.py`, `tests/test_match_review_display.py`; `uv run pytest`
- Impact: Import **Zusammenführungen prüfen** table matches incoming vs candidates without noisy `'-` / `-` club diffs.
- Follow-up: none

### 2026-04-11 - Club no-affiliation normalization (import + identity)
- Requirement/Milestone: [R1, R4; M2, M5]
- What shipped: `optional_club_from_cell` in `backend/domain/club.py` maps empty and punctuation-only Verein strings (including `-`, `'-`, en-dash, underscores) to `None`; wired into Excel singles/couples adapters, `person_with_updated_identity`, and UI API review identity rebuild helpers. Matching unchanged (empty `club_normalized` vs empty).
- Evidence: `backend/domain/club.py`, `backend/ingestion/adapters/singles.py`, `backend/ingestion/adapters/couples.py`, `backend/domain/identity.py`, `backend/ui_api/commands.py`, `docs/features/club-no-affiliation-normalization.md`, `tests/test_domain_club.py`; `uv run pytest`
- Impact: Fewer spurious club mismatches and cleaner stored identities for “no club” rows.
- Follow-up: none

### 2026-04-11 - F20 Standings export (PDF + CSV, declarative spec)
- Requirement/Milestone: [R5, R7; M5]
- What shipped: Backend `backend/export` builds format-agnostic sections from `ProjectDocument` / session JSON with `ExportSpec` (categories, columns/presets, F15 `eligible_only`/`full_grid`, race filter `all_active` / `race_event_uids` / `up_to_race_no`, embedded vs live snapshot). ReportLab PDF (landscape, repeated headers, ruleset/timestamp footer) and UTF-8 CSV reuse the same projection. Shared `build_standings_rows_for_category` in `backend/standings_view.py` with display helpers in `backend/standings_display.py` to match `get_standings` without import cycles. CLI: `uv run python -m backend.export`.
- Evidence: `backend/export/*`, `backend/standings_view.py`, `backend/standings_display.py`, `backend/ui_api/mappers.py`, `backend/ui_api/queries.py`, `backend/ui_api/commands.py`, `tests/test_f20_export.py`, `pyproject.toml` (pypdf); `uv run pytest`
- Impact: Organizers can produce printable/shareable standings files locally; mid-season exports use race-scoped recompute on an ephemeral document.
- Follow-up: GUI/API bridge (`export_standings` in ui-api) optional in F20b.

### 2026-04-11 - Historie: human-readable identity merge & correction details
- Requirement/Milestone: [R6, R8; M5]
- What shipped: `MatchingDecision.identity_timeline` stores display snapshots at merge/correction time; `get_year_timeline` / `get_audit_timeline` expose `identity_timeline`; **Historie** renders multi-line German-labeled survivor/absorbed and vorher/nachher with UID fallback for older data.
- Evidence: `backend/domain/models.py`, `backend/storage/schema_v2.py`, `backend/ui_api/commands.py`, `backend/ui_api/queries.py`, `frontend/app.js`, `frontend/strings.js`, `frontend/styles.css`, `docs/api/ui-api-v1.md`, `tests/test_f08_ui_api.py`; `uv run pytest`
- Impact: Operators can interpret audit rows without decoding UIDs alone.
- Follow-up: none

### 2026-04-11 - Import tab: block new file import while merge reviews are open
- Requirement/Milestone: [R6, R8; M5]
- What shipped: On **Lauf importieren**, **Datei auswählen**, Einzel/Paar, Laufnummer and **Lauf importieren** stay disabled until the review queue from `get_review_queue` is empty; a short hint explains why.
- Evidence: `frontend/app.js`, `frontend/strings.js`; `uv run pytest tests/test_f08_ui_api.py` (unchanged contract)
- Impact: Operators finish identity merge decisions before stacking another import.
- Follow-up: none

### 2026-04-11 - F19 Import review: merge and correct canonical identity
- Requirement/Milestone: [R6, R8; M5]
- What shipped: On **Lauf importieren** review, **Zusammenführen und Daten korrigieren** opens a comparison + edit dialog (reuse of the identity modal), then runs `apply_match_decision` and conditional `update_participant_identity` for changed fields. The standard accept button now sends `target_team_uid` for Paarlauf candidates instead of misusing `target_participant_uid`.
- Evidence: `frontend/app.js`, `frontend/strings.js`, `frontend/styles.css`, `docs/api/ui-api-v1.md`, `docs/features/F19-import-merge-with-identity-correction-ui.md`, `tests/test_f08_ui_api.py`; `uv run pytest tests/test_f08_ui_api.py`
- Impact: Operators can fix typos while seeing incoming vs existing data; couples review linking is API-correct.
- Follow-up: optional `window.confirm` before link+correct if operators want an extra safety step.

### 2026-04-10 - F17 Import merge review granular diffs + couple alignment
- Requirement/Milestone: [R6, R8; M5]
- What shipped: Display-only helpers build `candidate_review_displays[]` on `get_review_queue`: Paarlauf candidates can reorder members for comparison when the swapped pairing scores higher; name/YOB/club mismatches are exposed as per-fragment `diff` flags. The import review table renders inline highlights (`.merge-diff-part`) instead of coloring whole cells, with fallback to the previous behavior if hints are absent.
- Evidence: `backend/matching/review_display.py`, `backend/ui_api/queries.py`, `docs/api/ui-api-v1.md`, `frontend/app.js`, `frontend/styles.css`, `docs/features/F17-merge-review-display-polish.md`, `tests/test_match_review_display.py`, `tests/test_f08_ui_api.py`; `uv run pytest`
- Impact: Faster visual scanning during import review; swapped Excel member order no longer obscures a good team match.

### 2026-04-10 - F16 Standings manual duplicate merge (Einzel/Paar)
- Requirement/Milestone: [R3, R6, R8; M5]
- What shipped: Operators can merge two duplicate `Person` or `Couple` identities from **Laufübersicht** when they have no overlapping races in the category: `merge_standings_entities` rewires entries, remaps audit targets, prunes orphans, applies conservative **Außer Wertung** carry-over, appends `identity_merge` decisions (`merged_absorbed_uid`), and recomputes standings. GUI merge mode (mutually exclusive with identity correction), Historie table for `identity_merge` / `identity_correction`, and timeline payload fields for audit UIDs.
- Evidence: `backend/domain/identity_merge.py`, `backend/domain/models.py`, `backend/storage/schema_v2.py`, `backend/ui_api/commands.py`, `backend/ui_api/service.py`, `backend/ui_api/ranking_display.py`, `backend/ui_api/queries.py`, `frontend/app.js`, `frontend/strings.js`, `frontend/styles.css`, `docs/api/ui-api-v1.md`, `docs/features/F16-standings-manual-duplicate-merge.md`, `tests/test_f16_identity_merge.py`, `tests/test_f08_ui_api.py`, `tests/test_f15_ranking_display.py`; `uv run pytest`
- Impact: Fixes split canonical identities after import without Excel surgery; safe guard on same-Lauf overlap; season zip and exclusions stay consistent.

### 2026-04-10 - Configurable review vs new-identity threshold (GUI + UI API)
- Requirement/Milestone: [R6; M5]
- What shipped: Session `review_min` is settable via `set_matching_config` with validation against effective auto threshold; **Lauf hinzufügen** matching panel adds a second slider/number for the review-queue floor; client caps review when auto threshold drops to avoid invalid saves. New UI sessions default to fuzzy **100 %-only** auto-link, `strict_normalized_auto_only=false`, and `auto_min`/`review_min` both `0.5`.
- Evidence: `backend/ui_api/service.py`, `frontend/app.js`, `frontend/strings.js`, `frontend/styles.css`, `docs/api/ui-api-v1.md`, `tests/test_f08_ui_api.py`; `uv run pytest tests/test_f08_ui_api.py`
- Impact: organizers can tune how aggressively borderline rows go to human review instead of starting as new identities, without code changes.

### 2026-04-10 - F15 Ranking eligibility (Außer Wertung)
- Requirement/Milestone: [R5, R8; M5]
- What shipped: Persisted per-category `ranking_exclusions` on the project document; **Aktuelle Wertung** shows only Endwertung-eligible rows; **Laufübersicht** lists everyone with an **a. W.** checkbox, effective `platz` (null + **—** when excluded), and `set_ranking_eligibility` in the UI API. Successful imports clear all exclusions. Season zip carries exclusions inside `session_project.json`.
- Evidence: `backend/domain/models.py`, `backend/storage/schema_v2.py`, `backend/ui_api/ranking_display.py`, `backend/ui_api/queries.py`, `backend/ui_api/commands.py`, `backend/ui_api/service.py`, `backend/ingestion/service.py`, `frontend/app.js`, `frontend/strings.js`, `frontend/styles.css`, `docs/api/ui-api-v1.md`, `docs/features/F15-ranking-eligibility-exclusions.md`, `tests/test_f08_ui_api.py`, `tests/test_f15_ranking_display.py`, `tests/test_f02_ingestion.py`, `tests/test_f01_storage.py`; `uv run pytest`
- Impact: organizers can keep full per-race visibility while publishing a clean official ranking table; exclusions reset after each new import so flags are not stale.

### 2026-04-10 - Unified matching review table with diff highlighting
- Requirement/Milestone: [R6, R8; M4]
- What shipped: Replaced side-by-side two-column merge review layout with a single stacked comparison table. Incoming entry appears as a visually anchored header row; candidates are ranked rows below with shared columns. Fields that differ from the incoming entry (name, year-of-birth, club) are highlighted in red for instant visual distinction.
- Evidence: `frontend/app.js` (unified table render, `normalizeForDiff`, `nameDiffClass`, `clubDiffClass`), `frontend/styles.css` (`.merge-diff-cell`, `.merge-incoming-separator`, unified colgroup), `frontend/strings.js` (new `reviewHintLayout`, `incomingRangLabel`)
- Impact: eliminates left-right eye scanning during review; differing fields are immediately visible, reducing mental load and review time per entry.

### 2026-04-10 - Fix create_new_identity using suggested candidate name
- Requirement/Milestone: [R4, R6; M3]
- What shipped: `apply_match_decision` with `create_new_identity` now builds new singles (and Paarlauf) identities from `RaceEntryMatchMeta` incoming row fields when present, instead of cloning the review-linked candidate person/team.
- Evidence: `backend/ui_api/commands.py`, `tests/test_f08_ui_api.py::test_apply_match_decision_new_identity_uses_incoming_row_not_candidate_name`; `uv run pytest tests/test_f08_ui_api.py -k apply_match_decision`
- Impact: choosing “Neue Identität” after a fuzzy suggestion no longer creates a duplicate with the wrong (suggested) name.

### 2026-04-10 - Per-candidate match scores in review queue (GUI)
- Requirement/Milestone: [R4, R6, R8; M3]
- What shipped: Persist fuzzy similarity per ranked candidate (`candidate_confidences` aligned with `candidate_uids`), expose via `get_review_queue`, and render each candidate row with its own percentage; imports and stored match meta always populate the field for review rows.
- Evidence: `backend/domain/models.py`, `backend/matching/workflow.py`, `backend/storage/schema_v2.py`, `backend/ui_api/queries.py`, `backend/ui_api/commands.py`, `frontend/app.js`, `docs/api/ui-api-v1.md`, `tests/test_f08_ui_api.py`; `uv run pytest tests/test_f08_ui_api.py tests/test_f03_matching.py tests/test_f01_storage.py`
- Impact: operators can distinguish ranked candidates instead of seeing the top confidence repeated for every row.

### 2026-04-10 - F14 Season hard reset (keep year)
- Requirement/Milestone: [R1, R6, R8; M5]
- What shipped: Added guarded season hard reset in UI API (`reset_series_year`) and startup GUI so operators can clear all season content in place (events, identities, matching decisions, standings) while keeping the same year slot; reset uses typed-year confirmation and preserves repository atomic backup behavior.
- Evidence: `backend/ui_api/workspace.py`, `backend/ui_api/service.py`, `docs/api/ui-api-v1.md`, `frontend/app.js`, `frontend/strings.js`, `tests/test_f08_ui_api.py`, `docs/features/F14-season-hard-reset.md`; `uv run pytest tests/test_f08_ui_api.py`
- Impact: users can reliably restart a season dataset without deleting/recreating the year and without residual merge history affecting the next first import.
- Follow-up: consider an optional one-click restore flow from latest `.bak` for accidental resets.

### 2026-04-10 - F13 Season entry density and coverage preview
- Requirement/Milestone: [R1, R8; M5]
- What shipped: Tightened the startup season screen layout by widening the existing-season overview and compacting the create card, added compact local `Letzter Import` formatting (`HH:MM DD.MM.YYYY`), and added per-season coverage preview (`Einzel`/`Paare` run matrix) directly in the season table via new `list_series_years.race_coverage` payload fields.
- Evidence: `backend/ui_api/workspace.py`, `docs/api/ui-api-v1.md`, `frontend/app.js`, `frontend/styles.css`, `frontend/strings.js`, `tests/test_f08_ui_api.py`, `docs/features/F13-season-entry-density-and-coverage-preview.md`; `uv run pytest tests/test_f08_ui_api.py`
- Impact: organizers can assess season completeness and recency at a glance from startup, with less horizontal waste and fewer clicks into other views.
- Follow-up: optionally add color or tooltip affordances for quick gap highlighting when many runs are present.

### 2026-04-10 - F12 Season import/export with safe restore
- Requirement/Milestone: [R1, R7, R8; M5]
- What shipped: Added season-level export/import in GUI and UI API (`export_series_year`, `import_series_year`) using `.stundenlauf-season.zip` with `manifest.json` + checksum validation, schema/format compatibility checks, and atomic write/replace behavior; season entry now includes per-row export and a global import action with German conflict prompts (cancel/new year/replace with typed confirmation).
- Evidence: `backend/ui_api/workspace.py`, `backend/ui_api/service.py`, `backend/ui_api/pywebview_bridge.py`, `backend/ui_app.py`, `frontend/app.js`, `frontend/strings.js`, `docs/api/ui-api-v1.md`, `tests/test_f08_ui_api.py`; `uv run pytest tests/test_f08_ui_api.py`
- Impact: non-technical users can reliably back up and move complete seasons between machines without manual filesystem handling or partial-write risk.
- Follow-up: consider a dedicated preview/inspect step before import to show manifest metadata and simplify conflict choice UI beyond prompt-based flow.

### 2026-04-10 - Import matching panel: mode tabs and copy
- Requirement/Milestone: [R4, R6, R8; M5]
- What shipped: Import **Matching-Einstellungen** use a three-mode tab row (Strikt / Fuzzy-Automatik / Manuell) with fuzzy sub-tabs (*Nur 100 %-Ähnlichkeit* / *Ab Schwelle*) and a grid-aligned threshold control; German copy distinguishes strict normalized identity from 100 % fuzzy score; new UI sessions default to strict mode (`UiApiService` + frontend initial state).
- Evidence: `frontend/app.js`, `frontend/strings.js`, `frontend/styles.css`, `backend/ui_api/service.py`, `tests/test_f08_ui_api.py`, `docs/features/F11-strict-normalized-auto-match.md`, `docs/api/ui-api-v1.md`; `uv run pytest`
- Impact: Less confusion at import time and a safer default for organizers.
- Follow-up: optional persistence of matching mode per season.

### 2026-04-09 - F11 Strict normalized auto-match mode
- Requirement/Milestone: [R4, R6; M5]
- What shipped: Optional `strict_normalized_auto_only` matching mode auto-links only when incoming rows match exactly one existing entity on normalized name (`parse_person_name` of display name), YOB, gender, and normalized club; full scan avoids blocking misses after identity edits; fuzzy scores can no longer auto in this mode; `get_matching_config` / `set_matching_config` + Import panel checkbox with fuzzy controls disabled while active.
- Evidence: `backend/matching/strict_identity.py`, `backend/matching/workflow.py`, `backend/matching/config.py`, `backend/matching/decisions.py` (`name_key`), `backend/ui_api/service.py`, `docs/api/ui-api-v1.md`, `frontend/app.js`, `frontend/strings.js`, `docs/features/F11-strict-normalized-auto-match.md`, `tests/test_matching_strict_identity.py`, `tests/test_f08_ui_api.py`; `uv run pytest`
- Impact: Operators can avoid silent fuzzy auto-links after canonical renames when Excel text still differs slightly.
- Follow-up: optional persistence of matching mode in project metadata if sessions should survive restarts.

### 2026-04-09 - F10 Standings identity correction (German GUI)
- Requirement/Milestone: [R6, R8; M5]
- What shipped: **Aktuelle Wertung** includes a correction-mode toggle, row clicks open a single modal, `get_standings` team rows expose `team_members` for prefill, Einzel uses one form and Paarlauf uses two stacked sub-forms (Läufer A/B) each saving via `update_participant_identity`; modal chrome in `index.html`/`styles.css`, copy in `standings.identity` within `frontend/strings.js`.
- Evidence: `backend/ui_api/queries.py`, `docs/api/ui-api-v1.md`, `frontend/app.js`, `frontend/strings.js`, `frontend/index.html`, `frontend/styles.css`, `docs/features/F10-standings-identity-correction-ui.md`, `tests/test_f08_ui_api.py`; `uv run pytest`
- Impact: organizers fix canonical name/club/YOB where they see it in the standings table without CLI or ad-hoc tools.
- Follow-up: optional `entity_uid` on per-race results rows for the same flow from the lower table.

### 2026-04-09 - F09 Canonical identity correction (backend + API)
- Requirement/Milestone: [R3, R4, R6, R7; M5]
- What shipped: `update_participant_identity` UI API command updates canonical `Person` (or one Paarlauf member) with re-normalized derived fields, recomputes standings, and appends `MatchingDecision` rows with `kind=identity_correction` and `scope_series_year` so year-filtered timeline and `matching_decisions` counts include identity-only edits; extended `MatchingDecision` + `schema_v2` and centralized timeline filtering in `queries.py`.
- Evidence: `backend/domain/identity.py`, `backend/ui_api/commands.py`, `backend/ui_api/queries.py`, `backend/ui_api/service.py`, `backend/storage/schema_v2.py`, `docs/api/ui-api-v1.md`, `docs/features/F09-canonical-identity-correction.md`, `tests/test_f08_ui_api.py`; `uv run pytest`
- Impact: organizers can fix first-import typos in merged identities without re-importing the whole season; audit trail remains coherent per season.
- Follow-up: superseded by F10 standings identity correction GUI.

### 2026-04-09 - Zentraler GUI-String-Katalog (`frontend/strings.js`)
- Requirement/Milestone: [R8; M5]
- What shipped: Moved all German end-user copy for the pywebview UI into `frontend/strings.js` (`window.UIStrings` / `window.UIFormat`), load order updated in `frontend/index.html`, and refactored `frontend/app.js` to reference the catalog and apply shell chrome on startup.
- Evidence: `frontend/strings.js`, `frontend/app.js`, `frontend/index.html`, `docs/features/F05-german-ui-and-review-workflow.md`; `node --check frontend/strings.js` and `node --check frontend/app.js`
- Impact: copy edits and reviews can focus on a single module instead of searching scattered literals in `app.js` and HTML.
- Follow-up: optional alignment of Python-originated `details.message` text with the same catalog if mixed-language status lines become confusing.

### 2026-04-09 - Import-Dialog: Layout, Erkennung und Laufnummer-API
- Requirement/Milestone: [R8; M5]
- What shipped: Enlarged main shell tabs, renamed the import tab to `Import`, removed the duplicate standings shortcut, reordered the import sidebar (matrix first, then filename row with basename-only display, inference hint, Einzel/Paare toggles, Laufnummer dropdown, import button, then matching settings), and added optional `race_no` on `import_race` so the GUI can set Laufnummer independently of the filename.
- Evidence: `frontend/app.js`, `frontend/styles.css`, `frontend/index.html`, `backend/ingestion/service.py`, `backend/ingestion/adapters/singles.py`, `backend/ingestion/adapters/couples.py`, `backend/ui_api/commands.py`, `docs/api/ui-api-v1.md`, `tests/test_f08_ui_api.py`, `uv run pytest tests/test_f08_ui_api.py -q`
- Impact: clearer import flow with explicit Lauftyp/Laufnummer choices aligned to filename heuristics, and operators can import files whose names omit `Lauf N` without losing correct race numbering.
- Follow-up: optional extra filename heuristics for Lauftyp if real files often omit both markers.

### 2026-04-09 - Dateiweises Rollback in der GUI verknüpft
- Requirement/Milestone: [R1, R6, R8; M5]
- What shipped: Added a dedicated `rollback_source_batch` UI API command, exposed `source_sha256` in timeline items, and refactored `Historie` to group active imports by source batch with one `Datei zurücknehmen` action that rolls back all races from that file together.
- Evidence: `backend/ui_api/service.py`, `backend/ui_api/commands.py`, `backend/ui_api/queries.py`, `frontend/app.js`, `docs/api/ui-api-v1.md`, `tests/test_f08_ui_api.py`
- Impact: prevents accidental partial correction states in the main GUI flow by making rollback semantics match source-batch reimport policy.
- Follow-up: evaluate whether single-race rollback should be hidden behind an explicit advanced mode to further reduce misuse.

### 2026-04-09 - Importierte-Läufe-Matrix in Wertung und Importansicht
- Requirement/Milestone: [R8; M5]
- What shipped: Replaced the text summary of imported runs with a compact two-row matrix (`Einzel`, `Paare`) in both `Aktuelle Wertung` and `Lauf hinzufügen`, showing `x` per Lauf column with a default span of 1..5 and automatic extension for higher race numbers.
- Evidence: `frontend/app.js`, `frontend/styles.css`, `ReadLints` (no errors in edited files)
- Impact: operators can immediately see season coverage gaps/availability by race number in both key workflows, reducing context switching and interpretation effort.
- Follow-up: consider optional clickable race cells for future drill-down into event history.

### 2026-04-09 - Season deletion safeguard with typed-year confirmation
- Requirement/Milestone: [R8; M5]
- What shipped: Added a red season delete action in the season entry table with explicit warning plus mandatory exact-year input confirmation, and introduced `delete_series_year` in `ui-api-v1` with strict confirmation validation before removing season storage.
- Evidence: `frontend/app.js`, `backend/ui_api/workspace.py`, `backend/ui_api/service.py`, `docs/api/ui-api-v1.md`, `tests/test_f08_ui_api.py`, `uv run pytest tests/test_f08_ui_api.py -q`
- Impact: significantly reduces accidental season deletion risk while still allowing operators to clean up wrong/duplicate seasons directly in the GUI.
- Follow-up: evaluate whether an additional safeguard should block deletion when a season is currently open in another desktop session.

### 2026-04-09 - GUI control for auto-merge threshold (default strict review)
- Requirement/Milestone: [R4, R6, R8; M5]
- What shipped: Added a `Lauf hinzufügen` matching control (auto-merge on/off + threshold slider/number input + perfect-match auto-merge toggle), introduced session-level API methods (`get_matching_config`, `set_matching_config`), and wired imports to use the active matching config; default keeps perfect-match auto-merge enabled.
- Evidence: `frontend/app.js`, `backend/ui_api/service.py`, `backend/ui_api/commands.py`, `backend/ingestion/service.py`, `docs/api/ui-api-v1.md`, `tests/test_f08_ui_api.py`
- Impact: operators can tune merge strictness directly in the GUI, keep exact matches frictionless, and still prevent silent typo auto-links.
- Follow-up: evaluate if review threshold should also be user-adjustable in the same control panel.

### 2026-04-09 - Review workflow wording clarified (link vs new identity)
- Requirement/Milestone: [R6, R8; M5]
- What shipped: Clarified German review guidance and action labels so users can clearly distinguish linking to an existing candidate from intentionally creating a new identity when no candidate matches.
- Evidence: `frontend/app.js`, `uv run pytest tests/test_f08_ui_api.py -q`
- Impact: reduces misinterpretation risk in manual merge review by making the operator decision model explicit directly in the UI.
- Follow-up: validate wording in organizer UAT and refine microcopy if users still confuse "existing link" vs "new identity".

### 2026-04-09 - Safe source-batch reimport hardening
- Requirement/Milestone: [R1, R5, R6, R8; M5]
- What shipped: Replaced silent same-file noop handling with explicit duplicate/partial-rollback errors, implemented source-hash batch rollback in `reimport_race`, and surfaced clearer German guidance in the import/history UI.
- Evidence: `backend/ingestion/service.py`, `backend/storage/repository.py`, `backend/ui_api/commands.py`, `backend/ui_api/errors.py`, `frontend/app.js`, `docs/api/ui-api-v1.md`, `tests/test_f02_ingestion.py`, `tests/test_f08_ui_api.py`
- Impact: correction flow is safer and deterministic because reimport now enforces full source-batch rollback, preventing hidden partial-state duplicates and making operator next steps explicit.
- Follow-up: consider adding a dedicated history action that triggers `reimport_race` directly with guided file-pick UX for non-technical users.

### 2026-04-09 - Merge-Prüfung als Zwei-Spalten-Tabelle vereinfacht
- Requirement/Milestone: [R6, R8; M5]
- What shipped: Replaced the merge-review card with a side-by-side table view (`eingehender Eintrag` vs `mögliche Treffer`) including clear German guidance, ranked candidate selection, and explicit actions for `bestehende Person` vs `neue Person`.
- Evidence: `frontend/app.js`, `frontend/styles.css`, `backend/ui_api/queries.py`, `backend/ui_api/commands.py`, `tests/test_f08_ui_api.py`, `uv run pytest tests/test_f08_ui_api.py`
- Impact: users can now immediately distinguish incoming data from existing candidates and make safer merge decisions with less cognitive load.
- Follow-up: validate with organizer UAT whether additional field-level merge controls are still needed for edge cases.

### 2026-04-09 - Konfliktprüfung mit Kandidatenauswahl
- Requirement/Milestone: [R6, R8; M5]
- What shipped: Extended the German merge-review card with a real candidate picker dropdown so users can explicitly choose the merge target before confirming instead of always accepting the top suggestion.
- Evidence: `frontend/app.js`
- Impact: reduces accidental merges in ambiguous cases by making reviewer intent explicit at decision time.
- Follow-up: add a side-by-side candidate detail panel (selected candidate vs incoming entry) to further improve confidence on close matches.

### 2026-04-09 - Konfliktprüfung zeigt lesbare Kandidatendaten
- Requirement/Milestone: [R6, R8; M5]
- What shipped: Enhanced the review queue API (`get_review_queue`) to include human-readable entity previews (name/team members, year, club) and updated the German import/review UI to prioritize these details while keeping UIDs as secondary trace metadata.
- Evidence: `backend/ui_api/queries.py`, `frontend/app.js`, `docs/api/ui-api-v1.md`, `tests/test_f08_ui_api.py`, `uv run pytest tests/test_f08_ui_api.py`
- Impact: conflict resolution is faster and less error-prone because users no longer need to interpret raw UIDs to choose the right merge target.
- Follow-up: add a dedicated choose-candidate interaction (instead of one-click top-candidate accept) for ambiguous multi-candidate cases.

### 2026-04-09 - Default series storage moved to user Documents
- Requirement/Milestone: [R7; M5]
- What shipped: Changed default workspace resolution from current working directory to `~/Documents/Stundenlauf` so yearly series JSON data persists in a per-user app folder outside the repository/app directory; decoupled frontend asset lookup from workspace path.
- Evidence: `backend/app_paths.py`, `main.py`, `backend/ui_app.py`, `backend/ui_api/service.py`, `uv run pytest tests/test_f08_ui_api.py tests/test_f01_storage.py`
- Impact: improves portability and safety by avoiding accidental data placement inside the app checkout while keeping existing explicit `--workspace-dir` overrides intact.
- Follow-up: optional migration helper could detect and offer import of legacy `./data/series` folders.

### 2026-04-09 - F05 standings sidebar and quick category buttons
- Requirement/Milestone: [R8; M5]
- What shipped: Reworked `Aktuelle Wertung` to use a compact sidebar with `Lauf hinzufügen`, imported-run status for Einzel/Paare, and fast category switching via 2x3 button grids for Einzel and Paare with active selection highlighting (replacing the dropdown).
- Evidence: `frontend/app.js`, `frontend/styles.css`
- Impact: reduces navigation friction during race-day operation and keeps imported-run visibility in-context while switching categories.
- Follow-up: run organizer UAT for spacing/label preferences on the sidebar and button grid.

### 2026-04-09 - F05 German reactive desktop GUI shipped
- Requirement/Milestone: [R6, R8; M4, M5]
- What shipped: Implemented a full-screen German pywebview frontend with season startup flow (open/create year-series), standings and race matrix tables, add-race import/review workflow, and history rollback actions; extended `ui-api-v1` with season lifecycle methods (`list_series_years`, `create_series_year`, `open_series_year`).
- Evidence: `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`, `backend/ui_app.py`, `main.py`, `backend/ui_api/workspace.py`, `backend/ui_api/service.py`, `backend/ui_api/pywebview_bridge.py`, `docs/api/ui-api-v1.md`, `tests/test_f08_ui_api.py`, `uv run pytest tests/test_f08_ui_api.py`
- Impact: non-technical users can operate the core yearly workflow end-to-end in a guided German interface without CLI usage, including typo-merge review and race correction actions.
- Follow-up: add UI integration tests against fixture Excel files and run organizer UAT for copy/accessibility tuning.

### 2026-04-09 - UI API v1 year-level workspace extension
- Requirement/Milestone: [R1, R3, R5, R6, R8; M4, M5]
- What shipped: Added additive year-level read methods (`list_categories`, `get_year_overview`, `get_year_timeline`) plus optional `series_year` filters on project/audit queries; extended `import_race` with optional `source_type` (`singles`/`couples`) while keeping backward compatibility.
- Evidence: `backend/ui_api/queries.py`, `backend/ui_api/service.py`, `backend/ui_api/commands.py`, `backend/ingestion/service.py`, `docs/api/ui-api-v1.md`, `tests/test_f08_ui_api.py`, `uv run pytest tests/test_f08_ui_api.py`
- Impact: frontend can load and navigate all season datasets (singles + couples across categories) with fewer roundtrips and less client-side composition, improving fluidity for year-wide workflows.
- Follow-up: consume new year-level endpoints in F05 views (`Aktuelle Wertung`, race history, and season-level review monitoring).

### 2026-04-09 - F08 Python frontend API layer shipped (v1)
- Requirement/Milestone: [R1, R3, R4, R5, R6, R8; M4, M5]
- What shipped: Added a dedicated `backend/ui_api/` package with versioned envelopes, query/command handlers, DTO/error mapping, and a pywebview-compatible bridge (`PywebviewApiBridge`); published contract doc `docs/api/ui-api-v1.md`; added API tests in `tests/test_f08_ui_api.py`.
- Evidence: `backend/ui_api/`, `docs/api/ui-api-v1.md`, `tests/test_f08_ui_api.py`, `uv run pytest tests/test_f08_ui_api.py`
- Impact: F05 frontend can integrate against a stable backend contract without direct coupling to internal domain modules, with request-level traceability and deterministic command/query payloads.
- Follow-up: build the F05 German UI workflows on top of `ui-api-v1` and expand bridge tests to include real Excel import fixtures in frontend integration runs.

### 2026-04-08 - PROJECT_PLAN and feature doc sync (pre-GUI handoff)
- Requirement/Milestone: [Working agreements; M3/M4 narrative]
- What shipped: `PROJECT_PLAN.md` now states backend-vs-GUI requirement rule, marks R1–R5 and R7 complete where met, sets M1/M2 complete, documents delivery order F01–F04 then F06/F07 before F05, and lists F03 in delivery status. `F01`/`F02` feature plans updated to implemented with acceptance and Definition of Done checked; F01 scenario test numbering deduplicated. `F05` notes intentional deferral after validation tooling. Stale follow-ups on older accomplishment entries corrected.
- Evidence: `PROJECT_PLAN.md`, `docs/features/F01-domain-model-and-storage.md`, `docs/features/F02-excel-ingestion-and-race-merge.md`, `docs/features/F05-german-ui-and-review-workflow.md`, `docs/ACCOMPLISHMENTS.md`
- Impact: stable documentation baseline for F05 GUI implementation.
- Follow-up: keep requirement R6/R8 and F05 docs updated when the desktop shell ships.

### 2026-04-08 - F07 Gesamtwertung ground-truth comparison (Excel)
- Requirement/Milestone: [R1, R5; M5 validation]
- What shipped: `backend/tools/gesamtwertung_compare.py` parses Gesamtwertung Einzel blocks (half/hour × W/M), aggregates like `v1_legacy_top4`, merges duplicate GT rows, aligns to `StandingsSnapshot`, and writes comparison workbooks; `scripts/compare_gesamtwertung.py` supports single-section or `--all-sections --series-year`; `scripts/compare_2023_einzel_halbstunden_w.py` wraps 2023 defaults; tests in `tests/test_gesamtwertung_compare.py`; documented in `docs/features/F07-gesamtwertung-ground-truth-comparison.md`.
- Evidence: `uv run pytest tests/test_gesamtwertung_compare.py`
- Impact: repeatable organizer-vs-project totals for HITL review before promoting automated golden tests.
- Follow-up: optional pytest pass/fail on comparison when fixtures are stable; extend layout for Paare if needed.

### 2026-04-08 - F06 fixture HITL import script and standings export
- Requirement/Milestone: [R1, R5; M5 KPI prep]
- What shipped: `scripts/fixture_import_session.py` discovers local `.xlsx` fixtures under `--data-dir`, imports them in Lauf order (singles then couples per run), prints matching/review details, optional pause between files, and exports cumulative standings CSV (stdout or `--out-dir`); helpers in `backend/tools/fixture_session.py` with `tests/test_fixture_session.py`.
- Evidence: `backend/tools/fixture_session.py`, `scripts/fixture_import_session.py`, `tests/test_fixture_session.py`, `docs/features/F06-fixture-hitl-import-script.md`, `uv run pytest`
- Impact: enables ground-truth comparison of scoring and sorting against external spreadsheets before the German review UI is wired up.
- Follow-up: optional golden-master CSV diff; integrate review/rollback flows when F05 UI lands.

### 2026-04-08 - F04 ranking rules and standings (backend) shipped
- Requirement/Milestone: [R5; M3]
- What shipped: Versioned v1 ruleset (`v1_legacy_top4`) with top-4-or-all aggregation, deterministic sort (points then distance), sequential places, per-race contribution trace; `StandingsSnapshot` persisted in schema v2; automatic recompute on Excel import and on race rollback; optional CLI `--recompute-standings`.
- Evidence: `backend/ranking/`, `backend/domain/models.py`, `backend/storage/schema_v2.py`, `backend/storage/migrations.py`, `backend/ingestion/service.py`, `backend/storage/repository.py`, `main.py`, `tests/test_f04_ranking.py`, `uv run python -m unittest discover -s tests -p "test_*.py"`
- Impact: cumulative standings are explainable, reproducible for a stored ruleset id, and stay consistent when events are rolled back or re-imported.
- Follow-up: golden-master comparison against legacy spreadsheet outputs when curated fixtures exist; future rulesets beyond v1; UI for standings drilldown (F05).

### 2026-04-08 - F03 participant/team matching engine (backend) shipped
- Requirement/Milestone: [R3, R4, R6; M3]
- What shipped: Schema v2 with `matching_decisions` audit log and `RaceEntry.match_meta`; normalization + blocking + weighted scoring (typos, swap, title strip, YOB, club); order-insensitive Paarlauf team matching; fingerprint-based decision replay; conflict flags; aggregated `MatchingReport` on import; CLI prints matching summary.
- Evidence: `backend/matching/`, `backend/domain/models.py`, `backend/storage/schema_v2.py`, `backend/storage/migrations.py`, `backend/ingestion/mapping.py`, `backend/ingestion/service.py`, `main.py`, `tests/test_f03_matching.py`, `uv run pytest`
- Impact: imports no longer rely on exact string identity keys; uncertain matches surface as review metadata; manual decisions can be replayed deterministically by fingerprint.
- Follow-up: German UI for review queue, manual merge API, field-level merge UI payloads, and KPI tuning on curated historical fixtures.

### 2026-04-08 - F02 Excel ingestion and race merge backend shipped
- Requirement/Milestone: [R1, R2, R3; M2]
- What shipped: Implemented template-based Excel ingestion adapters (singles/couples), validation and mapping pipeline, merge/idempotency service, and CLI import entrypoint with German output.
- Evidence: `backend/ingestion/types.py`, `backend/ingestion/adapters/singles.py`, `backend/ingestion/adapters/couples.py`, `backend/ingestion/mapping.py`, `backend/ingestion/service.py`, `main.py`, `tests/test_f02_ingestion.py`, `uv run pytest`
- Impact: enables deterministic race-by-race import into canonical project storage with duplicate protection and ready integration boundary for F03 matching.
- Follow-up: tighten fixture parity with organizer-provided files and add rollback/reimport integration scenario coverage.

### 2026-04-08 - F01 Python domain and portable storage foundation implemented
- Requirement/Milestone: [R2, R3, R7; M1]
- What shipped: Implemented backend Python domain entities, identity/validation rules, versioned JSON storage repository with atomic save and rollback-safe event lifecycle, plus automated F01 tests.
- Evidence: `backend/domain/enums.py`, `backend/domain/models.py`, `backend/domain/identity.py`, `backend/domain/validation.py`, `backend/storage/schema_v1.py`, `backend/storage/repository.py`, `backend/storage/migrations.py`, `tests/test_f01_domain.py`, `tests/test_f01_storage.py`, `python -m unittest discover -s tests -p "test_f01_*.py"`
- Impact: establishes portable, auditable core data contracts required for reliable cross-race participant/team tracking and future ingestion/matching/ranking features.
- Follow-up: (historical) F02 shipped same day; see F02 accomplishment entry.

### 2026-04-08 - Detailed feature specs finalized for build start
- Requirement/Milestone: [R1, R2, R3, R4, R5, R6, R7, R8; M1, M2, M3, M4, M5]
- What shipped: Expanded and aligned all feature plans (`F01`-`F05`) with implementation tasks, acceptance criteria, UID/auditability requirements, rollback/reimport workflow, and concrete test cases.
- Evidence: `docs/features/F01-domain-model-and-storage.md`, `docs/features/F02-excel-ingestion-and-race-merge.md`, `docs/features/F03-participant-and-team-matching.md`, `docs/features/F04-ranking-rules-and-standings.md`, `docs/features/F05-german-ui-and-review-workflow.md`, `PROJECT_PLAN.md`
- Impact: project is now implementation-ready with consistent cross-feature contracts and a traceable path from import through review, rollback, and standings recalculation.
- Follow-up: (historical) M1–M2 backend and F01–F04 shipped in the same period; F06/F07 added for validation before F05 GUI; keep `PROJECT_PLAN.md` in sync with shipped work.

### 2026-04-07 - Domain-driven v1 roadmap drafted
- Requirement/Milestone: [M1, M2, M3, M4]
- What shipped: Converted placeholders into a concrete project plan and added rough feature plan docs for core work blocks.
- Evidence: `PROJECT_PLAN.md`, `docs/features/F01-domain-model-and-storage.md`, `docs/features/F02-excel-ingestion-and-race-merge.md`, `docs/features/F03-participant-and-team-matching.md`, `docs/features/F04-ranking-rules-and-standings.md`, `docs/features/F05-german-ui-and-review-workflow.md`
- Impact: clear execution path from storage foundation to matching, ranking, and German UI review workflow
- Follow-up: confirm official ranking rules and provide sample historical Excel files
