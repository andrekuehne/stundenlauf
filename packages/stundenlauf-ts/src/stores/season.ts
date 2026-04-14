import { create } from "zustand";
import type { DomainEvent } from "@/domain/events.ts";
import { emptySeasonState, projectState } from "@/domain/projection.ts";
import type { PersonIdentity, SeasonDescriptor, SeasonState } from "@/domain/types.ts";
import { getSeasonRepository } from "@/services/season-repository.ts";

export interface PersonCorrectionInput {
  person_id: string;
  given_name: string;
  family_name: string;
  display_name: string;
  yob: number;
  club: string | null;
}

interface SeasonStoreState {
  seasons: SeasonDescriptor[];
  activeSeasonId: string | null;
  eventLog: DomainEvent[];
  seasonState: SeasonState;
  loading: boolean;
  error: string | null;
  bootstrapWorkspace: () => Promise<void>;
  openSeason: (seasonId: string) => Promise<void>;
  createSeason: (label: string) => Promise<void>;
  deleteSeason: (seasonId: string) => Promise<void>;
  resetSeason: (seasonId: string) => Promise<void>;
  correctPersonIdentity: (input: PersonCorrectionInput) => Promise<void>;
  mergeTeams: (survivorTeamId: string, absorbedTeamId: string) => Promise<void>;
  rollbackBatch: (importBatchId: string, reason: string) => Promise<void>;
}

const APP_VERSION = "stundenlauf-ts-0.1.0";

function nextEnvelope(seq: number, type: DomainEvent["type"], payload: unknown): DomainEvent {
  return {
    event_id: crypto.randomUUID(),
    seq,
    recorded_at: new Date().toISOString(),
    type,
    schema_version: 1,
    payload,
    metadata: {
      app_version: APP_VERSION,
    },
  } as DomainEvent;
}

function canonicalClub(club: string | null): { club: string | null; club_normalized: string } {
  const clean = club?.trim() ?? "";
  if (!clean) return { club: null, club_normalized: "" };
  return { club: clean, club_normalized: clean.toLowerCase() };
}

function sortSeasons(seasons: SeasonDescriptor[]): SeasonDescriptor[] {
  return seasons.slice().sort((a, b) => a.label.localeCompare(b.label, "de"));
}

async function loadSnapshot(
  seasonId: string,
): Promise<{ eventLog: DomainEvent[]; seasonState: SeasonState }> {
  const repo = await getSeasonRepository();
  const eventLog = await repo.getEventLog(seasonId);
  return {
    eventLog,
    seasonState: projectState(seasonId, eventLog),
  };
}

async function reloadWorkspaceAndSeason(
  get: () => SeasonStoreState,
  set: (
    partial:
      | Partial<SeasonStoreState>
      | ((state: SeasonStoreState) => Partial<SeasonStoreState>),
  ) => void,
  preferredSeasonId?: string | null,
): Promise<void> {
  const repo = await getSeasonRepository();
  const seasons = sortSeasons(await repo.listSeasons());
  const desired =
    preferredSeasonId ??
    get().activeSeasonId ??
    (seasons.length > 0 ? seasons[0]?.season_id ?? null : null);

  if (!desired || !seasons.some((entry) => entry.season_id === desired)) {
    set({
      seasons,
      activeSeasonId: null,
      eventLog: [],
      seasonState: emptySeasonState("no-season"),
    });
    return;
  }

  const snapshot = await loadSnapshot(desired);
  set({
    seasons,
    activeSeasonId: desired,
    eventLog: snapshot.eventLog,
    seasonState: snapshot.seasonState,
  });
}

