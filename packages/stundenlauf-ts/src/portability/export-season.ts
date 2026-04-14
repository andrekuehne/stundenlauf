import JSZip from "jszip";
import type { SeasonRepository } from "@/services/season-repository.ts";
import { serializeEventLog } from "@/storage/serialization.ts";
import { triggerDownload } from "./download.ts";
import {
  SEASON_ARCHIVE_EVENTLOG_FILE,
  SEASON_ARCHIVE_MANIFEST_FILE,
  SEASON_ARCHIVE_SUFFIX,
} from "./constants.ts";
import { sha256Hex } from "./integrity.ts";
import { buildManifest } from "./manifest.ts";
import { sanitizeFilename } from "./sanitize.ts";
import type { BuiltSeasonArchive, ExportSeasonOptions, ExportSeasonResult } from "./types.ts";

type ExportSeasonRepository = Pick<
  SeasonRepository,
  "getSeason" | "getEventLog"
>;

function archiveFilename(label: string, override?: string): string {
  const trimmed = override?.trim();
  if (trimmed) {
    return trimmed.endsWith(SEASON_ARCHIVE_SUFFIX) ? trimmed : `${trimmed}${SEASON_ARCHIVE_SUFFIX}`;
  }
  return `stundenlauf-${sanitizeFilename(label)}${SEASON_ARCHIVE_SUFFIX}`;
}

export async function buildSeasonArchive(
  repository: ExportSeasonRepository,
  seasonId: string,
  options: ExportSeasonOptions = {},
): Promise<BuiltSeasonArchive> {
  const descriptor = await repository.getSeason(seasonId);
  if (!descriptor) {
    throw new Error(`Saison "${seasonId}" wurde nicht gefunden.`);
  }

  const events = await repository.getEventLog(seasonId);
  const eventlogJson = serializeEventLog(seasonId, descriptor.label, events, { pretty: false });
  const eventlogBytes = new TextEncoder().encode(eventlogJson);
  const parsed = JSON.parse(eventlogJson) as { format_version?: unknown };
  if (!Number.isInteger(parsed.format_version)) {
    throw new Error("Event-Log-Formatversion konnte nicht bestimmt werden.");
  }

  const lastEvent = events[events.length - 1];
  const manifest = buildManifest({
    seasonId,
    label: descriptor.label,
    eventlogFormatVersion: parsed.format_version as number,
    eventsTotal: events.length,
    lastEventSeq: lastEvent?.seq ?? -1,
    sha256Eventlog: await sha256Hex(eventlogBytes),
  });

  const zip = new JSZip();
  zip.file(SEASON_ARCHIVE_MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  zip.file(SEASON_ARCHIVE_EVENTLOG_FILE, eventlogJson);

  const zipBytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const blob = new Blob([zipBytes], { type: "application/zip" });
  return {
    blob,
    zip_bytes: zipBytes,
    filename: archiveFilename(descriptor.label, options.filename),
    manifest,
    eventlog_json: eventlogJson,
    eventlog_bytes: eventlogBytes,
  };
}

export async function exportSeason(
  repository: ExportSeasonRepository,
  seasonId: string,
  options: ExportSeasonOptions = {},
): Promise<ExportSeasonResult> {
  const archive = await buildSeasonArchive(repository, seasonId, options);
  triggerDownload(archive.blob, archive.filename);
  return {
    season_id: archive.manifest.season_id,
    label: archive.manifest.label,
    filename: archive.filename,
    bytes_written: archive.blob.size,
    events_total: archive.manifest.events_total,
    sha256_eventlog: archive.manifest.sha256_eventlog,
  };
}
