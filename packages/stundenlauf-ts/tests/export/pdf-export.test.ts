import { describe, expect, it } from "vitest";
import { projectState } from "@/domain/projection.ts";
import {
  buildExportSections,
  createExportSpec,
  createPdfStyleSpec,
  exportLaufuebersichtDualPdfs,
  formatDistanceKm,
  formatPoints,
  normalizePdfLayoutPreset,
  renderPdfBlob,
  resolvePdfLayoutOverrides,
  sortCategoryKeysForExport,
  splitCategoryKeysEinzelPaare,
} from "@/export/index.ts";
import {
  defaultEntry,
  importBatchRecorded,
  personRegistered,
  raceRegistered,
  resetSeqCounter,
  teamRegistered,
} from "../helpers/event-factories.ts";

function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(reader.error ?? new Error("Blob konnte nicht gelesen werden."));
    };
    reader.onload = () => {
      const result = reader.result;
      if (!(result instanceof ArrayBuffer)) {
        reject(new Error("Blob wurde nicht als ArrayBuffer gelesen."));
        return;
      }
      resolve(result);
    };
    reader.readAsArrayBuffer(blob);
  });
}

function decodePdfText(blob: Blob): Promise<string> {
  return readBlobAsArrayBuffer(blob).then((buffer) =>
    new TextDecoder("latin1").decode(new Uint8Array(buffer)),
  );
}

async function countPdfPages(blob: Blob): Promise<number> {
  const text = await decodePdfText(blob);
  return (text.match(/\/Type\s*\/Page\b/g) ?? []).length;
}

function buildSinglesState() {
  resetSeqCounter();
  return projectState("season-export", [
    personRegistered({
      person_id: "person-a",
      given_name: "Anna",
      family_name: "Alpha",
      display_name: "Anna Alpha",
      name_normalized: "anna alpha",
      club: "Club A",
      club_normalized: "club a",
    }),
    teamRegistered({
      team_id: "team-a",
      member_person_ids: ["person-a"],
      team_kind: "solo",
    }),
    importBatchRecorded({
      import_batch_id: "batch-1",
      source_file: "lauf-1.xlsx",
      source_sha256: "sha-1",
    }),
    raceRegistered({
      race_event_id: "race-1",
      import_batch_id: "batch-1",
      category: { duration: "hour", division: "men" },
      race_no: 1,
      entries: [
        defaultEntry({
          entry_id: "entry-a-1",
          team_id: "team-a",
          distance_m: 8234,
          points: 47,
        }),
      ],
    }),
    importBatchRecorded({
      import_batch_id: "batch-2",
      source_file: "lauf-2.xlsx",
      source_sha256: "sha-2",
    }),
    raceRegistered({
      race_event_id: "race-2",
      import_batch_id: "batch-2",
      category: { duration: "hour", division: "men" },
      race_no: 2,
      entries: [
        defaultEntry({
          entry_id: "entry-a-2",
          team_id: "team-a",
          distance_m: 2000,
          points: 7,
        }),
      ],
    }),
  ]);
}

