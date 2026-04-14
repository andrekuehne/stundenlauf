# F-TS08: Standings and Results Export (PDF, Excel)

## Overview

- Feature ID: F-TS08
- Feature name: Client-side PDF and Excel export for standings and results
- Owner: —
- Status: In progress (PDF path implemented; Excel pending)
- Related requirement(s): R5 (rankings as durable artifacts), R7 (portable data — export without cloud)
- Related milestone(s): M-TS6
- Python predecessor(s): F20 (standings multi-format export), `backend/export/` package (spec, projection, pdf_renderer, csv_renderer, gui_pdf_spec, gui_dual_pdf_export, registry)

## Problem Statement

Organizers need **printable, shareable standings** — bulletin-board PDFs for the venue, email attachments, and archival spreadsheets. The Python version produces these server-side via ReportLab (PDF) and Python's `csv` module. In the TS port, there is no server — all generation must happen client-side in the browser.

The Python export pipeline has a clean three-layer architecture worth preserving:

1. **Spec** — declarative export configuration (format, categories, columns, layout presets, styling).
2. **Projection** — format-agnostic table model built from domain state (column definitions, header rows, body rows, merge spans, banding/podium metadata).
3. **Renderer** — format-specific output (PDF, CSV).

The TS port replaces ReportLab with a client-side PDF library and replaces CSV with **Excel (.xlsx)** using a client-side spreadsheet library. The projection layer ports almost directly as pure TypeScript functions.

## Scope

### In Scope

- Port the **export spec** model: format selection, category filtering, column presets, row eligibility, PDF style options, layout presets.
- Port the **projection layer** as pure TypeScript: `ExportSection` construction from `SeasonState` + ranking engine output, supporting both flat and Laufübersicht table layouts.
- **PDF renderer** using a client-side library (jsPDF + jsPDF-AutoTable, or pdfmake) replicating the Python Laufübersicht and flat PDF layouts.
- **Excel renderer** using a client-side library (ExcelJS) producing `.xlsx` files with plain tables and light formatting (bold headers, column widths, number formatting, zebra banding).
- **Layout presets**: port `default` (landscape) and `compact` (portrait, tight margins, small font) presets.
- **Dual PDF export** for the GUI: separate Einzel and Paare PDFs with continuous section numbering (porting `gui_dual_pdf_export.py`).
- **Browser download** via blob URL for all generated files.
- **German formatting**: decimal comma for distances (`1,234` not `1.234`), German column headers, em-dash for empty cells.
- **Category sort order**: preserve the Python export ordering (Halbstundenlauf W/M, Stundenlauf W/M, then Paare by duration).
- **Footer**: organizer line, season year, category name, export timestamp — matching the Python PDF footer.
- **First-page intro block** for Laufübersicht PDFs: season year in blue plus the "Hinweis:" notice above the first table on page 1.
- Framework-agnostic export functions (pure TS + browser APIs); UI integration points defined for F-TS06.

### Out of Scope

- Season ZIP export/import (F-TS07 — separate feature).
- CSV export (replaced by Excel; CSV was a development convenience in the Python version).
- Logo embedding in PDF (optional in Python; defer unless users request it).
- A3 page size (Python supports it; defer unless needed — A4 landscape/portrait covers all current use cases).
- WYSIWYG visual layout editor.
- Digitally signed PDFs or interactive PDF forms.
- Dark-mode or custom theme variations for PDF output.

## Acceptance Criteria

