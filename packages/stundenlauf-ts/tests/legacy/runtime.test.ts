import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { EXPECTED_HEADER_COUPLES, EXPECTED_HEADER_SINGLES } from "@/ingestion/constants";
import type { DomainEvent } from "@/domain/events.ts";
import type { SeasonDescriptor } from "@/domain/types.ts";
import { LegacyApiRuntime } from "@/legacy/api/runtime.ts";
import type { LegacyApiRequest, LegacyApiResponse } from "@/legacy/api/types.ts";
import { buildSeasonArchive } from "@/portability/export-season.ts";
import {
  getSeasonRepository,
  setSeasonRepositoryForTests,
  type SeasonRepository,
} from "@/services/season-repository.ts";
import {
  defaultEntry,
  importBatchRecorded,
  personRegistered,
  raceRegistered,
  resetSeqCounter,
  teamRegistered,
} from "../helpers/event-factories.ts";
import { buildXlsx } from "../ingestion/xlsx-test-helpers.ts";

class InMemorySeasonRepository implements SeasonRepository {
  private readonly seasons = new Map<string, SeasonDescriptor>();
  private readonly eventLogs = new Map<string, DomainEvent[]>();
  private counter = 0;

  listSeasons(): Promise<SeasonDescriptor[]> {
    return Promise.resolve([...this.seasons.values()]);
  }

  createSeason(label: string): Promise<SeasonDescriptor> {
    const season: SeasonDescriptor = {
      season_id: `season-${++this.counter}`,
      label,
      created_at: new Date(`2026-04-${10 + this.counter}T12:00:00.000Z`).toISOString(),
    };
    this.seasons.set(season.season_id, season);
    this.eventLogs.set(season.season_id, []);
    return Promise.resolve(season);
  }

  getSeason(seasonId: string): Promise<SeasonDescriptor | null> {
    return Promise.resolve(this.seasons.get(seasonId) ?? null);
  }

  deleteSeason(seasonId: string): Promise<void> {
    this.seasons.delete(seasonId);
    this.eventLogs.delete(seasonId);
    return Promise.resolve();
  }

  getEventLog(seasonId: string): Promise<DomainEvent[]> {
    return Promise.resolve([...(this.eventLogs.get(seasonId) ?? [])]);
  }

  appendEvents(seasonId: string, events: DomainEvent[]): Promise<void> {
    const current = this.eventLogs.get(seasonId) ?? [];
    this.eventLogs.set(seasonId, [...current, ...events]);
    return Promise.resolve();
  }

  clearEventLog(seasonId: string): Promise<void> {
    this.eventLogs.set(seasonId, []);
    return Promise.resolve();
  }

  saveImportedSeason(season: SeasonDescriptor, events: DomainEvent[]): Promise<void> {
    this.seasons.set(season.season_id, season);
    this.eventLogs.set(season.season_id, [...events]);
    return Promise.resolve();
  }
}

function request(method: string, payload: Record<string, unknown> = {}): LegacyApiRequest {
  return {
    api_version: "v1",
    request_id: `${method}-req`,
    method,
    payload,
  };
}

async function invoke(
  runtime: LegacyApiRuntime,
  method: string,
  payload: Record<string, unknown> = {},
): Promise<LegacyApiResponse> {
  return runtime.invoke(request(method, payload));
}

function expectOk(response: LegacyApiResponse): Record<string, unknown> {
  expect(response.status).toBe("ok");
  if (response.status !== "ok") {
    throw new Error(`Expected ok response, got ${response.error.code}`);
  }
  return response.payload;
}

function buildSinglesImportFile(
  rows: unknown[][],
  name = "Ergebnisliste MW Lauf 2.xlsx",
): File {
  const buffer = buildXlsx(rows);
  const file = new File([buffer], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.resolve(buffer.slice(0)),
  });
  return file;
}

