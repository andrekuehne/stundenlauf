/**
 * Event log persistence: append, read, bulk-write for IndexedDB.
 *
 * Reference: F-TS01 §7 (Storage Format)
 */

import type { IDBPDatabase } from "idb";
import type { StundenlaufDB } from "./db.ts";
import type { DomainEvent } from "@/domain/events.ts";
import type { SeasonDescriptor } from "@/domain/types.ts";

export interface EventStore {
  getEventLog(seasonId: string): Promise<DomainEvent[]>;
  appendEvents(seasonId: string, events: DomainEvent[]): Promise<void>;
  writeEventLog(seasonId: string, label: string, events: DomainEvent[]): Promise<void>;
  deleteEventLog(seasonId: string): Promise<void>;
  getWorkspaceSeasons(): Promise<Map<string, SeasonDescriptor>>;
  saveWorkspaceSeasons(seasons: Map<string, SeasonDescriptor>): Promise<void>;
}

export function createEventStore(db: IDBPDatabase<StundenlaufDB>): EventStore {
  return {
    async getEventLog(seasonId: string): Promise<DomainEvent[]> {
      const record = await db.get("event_logs", seasonId);
      return record?.events ?? [];
    },

    async appendEvents(seasonId: string, events: DomainEvent[]): Promise<void> {
      if (events.length === 0) return;

      const tx = db.transaction("event_logs", "readwrite");
      const store = tx.objectStore("event_logs");
      const existing = await store.get(seasonId);
      const currentEvents = existing?.events ?? [];

      const lastEvent = currentEvents[currentEvents.length - 1];
      const lastSeq = lastEvent != null ? lastEvent.seq : -1;
      const firstEvent = events[0];
      if (firstEvent == null) return;
      const firstNewSeq = firstEvent.seq;

      if (firstNewSeq !== lastSeq + 1) {
        throw new Error(
          `Seq gap: existing log ends at seq=${lastSeq}, new events start at seq=${firstNewSeq}`,
        );
      }

      const batchIds = new Set<string>();
      for (const evt of currentEvents) {
        if (evt.metadata.import_batch_id) {
          batchIds.add(evt.metadata.import_batch_id);
        }
      }
      for (const evt of events) {
        if (
          evt.type === "import_batch.recorded" &&
          batchIds.has(
            (evt.payload as { import_batch_id: string }).import_batch_id,
          )
        ) {
          throw new Error(
            `Duplicate import_batch_id "${(evt.payload as { import_batch_id: string }).import_batch_id}" in event log`,
          );
        }
      }

      await store.put({
        season_id: seasonId,
        events: [...currentEvents, ...events],
      });
      await tx.done;
    },

    async writeEventLog(
      seasonId: string,
      _label: string,
      events: DomainEvent[],
    ): Promise<void> {
      await db.put("event_logs", { season_id: seasonId, events: [...events] });
    },

    async deleteEventLog(seasonId: string): Promise<void> {
      await db.delete("event_logs", seasonId);
    },

    async getWorkspaceSeasons(): Promise<Map<string, SeasonDescriptor>> {
      const record = await db.get("workspace", "singleton");
      if (!record) return new Map();
      return new Map(Object.entries(record.seasons));
    },

    async saveWorkspaceSeasons(seasons: Map<string, SeasonDescriptor>): Promise<void> {
      const obj: Record<string, SeasonDescriptor> = {};
      for (const [id, desc] of seasons) {
        obj[id] = desc;
      }
      await db.put("workspace", { key: "singleton", seasons: obj });
    },
  };
}
