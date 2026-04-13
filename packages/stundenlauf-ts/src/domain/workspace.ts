/**
 * Workspace-level season lifecycle operations: create, delete, reset, import.
 *
 * These are imperative operations on the season registry — NOT events within
 * a season's own event log.
 *
 * Reference: F-TS01 §3 (Season Identity and Workspace Operations)
 */

import type { SeasonDescriptor } from "./types.ts";

export interface WorkspaceState {
  seasons: Map<string, SeasonDescriptor>;
}

export function emptyWorkspaceState(): WorkspaceState {
  return { seasons: new Map() };
}

export function createSeason(
  ws: WorkspaceState,
  label: string,
): { ws: WorkspaceState; seasonId: string } {
  const seasonId = crypto.randomUUID();
  const descriptor: SeasonDescriptor = {
    season_id: seasonId,
    label,
    created_at: new Date().toISOString(),
  };
  const seasons = new Map(ws.seasons);
  seasons.set(seasonId, descriptor);
  return { ws: { seasons }, seasonId };
}

export function deleteSeason(ws: WorkspaceState, seasonId: string): WorkspaceState {
  if (!ws.seasons.has(seasonId)) {
    throw new Error(`Season "${seasonId}" does not exist`);
  }
  const seasons = new Map(ws.seasons);
  seasons.delete(seasonId);
  return { seasons };
}

export function renameSeason(
  ws: WorkspaceState,
  seasonId: string,
  newLabel: string,
): WorkspaceState {
  const existing = ws.seasons.get(seasonId);
  if (!existing) {
    throw new Error(`Season "${seasonId}" does not exist`);
  }
  const seasons = new Map(ws.seasons);
  seasons.set(seasonId, { ...existing, label: newLabel });
  return { seasons };
}

export function listSeasons(ws: WorkspaceState): SeasonDescriptor[] {
  return [...ws.seasons.values()];
}

export function getSeason(ws: WorkspaceState, seasonId: string): SeasonDescriptor | undefined {
  return ws.seasons.get(seasonId);
}
