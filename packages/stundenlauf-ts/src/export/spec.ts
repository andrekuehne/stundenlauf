export type ExportFormat = "pdf" | "xlsx";
export type RowEligibility = "eligible_only" | "full_grid";
export type TableLayout = "flat" | "laufuebersicht";
export type ExportColumnId =
  | "platz"
  | "display_name"
  | "club"
  | "yob"
  | "punkte_gesamt"
  | "distanz_gesamt"
  | "ausser_wertung"
  | "entity_uid"
  | "entity_kind"
  | "team_members"
  | "points_per_race";

export const KNOWN_COLUMN_IDS = new Set<ExportColumnId>([
  "platz",
  "display_name",
  "club",
  "yob",
  "punkte_gesamt",
  "distanz_gesamt",
  "ausser_wertung",
  "entity_uid",
  "entity_kind",
  "team_members",
  "points_per_race",
]);

export const COLUMN_PRESETS = {
  minimal: ["platz", "display_name", "punkte_gesamt", "distanz_gesamt"],
  official_board: ["platz", "display_name", "club", "punkte_gesamt", "distanz_gesamt"],
  laufuebersicht_board: [],
  debug_uid: [
    "platz",
    "display_name",
    "club",
    "yob",
    "punkte_gesamt",
    "distanz_gesamt",
    "entity_uid",
    "entity_kind",
  ],
} satisfies Record<string, readonly ExportColumnId[]>;

export type ExportColumnPreset = keyof typeof COLUMN_PRESETS;

export const GERMAN_HEADER_BY_COLUMN: Record<ExportColumnId, string> = {
  platz: "Platz",
  display_name: "Name",
  club: "Verein",
  yob: "Jg.",
  punkte_gesamt: "Punkte",
  distanz_gesamt: "km",
  ausser_wertung: "Außer Wertung",
  entity_uid: "UID",
  entity_kind: "Art",
  team_members: "Team",
  points_per_race: "Lauf",
};

export const DEFAULT_PDF_ORGANIZER_FOOTER = "HSG Uni Greifswald Triathlon Laufgruppe";

export const DEFAULT_LAUFUEBERSICHT_NOTICE =
  "In die Pokalwertung kommen alle Ergebnisse von Teilnehmern, die mindestens an drei Veranstaltungen teilgenommen haben. Für die Gesamtwertung werden maximal die vier besten Ergebnisse von insgesamt fünf Läufen berücksichtigt.";

export interface PdfLayoutOverrides {
  marginLeftCm: number;
  marginRightCm: number;
  marginTopCm: number;
  marginBottomCm: number;
  footerFontSizePt: number;
  footerYCm: number;
  sectionTitleFontSizePt: number;
  sectionTitleSpaceAfterPt: number;
  sectionSubtitleFontSizePt: number;
  sectionSubtitleSpaceAfterPt: number;
  coverYearFontSizePt: number;
  coverYearLeadingPt: number;
  coverYearSpaceAfterPt: number;
  coverNoticeFontSizePt: number;
  coverNoticeLeadingPt: number;
  coverSpacerAfterCm: number;
  tableSpacerAfterCm: number;
  lineThinPt: number;
  lineNormalPt: number;
  lineThickPt: number;
  doubleRuleWeightPt: number;
  doubleRuleGapPt: number;
  tableFontSizePt: number;
  tableHeaderFontSizePt: number;
  tableHeaderSecondaryDeltaPt: number;
  tableHeaderSecondaryMinPt: number;
  tablePlainLeadingExtraPt: number;
  tableResultLeadingExtraPt: number;
  tableCellHorizontalPaddingPt: number;
  tableCellVerticalPaddingPt: number;
  narrowPlatzCm: number;
  narrowPointsTotalCm: number;
  narrowDistanceTotalCm: number;
  narrowRaceKmPktCm: number;
  colorLineGreyHex: string;
  colorHeaderGreenHex: string;
  colorHeaderRunRedHex: string;
  colorCoverYearBlueHex: string;
  colorZebraEvenHex: string;
  colorZebraOddHex: string;
  colorPodiumTintHex: string;
}

export interface PdfStyleSpec {
  readonly pageSize: "A4";
  readonly orientation: "portrait" | "landscape";
  readonly title: string;
  readonly subtitle: string;
  readonly repeatHeader: boolean;
  readonly pageBreakBeforeEachCategory: boolean;
  readonly organizerFooter: string;
  readonly showOrganizerFooter: boolean;
  readonly showSeasonFooter: boolean;
  readonly showCategoryFooter: boolean;
  readonly showExportTimestampFooter: boolean;
  readonly tableLayout: TableLayout;
  readonly layoutPreset: string | null;
  readonly laufuebersichtShowCover: boolean;
  readonly laufuebersichtSectionNumberStart: number;
  readonly laufuebersichtNotice: string;
  readonly layoutOverrides: Partial<PdfLayoutOverrides>;
}

