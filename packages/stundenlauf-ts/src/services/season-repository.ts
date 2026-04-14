import { createSeason, deleteSeason, emptyWorkspaceState } from "@/domain/workspace.ts";
import type { DomainEvent } from "@/domain/events.ts";
import type { SeasonDescriptor } from "@/domain/types.ts";
import { openStundenlaufDB } from "@/storage/db.ts";
import { createEventStore } from "@/storage/event-store.ts";

export interface SeasonRepository {
  listSeasons(): Promise<SeasonDescriptor[]>;
  getSeason(seasonId: string): Promise<SeasonDescriptor | null>;
  createSeason(label: string): Promise<SeasonDescriptor>;
  deleteSeason(seasonId: string): Promise<void>;
  getEventLog(seasonId: string): Promise<DomainEvent[]>;
  appendEvents(seasonId: string, events: DomainEvent[]): Promise<void>;
  clearEventLog(seasonId: string): Promise<void>;
  saveImportedSeason(season: SeasonDescriptor, events: DomainEvent[]): Promise<void>;
}

let singleton: SeasonRepository | null = null;

async function buildRepository(): Promise<SeasonRepository> {
  const db = await openStundenlaufDB();
  const eventStore = createEventStore(db);

  return {
    async listSeasons() {
      const seasonsMap = await eventStore.getWorkspaceSeasons();
      return [...seasonsMap.values()].sort((a, b) => a.label.localeCompare(b.label, "de"));
    },

    async getSeason(seasonId) {
      const seasonsMap = await eventStore.getWorkspaceSeasons();
      return seasonsMap.get(seasonId) ?? null;
    },

    async createSeason(label) {
      const seasonsMap = await eventStore.getWorkspaceSeasons();
      const ws = { seasons: seasonsMap.size > 0 ? seasonsMap : emptyWorkspaceState().seasons };
      const next = createSeason(ws, label.trim());
      await eventStore.saveWorkspaceSeasons(next.ws.seasons);
      const created = next.ws.seasons.get(next.seasonId);
      if (!created) {
        throw new Error(`Season ${next.seasonId} could not be loaded after creation.`);
      }
      return created;
    },

    async deleteSeason(seasonId) {
      const seasonsMap = await eventStore.getWorkspaceSeasons();
      const next = deleteSeason({ seasons: seasonsMap }, seasonId);
      await eventStore.saveWorkspaceSeasons(next.seasons);
      await eventStore.deleteEventLog(seasonId);
    },

    async getEventLog(seasonId) {
      return eventStore.getEventLog(seasonId);
    },

    async appendEvents(seasonId, events) {
      await eventStore.appendEvents(seasonId, events);
    },

    async clearEventLog(seasonId) {
      await eventStore.writeEventLog(seasonId, "", []);
    },

    async saveImportedSeason(season, events) {
      const seasonsMap = await eventStore.getWorkspaceSeasons();
      const nextSeasons = new Map(seasonsMap);
      nextSeasons.set(season.season_id, season);
      await eventStore.saveWorkspaceSeasonsAndEventLog(nextSeasons, season.season_id, events);
    },
  };
}

export async function getSeasonRepository(): Promise<SeasonRepository> {
  singleton ??= await buildRepository();
  return singleton;
}

export function setSeasonRepositoryForTests(repo: SeasonRepository | null): void {
  singleton = repo;
}