function buildCouplesImportFile(
  rows: unknown[][],
  name = "Ergebnisliste MW_Paare Lauf 2.xlsx",
): File {
  const buffer = buildXlsx(rows);
  const file = new File([buffer], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.resolve(buffer.slice(0)),
  });
  return file;
}

async function buildSeasonArchiveFile(
  repo: SeasonRepository,
  seasonId: string,
  name = "season-import.stundenlauf-season.zip",
): Promise<File> {
  const archive = await buildSeasonArchive(repo, seasonId, { filename: name });
  const buffer = archive.zip_bytes.buffer.slice(0);
  const file = new File([buffer], name, { type: "application/zip" });
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.resolve(buffer.slice(0)),
  });
  return file;
}

beforeEach(() => {
  resetSeqCounter();
  localStorage.clear();
  setSeasonRepositoryForTests(new InMemorySeasonRepository());
});

afterEach(() => {
  setSeasonRepositoryForTests(null);
  localStorage.clear();
});

describe("LegacyApiRuntime season and overview flows", () => {
  it("creates, lists, opens, and summarizes aliased seasons", async () => {
    const runtime = new LegacyApiRuntime();

    const created = expectOk(
      await invoke(runtime, "create_series_year", {
        series_year: 2026,
        display_name: "Saison 2026",
      }),
    );
    expect(created.series_year).toBe(2026);

    const listed = expectOk(await invoke(runtime, "list_series_years"));
    expect(listed.items).toHaveLength(1);
    expect((listed.items as Array<Record<string, unknown>>)[0]?.series_year).toBe(2026);

    const opened = expectOk(
      await invoke(runtime, "open_series_year", {
        series_year: 2026,
      }),
    );
    expect(opened.active).toBe(true);

    const overview = expectOk(
      await invoke(runtime, "get_year_overview", {
        series_year: 2026,
      }),
    );
    expect(overview.categories).toEqual([]);
    expect(overview.race_history_groups).toEqual([]);
    expect((overview.totals as Record<string, unknown>).review_queue).toBe(0);
  });

  it("creates seasons with display name only", async () => {
    const runtime = new LegacyApiRuntime();

    const created = expectOk(
      await invoke(runtime, "create_series_year", {
        display_name: "Sommerlauf-Block A",
      }),
    );
    expect(created.series_year).toBe(1);
    expect(created.display_name).toBe("Sommerlauf-Block A");

    const listed = expectOk(await invoke(runtime, "list_series_years"));
    const items = listed.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]?.display_name).toBe("Sommerlauf-Block A");
  });
});

