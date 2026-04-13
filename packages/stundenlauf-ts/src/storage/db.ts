/**
 * IndexedDB setup and schema definitions.
 *
 * Reference: F-TS01 §7 (Storage Format)
 */

import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { DomainEvent } from "@/domain/events.ts";
import type { SeasonDescriptor } from "@/domain/types.ts";

const DB_NAME = "stundenlauf-ts";
const DB_VERSION = 1;

export interface StundenlaufDB extends DBSchema {
  workspace: {
    key: "singleton";
    value: {
      key: "singleton";
      seasons: Record<string, SeasonDescriptor>;
    };
  };
  event_logs: {
    key: string;
    value: {
      season_id: string;
      events: DomainEvent[];
    };
  };
}

export async function openStundenlaufDB(): Promise<IDBPDatabase<StundenlaufDB>> {
  return openDB<StundenlaufDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("workspace")) {
        db.createObjectStore("workspace", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("event_logs")) {
        db.createObjectStore("event_logs", { keyPath: "season_id" });
      }
    },
  });
}
