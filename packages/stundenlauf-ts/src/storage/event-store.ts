/**
 * Event log persistence: append, read, bulk-write for IndexedDB.
 *
 * Reference: F-TS01 §7 (Storage Format)
 */

import type { IDBPDatabase } from "idb";
import type { StundenlaufDB } from "./db.ts";
import type { DomainEvent } from "@/domain/events.ts";
import { applyEvent, projectState } from "@/domain/projection.ts";
import { validateEvent } from "@/domain/validation.ts";
import type { SeasonDescriptor } from "@/domain/types.ts";

export class EventAppendValidationError extends Error {
  readonly season_id: string;
  readonly batch_index: number;
  readonly event_seq: number;
  readonly event_type: DomainEvent["type"];
  readonly reasons: string[];

  constructor(params: {
    season_id: string;
    batch_index: number;
    event_seq: number;
    event_type: DomainEvent["type"];
    reasons: string[];
  }) {
    super(
      `Event append validation failed (season="${params.season_id}", index=${params.batch_index}, seq=${params.event_seq}, type="${params.event_type}"): ${params.reasons.join("; ")}`,
    );
    this.name = "EventAppendValidationError";
    this.season_id = params.season_id;
    this.batch_index = params.batch_index;
    this.event_seq = params.event_seq;
    this.event_type = params.event_type;
    this.reasons = [...params.reasons];
  }
}

export interface EventStore {
  getEventLog(seasonId: string): Promise<DomainEvent[]>;
  appendEvents(seasonId: string, events: DomainEvent[]): Promise<void>;
  writeEventLog(seasonId: string, label: string, events: DomainEvent[]): Promise<void>;
  deleteEventLog(seasonId: string): Promise<void>;
  getWorkspaceSeasons(): Promise<Map<string, SeasonDescriptor>>;
  saveWorkspaceSeasons(seasons: Map<string, SeasonDescriptor>): Promise<void>;
  saveWorkspaceSeasonsAndEventLog(
    seasons: Map<string, SeasonDescriptor>,
    seasonId: string,
    events: DomainEvent[],
  ): Promise<void>;
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

      for (let i = 0; i < events.length; i++) {
        const expectedSeq = firstNewSeq + i;
        const evt = events[i];
        if (!evt) continue;
        if (evt.seq !== expectedSeq) {
          throw new Error(
            `Seq discontinuity within append batch at index=${i}: expected seq=${expectedSeq}, got seq=${evt.seq}`,
          );
        }
      }

      let transientState = projectState(seasonId, currentEvents);
      for (let i = 0; i < events.length; i++) {
        const evt = events[i];
        if (!evt) continue;
        const validation = validateEvent(transientState, evt);
        if (!validation.valid) {
          throw new EventAppendValidationError({
            season_id: seasonId,
            batch_index: i,
            event_seq: evt.seq,
            event_type: evt.type,
            reasons: validation.errors,
          });
        }
        transientState = applyEvent(transientState, evt);
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

    async saveWorkspaceSeasonsAndEventLog(
      seasons: Map<string, SeasonDescriptor>,
      seasonId: string,
      events: DomainEvent[],
    ): Promise<void> {
      const workspaceRecord: Record<string, SeasonDescriptor> = {};
      for (const [id, desc] of seasons) {
        workspaceRecord[id] = desc;
      }

      const tx = db.transaction(["workspace", "event_logs"], "readwrite");
      await tx.objectStore("workspace").put({
        key: "singleton",
        seasons: workspaceRecord,
      });
      await tx.objectStore("event_logs").put({
        season_id: seasonId,
        events: [...events],
      });
      await tx.done;
    },
  };
}
