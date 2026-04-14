import type { DomainEvent } from "@/domain/events.ts";

export interface SeasonArchiveManifest {
  format: string;
  format_version: number;
  exported_at: string;
  app_version: string;
  eventlog_format_version: number;
  season_id: string;
  label: string;
  events_total: number;
  last_event_seq: number;
  sha256_eventlog: string;
}

export interface ImportSeasonOptions {
  targetSeasonId?: string;
  targetLabel?: string;
  replaceExisting?: boolean;
  confirmSeasonId?: string;
}

export interface ImportSeasonResult {
  season_id: string;
  label: string;
  events_imported: number;
  replaced_existing: boolean;
}

export interface ExportSeasonOptions {
  filename?: string;
}

export interface ExportSeasonResult {
  season_id: string;
  label: string;
  filename: string;
  bytes_written: number;
  events_total: number;
  sha256_eventlog: string;
}

export interface BuiltSeasonArchive {
  blob: Blob;
  zip_bytes: Uint8Array;
  filename: string;
  manifest: SeasonArchiveManifest;
  eventlog_json: string;
  eventlog_bytes: Uint8Array;
}

export interface ParsedSeasonArchive {
  manifest: SeasonArchiveManifest;
  eventlog_json: string;
  eventlog_bytes: Uint8Array;
  season_id: string;
  label: string;
  events: DomainEvent[];
}
