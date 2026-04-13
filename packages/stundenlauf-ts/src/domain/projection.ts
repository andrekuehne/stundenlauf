/**
 * Event projection: fold an event log into SeasonState.
 *
 * Reference: F-TS01 §8 (Projection Implementation)
 */

import type { SeasonState } from "./types.ts";
import type { DomainEvent } from "./events.ts";

export function emptySeasonState(seasonId: string): SeasonState {
  return {
    season_id: seasonId,
    persons: new Map(),
    teams: new Map(),
    import_batches: new Map(),
    race_events: new Map(),
    exclusions: new Map(),
  };
}

export function projectState(seasonId: string, events: readonly DomainEvent[]): SeasonState {
  let state = emptySeasonState(seasonId);
  for (const event of events) {
    state = applyEvent(state, event);
  }
  return state;
}

export function applyEvent(state: SeasonState, event: DomainEvent): SeasonState {
  switch (event.type) {
    case "import_batch.recorded":
    case "import_batch.rolled_back":
    case "person.registered":
    case "person.corrected":
    case "team.registered":
    case "race.registered":
    case "race.rolled_back":
    case "race.metadata_corrected":
    case "entry.reassigned":
    case "entry.corrected":
    case "ranking.eligibility_set":
      // TODO: implement per-event-type apply functions (F-TS01 implementation steps 3-4)
      return state;
  }
}
