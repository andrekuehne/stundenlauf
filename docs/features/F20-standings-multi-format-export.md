# Feature Plan: Standings export framework (PDF first)

## Overview

- Feature name: Standings multi-format export (extensible; PDF in v1)
- Owner: TBD
- Status: Shipped (backend v1)
- Related requirement(s): R5 (rankings as durable artifacts), R7 (local, file-based workflows—publish/share without cloud)
- Related milestone(s): M5 (hardening and first production use; organizer-facing outputs)

## Problem Statement

Organizers need **shareable, printable standings** (bulletin boards, email attachments, archival PDFs) derived from the same data the app already computes. Today, cumulative standings are visible in the GUI and a **CSV helper** exists for fixture workflows (`standings_snapshot_to_csv` in `backend/tools/fixture_session.py`), but there is no **user-grade export** with layout control.

The backend should accept **season project JSON** (the canonical `session_project.json` shape / deserialized `ProjectDocument`) and produce **files**—starting with **PDF**—while leaving a clear path to add formats (e.g. XLSX, HTML) without duplicating column or filtering logic.

## Scope

### In Scope

- A **backend-only** export pipeline that:
  - Loads or receives a **season document** (JSON compatible with persisted `session_project.json`).
  - Resolves **standings** (prefer **embedded snapshot** in the document for reproducibility; optional explicit **recompute** flag for “live rules” exports—see assumptions).
  - Builds a **tabular projection** (rows/cells) from domain + snapshot + people/couples metadata.
  - Renders **PDF** in the first iteration via a **pluggable exporter** interface.
- **Configurable output** (declarative request object / dict), including:
  - **Which categories** to include (e.g. one PDF per category vs combined).
  - **Which columns** appear and in which order (see column model below).
  - **Race scope** (e.g. all active races vs subset by `race_event_uid`; optional “label races by Lauf number” for headers).
  - **Presentation**: title, subtitle, footer, page size/orientation, basic typography (font family/size), table header repeat, column widths (auto vs hints), number formatting (decimals for distance, locale-agnostic canonical formatting in code with optional German labels in headers).
- **Framework hooks** for additional formats later: same tabular intermediate, different renderer.
- **Tests**: golden/regression on PDF bytes or structural checks (page count, text extraction) plus unit tests for projection logic.
- **Documentation**: module-level docstring + short section in `docs/api/ui-api-v1.md` **if** a UI/API entrypoint is added in the same delivery; otherwise document the Python API and optional CLI in this plan’s follow-up.

### Out of Scope (initial iteration)

- Desktop GUI “Export…” button and file picker (can be F20b or folded into F05 when API exists).
- **WYSIWYG** visual designer for layouts; v1 is **data-driven** config (JSON-serializable options).
- Cloud upload, email sending, or templated mail merge.
- Arbitrary user **Python scripting** inside templates.
- **Digitally signed** PDFs or interactive PDF forms.
- Full **historical re-export as-of past race** unless cheap to implement via “subset of events + recompute”; if costly, defer to v2 (see brainstorming).

## Brainstorming: what organizers actually need

### Jobs-to-be-done

- **Print at the venue**: A4 or A3, readable from a distance, strong header, clear Platz column, minimal clutter.
- **Email / WhatsApp**: Single PDF per category or one multi-section PDF; file size reasonable; opens on phones.
- **Archival / transparency**: Show **ruleset version** and **export timestamp** so “this PDF matches rule X” is defensible.
- **Partial season**: Mid-season bulletin (“Stand nach Lauf 3”)—implies **race subset** or **as-of** semantics.
- **Außer Wertung (F15)**: Some rows excluded from ranking; exporters should respect **eligible-only vs full grid** consistently with `get_standings` semantics (align with F15 feature doc).

### PDF-specific concerns (high value for users)

| Topic | Why it matters |
|--------|----------------|
| **Wide tables** | Many per-race columns → landscape, smaller font, or column groups; optional “totals only” preset. |
| **Header repeat** | Multi-page tables must repeat category + column headers. |
| **Umlauts / special chars** | German names and clubs need **embedded or system fonts** that support Latin-1/Unicode; avoid “tofu” boxes. |
| **Pagination** | Avoid splitting a row across pages; sane breaks between categories. |
| **Title block** | Series year, category name (human-readable), optional club/event name, generation date. |
| **Numbers** | Consistent decimal places for `distanz_gesamt` (F04: 3 decimals); thousands separators optional (DE vs EN) — recommend **fixed machine formatting in v1** + **German column headers** to match product language rules. |
| **Teams vs individuals** | Display name may be composite; optional second line for members (F10-style detail) if column selected. |
| **Branding** | Optional logo path (local file) in title area—common organizer ask; keep optional to avoid blocking v1. |

### Future formats (framework should not block)

- **XLSX**: Same columns; enables post-processing in Excel; good for power users.
- **HTML**: Single file for intranet paste; simpler styling than PDF.
- **CSV**: Already partially present; unify via same column projection for consistency.

## Conceptual architecture

