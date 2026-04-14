/**
 * Client-side Excel (.xlsx) generation for standings via ExcelJS.
 *
 * Reference: F-TS08 (Standings and Results Export)
 */

import ExcelJS from "exceljs";
import type { SeasonState } from "@/domain/types.ts";
import { buildGuiLaufuebersichtDualSpecs } from "./gui-pdf-spec.ts";
import {
  buildExportSections,
  type ExportBodyRow,
  type ExportCell,
  type ExportHeaderRow,
  type ExportSection,
} from "./projection.ts";
import type { ExportSpec } from "./spec.ts";

const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const EXCEL_SHEET_EINZEL = "Gesamtwertung_Einzel";
const EXCEL_SHEET_PAARE = "Gesamtwertung_Paare";
const HEADER_FILL = "FFE8F5E9";
const PODIUM_FILL = "FFC8DCFF";
const ZEBRA_FILL = "FFF5F5F5";
const WHITE_FILL = "FFFFFFFF";
const HEADER_RED = "FFC62828";
const TITLE_BLUE = "FF1F1F1F";
const BORDER_GREY = "FFBDBDBD";

type Alignment = NonNullable<ExcelJS.Style["alignment"]>["horizontal"];

export interface ExcelExportArtifact {
  readonly filename: string;
  readonly blob: Blob;
}

interface ExcelExportOptions {
  readonly seasonYear: number;
  readonly filenameBase?: string;
  readonly layoutPreset?: string | null;
}

function toExcelSpec(spec: ExportSpec): ExportSpec {
  return {
    ...spec,
    format: "xlsx",
    pdf: {
      ...spec.pdf,
      tableLayout: "laufuebersicht",
      laufuebersichtShowCover: false,
    },
  };
}

function excelFilename(baseName: string): string {
  const trimmed = baseName.trim() || "stundenlauf-ergebnisse";
  return trimmed.toLowerCase().endsWith(".xlsx") ? trimmed : `${trimmed}.xlsx`;
}

function styleColor(argb: string) {
  return { argb };
}

function headerFont(cell: ExportCell, row: ExportHeaderRow) {
  return {
    bold: true,
    size: row.kind === "primary" ? 11 : 10,
    color: styleColor(cell.colorRole === "headerRunRed" ? HEADER_RED : "FF000000"),
  } as const;
}

function bodyFont(cell: ExportCell) {
  return {
    bold: cell.emphasis === "bold",
    size: 10,
    color: styleColor("FF000000"),
  } as const;
}

function titleFont() {
  return {
    bold: true,
    size: 13,
    color: styleColor(TITLE_BLUE),
  } as const;
}

function rowFill(row: ExportBodyRow): string {
  if (row.podium) {
    return PODIUM_FILL;
  }
  return row.bandGroup % 2 === 0 ? WHITE_FILL : ZEBRA_FILL;
}

function widthForRole(role: ExportSection["columns"][number]["role"]): number {
  switch (role) {
    case "platz":
      return 8;
    case "identity_name":
      return 28;
    case "identity_club":
      return 24;
    case "race_km":
    case "race_pkt":
    case "total_km":
    case "total_pkt":
      return 11;
    default:
      return 14;
  }
}

function isCouplesSection(section: ExportSection): boolean {
  return section.bodyRows.some((row) => row.kind === "team_primary");
}

function sectionColumnCount(section: ExportSection): number {
  return isCouplesSection(section) ? section.columns.length + 4 : section.columns.length + 1;
}

function splitNameAndYob(value: string): { name: string; yob: string } {
  const match = value.match(/^(.*)\s+\(([^()]+)\)$/);
  if (!match) {
    return { name: value, yob: "" };
  }
  return {
    name: match[1]?.trim() ?? value,
    yob: match[2]?.trim() ?? "",
  };
}

function couplesTitle(section: ExportSection): string {
  const sectionPrefix = section.title.match(/^\d+\./)?.[0] ?? "";
  const duration = section.category.duration === "half_hour" ? "Halbstundenpaarlauf" : "Stundenpaarlauf";
  let division = "Mixed";
  switch (section.category.division) {
    case "couples_women":
      division = "Frauen";
      break;
    case "couples_men":
      division = "Männer";
      break;
    case "couples_mixed":
      division = "Mixed";
      break;
  }
  return `${sectionPrefix} ${duration} - ${division}`.trim();
}

