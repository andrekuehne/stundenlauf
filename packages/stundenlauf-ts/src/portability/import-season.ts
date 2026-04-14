import JSZip from "jszip";
import type { SeasonRepository } from "@/services/season-repository.ts";
import { deserializeEventLog } from "@/storage/serialization.ts";
import {
  SEASON_ARCHIVE_EVENTLOG_FILE,
  SEASON_ARCHIVE_MANIFEST_FILE,
} from "./constants.ts";
import { checksumMatches } from "./integrity.ts";
import { validateManifest } from "./manifest.ts";
import type { ImportSeasonOptions, ImportSeasonResult, ParsedSeasonArchive } from "./types.ts";

type ImportSeasonRepository = Pick<
  SeasonRepository,
  "listSeasons" | "saveImportedSeason"
>;

function normalizeLabel(label: string): string {
  return label.trim().toLocaleLowerCase("de");
}

function parseJson(text: string, description: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${description} ist kein gültiges JSON.`);
  }
}

export async function readSeasonArchive(file: File): Promise<ParsedSeasonArchive> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error("Die ausgewählte Datei ist kein gültiges ZIP-Archiv.");
  }

  const entryNames = Object.keys(zip.files).sort();
  const expected = [SEASON_ARCHIVE_EVENTLOG_FILE, SEASON_ARCHIVE_MANIFEST_FILE];
  const isValidStructure =
    entryNames.length === expected.length &&
    entryNames.every((name, index) => name === expected[index]) &&
    entryNames.every((name) => !name.includes("/") && !name.includes("\\") && !zip.files[name]?.dir);

  if (!isValidStructure) {
    throw new Error(
      `Ungültiger Saisonarchiv-Inhalt. Erwartet werden genau ${expected.join(" und ")} im Archivwurzelverzeichnis.`,
    );
  }

  const manifestEntry = zip.file(SEASON_ARCHIVE_MANIFEST_FILE);
  const eventlogEntry = zip.file(SEASON_ARCHIVE_EVENTLOG_FILE);
  if (!manifestEntry || !eventlogEntry) {
    throw new Error("Das Saisonarchiv ist unvollständig.");
  }

  const manifestJson = await manifestEntry.async("text");
  const eventlogJson = await eventlogEntry.async("text");
  const eventlogBytes = await eventlogEntry.async("uint8array");

  const manifest = validateManifest(parseJson(manifestJson, "manifest.json"));
  if (!(await checksumMatches(eventlogBytes, manifest.sha256_eventlog))) {
    throw new Error("Die Integritätsprüfung des Event-Logs ist fehlgeschlagen.");
  }

  const eventlog = deserializeEventLog(eventlogJson);
  if (eventlog.season_id !== manifest.season_id) {
    throw new Error("manifest.json und eventlog.json referenzieren unterschiedliche season_id-Werte.");
  }
  if (eventlog.label.trim().length === 0) {
    throw new Error("eventlog.json enthält keinen gültigen Saisonnamen.");
  }
  if (eventlog.format_version !== manifest.eventlog_format_version) {
    throw new Error("Die Event-Log-Formatversion im Manifest passt nicht zu eventlog.json.");
  }
  if (eventlog.events.length !== manifest.events_total) {
    throw new Error("Die Event-Anzahl im Manifest passt nicht zu eventlog.json.");
  }
  const lastEvent = eventlog.events[eventlog.events.length - 1];
  if ((lastEvent?.seq ?? -1) !== manifest.last_event_seq) {
    throw new Error("Die letzte Sequenznummer im Manifest passt nicht zu eventlog.json.");
  }

  return {
    manifest,
    eventlog_json: eventlogJson,
    eventlog_bytes: eventlogBytes,
    season_id: eventlog.season_id,
    label: eventlog.label,
    events: eventlog.events,
  };
}

export async function importSeason(
  repository: ImportSeasonRepository,
  file: File,
  options: ImportSeasonOptions = {},
): Promise<ImportSeasonResult> {
  const archive = await readSeasonArchive(file);
  const targetSeasonId = options.targetSeasonId?.trim() || archive.season_id;
  const targetLabel = options.targetLabel?.trim() || archive.label.trim();
  if (!targetLabel) {
    throw new Error("Bitte einen gültigen Saisonnamen angeben.");
  }

  const seasons = await repository.listSeasons();
  const existingById = seasons.find((season) => season.season_id === targetSeasonId) ?? null;
  const existingByLabel =
    seasons.find(
      (season) =>
        season.season_id !== targetSeasonId &&
        normalizeLabel(season.label) === normalizeLabel(targetLabel),
    ) ?? null;

  let replacedExisting = false;
  if (existingById) {
    if (!options.replaceExisting) {
      throw new Error(
        `Season "${existingById.label}" already exists. Use replace mode or import as a new season.`,
      );
    }
    if (options.confirmSeasonId?.trim() !== targetSeasonId) {
      throw new Error("Saison-Ersetzung nicht bestätigt.");
    }
    replacedExisting = true;
  } else if (existingByLabel) {
    throw new Error(
      `Season name "${existingByLabel.label}" already exists. Choose another season name or replace the existing season explicitly.`,
    );
  }

  await repository.saveImportedSeason(
    {
      season_id: targetSeasonId,
      label: targetLabel,
      created_at: new Date().toISOString(),
    },
    archive.events,
  );

  return {
    season_id: targetSeasonId,
    label: targetLabel,
    events_imported: archive.events.length,
    replaced_existing: replacedExisting,
  };
}