- [x] PDF export produces a downloadable `.pdf` file from the current season's standings.
- [x] Laufübersicht PDF layout matches Python version's structure: 3-row merged header, per-race Str./Pkt. columns, Gesamt columns, first-page intro notice, section titles, footers.
- [x] Flat PDF layout produces a simple table with configurable columns (minimal, official_board, debug_uid presets).
- [ ] Excel export produces a downloadable `.xlsx` file with one worksheet per category section.
- [ ] Excel worksheets have: bold header row(s), auto-fitted column widths, German decimal comma formatting for distances, zebra-banded rows.
- [x] Layout presets `default` and `compact` produce visually distinct output matching their Python equivalents in intent (exact pixel parity is not required).
- [x] Dual PDF export (Einzel + Paare) triggers two separate downloads with continuous section numbering.
- [x] Category sort order matches Python: Halbstundenlauf W, M → Stundenlauf W, M → Paare W, M, Mixed per duration.
- [x] German headers: Platz, Name, Verein, Laufstr., Wertung, (km), (Punkte), Gesamt.
- [x] Em-dash (—) for missing race results; decimal comma for distances; bold points values in PDF.
- [x] Team/couple rows render correctly in PDF: two rows per team with merged Platz and numeric columns.
- [ ] Excel duplicates numeric values per partner row instead of vertical merges.
- [x] Podium rows (places 1–3) get a light-blue tint in PDF.
- [x] Footer renders on every PDF page: organizer, season year, category, export timestamp.
- [x] Eligibility filtering works: `eligible_only` (default) excludes außer Wertung participants; `full_grid` includes all.
- [x] All export logic is framework-agnostic (no React/UI imports in export modules).
- [x] Export functions are tested with Vitest using fixture data.

---

## Technical Plan

### 1. Library Selection

#### PDF: jsPDF + jsPDF-AutoTable

jsPDF is the most mature client-side PDF library with the largest ecosystem. `jsPDF-AutoTable` adds table rendering with cell merging, row spanning, per-cell styling, header repetition, and page-break control — covering the Laufübersicht requirements.

**Key capabilities needed:**
- Cell-level font, color, and alignment control (bold Pkt. values, centered numeric columns, red run labels).
- Row/column span (3-row merged header, team partner rows with merged Platz/numeric columns).
- Header repetition on page breaks.
- Custom page footer on every page.
- Row-level background colors (zebra banding, podium tint, green header).
- Column-level vertical rules with different styles (thick, dashed, double).

**Alternative considered:** pdfmake — declarative JSON-based API, good table support. Rejected because jsPDF-AutoTable has more granular cell-level styling hooks (needed for the complex Laufübersicht chrome) and a larger community with better documentation.

**Font handling:** jsPDF ships with Helvetica (PDF standard font, no embedding needed). German characters (umlauts, ß) are supported in the standard Latin-1 encoding of Helvetica. No custom font embedding required for this use case.

#### Excel: ExcelJS

ExcelJS provides full `.xlsx` generation in the browser with:
- Worksheet creation and naming.
- Cell-level formatting: bold, alignment, number format, fill color.
- Column width control.
- Merged cells (for team partner rows and multi-row headers).
- Streaming or buffer-based output to a Blob.

**Alternative considered:** SheetJS (xlsx) — primarily an Excel *parser*; its writer produces functional but minimally styled output unless using the Pro (paid) edition. ExcelJS has better free-tier styling support.

| Concern | Library | Version |
|---|---|---|
| PDF generation | `jspdf` | latest |
| PDF tables | `jspdf-autotable` | latest |
| Excel generation | `exceljs` | latest |

### 2. Architecture

```
src/
  export/
    spec.ts                    # ExportSpec, PdfStyleSpec, layout presets, column definitions
    projection.ts              # Format-agnostic ExportSection builder (pure functions)
    pdf-renderer.ts            # jsPDF + AutoTable PDF generation
    excel-renderer.ts          # ExcelJS .xlsx generation
    registry.ts                # exportStandings(spec, state) → Blob dispatch
    formatting.ts              # German number formatting, category labels, sort order
    gui-pdf-spec.ts            # Fixed Laufübersicht specs for GUI (dual Einzel/Paare)
    download.ts                # Browser blob download helper
```

All modules are pure TypeScript with no UI framework imports. The UI (F-TS06) calls `exportStandings()` or the GUI-specific `exportLaufuebersichtDualPdfs()` and receives Blobs to download.

### 3. Export Spec (port of `spec.py`)

Port the declarative export configuration as TypeScript types:

