import type { SeasonState } from "@/domain/types.ts";
import { splitCategoryKeysEinzelPaare, sortCategoryKeysForExport } from "./formatting.ts";
import { effectiveCategoryKeys } from "./projection.ts";
import { createExportSpec, normalizePdfLayoutPreset, type ExportSpec } from "./spec.ts";

export function buildLaufuebersichtGuiSpec(
  categories: readonly string[],
  options: {
    readonly sectionNumberStart: number;
    readonly layoutPreset?: string | null;
  },
): ExportSpec {
  const normalizedPreset = normalizePdfLayoutPreset(options.layoutPreset);
  return createExportSpec({
    format: "pdf",
    categories,
    columns: ["laufuebersicht_board"],
    rows: { eligibility: "eligible_only" },
    pdf: {
      pageSize: "A4",
      orientation: normalizedPreset === "compact" ? "portrait" : "landscape",
      tableLayout: "laufuebersicht",
      pageBreakBeforeEachCategory: true,
      layoutPreset: normalizedPreset,
      laufuebersichtSectionNumberStart: options.sectionNumberStart,
    },
  });
}

export function buildGuiLaufuebersichtDualSpecs(
  state: SeasonState,
  options: {
    readonly layoutPreset?: string | null;
  } = {},
): { einzel: ExportSpec | null; paare: ExportSpec | null } {
  const categoryKeys = sortCategoryKeysForExport(effectiveCategoryKeys(state));
  if (categoryKeys.length === 0) {
    throw new Error("Keine Läufe in der Saison; PDF-Export ist nicht möglich.");
  }
  const [einzelKeys, paareKeys] = splitCategoryKeysEinzelPaare(categoryKeys);
  return {
    einzel:
      einzelKeys.length > 0
        ? buildLaufuebersichtGuiSpec(einzelKeys, {
            sectionNumberStart: 1,
            layoutPreset: options.layoutPreset,
          })
        : null,
    paare:
      paareKeys.length > 0
        ? buildLaufuebersichtGuiSpec(paareKeys, {
            sectionNumberStart: einzelKeys.length + 1,
            layoutPreset: options.layoutPreset,
          })
        : null,
  };
}