describe("LegacyApiRuntime standings, correction, reassignment, and timeline flows", () => {
  it("projects standings payloads and records correction plus reassignment timeline entries", async () => {
    const runtime = new LegacyApiRuntime();
    expectOk(await invoke(runtime, "create_series_year", { series_year: 2025 }));
    expectOk(await invoke(runtime, "open_series_year", { series_year: 2025 }));

    const repo = await getSeasonRepository();
    const seasonId = (await repo.listSeasons())[0]!.season_id;
    const events: DomainEvent[] = [
      personRegistered({
        person_id: "person-a",
        given_name: "Max",
        family_name: "Müller",
        display_name: "Max Müller",
        gender: "M",
        club: "LG A",
        club_normalized: "lg a",
      }),
      teamRegistered({
        team_id: "team-a",
        member_person_ids: ["person-a"],
        team_kind: "solo",
      }),
      personRegistered({
        person_id: "person-b",
        given_name: "Hans",
        family_name: "Schmidt",
        display_name: "Hans Schmidt",
        gender: "M",
        club: "LG B",
        club_normalized: "lg b",
      }),
      teamRegistered({
        team_id: "team-b",
        member_person_ids: ["person-b"],
        team_kind: "solo",
      }),
      importBatchRecorded({
        import_batch_id: "batch-1",
        source_sha256: "sha-1",
        source_file: "lauf-1.xlsx",
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
            points: 10,
            distance_m: 10000,
          }),
        ],
      }),
      importBatchRecorded({
        import_batch_id: "batch-2",
        source_sha256: "sha-2",
        source_file: "lauf-2.xlsx",
      }),
      raceRegistered({
        race_event_id: "race-2",
        import_batch_id: "batch-2",
        category: { duration: "hour", division: "men" },
        race_no: 2,
        entries: [
          defaultEntry({
            entry_id: "entry-b-2",
            team_id: "team-b",
            points: 8,
            distance_m: 9500,
          }),
        ],
      }),
    ];
    await repo.appendEvents(seasonId, events);

    const standings = expectOk(
      await invoke(runtime, "get_standings", {
        category_key: "hour:men",
      }),
    );
    const standingsRows = standings.rows as Array<Record<string, unknown>>;
    expect(standingsRows).toHaveLength(2);
    expect(standingsRows[0]?.entity_kind).toBe("participant");
    expect(standingsRows[0]?.entity_uid).toBe("person-a");

    expectOk(
      await invoke(runtime, "set_ranking_eligibility", {
        category_key: "hour:men",
        entity_uid: "person-b",
        ausser_wertung: true,
      }),
    );
    const resultsTable = expectOk(
      await invoke(runtime, "get_category_current_results_table", {
        category_key: "hour:men",
      }),
    );
    const resultRows = resultsTable.rows as Array<Record<string, unknown>>;
    expect(resultRows.find((row) => row.entity_uid === "person-b")?.ausser_wertung).toBe(true);

    expectOk(
      await invoke(runtime, "update_participant_identity", {
        series_year: 2025,
        participant_uid: "person-a",
        name: "Maximilian Müller",
        yob: 1990,
        club: "LG A",
      }),
    );

    expectOk(
      await invoke(runtime, "merge_standings_entities", {
        series_year: 2025,
        category_key: "hour:men",
        entity_kind: "participant",
        survivor_uid: "person-a",
        absorbed_uid: "person-b",
      }),
    );

    const mergedStandings = expectOk(
      await invoke(runtime, "get_standings", {
        category_key: "hour:men",
      }),
    );
    const mergedRows = mergedStandings.rows as Array<Record<string, unknown>>;
    expect(mergedRows).toHaveLength(1);
    expect(mergedRows[0]?.display_name).toBe("Maximilian Müller");
    expect(mergedRows[0]?.punkte_gesamt).toBe(18);

    const timeline = expectOk(
      await invoke(runtime, "get_year_timeline", {
        series_year: 2025,
      }),
    );
    const timelineItems = timeline.items as Array<Record<string, unknown>>;
    expect(
      timelineItems.some((item) => item.event_type === "matching_decision" && item.kind === "identity_correction"),
    ).toBe(true);
    expect(
      timelineItems.some((item) => item.event_type === "matching_decision" && item.kind === "result_reassignment"),
    ).toBe(true);
  });
});