```typescript
type ExportFormat = 'pdf' | 'xlsx';
type RowEligibility = 'eligible_only' | 'full_grid';
type TableLayout = 'flat' | 'laufuebersicht';

interface ExportSpec {
  format: ExportFormat;
  categories: string[];                // category keys in export order
  columns: string[];                   // column ids or preset names
  rows: { eligibility: RowEligibility };
  pdf: PdfStyleSpec;
}

interface PdfStyleSpec {
  pageSize: 'A4';
  orientation: 'portrait' | 'landscape';
  title: string;
  subtitle: string;
  tableLayout: TableLayout;
  layoutPreset?: string;               // 'default' | 'compact'
  repeatHeader: boolean;
  pageBreakBeforeEachCategory: boolean;
  organizerFooter: string;
  showOrganizerFooter: boolean;
  showSeasonFooter: boolean;
  showCategoryFooter: boolean;
  showExportTimestampFooter: boolean;
  laufuebersichtShowCover: boolean;
  laufuebersichtSectionNumberStart: number;
  laufuebersichtNotice: string;
  // Layout tokens (margins, font sizes, colors, column widths)
  // ... see PdfLayoutTokens below
}
```

**Column presets** (same as Python):

| Preset | Columns |
|---|---|
| `minimal` | Platz, Name, Punkte, km |
| `official_board` | Platz, Name, Verein, Punkte, km |
| `laufuebersicht_board` | (built dynamically from active races) |

**Layout presets** (same as Python):

| Preset | Description |
|---|---|
| `default` | A4 landscape, standard margins and fonts |
| `compact` | A4 portrait, tight margins (0.45 cm), small font (5 pt body), reduced padding |

### 4. Projection Layer (port of `projection.py`)

The projection layer builds `ExportSection` objects from domain state. This is a near-direct port of the Python code.

```typescript
interface ColumnDef {
  id: string;
  header: string;
  align: 'left' | 'right' | 'center';
}

interface ExportSection {
  categoryKey: string;
  categoryLabel: string;
  footerCategoryLabel: string;
  seasonYear: number;
  title: string;
  subtitle: string;
  columns: ColumnDef[];
  rows: string[][];                        // body rows (PDF layout)
  headerRows?: string[][];                 // multi-row header (Laufübersicht: 3 rows)
  tableSpans?: [col: number, row: number, col2: number, row2: number][];
  excelRows?: string[][];                  // body rows (Excel layout — duplicated numerics for teams)
  bodyRowBandGroup?: number[];             // logical band index per body row
  bodyRowPodium?: boolean[];               // podium tint flag per body row
  rulesetVersion: string;
  calculatedAt: string;
}
```

**Key projection functions to port:**

| Python function | TS equivalent | Notes |
|---|---|---|
| `build_export_sections()` | `buildExportSections()` | Dispatch: flat vs. Laufübersicht |
| `_build_laufuebersicht_sections()` | `buildLaufuebersichtSections()` | 3-row header, merged cells, team two-row layout |
| `_laufuebersicht_column_defs()` | `laufuebersichtColumnDefs()` | Dynamic columns from active races |
| `_build_laufuebersicht_header_rows()` | `buildLaufuebersichtHeaderRows()` | Platz/Name/Verein + per-race + Gesamt |
| `_row_to_cells()` | `rowToCells()` | Flat table cell resolver |
| `_format_distance()` | `formatDistance()` | `km.toFixed(3).replace('.', ',')` |
| `_format_points()` | `formatPoints()` | Integer or trimmed fractional |
| `_display_name_yob_line()` | `displayNameYobLine()` | `"Name (Jg.)"` format |
| `sort_category_keys_for_export()` | `sortCategoryKeysForExport()` | Print order |
| `split_category_keys_einzel_paare()` | `splitCategoryKeysEinzelPaare()` | Dual-PDF split |

**Inputs:** The projection reads from the ranking engine's output (F-TS04) — the same `buildStandingsRowsForCategory()` function that the GUI standings view uses. This ensures export and GUI show identical data.

### 5. PDF Renderer (port of `pdf_renderer.py`)

The PDF renderer uses jsPDF + AutoTable to replicate the ReportLab output.

#### 5.1 Page Setup

