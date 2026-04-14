import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent } from "@/domain/events.ts";
import type { SeasonDescriptor } from "@/domain/types.ts";
import {
  createEventStore,
  EventAppendValidationError,
} from "@/storage/event-store.ts";
import {
  defaultEntry,
  importBatchRecorded,
  personRegistered,
  raceRegistered,
  resetSeqCounter,
  teamRegistered,
} from "../helpers/event-factories.ts";

type EventLogRecord = {
  season_id: string;
  events: DomainEvent[];
};

type WorkspaceRecord = {
  key: "singleton";
  seasons: Record<string, SeasonDescriptor>;
};

class InMemoryEventDb {
  readonly eventLogs = new Map<string, EventLogRecord>();
  workspace: WorkspaceRecord | undefined;

  get(
    storeName: string,
    key: string,
  ): Promise<EventLogRecord | WorkspaceRecord | undefined> {
    if (storeName === "event_logs") return Promise.resolve(this.eventLogs.get(key));
    if (storeName === "workspace" && key === "singleton") return Promise.resolve(this.workspace);
    return Promise.resolve(undefined);
  }

  put(storeName: string, value: EventLogRecord | WorkspaceRecord): Promise<void> {
    this.putRecord(storeName, value);
    return Promise.resolve();
  }

  private putRecord(storeName: string, value: EventLogRecord | WorkspaceRecord): void {
    if (storeName === "event_logs") {
      const record = value as EventLogRecord;
      this.eventLogs.set(record.season_id, {
        season_id: record.season_id,
        events: [...record.events],
      });
      return;
    }
    if (storeName === "workspace") {
      const record = value as WorkspaceRecord;
      this.workspace = {
        key: "singleton",
        seasons: { ...record.seasons },
      };
      return;
    }
    throw new Error(`Unsupported store: ${storeName}`);
  }

  private getRecord(storeName: string, key: string): EventLogRecord | WorkspaceRecord | undefined {
    if (storeName === "event_logs") {
      return this.eventLogs.get(key);
    }
    if (storeName === "workspace" && key === "singleton") {
      return this.workspace;
    }
    return undefined;
  }

  transaction(storeNames: string | string[], mode: "readwrite") {
    void mode;
    const allowed = new Set(Array.isArray(storeNames) ? storeNames : [storeNames]);
    return {
      objectStore: (storeName: string) => {
        if (!allowed.has(storeName)) {
          throw new Error(`Unsupported store: ${storeName}`);
        }
        return {
          get: (key: string) => Promise.resolve(this.getRecord(storeName, key)),
          put: (value: EventLogRecord | WorkspaceRecord) => {
            this.putRecord(storeName, value);
            return Promise.resolve();
          },
        };
      },
      done: Promise.resolve(),
    };
  }
}

beforeEach(() => {
  resetSeqCounter();
});

describe("EventStore.appendEvents write barrier", () => {
  it("appends a valid event batch", async () => {
    const db = new InMemoryEventDb();
    const eventStore = createEventStore(db as never);
    const seasonId = "s1";

    const existingEvents: DomainEvent[] = [
      importBatchRecorded({ import_batch_id: "batch-1" }),
      personRegistered({ person_id: "person-1" }),
      teamRegistered({
        team_id: "team-1",
        member_person_ids: ["person-1"],
        team_kind: "solo",
      }),
    ];
    await eventStore.writeEventLog(seasonId, "seed", existingEvents);

    const newRace = raceRegistered({
      import_batch_id: "batch-1",
      entries: [defaultEntry({ entry_id: "entry-1", team_id: "team-1" })],
    });
    await eventStore.appendEvents(seasonId, [newRace]);

    const persisted = await eventStore.getEventLog(seasonId);
    expect(persisted).toHaveLength(4);
    expect(persisted[3]!.type).toBe("race.registered");
  });

  it("rejects unknown team references before persistence", async () => {
    const db = new InMemoryEventDb();
    const eventStore = createEventStore(db as never);
    const seasonId = "s1";

    const existingEvents: DomainEvent[] = [importBatchRecorded({ import_batch_id: "batch-1" })];
    await eventStore.writeEventLog(seasonId, "seed", existingEvents);

    const invalidRace = raceRegistered({
      import_batch_id: "batch-1",
      entries: [defaultEntry({ entry_id: "entry-1", team_id: "team-missing" })],
    });

    let thrown: unknown;
    try {
      await eventStore.appendEvents(seasonId, [invalidRace]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EventAppendValidationError);
    const appendError = thrown as EventAppendValidationError;
    expect(appendError.season_id).toBe(seasonId);
    expect(appendError.batch_index).toBe(0);
    expect(appendError.event_seq).toBe(invalidRace.seq);
    expect(appendError.event_type).toBe("race.registered");
    expect(
      appendError.reasons.some((reason) => reason.includes("unregistered team")),
    ).toBe(true);

    const persisted = await eventStore.getEventLog(seasonId);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.type).toBe("import_batch.recorded");
  });

  it("fails atomically when a middle event is invalid", async () => {
    const db = new InMemoryEventDb();
    const eventStore = createEventStore(db as never);
    const seasonId = "s1";

    const events: DomainEvent[] = [
      personRegistered({ person_id: "person-1" }),
      teamRegistered({
        team_id: "team-1",
        member_person_ids: ["person-missing"],
        team_kind: "solo",
      }),
    ];

    let thrown: unknown;
    try {
      await eventStore.appendEvents(seasonId, events);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EventAppendValidationError);
    const appendError = thrown as EventAppendValidationError;
    expect(appendError.batch_index).toBe(1);
    expect(appendError.event_seq).toBe(events[1]!.seq);
    expect(appendError.event_type).toBe("team.registered");
    expect(appendError.reasons.join(" ")).toContain("not registered");

    const persisted = await eventStore.getEventLog(seasonId);
    expect(persisted).toHaveLength(0);
  });
});

describe("EventStore atomic workspace import writes", () => {
  it("persists workspace registry and event log together", async () => {
    const db = new InMemoryEventDb();
    const eventStore = createEventStore(db as never);
    const descriptor: SeasonDescriptor = {
      season_id: "season-imported",
      label: "Sommerblock A",
      created_at: "2026-04-14T18:00:00.000Z",
    };
    const events: DomainEvent[] = [importBatchRecorded({ import_batch_id: "batch-import" })];

    await eventStore.saveWorkspaceSeasonsAndEventLog(
      new Map([[descriptor.season_id, descriptor]]),
      descriptor.season_id,
      events,
    );

    const seasons = await eventStore.getWorkspaceSeasons();
    const persistedEvents = await eventStore.getEventLog(descriptor.season_id);
    expect(seasons.get(descriptor.season_id)).toEqual(descriptor);
    expect(persistedEvents).toEqual(events);
  });
});
