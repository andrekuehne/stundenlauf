import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent } from "@/domain/events.ts";
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

class InMemoryEventDb {
  readonly eventLogs = new Map<string, EventLogRecord>();

  get(storeName: string, key: string): Promise<EventLogRecord | undefined> {
    if (storeName !== "event_logs") return Promise.resolve(undefined);
    return Promise.resolve(this.eventLogs.get(key));
  }

  put(storeName: string, value: EventLogRecord): Promise<void> {
    if (storeName !== "event_logs") return Promise.resolve();
    this.eventLogs.set(value.season_id, {
      season_id: value.season_id,
      events: [...value.events],
    });
    return Promise.resolve();
  }

  transaction(storeName: string, _mode: "readwrite") {
    if (storeName !== "event_logs") {
      throw new Error(`Unsupported store: ${storeName}`);
    }
    void _mode;
    return {
      objectStore: () => ({
        get: (key: string) => Promise.resolve(this.eventLogs.get(key)),
        put: (value: EventLogRecord) => {
          this.eventLogs.set(value.season_id, {
            season_id: value.season_id,
            events: [...value.events],
          });
          return Promise.resolve();
        },
      }),
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