function widthForExcelColumn(section: ExportSection, columnIndex: number): number {
  if (!isCouplesSection(section)) {
    switch (columnIndex) {
      case 0:
        return 8;
      case 1:
        return 26;
      case 2:
        return 8;
      case 3:
        return 22;
      default: {
        const originalIndex = columnIndex - 1;
        return widthForRole(section.columns[originalIndex]?.role ?? "race_km");
      }
    }
  }

  switch (columnIndex) {
    case 0:
      return 8;
    case 1:
    case 4:
      return 22;
    case 2:
    case 5:
      return 8;
    case 3:
    case 6:
      return 18;
    default: {
      const originalIndex = columnIndex - 4;
      return widthForRole(section.columns[originalIndex]?.role ?? "race_km");
    }
  }
}

function maxColumnCount(sections: readonly ExportSection[]): number {
  return sections.reduce((max, section) => Math.max(max, sectionColumnCount(section)), 1);
}

function applySheetColumnWidths(
  worksheet: ExcelJS.Worksheet,
  sections: readonly ExportSection[],
  sheetColumnCount: number,
): void {
  const widths = new Array<number>(sheetColumnCount).fill(12);
  sections.forEach((section) => {
    for (let index = 0; index < sectionColumnCount(section); index += 1) {
      widths[index] = Math.max(widths[index] ?? 12, widthForExcelColumn(section, index));
    }
  });
  worksheet.columns = widths.map((width) => ({ width }));
}

function spanOrigin(
  section: ExportSection,
  area: "header" | "body",
  rowIndex: number,
  columnIndex: number,
) {
  return (
    section.spans.find(
      (span) =>
        span.area === area &&
        span.startRow === rowIndex &&
        span.startCol === columnIndex,
    ) ?? null
  );
}

function coveredBySpan(
  section: ExportSection,
  area: "header" | "body",
  rowIndex: number,
  columnIndex: number,
) {
  return section.spans.some(
    (span) =>
      span.area === area &&
      rowIndex >= span.startRow &&
      rowIndex <= span.endRow &&
      columnIndex >= span.startCol &&
      columnIndex <= span.endCol &&
      !(span.startRow === rowIndex && span.startCol === columnIndex),
  );
}

function bodyCellForExcel(
  section: ExportSection,
  rowIndex: number,
  columnIndex: number,
): ExportCell | null {
  const row = section.bodyRows[rowIndex];
  const direct = row?.cells[columnIndex] ?? null;
  if (direct && direct.text !== "") {
    return direct;
  }
  const sourceSpan = section.spans.find(
    (span) =>
      span.area === "body" &&
      rowIndex >= span.startRow &&
      rowIndex <= span.endRow &&
      columnIndex >= span.startCol &&
      columnIndex <= span.endCol,
  );
  if (!sourceSpan) {
    return direct;
  }
  return section.bodyRows[sourceSpan.startRow]?.cells[sourceSpan.startCol] ?? direct;
}

function applyDefaultBorder(cell: ExcelJS.Cell): void {
  cell.border = {
    top: { style: "thin", color: styleColor(BORDER_GREY) },
    left: { style: "thin", color: styleColor(BORDER_GREY) },
    right: { style: "thin", color: styleColor(BORDER_GREY) },
    bottom: { style: "thin", color: styleColor(BORDER_GREY) },
  };
}

function renderTitleRow(
  worksheet: ExcelJS.Worksheet,
  rowIndex: number,
  section: ExportSection,
  sheetColumnCount: number,
): void {
  worksheet.mergeCells(rowIndex, 1, rowIndex, sheetColumnCount);
  const cell = worksheet.getCell(rowIndex, 1);
  cell.value = isCouplesSection(section) ? couplesTitle(section) : section.title;
  cell.font = titleFont();
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: styleColor(WHITE_FILL),
  };
  cell.border = {
    bottom: { style: "medium", color: styleColor(BORDER_GREY) },
  };
  worksheet.getRow(rowIndex).height = 22;
}

