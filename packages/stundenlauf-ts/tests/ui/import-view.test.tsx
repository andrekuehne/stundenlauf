import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ImportView } from "@/components/import/ImportView.tsx";
import { useImportStore } from "@/stores/import.ts";
import { useSeasonStore } from "@/stores/season.ts";
import { useStatusStore } from "@/stores/status.ts";

describe("ImportView", () => {
  const appendImportEvents = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    appendImportEvents.mockClear();
    useStatusStore.setState({ current: null });
    useSeasonStore.setState({
      activeSeasonId: "s1",
      eventLog: [],
      appendImportEvents,
      seasonState: {
        season_id: "s1",
        persons: new Map(),
        teams: new Map(),
        import_batches: new Map(),
        race_events: new Map(),
        exclusions: new Map(),
      },
    });
    useImportStore.getState().clearWorkflow();
    useImportStore.getState().resetDraft();
  });

  it("renders import controls and matching settings", () => {
    render(<ImportView seasonLabel="Saison: 2026" reviewLabel="Prüfungen offen: 0" />);

    expect(screen.getByRole("button", { name: "Lauf importieren" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Matching-Einstellungen" })).toBeInTheDocument();
    expect(screen.getByText("Keine offenen Prüfungen.")).toBeInTheDocument();
  });

  it("blocks new imports while open reviews exist", () => {
    useImportStore.setState({ openReviewCount: 2 });
    render(<ImportView seasonLabel="Saison: 2026" reviewLabel="Prüfungen offen: 2" />);

    expect(screen.getByText(/Solange offene Zusammenführungs-Prüfungen bestehen/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lauf importieren" })).toBeDisabled();
  });

  it("switches source type buttons", () => {
    render(<ImportView seasonLabel="Saison: 2026" reviewLabel="Prüfungen offen: 0" />);
    fireEvent.click(screen.getByRole("button", { name: "Paare" }));

    expect(useImportStore.getState().sourceType).toBe("couples");
  });
});