describe("LegacyApiRuntime season portability compatibility flows", () => {
  it("exports a season archive through the legacy save-target wrapper", async () => {
    const runtime = new LegacyApiRuntime();
    expectOk(
      await invoke(runtime, "create_series_year", {
        series_year: 2028,
        display_name: "Sommerblock A",
      }),
    );

    const repo = await getSeasonRepository();
    const season = (await repo.listSeasons())[0]!;
    await repo.appendEvents(season.season_id, [importBatchRecorded({ import_batch_id: "batch-export" })]);

    if (!("createObjectURL" in URL)) {
      Object.defineProperty(URL, "createObjectURL", {
        value: () => "blob:season-export-test",
        configurable: true,
        writable: true,
      });
    }
    if (!("revokeObjectURL" in URL)) {
      Object.defineProperty(URL, "revokeObjectURL", {
        value: () => undefined,
        configurable: true,
        writable: true,
      });
    }
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:season-export-test");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function noop(this: HTMLAnchorElement) {
        void this;
      });

    try {
      const picked = expectOk(
        await invoke(runtime, "pick_save_file", {
          suggested_name: "sommerblock-a.stundenlauf-season.zip",
          dialog_kind: "season_zip",
        }),
      );
      const exported = expectOk(
        await invoke(runtime, "export_series_year", {
          series_year: 2028,
          destination_path: picked.file_path,
        }),
      );

      expect(exported.display_name).toBe("Sommerblock A");
      expect(exported.export_file).toBe("sommerblock-a.stundenlauf-season.zip");
      expect(exported.events_total).toBe(1);
      expect(exported.sha256_eventlog).toMatch(/^[0-9a-f]{64}$/);
      expect(clickSpy).toHaveBeenCalledTimes(1);
    } finally {
      clickSpy.mockRestore();
      revokeObjectUrl.mockRestore();
      createObjectUrl.mockRestore();
    }
  });

  it("imports a generic named season while treating the requested year as an alias only", async () => {
    const runtime = new LegacyApiRuntime();
    const sourceRepo = new InMemorySeasonRepository();
    const sourceSeason = await sourceRepo.createSeason("Trainingsblock Alpha");
    await sourceRepo.appendEvents(sourceSeason.season_id, [
      importBatchRecorded({ import_batch_id: "batch-imported" }),
    ]);

    const archiveFile = await buildSeasonArchiveFile(sourceRepo, sourceSeason.season_id);
    const filePath = runtime.seedSelectedFileForTests(archiveFile);
    const imported = expectOk(
      await invoke(runtime, "import_series_year", {
        file_path: filePath,
        target_series_year: 2031,
      }),
    );

    const repo = await getSeasonRepository();
    const seasons = await repo.listSeasons();
    expect(imported.series_year).toBe(2031);
    expect(imported.display_name).toBe("Trainingsblock Alpha");
    expect(seasons).toHaveLength(1);
    expect(seasons[0]?.label).toBe("Trainingsblock Alpha");
    expect(await repo.getEventLog(seasons[0]!.season_id)).toHaveLength(1);
  });

  it("imports into a new alias slot when the frontend supplies a new season name", async () => {
    const runtime = new LegacyApiRuntime();
    expectOk(
      await invoke(runtime, "create_series_year", {
        series_year: 2030,
        display_name: "Trainingsblock Alpha",
      }),
    );

    const sourceRepo = new InMemorySeasonRepository();
    const sourceSeason = await sourceRepo.createSeason("Trainingsblock Alpha");
    await sourceRepo.appendEvents(sourceSeason.season_id, [
      importBatchRecorded({ import_batch_id: "batch-import-copy" }),
    ]);

    const archiveFile = await buildSeasonArchiveFile(sourceRepo, sourceSeason.season_id);
    const filePath = runtime.seedSelectedFileForTests(archiveFile);
    const imported = expectOk(
      await invoke(runtime, "import_series_year", {
        file_path: filePath,
        target_series_year: 2034,
        display_name: "Trainingsblock Alpha Kopie",
      }),
    );

    const repo = await getSeasonRepository();
    const seasons = await repo.listSeasons();
    const listed = expectOk(await invoke(runtime, "list_series_years"));
    expect(imported.series_year).toBe(2034);
    expect(imported.display_name).toBe("Trainingsblock Alpha Kopie");
    expect(seasons).toHaveLength(2);
    expect(seasons.map((season) => season.label).sort()).toEqual([
      "Trainingsblock Alpha",
      "Trainingsblock Alpha Kopie",
    ]);
    expect(listed.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          series_year: 2030,
          display_name: "Trainingsblock Alpha",
        }),
        expect.objectContaining({
          series_year: 2034,
          display_name: "Trainingsblock Alpha Kopie",
        }),
      ]),
    );
  });

  it("imports as a new season when the frontend supplies only a new season name", async () => {
    const runtime = new LegacyApiRuntime();
    expectOk(
      await invoke(runtime, "create_series_year", {
        series_year: 2035,
        display_name: "Trainingsblock Alpha",
      }),
    );

    const sourceRepo = new InMemorySeasonRepository();
    const sourceSeason = await sourceRepo.createSeason("Trainingsblock Alpha");
    await sourceRepo.appendEvents(sourceSeason.season_id, [
      importBatchRecorded({ import_batch_id: "batch-import-copy-name-only" }),
    ]);

    const archiveFile = await buildSeasonArchiveFile(sourceRepo, sourceSeason.season_id);
    const filePath = runtime.seedSelectedFileForTests(archiveFile);
    const imported = expectOk(
      await invoke(runtime, "import_series_year", {
        file_path: filePath,
        display_name: "Trainingsblock Alpha Kopie",
      }),
    );

    const listed = expectOk(await invoke(runtime, "list_series_years"));
    expect(imported.display_name).toBe("Trainingsblock Alpha Kopie");
    expect(listed.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          display_name: "Trainingsblock Alpha",
        }),
        expect.objectContaining({
          display_name: "Trainingsblock Alpha Kopie",
        }),
      ]),
    );
  });

  it("replaces an aliased target season but keeps the imported generic season label", async () => {
    const runtime = new LegacyApiRuntime();
    expectOk(
      await invoke(runtime, "create_series_year", {
        series_year: 2032,
        display_name: "Lokale Saison",
      }),
    );

    const sourceRepo = new InMemorySeasonRepository();
    const sourceSeason = await sourceRepo.createSeason("Herbstserie Beta");
    await sourceRepo.appendEvents(sourceSeason.season_id, [
      importBatchRecorded({ import_batch_id: "batch-replace" }),
    ]);

    const archiveFile = await buildSeasonArchiveFile(sourceRepo, sourceSeason.season_id);
    const filePath = runtime.seedSelectedFileForTests(archiveFile);
    const imported = expectOk(
      await invoke(runtime, "import_series_year", {
        file_path: filePath,
        target_series_year: 2032,
        replace_existing: true,
        confirm_replace_series_year: 2032,
      }),
    );

    const repo = await getSeasonRepository();
    const seasons = await repo.listSeasons();
    expect(imported.replaced_existing).toBe(true);
    expect(imported.display_name).toBe("Herbstserie Beta");
    expect(seasons).toHaveLength(1);
    expect(seasons[0]?.label).toBe("Herbstserie Beta");
  });

  it("replaces an existing season when the frontend targets it by season name", async () => {
    const runtime = new LegacyApiRuntime();
    expectOk(
      await invoke(runtime, "create_series_year", {
        series_year: 2036,
        display_name: "Lokale Saison",
      }),
    );

    const sourceRepo = new InMemorySeasonRepository();
    const sourceSeason = await sourceRepo.createSeason("Herbstserie Beta");
    await sourceRepo.appendEvents(sourceSeason.season_id, [
      importBatchRecorded({ import_batch_id: "batch-replace-name-only" }),
    ]);

    const archiveFile = await buildSeasonArchiveFile(sourceRepo, sourceSeason.season_id);
    const filePath = runtime.seedSelectedFileForTests(archiveFile);
    const imported = expectOk(
      await invoke(runtime, "import_series_year", {
        file_path: filePath,
        display_name: "Lokale Saison",
        replace_existing: true,
        confirm_replace_display_name: "Lokale Saison",
      }),
    );

    const repo = await getSeasonRepository();
    const seasons = await repo.listSeasons();
    expect(imported.replaced_existing).toBe(true);
    expect(imported.display_name).toBe("Lokale Saison");
    expect(seasons).toHaveLength(1);
    expect(seasons[0]?.label).toBe("Lokale Saison");
    expect(await repo.getEventLog(seasons[0]!.season_id)).toHaveLength(1);
  });

  it("rejects alias collisions unless replace mode is requested", async () => {
    const runtime = new LegacyApiRuntime();
    expectOk(
      await invoke(runtime, "create_series_year", {
        series_year: 2033,
        display_name: "Bestehende Saison",
      }),
    );

    const sourceRepo = new InMemorySeasonRepository();
    const sourceSeason = await sourceRepo.createSeason("Importierte Saison");
    const archiveFile = await buildSeasonArchiveFile(sourceRepo, sourceSeason.season_id);
    const filePath = runtime.seedSelectedFileForTests(archiveFile);
    const response = await invoke(runtime, "import_series_year", {
      file_path: filePath,
      target_series_year: 2033,
    });

    expect(response.status).toBe("error");
    if (response.status === "error") {
      expect(response.error.code).toBe("SEASON_IMPORT_CONFLICT");
      expect(response.error.message).toContain("already exists");
      expect(response.error.details.target_series_year).toBe(2033);
    }
  });
});