function setHeaderCell(
  worksheet: ExcelJS.Worksheet,
  rowIndex: number,
  columnIndex: number,
  text: string,
  options: {
    red?: boolean;
    mergeToRow?: number;
    mergeToCol?: number;
  } = {},
): void {
  const cell = worksheet.getCell(rowIndex, columnIndex);
  cell.value = text;
  cell.font = {
    bold: true,
    size: 10,
    color: styleColor(options.red ? HEADER_RED : "FF000000"),
  };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: styleColor(HEADER_FILL),
  };
  applyDefaultBorder(cell);
  if (options.mergeToRow != null || options.mergeToCol != null) {
    worksheet.mergeCells(
      rowIndex,
      columnIndex,
      options.mergeToRow ?? rowIndex,
      options.mergeToCol ?? columnIndex,
    );
  }
}

function renderHeaderRows(
  worksheet: ExcelJS.Worksheet,
  section: ExportSection,
  startRow: number,
): void {
  if (!isCouplesSection(section)) {
    const row1 = worksheet.getRow(startRow);
    const row2 = worksheet.getRow(startRow + 1);
    const row3 = worksheet.getRow(startRow + 2);
    row1.height = 22;
    row2.height = 18;
    row3.height = 18;

    const identityHeaders = ["Platz", "Vorname/Name", "Jg.", "Verein"];
    identityHeaders.forEach((header, index) => {
      setHeaderCell(worksheet, startRow, index + 1, header, {
        mergeToRow: startRow + 2,
      });
    });

    let excelColumn = 5;
    for (let index = 3; index < section.columns.length; index += 2) {
      const first = section.columns[index];
      const label = first?.role === "total_km" ? "Gesamt" : `${first?.raceNo ?? ""}. Lauf`;
      setHeaderCell(worksheet, startRow, excelColumn, label, {
        red: true,
        mergeToCol: excelColumn + 1,
      });
      setHeaderCell(worksheet, startRow + 1, excelColumn, "Laufstr.");
      setHeaderCell(worksheet, startRow + 1, excelColumn + 1, "Wertung");
      setHeaderCell(worksheet, startRow + 2, excelColumn, "(km)");
      setHeaderCell(worksheet, startRow + 2, excelColumn + 1, "(Punkte)");
      excelColumn += 2;
    }
    return;
  }

  if (isCouplesSection(section)) {
    const row1 = worksheet.getRow(startRow);
    const row2 = worksheet.getRow(startRow + 1);
    const row3 = worksheet.getRow(startRow + 2);
    row1.height = 22;
    row2.height = 18;
    row3.height = 18;

    const identityHeaders = ["Platz", "Vorname/Name", "Jg.", "Verein", "Vorname/Name", "Jg.", "Verein"];
    identityHeaders.forEach((header, index) => {
      setHeaderCell(worksheet, startRow, index + 1, header, {
        mergeToRow: startRow + 2,
      });
    });

    let excelColumn = 8;
    for (let index = 3; index < section.columns.length; index += 2) {
      const first = section.columns[index];
      const label = first?.role === "total_km" ? "Gesamt" : `${first?.raceNo ?? ""}. Lauf`;
      setHeaderCell(worksheet, startRow, excelColumn, label, {
        red: true,
        mergeToCol: excelColumn + 1,
      });
      setHeaderCell(worksheet, startRow + 1, excelColumn, "Laufstr.");
      setHeaderCell(worksheet, startRow + 1, excelColumn + 1, "Wertung");
      setHeaderCell(worksheet, startRow + 2, excelColumn, "(km)");
      setHeaderCell(worksheet, startRow + 2, excelColumn + 1, "(Punkte)");
      excelColumn += 2;
    }
    return;
  }

  section.headerRows.forEach((row, rowOffset) => {
    const excelRow = worksheet.getRow(startRow + rowOffset);
    excelRow.height = row.kind === "primary" ? 22 : 18;
    for (let columnIndex = 0; columnIndex < section.columns.length; columnIndex += 1) {
      if (coveredBySpan(section, "header", rowOffset, columnIndex)) {
        continue;
      }
      const cell = row.cells[columnIndex];
      if (!cell) {
        continue;
      }
      const excelCell = worksheet.getCell(startRow + rowOffset, columnIndex + 1);
      excelCell.value = cell.text;
      excelCell.font = headerFont(cell, row);
      excelCell.alignment = {
        horizontal: columnIndex < 3 ? "center" : "center",
        vertical: "middle",
        wrapText: true,
      };
      excelCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: styleColor(HEADER_FILL),
      };
      applyDefaultBorder(excelCell);
      const originSpan = spanOrigin(section, "header", rowOffset, columnIndex);
      if (originSpan) {
        worksheet.mergeCells(
          startRow + originSpan.startRow,
          originSpan.startCol + 1,
          startRow + originSpan.endRow,
          originSpan.endCol + 1,
        );
      }
    }
  });
}

