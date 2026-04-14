import type { Division, RaceCategory, RaceDuration } from "@/domain/types.ts";

export const EXPORT_EMPTY_CELL = "—";

export function parseCategoryKey(categoryKey: string): RaceCategory | null {
  const [duration, division] = categoryKey.split(":");
  if (!duration || !division) {
    return null;
  }
  return {
    duration: duration as RaceDuration,
    division: division as Division,
  };
}

export function categoryKeyIsCouples(categoryKey: string): boolean {
  return parseCategoryKey(categoryKey)?.division.startsWith("couples_") ?? false;
}

function durationSortOrder(duration: RaceDuration): number {
  return duration === "half_hour" ? 0 : 1;
}

function divisionSortOrder(division: Division): [number, number] {
  switch (division) {
    case "women":
      return [0, 0];
    case "men":
      return [0, 1];
    case "couples_women":
      return [1, 0];
    case "couples_men":
      return [1, 1];
    case "couples_mixed":
      return [1, 2];
  }
}

export function sortCategoryKeysForExport(categoryKeys: Iterable<string>): string[] {
  return [...categoryKeys].sort((left, right) => {
    const a = parseCategoryKey(left);
    const b = parseCategoryKey(right);
    if (!a || !b) {
      return left.localeCompare(right, "de");
    }

    const [aGroup, aDivision] = divisionSortOrder(a.division);
    const [bGroup, bDivision] = divisionSortOrder(b.division);
    if (aGroup !== bGroup) {
      return aGroup - bGroup;
    }

    const durationCompare = durationSortOrder(a.duration) - durationSortOrder(b.duration);
    if (durationCompare !== 0) {
      return durationCompare;
    }

    if (aDivision !== bDivision) {
      return aDivision - bDivision;
    }

    return left.localeCompare(right, "de");
  });
}

export function splitCategoryKeysEinzelPaare(categoryKeys: Iterable<string>): [string[], string[]] {
  const ordered = sortCategoryKeysForExport(categoryKeys);
  return [
    ordered.filter((categoryKey) => !categoryKeyIsCouples(categoryKey)),
    ordered.filter((categoryKey) => categoryKeyIsCouples(categoryKey)),
  ];
}

export function formatDistanceKm(distanceKm: number): string {
  return distanceKm.toFixed(3).replace(".", ",");
}

export function formatPoints(points: number): string {
  if (Number.isInteger(points)) {
    return String(points);
  }
  return Number(points.toFixed(1)).toString().replace(".", ",");
}

export function displayNameYobLine(name: string, yob: number | string | null): string {
  const trimmed = name.trim();
  if (yob == null || String(yob).trim() === "") {
    return trimmed;
  }
  return `${trimmed} (${String(yob).trim()})`;
}

export function laufuebersichtClubCell(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed || EXPORT_EMPTY_CELL;
}

export function durationLabel(duration: RaceDuration): string {
  return duration === "half_hour" ? "Halbstundenlauf" : "Stundenlauf";
}

export function divisionLabel(division: Division): string {
  switch (division) {
    case "women":
      return "Frauen";
    case "men":
      return "Männer";
    case "couples_women":
      return "Paare Frauen";
    case "couples_men":
      return "Paare Männer";
    case "couples_mixed":
      return "Paare Mixed";
  }
}

export function categoryFooterLabel(category: RaceCategory): string {
  return `${durationLabel(category.duration)} - ${divisionLabel(category.division)}`;
}

export function categoryLabel(category: RaceCategory): string {
  return categoryFooterLabel(category);
}

export function exportPdfCategoryTitle(seasonYear: number, category: RaceCategory): string {
  return `Saison ${seasonYear} — ${durationLabel(category.duration)} ${divisionLabel(category.division)}`;
}

export function laufuebersichtSectionTitle(sectionNumber: number, category: RaceCategory): string {
  return `${sectionNumber}. ${categoryFooterLabel(category)}`;
}
