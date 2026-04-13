import { describe, it, expect } from "vitest";
import { emptySeasonState, projectState } from "@/domain/projection.ts";

describe("emptySeasonState", () => {
  it("returns empty state for a given season ID", () => {
    const state = emptySeasonState("test-season");
    expect(state.season_id).toBe("test-season");
    expect(state.persons.size).toBe(0);
    expect(state.teams.size).toBe(0);
    expect(state.import_batches.size).toBe(0);
    expect(state.race_events.size).toBe(0);
    expect(state.exclusions.size).toBe(0);
  });
});

describe("projectState", () => {
  it("returns empty state for an empty event log", () => {
    const state = projectState("test-season", []);
    expect(state.season_id).toBe("test-season");
    expect(state.persons.size).toBe(0);
  });
});