function setBodyCell(
  worksheet: ExcelJS.Worksheet,
  rowIndex: number,
  columnIndex: number,
  value: string,
  fill: string,
  alignment: Alignment,
  emphasis: ExportCell["emphasis"] = "normal",
): void {
  const cell = worksheet.getCell(rowIndex, columnIndex);
  cell.value = value;
  cell.font = bodyFont({ text: value, emphasis });
  cell.alignment = {
    horizontal: alignment,
    vertical: "middle",
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: styleColor(fill),
  };
  applyDefaultBorder(cell);
}

function renderBodyRows(
  worksheet: ExcelJS.Worksheet,
  section: ExportSection,
  startRow: number,
): void {
  if (!isCouplesSection(section)) {
    section.bodyRows.forEach((row, rowOffset) => {
      const fill = rowFill(row);
      const identity = splitNameAndYob(row.cells[1]?.text ?? "");
      setBodyCell(worksheet, startRow + rowOffset, 1, row.cells[0]?.text ?? "", fill, "center");
      setBodyCell(worksheet, startRow + rowOffset, 2, identity.name, fill, "left");
      setBodyCell(worksheet, startRow + rowOffset, 3, identity.yob, fill, "center");
      setBodyCell(worksheet, startRow + rowOffset, 4, row.cells[2]?.text ?? "", fill, "left");

      for (let columnIndex = 3; columnIndex < row.cells.length; columnIndex += 1) {
        const cell = row.cells[columnIndex];
        const excelColumnIndex = columnIndex + 2;
        setBodyCell(
          worksheet,
          startRow + rowOffset,
          excelColumnIndex,
          cell?.text ?? "",
          fill,
          section.columns[columnIndex]?.align ?? "center",
          cell?.emphasis ?? "normal",
        );
      }
    });
    return;
  }

  if (isCouplesSection(section)) {
    let renderedRow = 0;
    for (let rowIndex = 0; rowIndex < section.bodyRows.length; rowIndex += 2) {
      const primary = section.bodyRows[rowIndex];
      const secondary = section.bodyRows[rowIndex + 1];
      if (!primary) {
        continue;
      }
      const fill = rowFill(primary);
      const excelRowIndex = startRow + renderedRow;
      const first = splitNameAndYob(primary.cells[1]?.text ?? "");
      const second = splitNameAndYob(secondary?.cells[1]?.text ?? "");

      setBodyCell(worksheet, excelRowIndex, 1, primary.cells[0]?.text ?? "", fill, "center");
      setBodyCell(worksheet, excelRowIndex, 2, first.name, fill, "left");
      setBodyCell(worksheet, excelRowIndex, 3, first.yob, fill, "center");
      setBodyCell(worksheet, excelRowIndex, 4, primary.cells[2]?.text ?? "", fill, "left");
      setBodyCell(worksheet, excelRowIndex, 5, second.name, fill, "left");
      setBodyCell(worksheet, excelRowIndex, 6, second.yob, fill, "center");
      setBodyCell(worksheet, excelRowIndex, 7, secondary?.cells[2]?.text ?? "", fill, "left");

      for (let columnIndex = 3; columnIndex < primary.cells.length; columnIndex += 1) {
        const cell = primary.cells[columnIndex];
        const excelColumnIndex = columnIndex + 5;
        setBodyCell(
          worksheet,
          excelRowIndex,
          excelColumnIndex,
          cell?.text ?? "",
          fill,
          section.columns[columnIndex]?.align ?? "center",
          cell?.emphasis ?? "normal",
        );
      }
      renderedRow += 1;
    }
    return;
  }

  section.bodyRows.forEach((row, rowOffset) => {
    const fill = rowFill(row);
    for (let columnIndex = 0; columnIndex < section.columns.length; columnIndex += 1) {
      const cell = bodyCellForExcel(section, rowOffset, columnIndex);
      const excelCell = worksheet.getCell(startRow + rowOffset, columnIndex + 1);
      excelCell.value = cell?.text ?? "";
      excelCell.font = bodyFont(cell ?? { text: "", emphasis: "normal" });
      excelCell.alignment = {
        horizontal: section.columns[columnIndex]?.align ?? "left",
        vertical: "middle",
      };
      excelCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: styleColor(fill),
      };
      applyDefaultBorder(excelCell);
    }
  });
}

