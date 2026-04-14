import { useMemo, useState } from "react";
import { emptySeasonState, projectState } from "@/domain/projection.ts";
import { finalizeImport } from "@/import/finalize.ts";
import { runMatching } from "@/import/run-matching.ts";
import { startImport } from "@/import/start-import.ts";
import { defaultMatchingConfig } from "@/matching/config.ts";
import {
  autoResolveReviewQueue,
  buildImportTrace,
  type HarnessSectionTrace,
} from "./import-harness-trace.ts";

type HarnessPhase = "idle" | "mw1_processed" | "mw2_processed" | "error";
type ActiveCycle = "mw1" | "mw2";

interface CycleResult {
  label: "MW1" | "MW2";
  source_file: string;
  trace: HarnessSectionTrace[];
  review_count_before_auto_resolve: number;
  events_emitted: number;
  report: {
    auto_links: number;
    review_items: number;
    new_identities: number;
    conflicts: number;
    replay_overrides: number;
    rows_imported: number;
    sections_imported: number;
    events_emitted: number;
  };
}

const HARNESS_SEASON_ID = "f-ts05-harness";

async function runCycle(
  label: "MW1" | "MW2",
  file: File,
  baseState: ReturnType<typeof emptySeasonState>,
  startSeq: number,
): Promise<{
  result: CycleResult;
  events: ReturnType<typeof finalizeImport>;
  nextState: ReturnType<typeof emptySeasonState>;
}> {
  const config = defaultMatchingConfig();
  const session = await startImport(file, baseState);
  const trace = await buildImportTrace(session.parsed, baseState, config);
  const matched = await runMatching(session, config);
  const reviewCountBefore = matched.review_queue.filter(
    (entry) => entry.status === "pending",
  ).length;
  const resolved = autoResolveReviewQueue(matched);
  if (resolved.phase !== "committing") {
    throw new Error("Import could not be finalized because review resolution is incomplete.");
  }
  const events = finalizeImport(resolved, { startSeq });
  const nextState = projectState(HARNESS_SEASON_ID, events);

  return {
    result: {
      label,
      source_file: file.name,
      trace,
      review_count_before_auto_resolve: reviewCountBefore,
      events_emitted: events.length,
      report: {
        ...resolved.report,
        events_emitted: events.length,
      },
    },
    events,
    nextState,
  };
}

function fmt(value: number): string {
  return value.toLocaleString("de-DE");
}

function getPoolMatchContext(
  section: HarnessSectionTrace,
  linkedTeamId: string,
): {
  teamLabel: string;
  memberNames: string[];
} {
  const team = section.pool_before.teams.find((entry) => entry.team_id === linkedTeamId);
  if (team === undefined) {
    return {
      teamLabel: "Nicht im Pool vor Abschnitt (neu erzeugt oder außerhalb des Pools verknüpft)",
      memberNames: [],
    };
  }

  const memberNames = team.member_person_ids.map((personId) => {
    const person = section.pool_before.people.find((entry) => entry.person_id === personId);
    return person ? `${person.display_name} (${person.person_id})` : personId;
  });

  return {
    teamLabel: `${team.team_id} (${team.team_kind})`,
    memberNames,
  };
}

function getCandidateDisplayName(
  section: HarnessSectionTrace,
  candidateUid: string,
): string {
  const person = section.pool_before.people.find((entry) => entry.person_id === candidateUid);
  if (person) return person.display_name;

  const team = section.pool_before.teams.find((entry) => entry.team_id === candidateUid);
  if (!team) return "Unbekannt (nicht im Pool vor Abschnitt)";

  const memberNames = team.member_person_ids.map((personId) => {
    const member = section.pool_before.people.find((entry) => entry.person_id === personId);
    return member?.display_name ?? personId;
  });
  return memberNames.join(" / ");
}

