import { describe, expect, it } from "vitest";
import {
  buildCouplesIncomingRowData,
  buildSinglesIncomingRowData,
  distanceKmToMeters,
  sectionNameFromContext,
} from "@/import/convert.ts";
import type { ImportRaceContext } from "@/ingestion/types.ts";

describe("distanceKmToMeters", () => {
  it("converts 12.5 km to 12500 m", () => {
    expect(distanceKmToMeters(12.5)).toBe(12500);
  });

  it("converts 5.123 km to 5123 m", () => {
    expect(distanceKmToMeters(5.123)).toBe(5123);
  });

  it("converts 0 km to 0 m", () => {
    expect(distanceKmToMeters(0)).toBe(0);
  });

  it("rounds to nearest meter", () => {
    expect(distanceKmToMeters(1.2345)).toBe(1235);
    expect(distanceKmToMeters(1.2344)).toBe(1234);
  });
});

describe("sectionNameFromContext", () => {
  it("produces German section name for men hour", () => {
    const ctx: ImportRaceContext = {
      race_no: 1,
      duration: "hour",
      division: "men",
      event_date: null,
    };
    expect(sectionNameFromContext(ctx)).toBe("Herren 60min");
  });

  it("produces German section name for women half_hour", () => {
    const ctx: ImportRaceContext = {
      race_no: 1,
      duration: "half_hour",
      division: "women",
      event_date: null,
    };
    expect(sectionNameFromContext(ctx)).toBe("Frauen 30min");
  });

  it("produces German section name for couples_mixed", () => {
    const ctx: ImportRaceContext = {
      race_no: 1,
      duration: "hour",
      division: "couples_mixed",
      event_date: null,
    };
    expect(sectionNameFromContext(ctx)).toBe("Paare Mix 60min");
  });
});

describe("buildSinglesIncomingRowData", () => {
  const ctx: ImportRaceContext = {
    race_no: 1,
    duration: "hour",
    division: "men",
    event_date: "2025-06-01",
  };

  it("maps singles row to IncomingRowData correctly", () => {
    const row = {
      startnr: "42",
      name: "Müller, Max",
      yob: 1990,
      club: "LG Test",
      distance_km: 12.5,
      points: 10,
    };

    const result = buildSinglesIncomingRowData(row, ctx, 3, "test.xlsx");

    expect(result.display_name).toBe("Müller, Max");
    expect(result.yob).toBe(1990);
    expect(result.yob_text).toBeNull();
    expect(result.club).toBe("LG Test");
    expect(result.row_kind).toBe("solo");
    expect(result.sheet_name).toBe("test.xlsx");
    expect(result.section_name).toBe("Herren 60min");
    expect(result.row_index).toBe(3);
  });

  it("handles null club", () => {
    const row = {
      startnr: "1",
      name: "Schmidt, Hans",
      yob: 1985,
      club: null,
      distance_km: 10,
      points: 8,
    };

    const result = buildSinglesIncomingRowData(row, ctx, 0, "file.xlsx");
    expect(result.club).toBeNull();
  });
});

describe("buildCouplesIncomingRowData", () => {
  const ctx: ImportRaceContext = {
    race_no: 1,
    duration: "hour",
    division: "couples_mixed",
    event_date: "2025-06-01",
  };

  it("joins couple names, yobs, and clubs correctly", () => {
    const row = {
      startnr: "5",
      name_a: "Müller, Max",
      yob_a: 1990,
      club_a: "LG A",
      name_b: "Müller, Anna",
      yob_b: 1992,
      club_b: "LG B",
      distance_km: 15,
      points: 12,
    };

    const result = buildCouplesIncomingRowData(row, ctx, 0, "paare.xlsx");

    expect(result.display_name).toBe("Müller, Max / Müller, Anna");
    expect(result.yob).toBeNull();
    expect(result.yob_text).toBe("1990 / 1992");
    expect(result.club).toBe("LG A / LG B");
    expect(result.row_kind).toBe("team");
    expect(result.sheet_name).toBe("paare.xlsx");
    expect(result.section_name).toBe("Paare Mix 60min");
    expect(result.row_index).toBe(0);
  });

  it("handles null clubs", () => {
    const row = {
      startnr: "1",
      name_a: "A",
      yob_a: 1990,
      club_a: null,
      name_b: "B",
      yob_b: 1985,
      club_b: null,
      distance_km: 10,
      points: 8,
    };

    const result = buildCouplesIncomingRowData(row, ctx, 0, "paare.xlsx");
    expect(result.club).toBeNull();
  });

  it("handles one null club", () => {
    const row = {
      startnr: "1",
      name_a: "A",
      yob_a: 1990,
      club_a: "LG Test",
      name_b: "B",
      yob_b: 1985,
      club_b: null,
      distance_km: 10,
      points: 8,
    };

    const result = buildCouplesIncomingRowData(row, ctx, 0, "paare.xlsx");
    expect(result.club).toBe("LG Test");
  });
});
