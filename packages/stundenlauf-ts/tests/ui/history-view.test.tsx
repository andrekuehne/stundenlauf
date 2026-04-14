import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HistoryView } from "@/components/history/HistoryView.tsx";
import { useSeasonStore } from "@/stores/season.ts";
import { useStatusStore } from "@/stores/status.ts";
import type { DomainEvent } from "@/domain/events.ts";

describe("HistoryView", () => {
  const rollbackBatch = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    rollbackBatch.mockClear();
    useStatusStore.setState({ current: null });
    const events: DomainEvent[] = [
      {
        event_id: "evt-1",
        seq: 0,
        recorded_at: "2026-04-01T00:00:00.000Z",
        type: "person.corrected",
        schema_version: 1,
        payload: { person_id: "p1", updated_fields: {}, rationale: "x" },
        metadata: { app_version: "test" },
      },
    ] as DomainEvent[];
    useSeasonStore.setState({
      seasonState: {
        season_id: "s1",
        persons: new Map(),
        teams: new Map(),
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
              entries: [],
            },
          ],
        ]),
        exclusions: new Map(),
      },
      eventLog: events,
      rollbackBatch,
    });
  });

  it("shows import history rows", () => {
    render(<HistoryView seasonLabel="Saison: s1" reviewLabel="Prüfungen offen: 0" />);
    expect(screen.getByText("lauf.xlsx")).toBeInTheDocument();
  });

  it("confirms and triggers rollback", () => {
    render(<HistoryView seasonLabel="Saison: s1" reviewLabel="Prüfungen offen: 0" />);
    fireEvent.click(screen.getByRole("button", { name: "Rollback" }));
    fireEvent.click(screen.getByRole("button", { name: "Bestätigen" }));
    expect(rollbackBatch).toHaveBeenCalledWith("b1", "Rollback über Historie");
  });
});