export interface ExportSpec {
  readonly format: ExportFormat;
  readonly categories: readonly string[];
  readonly columns: readonly (ExportColumnId | ExportColumnPreset)[];
  readonly rows: {
    readonly eligibility: RowEligibility;
  };
  readonly pdf: PdfStyleSpec;
}

export interface PdfLayoutPresetCatalogEntry {
  readonly id: string;
  readonly label_de: string;
}

export interface CreateExportSpecInput {
  readonly format?: ExportFormat;
  readonly categories: readonly string[];
  readonly columns?: readonly (ExportColumnId | ExportColumnPreset)[];
  readonly rows?: {
    readonly eligibility?: RowEligibility;
  };
  readonly pdf?: Partial<PdfStyleSpec>;
}

const DEFAULT_LAYOUT_OVERRIDES: PdfLayoutOverrides = {
  marginLeftCm: 1.5,
  marginRightCm: 1.5,
  marginTopCm: 1.5,
  marginBottomCm: 1.8,
  footerFontSizePt: 8,
  footerYCm: 1,
  sectionTitleFontSizePt: 14,
  sectionTitleSpaceAfterPt: 6,
  sectionSubtitleFontSizePt: 10,
  sectionSubtitleSpaceAfterPt: 12,
  coverYearFontSizePt: 26,
  coverYearLeadingPt: 30,
  coverYearSpaceAfterPt: 14,
  coverNoticeFontSizePt: 10,
  coverNoticeLeadingPt: 13,
  coverSpacerAfterCm: 0.35,
  tableSpacerAfterCm: 0.6,
  lineThinPt: 0.12,
  lineNormalPt: 0.25,
  lineThickPt: 0.75,
  doubleRuleWeightPt: 0.85,
  doubleRuleGapPt: 1.25,
  tableFontSizePt: 7,
  tableHeaderFontSizePt: 8,
  tableHeaderSecondaryDeltaPt: 2,
  tableHeaderSecondaryMinPt: 5,
  tablePlainLeadingExtraPt: 1,
  tableResultLeadingExtraPt: 2,
  tableCellHorizontalPaddingPt: 6,
  tableCellVerticalPaddingPt: 3,
  narrowPlatzCm: 0.95,
  narrowPointsTotalCm: 1.15,
  narrowDistanceTotalCm: 1.35,
  narrowRaceKmPktCm: 1.25,
  colorLineGreyHex: "#808080",
  colorHeaderGreenHex: "#E8F5E9",
  colorHeaderRunRedHex: "#C62828",
  colorCoverYearBlueHex: "#1565C0",
  colorZebraEvenHex: "#FFFFFF",
  colorZebraOddHex: "#F5F5F5",
  colorPodiumTintHex: "#C8DCFF",
};

export const PDF_LAYOUT_PRESETS: Record<
  string,
  Partial<Pick<PdfStyleSpec, "orientation">> & {
    layoutOverrides?: Partial<PdfLayoutOverrides>;
  }
> = {
  default: {},
  compact: {
    orientation: "portrait" as const,
    layoutOverrides: {
      marginLeftCm: 0.45,
      marginRightCm: 0.45,
      marginTopCm: 0.45,
      marginBottomCm: 0.65,
      footerFontSizePt: 5.5,
      footerYCm: 0.55,
      sectionTitleFontSizePt: 9,
      sectionTitleSpaceAfterPt: 1.5,
      sectionSubtitleFontSizePt: 6.5,
      sectionSubtitleSpaceAfterPt: 3,
      coverYearFontSizePt: 16,
      coverYearLeadingPt: 18,
      coverYearSpaceAfterPt: 6,
      coverNoticeFontSizePt: 6.5,
      coverNoticeLeadingPt: 8.5,
      coverSpacerAfterCm: 0.2,
      tableSpacerAfterCm: 0.25,
      tableFontSizePt: 5,
      tableHeaderFontSizePt: 5,
      tableResultLeadingExtraPt: 0,
      tablePlainLeadingExtraPt: 1,
      tableCellHorizontalPaddingPt: 2,
      tableCellVerticalPaddingPt: 0.45,
      narrowPlatzCm: 0.72,
      narrowPointsTotalCm: 0.82,
      narrowDistanceTotalCm: 0.88,
      narrowRaceKmPktCm: 0.88,
      doubleRuleWeightPt: 0.45,
      doubleRuleGapPt: 0.5,
    },
  },
};

export const PDF_LAYOUT_PRESET_LABELS_DE: Record<string, string> = {
  default: "Standard",
  compact: "Kompakt (Hochformat, wenig Weißraum, kleine Schrift)",
};

function ensureKnownPreset(preset: string | null): string | null {
  if (!preset || preset === "default") {
    return null;
  }
  if (!(preset in PDF_LAYOUT_PRESETS)) {
    throw new Error(`Unknown PDF layout preset "${preset}".`);
  }
  return preset;
}