function buildCouplesState() {
  resetSeqCounter();
  return projectState("season-couples", [
    personRegistered({
      person_id: "person-a",
      given_name: "Alex",
      family_name: "Able",
      display_name: "Alex Able",
      name_normalized: "alex able",
      club: "Club A",
      club_normalized: "club a",
    }),
    personRegistered({
      person_id: "person-b",
      given_name: "Berta",
      family_name: "Baker",
      display_name: "Berta Baker",
      name_normalized: "berta baker",
      club: "Club B",
      club_normalized: "club b",
      gender: "F",
    }),
    teamRegistered({
      team_id: "team-couple",
      member_person_ids: ["person-a", "person-b"],
      team_kind: "couple",
    }),
    importBatchRecorded({
      import_batch_id: "batch-couples",
      source_file: "couples.xlsx",
      source_sha256: "sha-couples",
    }),
    raceRegistered({
      race_event_id: "race-couple-1",
      import_batch_id: "batch-couples",
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

function buildMixedState() {
  resetSeqCounter();
  return projectState("season-mixed", [
    ...buildSinglesStateEventLog(),
    ...buildCouplesStateEventLog(),
  ]);
}

function buildSinglesStateEventLog() {
  resetSeqCounter();
  return [
    personRegistered({
      person_id: "person-a",
      given_name: "Anna",
      family_name: "Alpha",
      display_name: "Anna Alpha",
      name_normalized: "anna alpha",
      club: "Club A",
      club_normalized: "club a",
    }),
    teamRegistered({
      team_id: "team-a",
      member_person_ids: ["person-a"],
      team_kind: "solo",
    }),
    importBatchRecorded({
      import_batch_id: "batch-1",
      source_file: "lauf-1.xlsx",
      source_sha256: "sha-1",
    }),
    raceRegistered({
      race_event_id: "race-1",
      import_batch_id: "batch-1",
      category: { duration: "hour", division: "men" },
      race_no: 1,
      entries: [
        defaultEntry({
          entry_id: "entry-a-1",
          team_id: "team-a",
          distance_m: 8234,
          points: 47,
        }),
      ],
    }),
  ];
}

function buildCouplesStateEventLog() {
  const seqSeed = 10;
  resetSeqCounter();
  return [
    personRegistered(
      {
        person_id: "person-b",
        given_name: "Alex",
        family_name: "Able",
        display_name: "Alex Able",
        name_normalized: "alex able",
        club: "Club A",
        club_normalized: "club a",
      },
      { seq: seqSeed },
    ),
    personRegistered(
      {
        person_id: "person-c",
        given_name: "Berta",
        family_name: "Baker",
        display_name: "Berta Baker",
        name_normalized: "berta baker",
        club: "Club B",
        club_normalized: "club b",
        gender: "F",
      },
      { seq: seqSeed + 1 },
    ),
    teamRegistered(
      {
        team_id: "team-couple",
        member_person_ids: ["person-b", "person-c"],
        team_kind: "couple",
      },
      { seq: seqSeed + 2 },
    ),
    importBatchRecorded(
      {
        import_batch_id: "batch-couples",
        source_file: "couples.xlsx",
        source_sha256: "sha-couples",
      },
      { seq: seqSeed + 3 },
    ),
    raceRegistered(
      {
        race_event_id: "race-couple-1",
        import_batch_id: "batch-couples",
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
      },
      { seq: seqSeed + 4 },
    ),
  ];
}

describe("export formatting helpers", () => {
  it("sorts and splits category keys like the Python export", () => {
    const ordered = sortCategoryKeysForExport([
      "hour:couples_men",
      "half_hour:men",
      "hour:men",
      "half_hour:women",
      "hour:couples_women",
    ]);
    expect(ordered).toEqual([
      "half_hour:women",
      "half_hour:men",
      "hour:men",
      "hour:couples_women",
      "hour:couples_men",
    ]);
    expect(splitCategoryKeysEinzelPaare(ordered)).toEqual([
      ["half_hour:women", "half_hour:men", "hour:men"],
      ["hour:couples_women", "hour:couples_men"],
    ]);
  });

  it("formats distances, points, and compact preset resolution", () => {
    expect(formatDistanceKm(1.234)).toBe("1,234");
    expect(formatPoints(42)).toBe("42");
    expect(formatPoints(3.5)).toBe("3,5");
    expect(normalizePdfLayoutPreset("Kompakt")).toBe("compact");

    const pdf = createPdfStyleSpec({
      layoutPreset: "compact",
      layoutOverrides: { marginLeftCm: 2 },
    });
    const resolved = resolvePdfLayoutOverrides(pdf);
    expect(pdf.orientation).toBe("portrait");
    expect(resolved.marginLeftCm).toBe(2);
    expect(resolved.marginRightCm).toBe(0.45);
    expect(resolved.tableFontSizePt).toBe(5);
  });
});

describe("export projection", () => {
  it("builds laufuebersicht sections with a 3-row header and race cells", () => {
    const state = buildSinglesState();
    const spec = createExportSpec({
      categories: ["hour:men"],
      columns: ["laufuebersicht_board"],
      pdf: { tableLayout: "laufuebersicht" },
    });

    const sections = buildExportSections(state, spec, { seasonYear: 2026 });
    expect(sections).toHaveLength(1);
    const section = sections[0]!;
    expect(section.title).toBe("1. Stundenlauf - Männer");
    expect(section.headerRows).toHaveLength(3);
    expect(section.headerRows[0]?.cells[0]?.text).toBe("Platz");
    expect(section.headerRows[0]?.cells[3]?.text).toBe("1. Lauf");
    expect(section.headerRows[1]?.cells[3]?.text).toBe("Laufstr.");
    expect(section.headerRows[2]?.cells[4]?.text).toBe("(Punkte)");
    expect(section.bodyRows[0]?.cells[1]?.text).toBe("Anna Alpha (1990)");
    expect(section.bodyRows[0]?.cells[3]?.text).toBe("8,234");
    expect(section.bodyRows[0]?.cells[4]?.text).toBe("47");
    expect(section.bodyRows[0]?.cells[5]?.text).toBe("2,000");
    expect(section.bodyRows[0]?.cells[6]?.text).toBe("7");
  });

  it("builds team rows, spans, and semantic rules for couples", () => {
    const state = buildCouplesState();
    const spec = createExportSpec({
      categories: ["hour:couples_men"],
      columns: ["laufuebersicht_board"],
      pdf: { tableLayout: "laufuebersicht" },
    });

    const [section] = buildExportSections(state, spec, { seasonYear: 2026 });
    expect(section?.bodyRows).toHaveLength(2);
    expect(section?.bodyRows[0]?.kind).toBe("team_primary");
    expect(section?.bodyRows[1]?.kind).toBe("team_secondary");
    expect(section?.bodyRows[1]?.cells[0]?.text).toBe("");
    expect(section?.spans.some((span) => span.area === "body")).toBe(true);
    expect(section?.columnRules.some((rule) => rule.style === "thick")).toBe(true);
    expect(section?.columnRules.some((rule) => rule.style === "dashed")).toBe(true);
    expect(section?.columnRules.some((rule) => rule.style === "double")).toBe(true);
    expect(section?.rowRules).toEqual([{ afterBodyRow: 0, style: "thin" }]);
  });
});

describe("PDF export", () => {
  it("renders a laufuebersicht PDF blob with expected text", async () => {
    const state = buildSinglesState();
    const spec = createExportSpec({
      categories: ["hour:men"],
      columns: ["laufuebersicht_board"],
      pdf: {
        tableLayout: "laufuebersicht",
        title: "Laufübersicht Test",
      },
    });

    const blob = renderPdfBlob(state, spec, { seasonYear: 2026 });
    expect(blob.type).toBe("application/pdf");
    const bytes = new Uint8Array(await readBlobAsArrayBuffer(blob));
    expect(new TextDecoder("latin1").decode(bytes.slice(0, 4))).toBe("%PDF");

    const text = await decodePdfText(blob);
    expect(text).toContain("Hinweis:");
    expect(text).toContain("Anna Alpha");
    expect(text).toContain("1. Lauf");
    expect(text).toContain("Laufstr.");
    expect(text).toContain("Wertung");
    expect(text).toContain("Gesamt");
    expect(text).toContain("Saison 2026");
    expect(await countPdfPages(blob)).toBe(1);
  });

  it("exports dual einzel/paare PDFs with continuous section numbering", async () => {
    const state = buildMixedState();
    const artifacts = exportLaufuebersichtDualPdfs(state, {
      seasonYear: 2026,
      filenameBase: "report",
      layoutPreset: "compact",
    });

    expect(artifacts.map((artifact) => artifact.filename)).toEqual([
      "report_einzel.pdf",
      "report_paare.pdf",
    ]);

    const paareText = await decodePdfText(artifacts[1]!.blob);
    expect(paareText).toContain("2. Stundenlauf - Paare Männer");
  });
});
