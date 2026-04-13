import { describe, it, expect } from "vitest";
import {
  emptyWorkspaceState,
  createSeason,
  deleteSeason,
  renameSeason,
  listSeasons,
  getSeason,
} from "@/domain/workspace.ts";

describe("emptyWorkspaceState", () => {
  it("starts with no seasons", () => {
    const ws = emptyWorkspaceState();
    expect(ws.seasons.size).toBe(0);
  });
});

describe("createSeason", () => {
  it("adds a season to the registry", () => {
    const ws = emptyWorkspaceState();
    const result = createSeason(ws, "Stundenlauf 2025");
    expect(result.ws.seasons.size).toBe(1);
    expect(result.seasonId).toBeTruthy();
    const descriptor = result.ws.seasons.get(result.seasonId);
    expect(descriptor).toBeDefined();
    expect(descriptor!.label).toBe("Stundenlauf 2025");
    expect(descriptor!.created_at).toBeTruthy();
  });

  it("generates unique season IDs", () => {
    let ws = emptyWorkspaceState();
    const r1 = createSeason(ws, "Season A");
    ws = r1.ws;
    const r2 = createSeason(ws, "Season B");
    expect(r1.seasonId).not.toBe(r2.seasonId);
    expect(r2.ws.seasons.size).toBe(2);
  });

  it("does not mutate the original workspace", () => {
    const ws = emptyWorkspaceState();
    createSeason(ws, "Test");
    expect(ws.seasons.size).toBe(0);
  });
});

describe("deleteSeason", () => {
  it("removes a season from the registry", () => {
    const ws = emptyWorkspaceState();
    const { ws: ws2, seasonId } = createSeason(ws, "Test");
    const ws3 = deleteSeason(ws2, seasonId);
    expect(ws3.seasons.size).toBe(0);
  });

  it("throws when deleting a nonexistent season", () => {
    const ws = emptyWorkspaceState();
    expect(() => deleteSeason(ws, "nonexistent")).toThrow("does not exist");
  });

  it("does not mutate the original workspace", () => {
    const { ws, seasonId } = createSeason(emptyWorkspaceState(), "Test");
    deleteSeason(ws, seasonId);
    expect(ws.seasons.size).toBe(1);
  });
});

describe("renameSeason", () => {
  it("updates the label of an existing season", () => {
    const { ws, seasonId } = createSeason(emptyWorkspaceState(), "Old Name");
    const ws2 = renameSeason(ws, seasonId, "New Name");
    expect(ws2.seasons.get(seasonId)!.label).toBe("New Name");
  });

  it("preserves created_at", () => {
    const { ws, seasonId } = createSeason(emptyWorkspaceState(), "Test");
    const original = ws.seasons.get(seasonId)!;
    const ws2 = renameSeason(ws, seasonId, "Renamed");
    expect(ws2.seasons.get(seasonId)!.created_at).toBe(original.created_at);
  });

  it("throws when renaming a nonexistent season", () => {
    const ws = emptyWorkspaceState();
    expect(() => renameSeason(ws, "nonexistent", "New")).toThrow("does not exist");
  });
});

describe("listSeasons", () => {
  it("returns empty array for empty workspace", () => {
    expect(listSeasons(emptyWorkspaceState())).toEqual([]);
  });

  it("returns all seasons", () => {
    let ws = emptyWorkspaceState();
    ws = createSeason(ws, "A").ws;
    ws = createSeason(ws, "B").ws;
    ws = createSeason(ws, "C").ws;
    const list = listSeasons(ws);
    expect(list).toHaveLength(3);
    expect(list.map((s) => s.label).sort()).toEqual(["A", "B", "C"]);
  });
});

describe("getSeason", () => {
  it("returns the descriptor for an existing season", () => {
    const { ws, seasonId } = createSeason(emptyWorkspaceState(), "Test");
    const descriptor = getSeason(ws, seasonId);
    expect(descriptor).toBeDefined();
    expect(descriptor!.label).toBe("Test");
  });

  it("returns undefined for a nonexistent season", () => {
    expect(getSeason(emptyWorkspaceState(), "nonexistent")).toBeUndefined();
  });
});