export const useSeasonStore = create<SeasonStoreState>((set, get) => ({
  seasons: [],
  activeSeasonId: null,
  eventLog: [],
  seasonState: emptySeasonState("no-season"),
  loading: false,
  error: null,

  bootstrapWorkspace: async () => {
    set({ loading: true, error: null });
    try {
      await reloadWorkspaceAndSeason(get, set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ loading: false });
    }
  },

  openSeason: async (seasonId) => {
    set({ loading: true, error: null });
    try {
      await reloadWorkspaceAndSeason(get, set, seasonId);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ loading: false });
    }
  },

  createSeason: async (label) => {
    const nextLabel = label.trim();
    if (!nextLabel) {
      set({ error: "Bitte einen Saisonnamen eingeben." });
      return;
    }
    set({ loading: true, error: null });
    try {
      const repo = await getSeasonRepository();
      const created = await repo.createSeason(nextLabel);
      await reloadWorkspaceAndSeason(get, set, created.season_id);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ loading: false });
    }
  },

  deleteSeason: async (seasonId) => {
    set({ loading: true, error: null });
    try {
      const repo = await getSeasonRepository();
      await repo.deleteSeason(seasonId);
      const fallback = get().activeSeasonId === seasonId ? null : get().activeSeasonId;
      await reloadWorkspaceAndSeason(get, set, fallback);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ loading: false });
    }
  },

  resetSeason: async (seasonId) => {
    set({ loading: true, error: null });
    try {
      const repo = await getSeasonRepository();
      await repo.clearEventLog(seasonId);
      await reloadWorkspaceAndSeason(get, set, seasonId);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ loading: false });
    }
  },

  correctPersonIdentity: async (input) => {
    const state = get();
    if (!state.activeSeasonId) return;
    const existing = state.seasonState.persons.get(input.person_id);
    if (!existing) {
      set({ error: `Person ${input.person_id} wurde nicht gefunden.` });
      return;
    }

    const club = canonicalClub(input.club);
    const event = nextEnvelope(state.eventLog.length, "person.corrected", {
      person_id: input.person_id,
      updated_fields: {
        given_name: input.given_name.trim(),
        family_name: input.family_name.trim(),
        display_name: input.display_name.trim(),
        yob: input.yob,
        club: club.club,
        club_normalized: club.club_normalized,
      },
      rationale: "Korrektur über Aktuelle Wertung",
    });

    set({ loading: true, error: null });
    try {
      const repo = await getSeasonRepository();
      await repo.appendEvents(state.activeSeasonId, [event]);
      await reloadWorkspaceAndSeason(get, set, state.activeSeasonId);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      set({
        seasonState: {
          ...state.seasonState,
          persons: new Map<string, PersonIdentity>(state.seasonState.persons).set(
            existing.person_id,
            existing,
          ),
        },
      });
    } finally {
      set({ loading: false });
    }
  },

  mergeTeams: async (survivorTeamId, absorbedTeamId) => {
    const state = get();
    if (!state.activeSeasonId) return;
    if (survivorTeamId === absorbedTeamId) {
      set({ error: "Bitte zwei unterschiedliche Teams auswählen." });
      return;
    }

    const events: DomainEvent[] = [];
    let seq = state.eventLog.length;
    for (const [raceEventId, race] of state.seasonState.race_events) {
      const entry = race.entries.find((candidate) => candidate.team_id === absorbedTeamId);
      if (!entry) continue;
      const survivorAlreadyInRace = race.entries.some(
        (candidate) => candidate.team_id === survivorTeamId,
      );
      if (survivorAlreadyInRace) continue;
      events.push(
        nextEnvelope(seq++, "entry.reassigned", {
          entry_id: entry.entry_id,
          race_event_id: raceEventId,
          from_team_id: absorbedTeamId,
          to_team_id: survivorTeamId,
          rationale: "Duplikat-Zusammenführung über Aktuelle Wertung",
        }),
      );
    }

    if (events.length === 0) {
      set({ error: "Für diese Teamkombination wurden keine zusammenführbaren Einträge gefunden." });
      return;
    }

    set({ loading: true, error: null });
    try {
      const repo = await getSeasonRepository();
      await repo.appendEvents(state.activeSeasonId, events);
      await reloadWorkspaceAndSeason(get, set, state.activeSeasonId);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ loading: false });
    }
  },

  rollbackBatch: async (importBatchId, reason) => {
    const state = get();
    if (!state.activeSeasonId) return;
    const batch = state.seasonState.import_batches.get(importBatchId);
    if (!batch) {
      set({ error: `Import-Batch ${importBatchId} wurde nicht gefunden.` });
      return;
    }

    let seq = state.eventLog.length;
    const events: DomainEvent[] = [];

    for (const race of state.seasonState.race_events.values()) {
      if (race.import_batch_id !== importBatchId) continue;
      if (race.state === "rolled_back") continue;
      events.push(
        nextEnvelope(seq++, "race.rolled_back", {
          race_event_id: race.race_event_id,
          reason,
        }),
      );
    }
    events.push(
      nextEnvelope(seq++, "import_batch.rolled_back", {
        import_batch_id: importBatchId,
        reason,
      }),
    );

    set({ loading: true, error: null });
    try {
      const repo = await getSeasonRepository();
      await repo.appendEvents(state.activeSeasonId, events);
      await reloadWorkspaceAndSeason(get, set, state.activeSeasonId);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ loading: false });
    }
  },
}));