export function pdfLayoutPresetCatalog(): PdfLayoutPresetCatalogEntry[] {
  const preferred = ["default", "compact"];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const presetId of preferred) {
    if (presetId in PDF_LAYOUT_PRESETS) {
      ordered.push(presetId);
      seen.add(presetId);
    }
  }
  for (const presetId of Object.keys(PDF_LAYOUT_PRESETS).sort()) {
    if (!seen.has(presetId)) {
      ordered.push(presetId);
    }
  }
  return ordered.map((presetId) => ({
    id: presetId,
    label_de: PDF_LAYOUT_PRESET_LABELS_DE[presetId] ?? presetId,
  }));
}

export function normalizePdfLayoutPreset(raw: string | null | undefined): string | null {
  const key = raw?.trim().toLowerCase() ?? "";
  if (!key || key === "default" || key === "standard") {
    return null;
  }
  if (key in PDF_LAYOUT_PRESETS) {
    return key;
  }
  for (const [presetId, label] of Object.entries(PDF_LAYOUT_PRESET_LABELS_DE)) {
    if (label.toLowerCase().includes(key)) {
      return presetId;
    }
  }
  throw new Error(`Unknown PDF layout preset "${raw ?? ""}".`);
}

export function resolvePdfLayoutOverrides(pdf: PdfStyleSpec): PdfLayoutOverrides {
  const preset = pdf.layoutPreset ? PDF_LAYOUT_PRESETS[pdf.layoutPreset] : undefined;
  return {
    ...DEFAULT_LAYOUT_OVERRIDES,
    ...(preset?.layoutOverrides ?? {}),
    ...pdf.layoutOverrides,
  };
}

export function createPdfStyleSpec(input: Partial<PdfStyleSpec> = {}): PdfStyleSpec {
  const normalizedPreset = ensureKnownPreset(normalizePdfLayoutPreset(input.layoutPreset));
  const preset = normalizedPreset ? PDF_LAYOUT_PRESETS[normalizedPreset] : undefined;
  const orientation = input.orientation ?? preset?.orientation ?? "landscape";
  const sectionNumberStart = input.laufuebersichtSectionNumberStart ?? 1;
  if (sectionNumberStart < 1) {
    throw new Error("laufuebersichtSectionNumberStart must be >= 1.");
  }
  return {
    pageSize: "A4",
    orientation,
    title: input.title ?? "",
    subtitle: input.subtitle ?? "",
    repeatHeader: input.repeatHeader ?? true,
    pageBreakBeforeEachCategory: input.pageBreakBeforeEachCategory ?? false,
    organizerFooter: input.organizerFooter?.trim() || DEFAULT_PDF_ORGANIZER_FOOTER,
    showOrganizerFooter: input.showOrganizerFooter ?? true,
    showSeasonFooter: input.showSeasonFooter ?? true,
    showCategoryFooter: input.showCategoryFooter ?? true,
    showExportTimestampFooter: input.showExportTimestampFooter ?? true,
    tableLayout: input.tableLayout ?? "flat",
    layoutPreset: normalizedPreset,
    laufuebersichtShowCover: input.laufuebersichtShowCover ?? true,
    laufuebersichtSectionNumberStart: sectionNumberStart,
    laufuebersichtNotice: input.laufuebersichtNotice?.trim() ?? "",
    layoutOverrides: { ...(input.layoutOverrides ?? {}) },
  };
}

export function resolveColumns(spec: ExportSpec): ExportColumnId[] {
  if (spec.pdf.tableLayout === "laufuebersicht") {
    if (
      spec.columns.length !== 1 ||
      spec.columns[0] !== "laufuebersicht_board"
    ) {
      throw new Error(
        "pdf.tableLayout 'laufuebersicht' requires columns: ['laufuebersicht_board'] exactly.",
      );
    }
    return [];
  }

  const resolved: ExportColumnId[] = [];
  for (const item of spec.columns) {
    if (item === "laufuebersicht_board") {
      throw new Error("laufuebersicht_board is only valid with pdf.tableLayout='laufuebersicht'.");
    }
    if (item in COLUMN_PRESETS) {
      resolved.push(...COLUMN_PRESETS[item as ExportColumnPreset]);
      continue;
    }
    if (KNOWN_COLUMN_IDS.has(item as ExportColumnId)) {
      resolved.push(item as ExportColumnId);
      continue;
    }
    throw new Error(`Unknown export column or preset "${item}".`);
  }
  return resolved;
}

export function createExportSpec(input: CreateExportSpecInput): ExportSpec {
  if (input.categories.length === 0) {
    throw new Error("Export categories must not be empty.");
  }
  const spec: ExportSpec = {
    format: input.format ?? "pdf",
    categories: [...input.categories],
    columns: input.columns ?? ["official_board"],
    rows: {
      eligibility: input.rows?.eligibility ?? "eligible_only",
    },
    pdf: createPdfStyleSpec(input.pdf),
  };
  resolveColumns(spec);
  return spec;
}

export function resolvedLaufuebersichtNotice(pdf: PdfStyleSpec): string {
  return pdf.laufuebersichtNotice.trim() || DEFAULT_LAUFUEBERSICHT_NOTICE;
}