describe("LegacyApiRuntime staged import review flow", () => {
  it("runs import_race through get_review_queue and apply_match_decision", async () => {
    const runtime = new LegacyApiRuntime();
    expectOk(await invoke(runtime, "create_series_year", { series_year: 2027 }));
    expectOk(await invoke(runtime, "open_series_year", { series_year: 2027 }));

    const repo = await getSeasonRepository();
    const seasonId = (await repo.listSeasons())[0]!.season_id;
    await repo.appendEvents(seasonId, [
      importBatchRecorded({
        import_batch_id: "seed-batch",
        source_sha256: "seed-sha",
        source_file: "seed.xlsx",
      }),
      personRegistered({
        person_id: "person-existing",
        given_name: "Max",
        family_name: "Müller",
        display_name: "Max Müller",
        gender: "M",
        club: "LG A",
        club_normalized: "lg a",
      }),
      teamRegistered({
        team_id: "team-existing",
        member_person_ids: ["person-existing"],
        team_kind: "solo",
      }),
      personRegistered({
        person_id: "person-existing-2",
        given_name: "Max",
        family_name: "Müller",
        display_name: "Max Müller",
        gender: "M",
        club: "LG A",
        club_normalized: "lg a",
      }),
      teamRegistered({
        team_id: "team-existing-2",
        member_person_ids: ["person-existing-2"],
        team_kind: "solo",
      }),
      raceRegistered({
        race_event_id: "seed-race",
        import_batch_id: "seed-batch",
        category: { duration: "hour", division: "men" },
        race_no: 1,
        entries: [
          defaultEntry({
            entry_id: "seed-entry",
            team_id: "team-existing",
            points: 8,
            distance_m: 10000,
          }),
        ],
      }),
    ]);
    expectOk(
      await invoke(runtime, "set_matching_config", {
        auto_min: 0.88,
        review_min: 0.72,
        auto_merge_enabled: false,
        perfect_match_auto_merge: false,
        strict_normalized_auto_only: true,
      }),
    );

    const rows = [
      [...EXPECTED_HEADER_SINGLES],
      ["h-Lauf", "", "", "", "", "", "", ""],
      ["Männer", "", "", "", "", "", "", ""],
      [1, "11", "Müller, Max", 1990, "LG A", "11,0", "", "9"],
    ];
    const filePath = runtime.seedSelectedFileForTests(buildSinglesImportFile(rows));

    const importedResponse = await invoke(runtime, "import_race", {
      series_year: 2027,
      file_path: filePath,
      source_type: "singles",
      race_no: 2,
    });
    const imported = expectOk(importedResponse);
    expect(imported.review_queue_count).toBe(1);

    const queue = expectOk(await invoke(runtime, "get_review_queue"));
    const items = queue.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect((items[0]?.candidate_uids as string[])[0]).toBe("person-existing");

    expectOk(
      await invoke(runtime, "apply_match_decision", {
        race_event_uid: items[0]?.race_event_uid,
        entry_uid: items[0]?.entry_uid,
        target_participant_uid: "person-existing",
        rationale: "manual review accept",
      }),
    );

    const queueAfter = expectOk(await invoke(runtime, "get_review_queue"));
    expect(queueAfter.items).toEqual([]);

    const standings = expectOk(
      await invoke(runtime, "get_standings", {
        category_key: "hour:men",
      }),
    );
    const rowsAfter = standings.rows as Array<Record<string, unknown>>;
    expect(rowsAfter).toHaveLength(1);
    expect(rowsAfter[0]?.display_name).toBe("Max Müller");
    expect(rowsAfter[0]?.punkte_gesamt).toBe(17);
  });

  it("flags couple member YOB diffs in candidate review displays", async () => {
    const runtime = new LegacyApiRuntime();
    expectOk(await invoke(runtime, "create_series_year", { series_year: 2028 }));
    expectOk(await invoke(runtime, "open_series_year", { series_year: 2028 }));

    const repo = await getSeasonRepository();
    const seasonId = (await repo.listSeasons())[0]!.season_id;
    await repo.appendEvents(seasonId, [
      importBatchRecorded({
        import_batch_id: "seed-couples-batch",
        source_sha256: "seed-couples-sha",
        source_file: "seed-couples.xlsx",
      }),
      personRegistered({
        person_id: "c-person-a",
        given_name: "Anna",
        family_name: "Meyer",
        display_name: "Anna Meyer",
        gender: "F",
        yob: 1991,
        club: "LG A",
        club_normalized: "lg a",
      }),
      personRegistered({
        person_id: "c-person-b",
        given_name: "Berta",
        family_name: "Schulz",
        display_name: "Berta Schulz",
        gender: "F",
        yob: 1992,
        club: "LG A",
        club_normalized: "lg a",
      }),
      teamRegistered({
        team_id: "c-team-existing",
        member_person_ids: ["c-person-a", "c-person-b"],
        team_kind: "couple",
      }),
      raceRegistered({
        race_event_id: "seed-couples-race",
        import_batch_id: "seed-couples-batch",
        category: { duration: "half_hour", division: "couples_women" },
        race_no: 1,
        entries: [
          defaultEntry({
            entry_id: "seed-couples-entry",
            team_id: "c-team-existing",
            points: 8,
            distance_m: 8200,
          }),
        ],
      }),
    ]);
    expectOk(
      await invoke(runtime, "set_matching_config", {
        auto_min: 1.1,
        review_min: 0.0,
        auto_merge_enabled: false,
        perfect_match_auto_merge: false,
      }),
    );

    const rows = [
      [...EXPECTED_HEADER_COUPLES],
      ["1/2 h-Lauf", "", "", "", "", "", "", "", "", "", ""],
      ["Paare Frauen", "", "", "", "", "", "", "", "", "", ""],
      [1, "22", "Anna Meyer", 1990, "LG A", "Berta Schulz", 1993, "LG A", "8,2", "", "9"],
    ];
    const filePath = runtime.seedSelectedFileForTests(buildCouplesImportFile(rows));

    const imported = expectOk(
      await invoke(runtime, "import_race", {
        series_year: 2028,
        file_path: filePath,
        source_type: "couples",
        race_no: 2,
      }),
    );
    expect(imported.review_queue_count).toBe(1);

    const queue = expectOk(await invoke(runtime, "get_review_queue"));
    const items = queue.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    const displays = items[0]!.candidate_review_displays as Array<Record<string, unknown> | null>;
    const firstDisplay = displays[0] as Record<string, unknown>;
    const lines = firstDisplay.lines as Array<Record<string, unknown>>;
    expect(lines).toHaveLength(2);
    expect((lines[0]!.yob as Record<string, unknown>).diff).toBe(true);
    expect((lines[1]!.yob as Record<string, unknown>).diff).toBe(true);
  });
});
