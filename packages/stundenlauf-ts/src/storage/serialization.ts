/**
 * JSON serialization/deserialization for event logs (season archives).
 *
 * Pure functions — no IndexedDB dependency.
 *
 * Reference: F-TS01 §7 (Storage Format)
 */

import type { DomainEvent } from "@/domain/events.ts";

export interface SeasonArchive {
  format: "stundenlauf-ts-eventlog";
  format_version: 1;
  season_id: string;
  label: string;
  events: DomainEvent[];
}

const EXPECTED_FORMAT = "stundenlauf-ts-eventlog" as const;
const SUPPORTED_FORMAT_VERSION = 1;

export function serializeEventLog(
  seasonId: string,
  label: string,
  events: readonly DomainEvent[],
  options: { pretty?: boolean } = {},
): string {
  const archive: SeasonArchive = {
    format: EXPECTED_FORMAT,
    format_version: SUPPORTED_FORMAT_VERSION,
    season_id: seasonId,
    label,
    events: [...events],
  };
  return JSON.stringify(archive, null, options.pretty === false ? undefined : 2);
}

export function deserializeEventLog(json: string): SeasonArchive {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error("Invalid JSON: could not parse season archive");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid archive: expected a JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.format !== EXPECTED_FORMAT) {
    throw new Error(
      `Invalid archive format: expected "${EXPECTED_FORMAT}", got "${String(obj.format)}"`,
    );
  }

  if (obj.format_version !== SUPPORTED_FORMAT_VERSION) {
    throw new Error(
      `Unsupported format_version: expected ${SUPPORTED_FORMAT_VERSION}, got ${String(obj.format_version)}`,
    );
  }

  if (typeof obj.season_id !== "string" || obj.season_id.length === 0) {
    throw new Error("Invalid archive: missing or empty season_id");
  }

  if (typeof obj.label !== "string") {
    throw new Error("Invalid archive: missing or non-string label");
  }

  if (!Array.isArray(obj.events)) {
    throw new Error("Invalid archive: events must be an array");
  }

  return {
    format: EXPECTED_FORMAT,
    format_version: SUPPORTED_FORMAT_VERSION,
    season_id: obj.season_id,
    label: obj.label,
    events: obj.events as DomainEvent[],
  };
}
