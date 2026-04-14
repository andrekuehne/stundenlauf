import type { DomainEvent } from "@/domain/events.ts";
import type { SeasonState } from "@/domain/types.ts";

export interface ImportBatchHistoryRow {
  import_batch_id: string;
  source_file: string;
  imported_at: string;
  state: "active" | "rolled_back";
  races_count: number;
}

export interface AuditRow {
  event_id: string;
  recorded_at: string;
  type: string;
  detail: string;
}

function eventDetail(event: DomainEvent): string {
  switch (event.type) {
    case "person.corrected":
      return `Person ${event.payload.person_id} bearbeitet`;
    case "entry.reassigned":
      return `Eintrag ${event.payload.entry_id} umgehängt`;
    case "entry.corrected":
      return `Eintrag ${event.payload.entry_id} korrigiert`;
    case "race.metadata_corrected":
      return `Lauf ${event.payload.race_event_id} angepasst`;
    case "race.rolled_back":
      return `Lauf ${event.payload.race_event_id} zurückgerollt`;
    case "import_batch.rolled_back":
      return `Import ${event.payload.import_batch_id} zurückgerollt`;
    default:
      return "";
  }
}

export function buildImportBatchRows(state: SeasonState): ImportBatchHistoryRow[] {
  const rows: ImportBatchHistoryRow[] = [];
  for (const batch of state.import_batches.values()) {
    const racesCount = [...state.race_events.values()].filter(
      (race) => race.import_batch_id === batch.import_batch_id,
    ).length;
    rows.push({
      import_batch_id: batch.import_batch_id,
      source_file: batch.source_file,
      imported_at:
        [...state.race_events.values()].find((race) => race.import_batch_id === batch.import_batch_id)
          ?.imported_at ?? "-",
      state: batch.state,
      races_count: racesCount,
    });
  }
  return rows.sort((a, b) => b.imported_at.localeCompare(a.imported_at));
}

export function buildAuditRows(eventLog: DomainEvent[]): AuditRow[] {
  return eventLog
    .filter((event) =>
      [
        "person.corrected",
        "entry.reassigned",
        "entry.corrected",
        "race.metadata_corrected",
        "race.rolled_back",
        "import_batch.rolled_back",
      ].includes(event.type),
    )
    .map((event) => ({
      event_id: event.event_id,
      recorded_at: event.recorded_at,
      type: event.type,
      detail: eventDetail(event),
    }))
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
}
