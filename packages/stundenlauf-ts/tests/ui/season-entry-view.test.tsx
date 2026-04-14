import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SeasonEntryView } from "@/components/season/SeasonEntryView.tsx";
import { useSeasonStore } from "@/stores/season.ts";
import { useStatusStore } from "@/stores/status.ts";

describe("SeasonEntryView", () => {
  const createSeason = vi.fn(() => Promise.resolve());
  const openSeason = vi.fn(() => Promise.resolve());
  const deleteSeason = vi.fn(() => Promise.resolve());
  const resetSeason = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    createSeason.mockClear();
    openSeason.mockClear();
    deleteSeason.mockClear();
    resetSeason.mockClear();
    useStatusStore.setState({ current: null });
    useSeasonStore.setState({
      seasons: [{ season_id: "s1", label: "Saison 1", created_at: "2026-01-01T00:00:00.000Z" }],
      activeSeasonId: "s1",
      loading: false,
      error: null,
      createSeason,
      openSeason,
      deleteSeason,
      resetSeason,
    });
  });

  it("creates a season from input", () => {
    render(<SeasonEntryView seasonLabel="Saison: s1" reviewLabel="Prüfungen offen: 0" />);
    fireEvent.change(screen.getByLabelText("Saisonname"), { target: { value: "Neu" } });
    fireEvent.click(screen.getByRole("button", { name: "Saison anlegen" }));
    expect(createSeason).toHaveBeenCalledWith("Neu");
  });

  it("opens existing season", () => {
    render(<SeasonEntryView seasonLabel="Saison: s1" reviewLabel="Prüfungen offen: 0" />);
    fireEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    expect(openSeason).toHaveBeenCalledWith("s1");
  });
});