function renderSection(
  worksheet: ExcelJS.Worksheet,
  section: ExportSection,
  startRow: number,
  sheetColumnCount: number,
): number {
  renderTitleRow(worksheet, startRow, section, sheetColumnCount);
  renderHeaderRows(worksheet, section, startRow + 1);
  renderBodyRows(worksheet, section, startRow + 1 + section.headerRows.length);
  const renderedBodyRowCount = isCouplesSection(section)
    ? Math.ceil(section.bodyRows.length / 2)
    : section.bodyRows.length;
  return startRow + 1 + section.headerRows.length + renderedBodyRowCount;
}

function buildWorkbookSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  sections: readonly ExportSection[],
): void {
  const worksheet = workbook.addWorksheet(sheetName);
  const sheetColumnCount = maxColumnCount(sections);
  applySheetColumnWidths(worksheet, sections, sheetColumnCount);

  if (sections.length === 0) {
    worksheet.getCell("A1").value = "Keine Läufe in dieser Exportgruppe vorhanden.";
    worksheet.getCell("A1").font = { italic: true, size: 10 };
    return;
  }

  let currentRow = 1;
  sections.forEach((section, index) => {
    currentRow = renderSection(worksheet, section, currentRow, sheetColumnCount);
    if (index < sections.length - 1) {
      currentRow += 2;
    }
  });
}

function writeBufferToBlob(buffer: ArrayBuffer | Uint8Array): Blob {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return new Blob([bytes], { type: XLSX_MIME_TYPE });
}

export async function renderExcelBlob(
  state: SeasonState,
  spec: ExportSpec,
  options: { seasonYear: number },
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "stundenlauf-ts";
  workbook.created = new Date();
  const sections = buildExportSections(state, toExcelSpec(spec), options);
  buildWorkbookSheet(workbook, EXCEL_SHEET_EINZEL, sections);
  const buffer = await workbook.xlsx.writeBuffer();
  return writeBufferToBlob(buffer as ArrayBuffer | Uint8Array);
}

export async function exportGesamtwertungWorkbook(
  state: SeasonState,
  options: ExcelExportOptions,
): Promise<ExcelExportArtifact> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "stundenlauf-ts";
  workbook.created = new Date();

  const specs = buildGuiLaufuebersichtDualSpecs(state, {
    layoutPreset: options.layoutPreset,
  });
  const einzelSections = specs.einzel
    ? buildExportSections(state, toExcelSpec(specs.einzel), {
        seasonYear: options.seasonYear,
      })
    : [];
  const paareSections = specs.paare
    ? buildExportSections(state, toExcelSpec(specs.paare), {
        seasonYear: options.seasonYear,
      })
    : [];

  buildWorkbookSheet(workbook, EXCEL_SHEET_EINZEL, einzelSections);
  buildWorkbookSheet(workbook, EXCEL_SHEET_PAARE, paareSections);

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    filename: excelFilename(options.filenameBase ?? `stundenlauf-${options.seasonYear}-ergebnisse`),
    blob: writeBufferToBlob(buffer as ArrayBuffer | Uint8Array),
  };
}