1. **Parse / validate input**  
   - Deserialize JSON → `ProjectDocument` (reuse existing schema loader used by storage/import).

2. **Resolve standings snapshot**  
   - Default: `document.standings` if present and compatible.  
   - Optional: `recompute=True` → `recompute_project_standings` (or `compute_standings_snapshot`) for exports that must reflect latest code/rules.

3. **Build `StandingsTableModel` (pure, format-agnostic)**  
   - Inputs: `ProjectDocument`, `StandingsSnapshot`, `ExportSpec` (filters + columns + locale/labels).  
   - Outputs: sequence of **sections** (e.g. per `category_key`), each with `columns: list[ColumnDef]`, `rows: list[list[CellValue]]`, and metadata (title, footnotes).  
   - Column resolution maps **logical column ids** (`platz`, `display_name`, `club`, `punkte_gesamt`, `distanz_gesamt`, `points_race:<uid>`, `ranking_eligible`, …) to cell values via small resolvers that read domain + contributions.

4. **Render**  
   - `Exporter` protocol, e.g. `render_pdf(model, style: PdfStyle, dest: Path | BinaryIO) -> None`.  
   - Registry: `register_exporter("pdf", ...)`, future `"xlsx"`.

This keeps **business logic and column semantics in one place**; PDF only draws rectangles and text.

## Export request shape (illustrative)

Serializable dict (for future API/CLI). Exact names are implementation details; the plan locks in **concepts**:

```json
{
  "format": "pdf",
  "standings": { "source": "embedded", "recompute": false },
  "categories": ["30m_men", "30m_women"],
  "race_filter": { "mode": "all_active" },
  "rows": { "eligibility": "eligible_only" },
  "columns": [
    "platz",
    "display_name",
    "club",
    "punkte_gesamt",
    "distanz_gesamt",
    "points_per_race"
  ],
  "pdf": {
    "page_size": "A4",
    "orientation": "landscape",
    "title": "Stundenlauf {series_year} — Zwischenstand",
    "organizer_footer": "HSG Uni Greifswald Triathlon Laufgruppe",
    "show_category_footer": true,
    "repeat_header": true,
    "theme": "default"
  }
}
```

**Race filter modes (candidates):** `all_active` | `race_event_uids` (explicit list) | `up_to_race_no` (if mappable from events). Document chosen mode in implementation notes.

**Column bundles:** Presets such as `minimal`, `official_board`, `debug_uid` reduce configuration burden for callers.

**Laufübersicht PDF layout:** Set `pdf.table_layout` to `laufuebersicht` and `columns` to `["laufuebersicht_board"]` only. Produces a **three-row** header: `Platz` / `Name` / `Verein` are merged vertically; each `n. Lauf` and **Gesamt** spans two columns on row 1 with **Laufstr.** / **Wertung** on row 2 and **(km)** / **(Punkte)** on row 3 (rows 2–3 use a **smaller** font than the main header row, regular Helvetica, **centered**). Body columns stay distance then points per race and for Gesamt (German decimal comma in distance cells; no `km` suffix in body values), **centered** in their cells. Per-race distance and points columns share the same fixed width (leaving **Name** / **Verein** flexible). **Pkt.** numeric body values are **bold**; em dashes in points cells stay regular weight. Default table type is **7 pt** body / **8 pt** header (override with `pdf.table_font_size` / `table_header_font_size`). Str./Pkt. body cells use matching Paragraph styles so km and points **line up vertically**. `Name (Jg.)` for eligible rows; two PDF body rows per team with merged Platz and numeric columns.

## Implementation (shipped)

- Package: [`backend/export/`](../../backend/export/) — `ExportSpec.from_dict`, `export_standings` / `export_standings_to_path`, `export_standings_pdf_bytes`, `resolve_document_for_export`, `build_export_sections`, ReportLab PDF + CSV second format.
- PDF footer: centered line **Organizer - Saison YYYY - category - Export: …** (hyphen-separated). Default organizer is `HSG Uni Greifswald Triathlon Laufgruppe` (`pdf.organizer_footer`); omit it with `""` or `pdf.show_organizer_footer: false`. Season uses the section’s category year (`pdf.show_season_footer`). Category line is spelled-out (e.g. `Stundenlauf - Männer`; `pdf.show_category_footer`). `pdf.show_ruleset_footer` is deprecated (ignored for rendering).
- Shared standings rows (GUI/export parity): [`backend/standings_view.py`](../../backend/standings_view.py) (`build_standings_rows_for_category`); display helpers in [`backend/standings_display.py`](../../backend/standings_display.py) (avoids `ui_api` import cycles).
- CLI: `uv run python -m backend.export --input <session_project.json> --output <file.pdf|csv>` (optional `--spec export.json`).

## Technical Plan

