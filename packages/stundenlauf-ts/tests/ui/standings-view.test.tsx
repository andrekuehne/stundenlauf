import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StandingsView } from "@/components/standings/StandingsView.tsx";
import { useSeasonStore } from "@/stores/season.ts";
import { useStandingsStore } from "@/stores/standings.ts";
import { useStatusStore } from "@/stores/status.ts";

describe("StandingsView", () => {
  const correctPersonIdentity = vi.fn(() => Promise.resolve());
  const mergeTeams = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    correctPersonIdentity.mockClear();
    mergeTeams.mockClear();
    useStatusStore.setState({ current: null });
    useStandingsStore.setState({
      selectedCategoryKey: null,
      mode: "overview",
      selectedPersonId: null,
      mergeSurvivorTeamId: null,
      mergeAbsorbedTeamId: null,
    });
    useSeasonStore.setState({
      seasonState: {
        season_id: "s1",
        persons: new Map([
          [
            "p1",
            {
              person_id: "p1",
              given_name: "Max",
              family_name: "Müller",
              display_name: "Max Müller",
              name_normalized: "max|muller",
              yob: 1990,
              gender: "M",
              club: "LG A",
              club_normalized: "lg a",
            },
          ],
          [
            "p2",
            {
              person_id: "p2",
              given_name: "Tom",
              family_name: "Schmidt",
              display_name: "Tom Schmidt",
              name_normalized: "tom|schmidt",
              yob: 1991,
              gender: "M",
              club: "LG B",
              club_normalized: "lg b",
            },
          ],
        ]),
        teams: new Map([
          ["t1", { team_id: "t1", member_person_ids: ["p1"], team_kind: "solo" }],
          ["t2", { team_id: "t2", member_person_ids: ["p2"], team_kind: "solo" }],
        ]),
        import_batches: new Map([
          [
            "b1",
            {
              import_batch_id: "b1",
              source_file: "lauf.xlsx",
              source_sha256: "sha",
              parser_version: "1",
              state: "active",
            },
          ],
        ]),
        race_events: new Map([
          [
            "r1",
            {
              race_event_id: "r1",
              import_batch_id: "b1",
              category: { duration: "hour", division: "men" },
              race_no: 1,
              race_date: "2026-04-01",
              state: "active",
              imported_at: "2026-04-01T00:00:00.000Z",
              entries: [
                {
                  entry_id: "e1",
                  startnr: "1",
                  team_id: "t1",
                  distance_m: 10000,
                  points: 10,
                  incoming: {
                    display_name: "Max Müller",
                    yob: 1990,
                    yob_text: null,
                    club: "LG A",
                    row_kind: "solo",
                    sheet_name: "s",
                    section_name: "s",
                    row_index: 0,
                  },
                  resolution: { method: "manual", confidence: 0.9, candidate_count: 1 },
                },
              ],
            },
          ],
        ]),
        exclusions: new Map(),
      },
      correctPersonIdentity,
      mergeTeams,
    });
  });

  it("renders standings and imported runs sections", () => {
    render(<StandingsView seasonLabel="Saison: s1" reviewLabel="Prüfungen offen: 0" />);
    expect(screen.getByText("Gesamtwertung")).toBeInTheDocument();
    expect(screen.getByText("Importierte Läufe")).toBeInTheDocument();
  });

  it("opens merge mode and submits selected teams", () => {
    render(<StandingsView seasonLabel="Saison: s1" reviewLabel="Prüfungen offen: 0" />);
    fireEvent.click(screen.getByRole("button", { name: "Duplikate zusammenführen" }));
    fireEvent.change(screen.getByLabelText("Ziel-Team"), { target: { value: "t1" } });
    fireEvent.change(screen.getByLabelText("Aufzulösendes Team"), { target: { value: "t2" } });
    fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(mergeTeams).toHaveBeenCalledWith("t1", "t2");
  });
});
