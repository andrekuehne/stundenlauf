import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "@/App.tsx";
import { STR } from "@/strings.ts";
import { setSeasonRepositoryForTests } from "@/services/season-repository.ts";
import { useSeasonStore } from "@/stores/season.ts";
import { useStatusStore } from "@/stores/status.ts";

describe("App shell", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    setSeasonRepositoryForTests({
      listSeasons: () => Promise.resolve([]),
      createSeason: () =>
        Promise.resolve({
        season_id: "s1",
        label: "Test",
        created_at: new Date().toISOString(),
      }),
      deleteSeason: () => Promise.resolve(),
      getEventLog: () => Promise.resolve([]),
      appendEvents: () => Promise.resolve(),
      clearEventLog: () => Promise.resolve(),
    });
    useSeasonStore.setState({
      seasons: [],
      activeSeasonId: null,
      eventLog: [],
      seasonState: {
        season_id: "no-season",
        persons: new Map(),
        teams: new Map(),
        import_batches: new Map(),
        race_events: new Map(),
        exclusions: new Map(),
      },
      loading: false,
      error: null,
    });
    useStatusStore.setState({ current: null });
  });

  afterEach(() => {
    setSeasonRepositoryForTests(null);
  });

  it("renders all top-level tabs in German", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: STR.shell.appTitle })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: STR.shell.tabs.standings })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: STR.shell.tabs.import })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: STR.shell.tabs.history })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: STR.shell.tabs.season })).toBeInTheDocument();
  });

  it("switches the active view when clicking tabs", async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText(STR.views.standings.noCategory)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("tab", { name: STR.shell.tabs.import }));
    expect(screen.getByRole("button", { name: STR.views.import.importRace })).toBeInTheDocument();
  });

  it("renders header context labels from season and review state", () => {
    useSeasonStore.setState({
      seasons: [{ season_id: "s1", label: "2026", created_at: new Date().toISOString() }],
      activeSeasonId: "s1",
    });
    render(<App />);

    expect(screen.getAllByText("Saison: 2026").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Prüfungen offen: 0").length).toBeGreaterThan(0);
  });

  it("renders dev-only legacy layout harness page", () => {
    window.history.replaceState({}, "", "/?harness=legacy-layout");
    render(<App />);

    expect(
      screen.getByRole("heading", { name: STR.shell.appTitle, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: STR.shell.tabs.standings })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: STR.shell.tabs.import })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: STR.shell.tabs.history })).toBeInTheDocument();
    expect(screen.getByText("Saison öffnen oder neu anlegen")).toBeInTheDocument();
  });
});
