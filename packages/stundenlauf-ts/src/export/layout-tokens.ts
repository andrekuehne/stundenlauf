import type { PdfLayoutOverrides, PdfStyleSpec } from "./spec.ts";
import { resolvePdfLayoutOverrides } from "./spec.ts";

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface ResolvedPdfLayoutTokens extends PdfLayoutOverrides {
  readonly lineGrey: RgbColor;
  readonly headerGreen: RgbColor;
  readonly headerRunRed: RgbColor;
  readonly coverYearBlue: RgbColor;
  readonly zebraEven: RgbColor;
  readonly zebraOdd: RgbColor;
  readonly podiumTint: RgbColor;
}

export function hexToRgb(hex: string): RgbColor {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[\da-f]{6}$/i.test(normalized)) {
    throw new Error(`Invalid hex color "${hex}".`);
  }
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

export function resolvePdfLayoutTokens(pdf: PdfStyleSpec): ResolvedPdfLayoutTokens {
  const layout = resolvePdfLayoutOverrides(pdf);
  return {
    ...layout,
    lineGrey: hexToRgb(layout.colorLineGreyHex),
    headerGreen: hexToRgb(layout.colorHeaderGreenHex),
    headerRunRed: hexToRgb(layout.colorHeaderRunRedHex),
    coverYearBlue: hexToRgb(layout.colorCoverYearBlueHex),
    zebraEven: hexToRgb(layout.colorZebraEvenHex),
    zebraOdd: hexToRgb(layout.colorZebraOddHex),
    podiumTint: hexToRgb(layout.colorPodiumTintHex),
  };
}

export function podiumFillForBand(
  bandGroup: number,
  tokens: Pick<ResolvedPdfLayoutTokens, "zebraEven" | "zebraOdd" | "podiumTint">,
): RgbColor {
  const base = bandGroup % 2 === 0 ? tokens.zebraEven : tokens.zebraOdd;
  return {
    r: Math.min(255, Math.floor((base.r * tokens.podiumTint.r) / 255)),
    g: Math.min(255, Math.floor((base.g * tokens.podiumTint.g) / 255)),
    b: Math.min(255, Math.floor((base.b * tokens.podiumTint.b) / 255)),
  };
}
