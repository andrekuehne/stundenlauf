import type { SeasonArchiveManifest } from "./types.ts";
import {
  SEASON_ARCHIVE_FORMAT,
  SEASON_ARCHIVE_FORMAT_VERSION,
  STUNDENLAUF_TS_APP_VERSION,
} from "./constants.ts";

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Ungültiges Manifest: JSON-Objekt erwartet.");
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Ungültiges Manifest: Feld "${field}" fehlt oder ist leer.`);
  }
  return value.trim();
}

function requiredInteger(
  value: unknown,
  field: string,
  predicate: (value: number) => boolean = () => true,
): number {
  if (!Number.isInteger(value) || !predicate(value as number)) {
    throw new Error(`Ungültiges Manifest: Feld "${field}" hat einen ungültigen Wert.`);
  }
  return value as number;
}

export function buildManifest(params: {
  seasonId: string;
  label: string;
  eventlogFormatVersion: number;
  eventsTotal: number;
  lastEventSeq: number;
  sha256Eventlog: string;
  exportedAt?: string;
  appVersion?: string;
}): SeasonArchiveManifest {
  return {
    format: SEASON_ARCHIVE_FORMAT,
    format_version: SEASON_ARCHIVE_FORMAT_VERSION,
    exported_at: params.exportedAt ?? new Date().toISOString(),
    app_version: params.appVersion ?? STUNDENLAUF_TS_APP_VERSION,
    eventlog_format_version: params.eventlogFormatVersion,
    season_id: params.seasonId,
    label: params.label,
    events_total: params.eventsTotal,
    last_event_seq: params.lastEventSeq,
    sha256_eventlog: params.sha256Eventlog.toLowerCase(),
  };
}

export function validateManifest(raw: unknown): SeasonArchiveManifest {
  const manifest = asObject(raw);
  const format = requiredString(manifest.format, "format");
  if (format !== SEASON_ARCHIVE_FORMAT) {
    throw new Error(
      `Unbekanntes Saisonarchiv-Format "${format}". Erwartet wird "${SEASON_ARCHIVE_FORMAT}".`,
    );
  }

  const formatVersion = requiredInteger(manifest.format_version, "format_version");
  if (formatVersion !== SEASON_ARCHIVE_FORMAT_VERSION) {
    throw new Error(
      `Nicht unterstützte Saisonarchiv-Version ${formatVersion}. Unterstützt wird ${SEASON_ARCHIVE_FORMAT_VERSION}.`,
    );
  }

  const exportedAt = requiredString(manifest.exported_at, "exported_at");
  const appVersion = requiredString(manifest.app_version, "app_version");
  const seasonId = requiredString(manifest.season_id, "season_id");
  const label = requiredString(manifest.label, "label");
  const eventlogFormatVersion = requiredInteger(
    manifest.eventlog_format_version,
    "eventlog_format_version",
  );
  const eventsTotal = requiredInteger(manifest.events_total, "events_total", (value) => value >= 0);
  const lastEventSeq = requiredInteger(
    manifest.last_event_seq,
    "last_event_seq",
    (value) => value >= -1,
  );
  const checksum = requiredString(manifest.sha256_eventlog, "sha256_eventlog").toLowerCase();
  if (!/^[0-9a-f]+$/i.test(checksum)) {
    throw new Error('Ungültiges Manifest: Feld "sha256_eventlog" muss eine Hex-Zeichenfolge sein.');
  }

  return {
    format,
    format_version: formatVersion,
    exported_at: exportedAt,
    app_version: appVersion,
    eventlog_format_version: eventlogFormatVersion,
    season_id: seasonId,
    label,
    events_total: eventsTotal,
    last_event_seq: lastEventSeq,
    sha256_eventlog: checksum,
  };
}
