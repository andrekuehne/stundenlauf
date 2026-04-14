/**
 * Client-side PDF generation for standings via jsPDF + AutoTable.
 *
 * Reference: F-TS08 (Standings and Results Export)
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { buildGuiLaufuebersichtDualSpecs } from "./gui-pdf-spec.ts";
import { podiumFillForBand, resolvePdfLayoutTokens, type RgbColor, type ResolvedPdfLayoutTokens } from "./layout-tokens.ts";
import {
  buildExportSections,
  type ColumnDef,
  type ColumnRule,
  type ExportCell,
  type ExportSection,
  type RowRule,
} from "./projection.ts";
import { resolvedLaufuebersichtNotice, type ExportSpec, type PdfStyleSpec } from "./spec.ts";
import type { SeasonState } from "@/domain/types.ts";

type AutoTableCellInput = string | { content: string; rowSpan?: number; colSpan?: number; styles?: Record<string, unknown> };

export interface PdfExportArtifact {
  readonly filename: string;
  readonly blob: Blob;
}

function ptToCm(points: number): number {
  return points / 28.3464567;
}

function rgbTuple(color: RgbColor): [number, number, number] {
  return [color.r, color.g, color.b];
}

function nowExportTimestamp(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hour = String(now.getUTCHours()).padStart(2, "0");
  const minute = String(now.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute} UTC`;
}

function createDocument(pdf: PdfStyleSpec): jsPDF {
  return new jsPDF({
    orientation: pdf.orientation,
    unit: "cm",
    format: "a4",
  });
}

function columnWidth(column: ColumnDef, tokens: ResolvedPdfLayoutTokens): number | null {
  switch (column.role) {
    case "platz":
      return tokens.narrowPlatzCm;
    case "points_total":
      return tokens.narrowPointsTotalCm;
    case "distance_total":
      return tokens.narrowDistanceTotalCm;
    case "race_km":
    case "race_pkt":
    case "total_km":
    case "total_pkt":
      return tokens.narrowRaceKmPktCm;
    default:
      return null;
  }
}

function tableColumnWidths(
  columns: readonly ColumnDef[],
  pageWidthCm: number,
  tokens: ResolvedPdfLayoutTokens,
): number[] {
  const available = pageWidthCm - tokens.marginLeftCm - tokens.marginRightCm;
  const widths = new Array<number>(columns.length).fill(0);
  let fixed = 0;
  const flexible: number[] = [];
  columns.forEach((column, index) => {
    const resolved = columnWidth(column, tokens);
    if (resolved == null) {
      flexible.push(index);
      return;
    }
    widths[index] = resolved;
    fixed += resolved;
  });
  const flexibleWidth = flexible.length > 0 ? Math.max((available - fixed) / flexible.length, 1.2) : 0;
  for (const index of flexible) {
    widths[index] = flexibleWidth;
  }
  return widths;
}

function spanOrigin(
  spans: ExportSection["spans"],
  area: "header" | "body",
  row: number,
  column: number,
): ExportSection["spans"][number] | null {
  return (
    spans.find(
      (span) =>
        span.area === area &&
        span.startRow === row &&
        span.startCol === column,
    ) ?? null
  );
}

function isCoveredBySpan(
  spans: ExportSection["spans"],
  area: "header" | "body",
  row: number,
  column: number,
): boolean {
  return spans.some(
    (span) =>
      span.area === area &&
      row >= span.startRow &&
      row <= span.endRow &&
      column >= span.startCol &&
      column <= span.endCol &&
      !(span.startRow === row && span.startCol === column),
  );
}

function cellStyles(cell: ExportCell): Record<string, unknown> | undefined {
  const styles: Record<string, unknown> = {};
  if (cell.emphasis === "bold") {
    styles.fontStyle = "bold";
  }
  if (cell.colorRole === "headerRunRed") {
    styles.textColor = [198, 40, 40];
  }
  return Object.keys(styles).length > 0 ? styles : undefined;
}

function buildAutoTableRows(
  section: ExportSection,
  area: "header" | "body",
): AutoTableCellInput[][] {
  const rows = area === "header" ? section.headerRows.map((row) => row.cells) : section.bodyRows.map((row) => row.cells);
  return rows.map((cells, rowIndex) => {
    const rendered: AutoTableCellInput[] = [];
    for (let columnIndex = 0; columnIndex < section.columns.length; columnIndex += 1) {
      if (isCoveredBySpan(section.spans, area, rowIndex, columnIndex)) {
        continue;
      }
      const cell = cells[columnIndex];
      const span = spanOrigin(section.spans, area, rowIndex, columnIndex);
      if (!cell) {
        rendered.push("");
        continue;
      }
      if (!span) {
        rendered.push(
          cellStyles(cell)
            ? {
                content: cell.text,
                styles: cellStyles(cell),
              }
            : cell.text,
        );
        continue;
      }
      rendered.push({
        content: cell.text,
        rowSpan: span.endRow - span.startRow + 1,
        colSpan: span.endCol - span.startCol + 1,
        styles: cellStyles(cell),
      });
    }
    return rendered;
  });
}

function lineWidthForRule(rule: RuleStyleLike, tokens: ResolvedPdfLayoutTokens): number {
  switch (rule) {
    case "thin":
      return ptToCm(tokens.lineThinPt);
    case "thick":
      return ptToCm(tokens.lineThickPt);
    case "double":
      return ptToCm(tokens.doubleRuleWeightPt);
    case "dashed":
    case "normal":
    default:
      return ptToCm(tokens.lineNormalPt);
  }
}

type RuleStyleLike = ColumnRule["style"] | RowRule["style"];

function setDash(doc: jsPDF, style: RuleStyleLike): void {
  const dashApi = doc as jsPDF & {
    setLineDashPattern: (dashArray: number[], dashPhase?: number) => jsPDF;
  };
  if (style === "dashed") {
    dashApi.setLineDashPattern([ptToCm(2), ptToCm(2)], 0);
    return;
  }
  dashApi.setLineDashPattern([], 0);
}

function drawRuleLine(
  doc: jsPDF,
  tokens: ResolvedPdfLayoutTokens,
  rule: RuleStyleLike,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  doc.setDrawColor(...rgbTuple(tokens.lineGrey));
  doc.setLineWidth(lineWidthForRule(rule, tokens));
  setDash(doc, rule);
  if (rule === "double") {
    const gap = ptToCm(tokens.doubleRuleGapPt);
    if (x1 === x2) {
      doc.line(x1 - gap / 2, y1, x2 - gap / 2, y2);
      doc.line(x1 + gap / 2, y1, x2 + gap / 2, y2);
    } else {
      doc.line(x1, y1 - gap / 2, x2, y2 - gap / 2);
      doc.line(x1, y1 + gap / 2, x2, y2 + gap / 2);
    }
  } else {
    doc.line(x1, y1, x2, y2);
  }
  setDash(doc, "normal");
}

function drawFooter(
  doc: jsPDF,
  tokens: ResolvedPdfLayoutTokens,
  pdf: PdfStyleSpec,
  context: { seasonYear: number; categoryLabel: string },
  exportTimestamp: string,
): void {
  const parts: string[] = [];
  if (pdf.showOrganizerFooter && pdf.organizerFooter.trim()) {
    parts.push(pdf.organizerFooter.trim());
  }
  if (pdf.showSeasonFooter) {
    parts.push(`Saison ${context.seasonYear}`);
  }
  if (pdf.showCategoryFooter && context.categoryLabel) {
    parts.push(context.categoryLabel);
  }
  if (pdf.showExportTimestampFooter) {
    parts.push(`Export: ${exportTimestamp}`);
  }
  if (parts.length === 0) {
    return;
  }
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(tokens.footerFontSizePt);
  doc.setTextColor(0, 0, 0);
  doc.text(parts.join(" - "), pageWidth / 2, doc.internal.pageSize.getHeight() - tokens.footerYCm, {
    align: "center",
    baseline: "bottom",
  });
}

function drawFirstPageIntro(
  doc: jsPDF,
  spec: ExportSpec,
  section: ExportSection,
  tokens: ResolvedPdfLayoutTokens,
): number {
  const cover = section.cover;
  if (!cover) {
    return tokens.marginTopCm;
  }
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;
  let y = tokens.marginTopCm;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(tokens.coverYearFontSizePt);
  doc.setTextColor(...rgbTuple(tokens.coverYearBlue));
  doc.text(String(cover.seasonYear), centerX, y, { align: "center", baseline: "top" });
  y += ptToCm(tokens.coverYearLeadingPt) + tokens.coverSpacerAfterCm;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(tokens.coverNoticeFontSizePt);
  doc.setTextColor(0, 0, 0);
  doc.text("Hinweis:", centerX, y, { align: "center", baseline: "top" });
  y += ptToCm(tokens.coverNoticeLeadingPt);

  doc.setFont("helvetica", "normal");
  const maxWidth = pageWidth - tokens.marginLeftCm - tokens.marginRightCm;
  const splitLines: unknown = doc.splitTextToSize(
    cover.notice || resolvedLaufuebersichtNotice(spec.pdf),
    maxWidth,
  );
  const lines = Array.isArray(splitLines) ? splitLines : [splitLines];
  doc.text(lines, centerX, y, {
    align: "center",
    baseline: "top",
    maxWidth,
  });

  return y + lines.length * ptToCm(tokens.coverNoticeLeadingPt) + tokens.coverSpacerAfterCm;
}

function bodyFillColor(
  section: ExportSection,
  rowIndex: number,
  tokens: ResolvedPdfLayoutTokens,
): [number, number, number] {
  const row = section.bodyRows[rowIndex];
  if (!row) {
    return rgbTuple(tokens.zebraEven);
  }
  if (row.podium) {
    return rgbTuple(podiumFillForBand(row.bandGroup, tokens));
  }
  return rgbTuple(row.bandGroup % 2 === 0 ? tokens.zebraEven : tokens.zebraOdd);
}

function rawSpanValue(raw: unknown, key: "rowSpan" | "colSpan"): number {
  if (!raw || typeof raw !== "object") {
    return 1;
  }
  const candidate = (raw as Record<string, unknown>)[key];
  return typeof candidate === "number" && candidate > 1 ? candidate : 1;
}

function renderSectionTable(
  doc: jsPDF,
  section: ExportSection,
  spec: ExportSpec,
  seasonYear: number,
  exportTimestamp: string,
): number {
  const tokens = resolvePdfLayoutTokens(spec.pdf);
  const pageWidth = doc.internal.pageSize.getWidth();
  const head = buildAutoTableRows(section, "header");
  const body = buildAutoTableRows(section, "body");
  const widths = tableColumnWidths(section.columns, pageWidth, tokens);
  const columnStyles = Object.fromEntries(
    widths.map((width, index) => [
      index,
      {
        cellWidth: width,
        halign: section.columns[index]?.align ?? "left",
      },
    ]),
  );

  const titleY = drawFirstPageIntro(doc, spec, section, tokens);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(tokens.sectionTitleFontSizePt);
  doc.setTextColor(0, 0, 0);
  doc.text(section.title, pageWidth / 2, titleY, { align: "center", baseline: "top" });
  let startY = titleY + ptToCm(tokens.sectionTitleFontSizePt + tokens.sectionTitleSpaceAfterPt);
  if (section.subtitle.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(tokens.sectionSubtitleFontSizePt);
    doc.text(section.subtitle, pageWidth / 2, startY, { align: "center", baseline: "top" });
    startY += ptToCm(tokens.sectionSubtitleFontSizePt + tokens.sectionSubtitleSpaceAfterPt);
  }

  autoTable(doc, {
    head,
    body,
    startY,
    margin: {
      left: tokens.marginLeftCm,
      right: tokens.marginRightCm,
      bottom: tokens.marginBottomCm,
    },
    showHead: spec.pdf.repeatHeader ? "everyPage" : "firstPage",
    theme: section.columnRules.length > 0 ? "plain" : "grid",
    styles: {
      font: "helvetica",
      fontSize: tokens.tableFontSizePt,
      cellPadding: {
        top: ptToCm(tokens.tableCellVerticalPaddingPt),
        bottom: ptToCm(tokens.tableCellVerticalPaddingPt),
        left: ptToCm(tokens.tableCellHorizontalPaddingPt),
        right: ptToCm(tokens.tableCellHorizontalPaddingPt),
      },
      lineWidth: section.columnRules.length > 0 ? 0 : ptToCm(tokens.lineNormalPt),
      lineColor: rgbTuple(tokens.lineGrey),
      overflow: "linebreak",
      valign: "middle",
      textColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: section.columnRules.length > 0 ? rgbTuple(tokens.headerGreen) : [235, 235, 235],
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
      textColor: [0, 0, 0],
      lineWidth: 0,
    },
    bodyStyles: {
      lineWidth: 0,
    },
    columnStyles,
    didParseCell: (data) => {
      if (data.section === "head") {
        const rowKind = section.headerRows[data.row.index]?.kind;
        if (rowKind && rowKind !== "primary") {
          data.cell.styles.fontStyle = "normal";
          data.cell.styles.fontSize = Math.max(
            tokens.tableHeaderSecondaryMinPt,
            tokens.tableHeaderFontSizePt - tokens.tableHeaderSecondaryDeltaPt,
          );
        } else {
          data.cell.styles.fontSize = tokens.tableHeaderFontSizePt;
        }
        const raw = data.cell.raw as Record<string, unknown> | undefined;
        const textColor = raw?.styles && typeof raw.styles === "object" ? (raw.styles as Record<string, unknown>).textColor : undefined;
        if (Array.isArray(textColor)) {
          data.cell.styles.textColor = textColor as [number, number, number];
        }
        return;
      }

      const bodyRow = section.bodyRows[data.row.index];
      if (!bodyRow) {
        return;
      }
      data.cell.styles.fillColor = bodyFillColor(section, data.row.index, tokens);
      data.cell.styles.fontSize = tokens.tableFontSizePt;
      const raw = data.cell.raw as Record<string, unknown> | undefined;
      const fontStyle = raw?.styles && typeof raw.styles === "object" ? (raw.styles as Record<string, unknown>).fontStyle : undefined;
      if (fontStyle === "bold") {
        data.cell.styles.fontStyle = "bold";
      }
    },
    didDrawCell: (data) => {
      if (data.section !== "head" && data.section !== "body") {
        return;
      }

      const raw = data.cell.raw as Record<string, unknown> | undefined;
      const rowSpan = rawSpanValue(raw, "rowSpan");
      const colSpan = rawSpanValue(raw, "colSpan");
      const endColumnIndex = data.column.index + colSpan - 1;
      const columnRule = section.columnRules.find((rule) => rule.afterColumn === endColumnIndex) ?? null;
      if (columnRule) {
        drawRuleLine(
          doc,
          tokens,
          columnRule.style,
          data.cell.x + data.cell.width,
          data.cell.y,
          data.cell.x + data.cell.width,
          data.cell.y + data.cell.height,
        );
      }

      if (data.section === "head") {
        const bottomHeaderRowIndex = data.row.index + rowSpan - 1;
        if (bottomHeaderRowIndex === section.headerRows.length - 1) {
          drawRuleLine(
            doc,
            tokens,
            section.headerSeparatorStyle,
            data.cell.x,
            data.cell.y + data.cell.height,
            data.cell.x + data.cell.width,
            data.cell.y + data.cell.height,
          );
        }
        return;
      }

      const bottomBodyRowIndex = data.row.index + rowSpan - 1;
      const rowRule = section.rowRules.find((rule) => rule.afterBodyRow === bottomBodyRowIndex) ?? null;
      if (rowRule) {
        drawRuleLine(
          doc,
          tokens,
          rowRule.style,
          data.cell.x,
          data.cell.y + data.cell.height,
          data.cell.x + data.cell.width,
          data.cell.y + data.cell.height,
        );
      }
    },
    didDrawPage: () => {
      drawFooter(doc, tokens, spec.pdf, {
        seasonYear,
        categoryLabel: section.footerContext.categoryLabel,
      }, exportTimestamp);
    },
  });

  const lastY = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
  return typeof lastY === "number" ? lastY : startY;
}

export function renderPdfBlob(
  state: SeasonState,
  spec: ExportSpec,
  options: {
    readonly seasonYear: number;
  },
): Blob {
  const sections = buildExportSections(state, spec, { seasonYear: options.seasonYear });
  const doc = createDocument(spec.pdf);
  const exportTimestamp = nowExportTimestamp();

  sections.forEach((section, index) => {
    if (index > 0 && spec.pdf.pageBreakBeforeEachCategory) {
      doc.addPage();
    }

    renderSectionTable(doc, section, spec, options.seasonYear, exportTimestamp);
  });

  if (sections.length === 0) {
    drawFooter(doc, resolvePdfLayoutTokens(spec.pdf), spec.pdf, {
      seasonYear: options.seasonYear,
      categoryLabel: "",
    }, exportTimestamp);
  }

  const output = doc.output("arraybuffer");
  return new globalThis.Blob([new Uint8Array(output)], { type: "application/pdf" });
}

export function exportLaufuebersichtDualPdfs(
  state: SeasonState,
  options: {
    readonly seasonYear: number;
    readonly filenameBase: string;
    readonly layoutPreset?: string | null;
  },
): PdfExportArtifact[] {
  const specs = buildGuiLaufuebersichtDualSpecs(state, {
    layoutPreset: options.layoutPreset,
  });
  const artifacts: PdfExportArtifact[] = [];
  if (specs.einzel) {
    artifacts.push({
      filename: `${options.filenameBase}_einzel.pdf`,
      blob: renderPdfBlob(state, specs.einzel, { seasonYear: options.seasonYear }),
    });
  }
  if (specs.paare) {
    artifacts.push({
      filename: `${options.filenameBase}_paare.pdf`,
      blob: renderPdfBlob(state, specs.paare, { seasonYear: options.seasonYear }),
    });
  }
  if (artifacts.length === 0) {
    throw new Error("PDF-Export: keine Wertungskategorien in der Saison.");
  }
  return artifacts;
}
