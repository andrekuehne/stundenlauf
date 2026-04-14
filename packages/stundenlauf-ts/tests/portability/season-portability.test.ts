import JSZip from "jszip";
import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent } from "@/domain/events.ts";
import { projectState } from "@/domain/projection.ts";
import type { SeasonDescriptor } from "@/domain/types.ts";
import { buildSeasonArchive } from "@/portability/export-season.ts";
import { importSeason, readSeasonArchive } from "@/portability/import-season.ts";
import {
  defaultEntry,
  importBatchRecorded,
  personRegistered,
  raceRegistered,
  resetSeqCounter,
  teamRegistered,
} from "../helpers/event-factories.ts";

class InMemoryPortabilityRepository {
  private readonly seasons = new Map<string, SeasonDescriptor>();
  private readonly eventLogs = new Map<string, DomainEvent[]>();

  seedSeason(season: SeasonDescriptor, events: DomainEvent[]): void {
    this.seasons.set(season.season_id, season);
    this.eventLogs.set(season.season_id, [...events]);
  }

  listSeasons(): Promise<SeasonDescriptor[]> {
    return Promise.resolve([...this.seasons.values()]);
  }

  getSeason(seasonId: string): Promise<SeasonDescriptor | null> {
    return Promise.resolve(this.seasons.get(seasonId) ?? null);
  }

  getEventLog(seasonId: string): Promise<DomainEvent[]> {
    return Promise.resolve([...(this.eventLogs.get(seasonId) ?? [])]);
  }

  saveImportedSeason(season: SeasonDescriptor, events: DomainEvent[]): Promise<void> {
    this.seasons.set(season.season_id, season);
    this.eventLogs.set(season.season_id, [...events]);
    return Promise.resolve();
  }
}

async function buildArchiveFile(
  repo: InMemoryPortabilityRepository,
  seasonId: string,
  fileName = "archive.stundenlauf-season.zip",
): Promise<File> {
  const archive = await buildSeasonArchive(repo, seasonId, { filename: fileName });
  const buffer = archive.zip_bytes.buffer.slice(0);
  const file = new File([buffer], fileName, { type: "application/zip" });
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.resolve(buffer.slice(0)),
  });
  return file;
}

function buildSeasonEvents(): DomainEvent[] {
  return [
    importBatchRecorded({ import_batch_id: "batch-1" }),
    personRegistered({
      person_id: "person-1",
      given_name: "Jürgen",
      family_name: "Groß",
      display_name: "Jürgen Groß",
      club: "LG Süd",
      club_normalized: "lg sud",
    }),
    teamRegistered({
      team_id: "team-1",
      member_person_ids: ["person-1"],
      team_kind: "solo",
    }),
    raceRegistered({
      import_batch_id: "batch-1",
      race_event_id: "race-1",
      race_no: 1,
      entries: [
        defaultEntry({
          entry_id: "entry-1",
          team_id: "team-1",
          distance_m: 12345,
          points: 12,
        }),
      ],
    }),
  ];
}

beforeEach(() => {
  resetSeqCounter();
});

describe("season archive export/import", () => {
  it("round-trips a season archive into identical projected state", async () => {
    const sourceRepo = new InMemoryPortabilityRepository();
    const targetRepo = new InMemoryPortabilityRepository();
    const season: SeasonDescriptor = {
      season_id: "season-source",
      label: "Trainingsblock Alpha",
      created_at: "2026-04-14T18:40:00.000Z",
    };
    const events = buildSeasonEvents();
    sourceRepo.seedSeason(season, events);

    const archiveFile = await buildArchiveFile(sourceRepo, season.season_id);
    const imported = await importSeason(targetRepo, archiveFile);
    const importedEvents = await targetRepo.getEventLog(imported.season_id);

    expect(imported.label).toBe("Trainingsblock Alpha");
    expect(importedEvents).toHaveLength(events.length);
    expect(projectState(season.season_id, events)).toEqual(
      projectState(imported.season_id, importedEvents),
    );
  });

  it("rejects conflicting generic season names by default", async () => {
    const sourceRepo = new InMemoryPortabilityRepository();
    const targetRepo = new InMemoryPortabilityRepository();
    sourceRepo.seedSeason(
      {
        season_id: "season-source",
        label: "Trainingsblock Alpha",
        created_at: "2026-04-14T18:40:00.000Z",
      },
      buildSeasonEvents(),
    );
    targetRepo.seedSeason(
      {
        season_id: "season-existing",
        label: "Trainingsblock Alpha",
        created_at: "2026-04-14T18:45:00.000Z",
      },
      [],
    );

    await expect(importSeason(targetRepo, await buildArchiveFile(sourceRepo, "season-source"))).rejects
      .toThrow('Season name "Trainingsblock Alpha" already exists');
  });

  it("replaces an existing season when the canonical season id is confirmed", async () => {
    const sourceRepo = new InMemoryPortabilityRepository();
    const targetRepo = new InMemoryPortabilityRepository();
    const replacementEvents = buildSeasonEvents();
    sourceRepo.seedSeason(
      {
        season_id: "season-replacement",
        label: "Herbstserie Beta",
        created_at: "2026-04-14T18:50:00.000Z",
      },
      replacementEvents,
    );
    targetRepo.seedSeason(
      {
        season_id: "season-target",
        label: "Lokale Saison",
        created_at: "2026-04-14T18:55:00.000Z",
      },
      [],
    );

    const imported = await importSeason(
      targetRepo,
      await buildArchiveFile(sourceRepo, "season-replacement"),
      {
        targetSeasonId: "season-target",
        replaceExisting: true,
        confirmSeasonId: "season-target",
      },
    );

    expect(imported.replaced_existing).toBe(true);
    expect((await targetRepo.getSeason("season-target"))?.label).toBe("Herbstserie Beta");
    expect(await targetRepo.getEventLog("season-target")).toEqual(replacementEvents);
  });

  it("rejects tampered archives on checksum mismatch", async () => {
    const repo = new InMemoryPortabilityRepository();
    repo.seedSeason(
      {
        season_id: "season-source",
        label: "Trainingsblock Alpha",
        created_at: "2026-04-14T18:40:00.000Z",
      },
      buildSeasonEvents(),
    );

    const archive = await buildSeasonArchive(repo, "season-source");
    const zip = await JSZip.loadAsync(archive.zip_bytes);
    zip.file("eventlog.json", '{"format":"stundenlauf-ts-eventlog","format_version":1,"season_id":"season-source","label":"Manipuliert","events":[]}');
    const tamperedBytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const tamperedBuffer = tamperedBytes.buffer.slice(0);
    const file = new File([tamperedBuffer], "tampered.stundenlauf-season.zip", {
      type: "application/zip",
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: () => Promise.resolve(tamperedBuffer.slice(0)),
    });

    await expect(readSeasonArchive(file)).rejects.toThrow("Integritätsprüfung");
  });
});