```typescript
function createPdfDocument(style: PdfStyleSpec): jsPDF {
  return new jsPDF({
    orientation: style.orientation,
    unit: 'cm',
    format: 'a4',
  });
}
```

#### 5.2 First-Page Intro (Laufübersicht)

- Large blue year text (Helvetica-Bold, 26 pt default, `#1565C0`).
- Bold "Hinweis:" label plus notice body paragraph (Helvetica, 10 pt default).
- Rendered above the first category section so page 1 contains both the note and the first table.

#### 5.3 Section Rendering

For each category section:
1. Add section footer hint (season year, category label) — captured for page footer.
2. Section title: `"N. Halbstundenlauf - Frauen"` (centered, 14 pt bold).
3. Optional subtitle.
4. Table via AutoTable.

#### 5.4 Table Styling (Laufübersicht)

AutoTable configuration for the Laufübersicht layout:

| Aspect | Implementation |
|---|---|
| **3-row header** | `head: [row0, row1, row2]` with `columnSpans` for merged cells |
| **Header repeat** | `showHead: 'everyPage'` |
| **Header background** | Pale green (`#E8F5E9`) |
| **Run label color** | Red (`#C62828`) for merged "n. Lauf" and "Gesamt" cells in row 0 |
| **Sub-header font** | Rows 1–2 use regular Helvetica, 2 pt smaller than main header |
| **Body font** | 7 pt Helvetica (default); 5 pt for compact |
| **Bold points** | Per-cell `styles` callback: Pkt. columns use bold font (except em-dash) |
| **Column widths** | Fixed narrow widths for Platz, per-race Str./Pkt., Gesamt; Name/Verein flex |
| **Vertical rules** | `didDrawCell` hook: thick after Verein; dashed between Str./Pkt.; double before Gesamt |
| **Horizontal rules** | `didDrawCell` hook: double rule after header; thin within team partner rows; thick after podium block |
| **Zebra banding** | Alternating row fills keyed by `bodyRowBandGroup` (both partner rows share group) |
| **Podium tint** | Places 1–3 get light-blue fill (`rgb(200, 220, 255)`) |
| **Team partner rows** | Row span on Platz and numeric columns; second row has Name/Verein only |
| **Cell alignment** | Platz: right; Name/Verein: left; all numeric columns: center |
| **Empty cells** | Em-dash (—) |

#### 5.5 Footer

On every page (via `didDrawPage` hook):

```
HSG Uni Greifswald Triathlon Laufgruppe - Saison 2025 - Stundenlauf - Männer - Export: 2025-06-15 14:30 UTC
```

Parts joined by " - ", each toggleable via `show*Footer` flags. Centered at bottom of page, Helvetica, 8 pt default.

#### 5.6 Flat Table

Simpler: single-row header, no merging, standard grid. Same zebra banding and footer.

### 6. Excel Renderer

The Excel renderer uses ExcelJS to produce `.xlsx` files. The goal is clean, usable spreadsheets — not a pixel-perfect recreation of the PDF layout.

#### 6.1 Workbook Structure