- Architecture/approach:
  - New package e.g. `backend/export/` or `backend/standings_export/` with:
    - `spec.py` — export request dataclasses + validation.
    - `projection.py` — `StandingsTableModel` build from `ProjectDocument` + snapshot + spec.
    - `pdf_renderer.py` — PDF backend (v1).
    - `registry.py` — format dispatch.
  - Reuse display-name logic patterns from `backend/tools/fixture_session.py` (`entity_display_name`); consider **moving shared label resolution** to a small shared module if duplication would otherwise grow.
- Data model/API changes:
  - No schema migration required for v1 if export is read-only on JSON.
  - Optional later: `export_standings` in `ui_api` mirroring the Python function, returning path or base64 for GUI—defer unless bundled with F20.
- **PDF stack (decision): [ReportLab](https://www.reportlab.com/)** — chosen for the **Windows-first** desktop app: solid programmatic tables, pagination, and **TTF embedding** for German text; ships as standard **wheels via `uv add`** without the extra native graphics stack that HTML→PDF tools need on Windows. The v1 PDF renderer (`pdf_renderer.py`) is implemented with ReportLab only; other libraries are out of scope unless requirements change.
- Performance/reliability concerns:
  - Typical season size is small; synchronous export acceptable.
  - Guardrails: max columns / max rows to avoid accidental huge PDFs from malformed specs (configurable limits).

## Risks and Assumptions

- Assumption: **Embedded standings** in the JSON are the default source of truth for “what the user saw,” matching reproducibility goals; **recompute** is opt-in and may differ from historical GUI if rules/code changed.
- Assumption: Export runs in a **trusted local context**; logo paths and file outputs are user-supplied (validate paths, no zip-slip patterns if reading sidecar files).
- Risk: **Column explosion** when `points_per_race` expands to many races → ugly PDFs.
  - Mitigation: presets, landscape default, optional “abbreviated race columns” (L1, L2…), documentation of recommended configs.
- Risk: **Font / Unicode** issues on Windows.
  - Mitigation: bundle a safe default font or document required font installation; add a test with umlaut-heavy fixture names.
- Risk: **Eligibility and merges (F15/F16)** not reflected consistently in projection.
  - Mitigation: single mapping table from UI/API semantics or explicit parity tests against `get_standings` row sets.
- Risk: Duplicating logic already in `get_standings` / queries.
  - Mitigation: prefer calling shared query helpers or extracting a neutral “standings row view” function used by both API and export.

## Implementation Steps

1. Define `ExportSpec` + validation; document column ids and presets in code (single source of truth).
2. Implement `projection` with unit tests (fixed tiny `ProjectDocument` fixtures).
3. Implement `render_pdf` with **ReportLab** and style options (title, footer, orientation, fonts, embedded font for umlauts as needed).
4. Add integration test: export PDF from a small in-memory project, assert via text extraction or snapshot hash (stable enough for CI).
5. CLI entrypoint `uv run python -m backend.export` for operator use without GUI (shipped).
6. If GUI/API required in same release: extend `docs/api/ui-api-v1.md` + bridge tests.

## Test Plan

- Unit: column projection for singles/teams, race subset, eligibility modes, empty category.
- Unit: unknown column id → clear error.
- Integration: PDF renders without exception; extracted text contains known participant substring and `ruleset` footer when enabled.
- Manual: open PDF in Acrobat/Edge; verify umlauts, multi-page header repeat, landscape layout with realistic column count.

## Rollback strategy

- New module only; no persistence changes. Roll back by removing package and optional CLI/API wiring.

## Acceptance Criteria

- [x] Backend can accept season JSON (or `ProjectDocument`) and produce a **PDF** file from declarative options.
- [x] **Column set and order** are configurable via stable logical column identifiers; invalid ids fail fast with actionable errors.
- [x] **Category selection** and **race scope** are supported at least for: all active races, and explicit subset by event UID (or documented equivalent).
- [x] **PDF styling** covers: page size, orientation, title/footer text, optional ruleset/timestamp footer, repeated table headers on new pages.
- [x] Exporter architecture allows adding a **second format** without rewriting projection (e.g. stub `csv` exporter reusing projection, or documented `Exporter` protocol + registry).
- [x] Automated tests cover projection and a minimal PDF smoke path.
- [x] Feature ties explicitly to **F15 eligibility** behavior (eligible-only vs full) in tests or documented parity.

## Definition of Done

- [x] Code implemented
- [x] Tests added/updated and passing
- [x] Docs updated (this plan + API/CLI notes as applicable)
- [x] Entry added to `docs/ACCOMPLISHMENTS.md`
- [x] Requirement/milestone status updated in `PROJECT_PLAN.md` when shipped

## Links

- Related: [F04 Ranking rules and standings](F04-ranking-rules-and-standings.md) — snapshot shape and ruleset versioning.
- Related: [F06 Fixture import + CSV export](F06-fixture-hitl-import-script.md) — prior art for CSV serialization.
- Related: [F12 Season import/export](F12-season-import-export.md) — season JSON portability.
- Related: [F15 Ranking eligibility](F15-ranking-eligibility-exclusions.md) — align export rows with eligible vs full views.
- PR(s): TBD
- Related issue(s): TBD
- Release notes: TBD
