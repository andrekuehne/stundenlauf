import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { projectState } from "@/domain/projection.ts";
import { exportGesamtwertungWorkbook } from "@/export/index.ts";
import {
  defaultEntry,
  importBatchRecorded,
  personRegistered,
  raceRegistered,
  resetSeqCounter,
  teamRegistered,
} from "../helpers/event-factories.ts";

async function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(reader.error ?? new Error("Blob konnte nicht gelesen werden."));
    };
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("Blob wurde nicht als ArrayBuffer gelesen."));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsArrayBuffer(blob);
  });
}

async function loadWorkbook(blob: Blob): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const buffer = await readBlobAsArrayBuffer(blob);
  await workbook.xlsx.load(new Uint8Array(buffer));
  return workbook;
}

function buildMixedState() {
  resetSeqCounter();
  return projectState("season-excel-export", [
    personRegistered({
      person_id: "person-single",
      given_name: "Romy",
      family_name: "Baguhl",
      display_name: "Romy Baguhl",
      name_normalized: "romy baguhl",
      club: "HSG Uni Greifswald",
      club_normalized: "hsg uni greifswald",
      yob: 1980,
      gender: "F",
    }),
    teamRegistered({
      team_id: "team-single",
      member_person_ids: ["person-single"],
      team_kind: "solo",
    }),
    importBatchRecorded({
      import_batch_id: "batch-single",
      source_file: "single.xlsx",
      source_sha256: "sha-single",
    }),
    raceRegistered({
      race_event_id: "race-single-1",
      import_batch_id: "batch-single",
      category: { duration: "half_hour", division: "women" },
      race_no: 1,
      entries: [
        defaultEntry({
          entry_id: "entry-single-1",
          team_id: "team-single",
          distance_m: 5762,
          points: 45,
        }),
      ],
    }),
    personRegistered({
      person_id: "person-couple-a",
      given_name: "Alex",
      family_name: "Able",
      display_name: "Alex Able",
      name_normalized: "alex able",
      club: "Club A",
      club_normalized: "club a",
      yob: 1990,
    }),
    personRegistered({
      person_id: "person-couple-b",
      given_name: "Berta",
      family_name: "Baker",
      display_name: "Berta Baker",
      name_normalized: "berta baker",
      club: "Club B",
      club_normalized: "club b",
      yob: 1991,
      gender: "F",
    }),
    teamRegistered({
      team_id: "team-couple",
      member_person_ids: ["person-couple-a", "person-couple-b"],
      team_kind: "couple",
    }),
    importBatchRecorded({
      import_batch_id: "batch-couple",
      source_file: "couples.xlsx",
      source_sha256: "sha-couple",
    }),
    raceRegistered({
      race_event_id: "race-couple-1",
      import_batch_id: "batch-couple",
      category: { duration: "hour", division: "couples_men" },
      race_no: 1,
      entries: [
        defaultEntry({
          entry_id: "entry-couple-1",
          team_id: "team-couple",
          distance_m: 5500,
          points: 10,
        }),
      ],
    }),
  ]);
}

describe("Excel Gesamtwertung export", () => {
  it("creates the requested two-sheet workbook with numbered section titles", async () => {
    const artifact = await exportGesamtwertungWorkbook(buildMixedState(), {
      seasonYear: 2026,
      filenameBase: "report",
    });

    expect(artifact.filename).toBe("report.xlsx");
    expect(artifact.blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    const workbook = await loadWorkbook(artifact.blob);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Gesamtwertung_Einzel",
      "Gesamtwertung_Paare",
    ]);

    const einzel = workbook.getWorksheet("Gesamtwertung_Einzel");
    const paare = workbook.getWorksheet("Gesamtwertung_Paare");
    expect(einzel?.getCell("A1").value).toBe("1. Halbstundenlauf - Frauen");
    expect(einzel?.getCell("A2").value).toBe("Platz");
    expect(einzel?.getCell("B2").value).toBe("Vorname/Name");
    expect(einzel?.getCell("C2").value).toBe("Jg.");
    expect(einzel?.getCell("E2").value).toBe("1. Lauf");
    expect(einzel?.views ?? null).toBeNull();
    expect(paare?.getCell("A1").value).toBe("2. Stundenpaarlauf - Männer");
    expect(paare?.getCell("B2").value).toBe("Vorname/Name");
    expect(paare?.getCell("E2").value).toBe("Vorname/Name");
    expect(paare?.getCell("H2").value).toBe("1. Lauf");
    expect(paare?.views ?? null).toBeNull();
  });

  it("renders couples in one row with side-by-side member identity columns", async () => {
    const artifact = await exportGesamtwertungWorkbook(buildMixedState(), {
      seasonYear: 2026,
    });
    const workbook = await loadWorkbook(artifact.blob);
    const worksheet = workbook.getWorksheet("Gesamtwertung_Paare");
    if (!worksheet) {
      throw new Error("Paare-Arbeitsblatt fehlt.");
    }

    expect(worksheet.getCell("A5").value).toBe("1");
    expect(worksheet.getCell("B5").value).toBe("Alex Able");
    expect(worksheet.getCell("C5").value).toBe("1990");
    expect(worksheet.getCell("D5").value).toBe("Club A");
    expect(worksheet.getCell("E5").value).toBe("Berta Baker");
    expect(worksheet.getCell("F5").value).toBe("1991");
    expect(worksheet.getCell("G5").value).toBe("Club B");
    expect(worksheet.getCell("H5").value).toBe("5,500");
    expect(worksheet.getCell("I5").value).toBe("10");
    expect(worksheet.getCell("J5").value).toBe("5,500");
    expect(worksheet.getCell("K5").value).toBe("10");
    expect(worksheet.getCell("A6").value).toBeNull();

    const merges = worksheet.model.merges;
    expect(merges.some((merge) => merge === "A5:A6")).toBe(false);
  });

  it("renders singles with separate name and year columns", async () => {
    const artifact = await exportGesamtwertungWorkbook(buildMixedState(), {
      seasonYear: 2026,
    });
    const workbook = await loadWorkbook(artifact.blob);
    const worksheet = workbook.getWorksheet("Gesamtwertung_Einzel");
    if (!worksheet) {
      throw new Error("Einzel-Arbeitsblatt fehlt.");
    }

    expect(worksheet.getCell("A5").value).toBe("1");
    expect(worksheet.getCell("B5").value).toBe("Romy Baguhl");
    expect(worksheet.getCell("C5").value).toBe("1980");
    expect(worksheet.getCell("D5").value).toBe("HSG Uni Greifswald");
    expect(worksheet.getCell("E5").value).toBe("5,762");
    expect(worksheet.getCell("F5").value).toBe("45");
    expect(worksheet.getCell("G5").value).toBe("5,762");
    expect(worksheet.getCell("H5").value).toBe("45");
  });
});