export function ImportOrchestrationHarness() {
  const [phase, setPhase] = useState<HarnessPhase>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCycle, setActiveCycle] = useState<ActiveCycle>("mw1");
  const [sectionIndex, setSectionIndex] = useState(0);
  const [rowIndex, setRowIndex] = useState(0);
  const [mw1, setMw1] = useState<CycleResult | null>(null);
  const [mw2, setMw2] = useState<CycleResult | null>(null);
  const [mw1Events, setMw1Events] = useState<ReturnType<typeof finalizeImport>>([]);
  const [stateAfterMw1, setStateAfterMw1] = useState(
    emptySeasonState(HARNESS_SEASON_ID),
  );

  const activeResult = useMemo(
    () => (activeCycle === "mw2" && mw2 ? mw2 : mw1),
    [activeCycle, mw1, mw2],
  );
  const activeSection = activeResult?.trace[sectionIndex] ?? null;
  const activeRow = activeSection?.rows[rowIndex] ?? null;
  const poolMatchContext = useMemo(() => {
    if (activeSection == null || activeRow == null) return null;
    return getPoolMatchContext(activeSection, activeRow.linked_team_id);
  }, [activeSection, activeRow]);

  function resetNavigation() {
    setSectionIndex(0);
    setRowIndex(0);
  }

  function resetAll() {
    setPhase("idle");
    setBusy(false);
    setError(null);
    setActiveCycle("mw1");
    resetNavigation();
    setMw1(null);
    setMw2(null);
    setMw1Events([]);
    setStateAfterMw1(emptySeasonState(HARNESS_SEASON_ID));
  }

  async function handleMw1File(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const base = emptySeasonState(HARNESS_SEASON_ID);
      const { result, events, nextState } = await runCycle("MW1", file, base, 0);
      setMw1(result);
      setMw2(null);
      setMw1Events(events);
      setStateAfterMw1(nextState);
      setActiveCycle("mw1");
      resetNavigation();
      setPhase("mw1_processed");
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleMw2File(file: File): Promise<void> {
    if (mw1 == null) {
      setError("Bitte zuerst MW1 verarbeiten.");
      setPhase("error");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { result } = await runCycle(
        "MW2",
        file,
        stateAfterMw1,
        mw1Events.length,
      );
      setMw2(result);
      setActiveCycle("mw2");
      resetNavigation();
      setPhase("mw2_processed");
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const sectionCount = activeResult?.trace.length ?? 0;
  const rowCount = activeSection?.rows.length ?? 0;

  return (
    <main id="app" style={{ padding: "16px" }}>
      <h1>F-TS05 Import Harness</h1>
      <p>
        Dev-only manual cycle for MW1 → MW2. Matching uses current defaults and
        auto-resolves review queue by taking the top candidate (or creating a new identity
        if no candidate exists).
      </p>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
        <label>
          MW1 Datei:
          <input
            type="file"
            accept=".xlsx"
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void handleMw1File(file);
              event.currentTarget.value = "";
            }}
          />
        </label>

        <label>
          MW2 Datei:
          <input
            type="file"
            accept=".xlsx"
            disabled={busy || mw1 == null}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void handleMw2File(file);
              event.currentTarget.value = "";
            }}
          />
        </label>

        <button type="button" onClick={resetAll} disabled={busy}>
          Reset
        </button>
      </div>

      <p>
        <strong>Status:</strong> {phase}
        {busy ? " (läuft...)" : ""}
      </p>
      {error ? (
        <p role="alert" style={{ color: "var(--color-danger)" }}>
          Fehler: {error}
        </p>
      ) : null}

      {mw1 ? (
        <section style={{ marginBottom: "16px" }}>
          <h2>Zyklusübersicht</h2>
          <table>
            <thead>
              <tr>
                <th>Zyklus</th>
                <th>Datei</th>
                <th>Abschnitte</th>
                <th>Rows</th>
                <th>Review vor Auto</th>
                <th>Events</th>
              </tr>
            </thead>
            <tbody>
              {[mw1, mw2].filter((item): item is CycleResult => item !== null).map((item) => (
                <tr key={item.label}>
                  <td>{item.label}</td>
                  <td>{item.source_file}</td>
                  <td>{fmt(item.report.sections_imported)}</td>
                  <td>{fmt(item.report.rows_imported)}</td>
                  <td>{fmt(item.review_count_before_auto_resolve)}</td>
                  <td>{fmt(item.events_emitted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
            <button type="button" onClick={() => { setActiveCycle("mw1"); resetNavigation(); }}>
              MW1 anzeigen
            </button>
            <button
              type="button"
              disabled={mw2 == null}
              onClick={() => {
                setActiveCycle("mw2");
                resetNavigation();
              }}
            >
              MW2 anzeigen
            </button>
          </div>
        </section>
      ) : null}

      {activeResult && activeSection && activeRow ? (
        <>
          <section style={{ marginBottom: "16px" }}>
            <h2>Navigation ({activeResult.label})</h2>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <label>
                Abschnitt:
                <select
                  value={sectionIndex}
                  onChange={(event) => {
                    setSectionIndex(Number(event.target.value));
                    setRowIndex(0);
                  }}
                >
                  {activeResult.trace.map((section, idx) => (
                    <option key={section.section_index} value={idx}>
                      #{section.section_index} {section.duration} / {section.division} / Lauf{" "}
                      {section.race_no}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  setRowIndex((idx) => Math.max(0, idx - 1));
                }}
                disabled={rowIndex <= 0}
              >
                Vorherige Zeile
              </button>
              <button
                type="button"
                onClick={() => {
                  setRowIndex((idx) => Math.min(rowCount - 1, idx + 1));
                }}
                disabled={rowIndex >= rowCount - 1}
              >
                Nächste Zeile
              </button>
              <span>
                Zeile {rowIndex + 1} / {rowCount} (Abschnitt {sectionIndex + 1} / {sectionCount})
              </span>
            </div>
          </section>

          <section style={{ marginBottom: "16px" }}>
            <h2>Schnellansicht: aktueller Match</h2>
            <table>
              <tbody>
                <tr>
                  <th>Startnummer</th>
                  <td>{activeRow.startnr}</td>
                </tr>
                <tr>
                  <th>Incoming Name</th>
                  <td>{activeRow.display_name}</td>
                </tr>
                <tr>
                  <th>Incoming Jahrgang</th>
                  <td>{activeRow.yob_text ?? "—"}</td>
                </tr>
                <tr>
                  <th>Incoming Verein</th>
                  <td>{activeRow.club_text ?? "—"}</td>
                </tr>
                <tr>
                  <th>Route</th>
                  <td>{activeRow.route}</td>
                </tr>
                <tr>
                  <th>Ziel Team-ID</th>
                  <td>{activeRow.linked_team_id}</td>
                </tr>
                <tr>
                  <th>Confidence</th>
                  <td>{activeRow.confidence.toFixed(3)}</td>
                </tr>
                <tr>
                  <th>Kandidatenzahl</th>
                  <td>{activeRow.candidate_count}</td>
                </tr>
                <tr>
                  <th>Top Candidate UID</th>
                  <td>{activeRow.top_candidate_uid ?? "—"}</td>
                </tr>
                <tr>
                  <th>Match im Pool</th>
                  <td>{poolMatchContext?.teamLabel ?? "—"}</td>
                </tr>
                <tr>
                  <th>Team-Mitglieder</th>
                  <td>
                    {poolMatchContext && poolMatchContext.memberNames.length > 0
                      ? poolMatchContext.memberNames.join(", ")
                      : "—"}
                  </td>
                </tr>
                <tr>
                  <th>Conflict Flags</th>
                  <td>
                    {activeRow.conflict_flags.length > 0
                      ? activeRow.conflict_flags.join(", ")
                      : "—"}
                  </td>
                </tr>
                <tr>
                  <th>Feature Scores</th>
                  <td>
                    {Object.keys(activeRow.features).length > 0
                      ? Object.entries(activeRow.features)
                          .map(([key, value]) => `${key}=${value.toFixed(3)}`)
                          .join(", ")
                      : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section style={{ marginBottom: "16px" }}>
            <h2>Resultat-Platzierung</h2>
            <p>
              {activeRow.route === "new_identity"
                ? "Neue Identität erstellt."
                : "Bestehende Identität verwendet."}
            </p>
            <table>
              <tbody>
                <tr>
                  <th>Neue Personen-IDs</th>
                  <td>
                    {activeRow.new_person_ids.length > 0
                      ? activeRow.new_person_ids.join(", ")
                      : "—"}
                  </td>
                </tr>
                <tr>
                  <th>Neue Team-IDs</th>
                  <td>
                    {activeRow.new_team_ids.length > 0
                      ? activeRow.new_team_ids.join(", ")
                      : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section style={{ marginBottom: "16px" }}>
            <h2>Kandidatenliste</h2>
            <table>
              <thead>
                <tr>
                  <th>UID</th>
                  <th>Display-Name</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {activeRow.candidate_uids.length > 0 ? (
                  activeRow.candidate_uids.map((uid, idx) => (
                    <tr key={`${uid}-${idx}`}>
                      <td>{uid}</td>
                      <td>{getCandidateDisplayName(activeSection, uid)}</td>
                      <td>{(activeRow.candidate_confidences[idx] ?? 0).toFixed(3)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>Keine Kandidaten</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section style={{ marginBottom: "16px" }}>
            <details>
              <summary>
                Teilnehmerpool vor Abschnitt (Personen: {fmt(activeSection.pool_before.person_count)} | Teams:{" "}
                {fmt(activeSection.pool_before.team_count)})
              </summary>
              <div style={{ marginTop: "12px" }}>
                <h3>Pool Personen (scrollbar)</h3>
                <div style={{ maxHeight: "260px", overflow: "auto", border: "1px solid var(--color-border)" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Person-ID</th>
                        <th>Name</th>
                        <th>Jg.</th>
                        <th>Geschlecht</th>
                        <th>Verein</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSection.pool_before.people.length > 0 ? (
                        activeSection.pool_before.people.map((person) => (
                          <tr key={person.person_id}>
                            <td>{person.person_id}</td>
                            <td>{person.display_name}</td>
                            <td>{person.yob}</td>
                            <td>{person.gender}</td>
                            <td>{person.club ?? "—"}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5}>Leer (keine bekannten Personen vor diesem Abschnitt)</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          </section>
        </>
      ) : null}
    </main>
  );
}