- One worksheet per category section, named with the category label (e.g. "Halbstundenlauf - Frauen").
- If multiple categories share the same label (shouldn't happen, but defensive), append a numeric suffix.

#### 6.2 Laufübersicht Worksheet

**Header rows (3 rows, matching PDF):**
- Row 1: "Platz", "Name", "Verein", then merged cells for each race ("1. Lauf" spanning 2 columns), "Gesamt" spanning 2 columns.
- Row 2: empty, empty, empty, then "Laufstr." / "Wertung" alternating.
- Row 3: empty, empty, empty, then "(km)" / "(Punkte)" alternating.
- All header rows: bold, pale green fill (`#E8F5E9`), centered for race/Gesamt columns.
- Row 1 race labels: red font (`#C62828`).
- Freeze panes below header row 3 and after Verein column for scrollable navigation.

**Body rows:**
- Team partners: two rows, with `excelRows` data (both rows carry duplicated numeric values — matches the CSV behavior from the Python version, which is more practical in a spreadsheet than merged cells across rows).
- Podium rows (1–3): light-blue fill.
- Zebra banding for remaining rows.
- Distance cells: formatted with 3 decimal places and comma separator (Excel custom format `#,##0.000` with German locale, or explicit string with comma).
- Points cells: bold.

**Column widths:**
- Platz: narrow (~5 characters).
- Name: wide (~30 characters).
- Verein: medium (~20 characters).
- Per-race Str./Pkt.: narrow (~8 characters each).
- Gesamt Str./Pkt.: narrow (~8 characters each).

#### 6.3 Flat Worksheet

- Single header row, bold, with column names from the preset.
- Body rows with basic formatting (right-aligned numbers, left-aligned text).
- Zebra banding.
- Auto-filter on the header row.

#### 6.4 Sheet Metadata

Each worksheet gets a small metadata block in a separate "Info" worksheet (or as a header above the table):
- Season label.
- Category.
- Export timestamp.
- Eligibility filter applied.

### 7. GUI Export Functions (port of `gui_pdf_spec.py` + `gui_dual_pdf_export.py`)

The GUI triggers export via two entry points:

```typescript
async function exportLaufuebersichtDualPdfs(
  state: SeasonState,
  layoutPreset?: string,
): Promise<{ einzel?: Blob; paare?: Blob }> {
  const allKeys = getActiveCategoryKeys(state);
  const [einzel, paare] = splitCategoryKeysEinzelPaare(allKeys);

  const result: { einzel?: Blob; paare?: Blob } = {};
  if (einzel.length > 0) {
    const spec = buildLaufuebersichtGuiSpec(einzel, { sectionNumberStart: 1, layoutPreset });
    result.einzel = await exportStandingsToBlob(spec, state);
  }
  if (paare.length > 0) {
    const spec = buildLaufuebersichtGuiSpec(paare, {
      sectionNumberStart: einzel.length + 1,
      layoutPreset,
    });
    result.paare = await exportStandingsToBlob(spec, state);
  }
  return result;
}

async function exportStandingsExcel(
  state: SeasonState,
  categories: string[],
  options?: { eligibility?: RowEligibility; tableLayout?: TableLayout },
): Promise<Blob> {
  // Build spec, project sections, render to .xlsx blob
}
```

The UI (F-TS06 StandingsSidebar) calls these functions and triggers browser downloads via the `download.ts` helper.

### 8. Browser Download Helper

```typescript
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

Default filenames:
- PDF: `stundenlauf-{year}-laufuebersicht-einzel.pdf`, `stundenlauf-{year}-laufuebersicht-paare.pdf`
- Excel: `stundenlauf-{year}-ergebnisse.xlsx`

### 9. Formatting Utilities (port of `projection.py` helpers)

| Python | TypeScript | Behavior |
|---|---|---|
| `_format_distance(km)` | `formatDistance(km: number): string` | `km.toFixed(3).replace('.', ',')` → `"1,234"` |
| `_format_points(p)` | `formatPoints(p: number): string` | Integer if whole, else trimmed 1-decimal → `"42"` or `"3.5"` → `"3,5"` |
| `_display_name_yob_line(name, yob)` | `displayNameYobLine(name: string, yob: number \| null): string` | `"Müller, Max (1990)"` |
| `_laufuebersicht_club_cell(raw)` | `laufuebersichtClubCell(raw: string \| null): string` | Em-dash for null/empty |
| `sort_category_keys_for_export()` | `sortCategoryKeysForExport(keys: string[]): string[]` | Half-hour W/M → Hour W/M → Paare |
| `split_category_keys_einzel_paare()` | `splitCategoryKeysEinzelPaare(keys: string[]): [string[], string[]]` | Einzel vs Paare split |
| `category_label()` | `categoryLabel(duration, division): string` | `"Halbstundenlauf - Frauen"` |
| `category_footer_label()` | `categoryFooterLabel(duration, division): string` | `"Halbstundenlauf - Frauen"` |
| `laufuebersicht_section_title()` | `laufuebersichtSectionTitle(n, duration, division): string` | `"1. Halbstundenlauf - Frauen"` |

### 10. Layout Presets and Tokens

Port the `PdfLayoutTokens` concept — a resolved set of numeric layout parameters used by the renderer:

```typescript
interface PdfLayoutTokens {
  marginLeftCm: number;
  marginRightCm: number;
  marginTopCm: number;
  marginBottomCm: number;
  footerFontSizePt: number;
  footerYCm: number;
  sectionTitleFontSizePt: number;
  sectionTitleSpaceAfterPt: number;
  // ... all layout values from PdfStyleSpec
  tableFontSize: number;
  tableHeaderFontSize: number;
  narrowPlatzCm: number;
  narrowPunkteGesamtCm: number;
  narrowDistanzGesamtCm: number;
  narrowLaufuebersichtKmPktCm: number;
  // Resolved colors
  lineGrey: string;
  headerGreen: string;
  headerRunRed: string;
  coverYearBlue: string;
  zebraEven: string;
  zebraOdd: string;
  podiumTint: string;
}
```

Preset definitions:

```typescript
const PDF_LAYOUT_PRESETS: Record<string, Partial<PdfStyleSpec>> = {
  default: {},
  compact: {
    orientation: 'portrait',
    marginLeftCm: 0.45,
    marginRightCm: 0.45,
    marginTopCm: 0.45,
    marginBottomCm: 0.65,
    footerFontSizePt: 5.5,
    tableFontSize: 5,
    tableHeaderFontSize: 5,
    narrowPlatzCm: 0.72,
    narrowPunkteGesamtCm: 0.82,
    narrowDistanzGesamtCm: 0.88,
    narrowLaufuebersichtKmPktCm: 0.88,
    // ... remaining compact overrides from Python
  },
};

const PDF_LAYOUT_PRESET_LABELS_DE: Record<string, string> = {
  default: 'Standard',
  compact: 'Kompakt (Hochformat, wenig Weißraum, kleine Schrift)',
};
```

---

## Mapping from Python Implementation

### Python approach

- `backend/export/spec.py` — declarative `ExportSpec` with `PdfStyleSpec`, column presets, layout presets, validation.
- `backend/export/projection.py` — format-agnostic `ExportSection` builder from `ProjectDocument` + standings snapshot.
- `backend/export/pdf_renderer.py` — ReportLab `SimpleDocTemplate`, `Table`, `TableStyle`, custom page template with footer.
- `backend/export/csv_renderer.py` — CSV with UTF-8 BOM, category comment lines.
- `backend/export/gui_pdf_spec.py` — fixed Laufübersicht spec for GUI export.
- `backend/export/gui_dual_pdf_export.py` — writes `{base}_einzel.pdf` and `{base}_paare.pdf`.
- `backend/export/pdf_layout_tokens.py` — resolved layout values from `PdfStyleSpec`.
- `backend/export/registry.py` — format dispatch: `export_standings_to_path`, `export_standings_pdf_bytes`.
- `backend/export/resolve.py` — loads `ProjectDocument`, optional race filter, optional standings recompute.

### TS port differences

| Aspect | Python | TS Port |
|---|---|---|
| PDF library | ReportLab (server-side) | jsPDF + AutoTable (client-side) |
| Second format | CSV (UTF-8 with BOM) | Excel (.xlsx) via ExcelJS |
| Data source | `ProjectDocument` snapshot | `SeasonState` projection from event log (F-TS01) |
| Standings source | Embedded snapshot or live recompute | Always computed on-demand from event log (F-TS04) |
| File output | Filesystem path (desktop) | Blob → browser download |
| GUI trigger | `api("export_standings_pdf")` via bridge | Direct function call returning Blob |
| File save dialog | `pick_save_file` (OS native) | `<a download>` click (browser) |
| `resolve.py` | Loads JSON, optional race filter + recompute | Not needed — state is always live from projection |
| `registry.py` | Format dispatch + filesystem write | Format dispatch → Blob |
| Race filter | `all_active`, `race_event_uids`, `up_to_race_no` | `all_active` only in v1 (others deferred) |
| Logo path | Local file path, embedded in PDF | Deferred (browser file selection complexity) |
| A3 page size | Supported | Deferred (A4 only in v1) |

### Reusable logic (port directly)

These pure functions port with minimal adaptation:

| Python function | Notes |
|---|---|
| `sort_category_keys_for_export()` | Key sorting logic; direct port |
| `split_category_keys_einzel_paare()` | Uses the sort above; direct port |
| `category_key_is_couples()` | String parse on `year:duration:division` |
| `_format_distance()` | One-liner with `.replace('.', ',')` |
| `_format_points()` | Integer-or-trimmed formatting |
| `_display_name_yob_line()` | String formatting |
| `_laufuebersicht_club_cell()` | Null → em-dash |
| `_laufuebersicht_column_defs()` | Dynamic column construction |
| `_build_laufuebersicht_header_rows()` | 3-row header construction |
| `_row_to_cells()` | Column-based cell resolver |
| `_laufuebersicht_gui_spec_dict()` | Fixed spec for GUI |
| `normalize_pdf_layout_preset()` | Preset resolution |
| `pdf_layout_preset_catalog()` | Ordered options for UI dropdown |

---

## Risks and Assumptions

- **Assumption:** jsPDF-AutoTable can handle the Laufübersicht's complex table styling (merged cells, per-cell fonts, custom line drawing). The library's `didDrawCell` and `willDrawCell` hooks provide low-level canvas access for custom rules/lines. If AutoTable falls short on specific decorations (double rules, dashed verticals), we can draw them manually on the jsPDF canvas.
- **Assumption:** ExcelJS works correctly in browser environments (it's designed for both Node.js and browser). The library supports in-memory workbook generation and `writeBuffer()` for Blob creation.
- **Assumption:** Helvetica (PDF standard font) handles all German characters needed (ä, ö, ü, ß, Ä, Ö, Ü). This is true for the WinAnsiEncoding used by jsPDF's built-in Helvetica. If edge cases arise (rare Unicode characters in club names), custom font embedding can be added later.
- **Risk:** jsPDF-AutoTable's merged-cell handling may have quirks with header repetition on page breaks.
  - Mitigation: Test with multi-page Laufübersicht fixtures (8+ races, 50+ participants). If AutoTable's header repeat doesn't work with merged cells, render the header manually at the top of each page via `didDrawPage`.
- **Risk:** Excel number formatting with German locale may not behave consistently across Excel versions.
  - Mitigation: Use explicit string values with comma separators for distances (avoiding locale-dependent number formats). Points and other integers use numeric cells.
- **Risk:** Large exports (many categories, many races) may be slow in the browser.
  - Mitigation: Typical season size is small (≤ 6 categories, ≤ 5 races, ≤ 200 participants). Synchronous generation is acceptable. If needed, offload to a Web Worker later.
- **Risk:** Visual differences from Python PDF output.
  - Mitigation: Accept that pixel-perfect parity with ReportLab is unrealistic. The goal is functionally equivalent output with the same information, structure, and visual character. Side-by-side comparison during development; document intentional differences.

## Implementation Steps

1. **Install dependencies** — add `jspdf`, `jspdf-autotable`, and `exceljs` to the project.
2. **Port formatting utilities** — `formatDistance`, `formatPoints`, `displayNameYobLine`, `laufuebersichtClubCell`, category sorting/splitting. Unit-test each.
3. **Port export spec** — `ExportSpec`, `PdfStyleSpec`, column presets, layout presets, validation. Unit-test validation logic.
4. **Port projection layer** — `buildExportSections` for both flat and Laufübersicht layouts. Unit-test with fixture standings data (construct minimal `SeasonState` → verify `ExportSection` structure, header rows, body rows, spans, banding).
5. **Implement PDF renderer (flat layout)** — simple table with grid, zebra banding, configurable columns. Verify with snapshot test (generate PDF → check text extraction or byte-stable output).
6. **Implement PDF renderer (Laufübersicht layout)** — first-page intro block, 3-row merged header, per-cell styling, vertical rules, footer. Test with multi-page fixture.
7. **Implement Excel renderer (flat layout)** — single worksheet per category, bold header, zebra banding, auto-filter. Verify generated `.xlsx` opens correctly.
8. **Implement Excel renderer (Laufübersicht layout)** — 3-row header with merged cells, freeze panes, team two-row layout, podium tinting.
9. **Port GUI spec functions** — `buildLaufuebersichtGuiSpec`, `exportLaufuebersichtDualPdfs`. Unit-test spec construction.
10. **Implement download helper** — `downloadBlob` utility. Manual browser test.
11. **Integration testing** — end-to-end: construct season state → export PDF and Excel → verify files are non-empty and structurally valid.
12. **Visual validation** — open generated PDFs and Excel files side-by-side with Python output; document any intentional differences.

## Test Plan

- **Unit: Formatting** — `formatDistance(1.234)` → `"1,234"`, `formatPoints(42)` → `"42"`, `formatPoints(3.5)` → `"3,5"`, `displayNameYobLine("Müller, Max", 1990)` → `"Müller, Max (1990)"`.
- **Unit: Category sorting** — verify Halbstundenlauf W before M, Einzel before Paare, cross-duration ordering.
- **Unit: Spec validation** — invalid column id → error, invalid preset → error, laufuebersicht without correct columns → error.
- **Unit: Projection (flat)** — fixture standings data → verify correct column count, cell values, German formatting.
- **Unit: Projection (Laufübersicht)** — fixture data with 3 races → verify 3-row header structure, span list, team two-row layout, podium flags, band groups.
- **Unit: Projection (eligibility)** — `eligible_only` vs `full_grid` produces different row counts.
- **Integration: PDF generation** — render sections to jsPDF → verify blob is non-empty and starts with `%PDF`.
- **Integration: Excel generation** — render sections to ExcelJS → verify blob is non-empty and can be parsed back (read the generated buffer with ExcelJS to verify worksheet names and cell values).
- **Integration: Dual PDF** — season with Einzel + Paare categories → produces two blobs; section numbering continues (Paare starts at N+1).
- **Snapshot: PDF text** — extract text from generated PDF pages; verify expected headers, participant names, and footer text appear.

## Definition of Done

- [ ] PDF export produces correct Laufübersicht and flat layouts for fixture data.
- [ ] Excel export produces correct `.xlsx` with formatted tables for fixture data.
- [ ] Layout presets (`default`, `compact`) produce distinct output.
- [ ] Dual Einzel/Paare PDF export works with continuous section numbering.
- [ ] All formatting utilities tested (German numbers, category labels, sorting).
- [ ] Projection layer tested for both flat and Laufübersicht layouts.
- [ ] No UI framework imports in any export module.
- [ ] All tests pass (Vitest).
- [ ] Entry added to `packages/stundenlauf-ts/docs/ACCOMPLISHMENTS.md`.
- [ ] Requirement/milestone status updated in `packages/stundenlauf-ts/PROJECT_PLAN.md`.

## Links

- Python source reference(s):
  - `backend/export/spec.py` — export spec, column presets, layout presets
  - `backend/export/projection.py` — format-agnostic table projection
  - `backend/export/pdf_renderer.py` — ReportLab PDF renderer
  - `backend/export/csv_renderer.py` — CSV renderer (replaced by Excel in TS port)
  - `backend/export/gui_pdf_spec.py` — fixed GUI Laufübersicht spec
  - `backend/export/gui_dual_pdf_export.py` — dual Einzel/Paare PDF writer
  - `backend/export/pdf_layout_tokens.py` — resolved layout values
  - `backend/export/registry.py` — format dispatch
  - `backend/standings_view.py` — shared standings row builder
  - `backend/standings_display.py` — category labels, display helpers
  - `docs/features/F20-standings-multi-format-export.md` — Python feature doc
- Depends on: F-TS01 (domain types, `SeasonState`), F-TS04 (ranking engine — standings computation), F-TS06 (UI shell — export trigger in StandingsSidebar)
- Depended on by: F-TS06 (UI triggers PDF/Excel export), F-TS09 (PWA deployment wraps everything)
