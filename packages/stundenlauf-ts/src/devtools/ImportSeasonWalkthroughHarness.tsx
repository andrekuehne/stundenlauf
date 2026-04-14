import { useMemo, useState } from "react";
import {
  categoryKey,
  emptySeasonState,
  isEffectiveRace,
  projectState,
} from "@/domain/projection.ts";
import type { DomainEvent } from "@/domain/events.ts";
import { finalizeImport } from "@/import/finalize.ts";
import { getReviewQueue, resolveReviewEntry } from "@/import/review.ts";
import { runMatching } from "@/import/run-matching.ts";
import { startImport } from "@/import/start-import.ts";
import type { ImportSession } from "@/import/types.ts";
import {
  DEFAULT_AUTO_MIN,
  DEFAULT_REVIEW_MIN,
  defaultMatchingConfig,
  effectiveAutoMin,
  type MatchingConfig,
} from "@/matching/config.ts";
import type { SeasonState } from "@/domain/types.ts";

type HarnessMatchingMode = "strict" | "fuzzy_automatik" | "manuell";

interface ImportLogEntry {
  file_name: string;
  imported_at: string;
  mode: HarnessMatchingMode;
  effective_auto_min: number;
  review_min: number;
  rows_imported: number;
  review_items: number;
  events_emitted: number;
}

interface PendingReviewItem {
  entry_id: string;
  section_index: number;
  entry_index: number;
  confidence: number;
  item: ReturnType<typeof getReviewQueue>[number];
}

interface RankedRow {
  team_id: string;
  team_label: string;
  total_points: number;
  total_distance_m: number;
  races_count: number;
}

interface CategoryRankingTable {
  category_key: string;
  rows: RankedRow[];
}

type TeamAggregation = {
  total_points: number;
  total_distance_m: number;
  races: Set<string>;
};

const HARNESS_SEASON_ID = "f-ts05-season-walkthrough";
const NEW_IDENTITY_OPTION = "__create_new_identity__";

function clampThreshold(value: number): number {
  return Math.min(1, Math.max(0.5, value));
}

function modeLabel(mode: HarnessMatchingMode): string {
  if (mode === "strict") return "Strikt";
  if (mode === "manuell") return "Manuell";
  return "Fuzzy-Automatik";
}

function thresholdLabel(value: number): string {
  return value.toFixed(2);
}

function buildMatchingConfig(
  mode: HarnessMatchingMode,
  autoMin: number,
  reviewMin: number,
): MatchingConfig {
  const auto = clampThreshold(autoMin);
  const review = Math.min(clampThreshold(reviewMin), auto);
  const base = defaultMatchingConfig({
    auto_min: auto,
    review_min: review,
  });

  if (mode === "strict") {
    return {
      ...base,
      strict_normalized_auto_only: true,
      auto_merge_enabled: false,
      perfect_match_auto_merge: false,
    };
  }
  if (mode === "manuell") {
    return {
      ...base,
      strict_normalized_auto_only: false,
      auto_merge_enabled: false,
      perfect_match_auto_merge: false,
    };
  }
  return {
    ...base,
    strict_normalized_auto_only: false,
    auto_merge_enabled: false,
    perfect_match_auto_merge: true,
  };
}

function teamDisplayLabel(state: SeasonState, teamId: string): string {
  const team = state.teams.get(teamId);
  if (!team) return teamId;
  const members = team.member_person_ids.map((personId) => {
    const person = state.persons.get(personId);
    return person?.display_name ?? personId;
  });
  return `${members.join(" / ")} (${teamId})`;
}

function buildCategoryRankingTables(state: SeasonState): CategoryRankingTable[] {
  const byCategory = new Map<string, Map<string, TeamAggregation>>();

  for (const [raceEventId, race] of state.race_events) {
    if (!isEffectiveRace(state, raceEventId)) continue;
    const catKey = categoryKey(race.category);
    const byTeam = byCategory.get(catKey) ?? new Map<string, TeamAggregation>();
    for (const entry of race.entries) {
      const current = byTeam.get(entry.team_id) ?? {
        total_points: 0,
        total_distance_m: 0,
        races: new Set<string>(),
      };
      current.total_points += entry.points;
      current.total_distance_m += entry.distance_m;
      current.races.add(raceEventId);
      byTeam.set(entry.team_id, current);
    }
    byCategory.set(catKey, byTeam);
  }

  const tables: CategoryRankingTable[] = [...byCategory.entries()].map(
    ([category_key, byTeam]) => {
      const rows: RankedRow[] = [...byTeam.entries()].map(([teamId, value]) => ({
        team_id: teamId,
        team_label: teamDisplayLabel(state, teamId),
        total_points: value.total_points,
        total_distance_m: value.total_distance_m,
        races_count: value.races.size,
      }));

      rows.sort((a, b) => {
        if (a.total_points !== b.total_points) return b.total_points - a.total_points;
        if (a.total_distance_m !== b.total_distance_m) return b.total_distance_m - a.total_distance_m;
        return a.team_id.localeCompare(b.team_id);
      });
      return { category_key, rows };
    },
  );

  return tables;
}

function buildImportedRaces(
  state: SeasonState,
): Array<{
  race_event_id: string;
  category_key: string;
  race_no: number;
  race_date: string;
  source_file: string;
  entries_count: number;
}> {
  const rows: Array<{
    race_event_id: string;
    category_key: string;
    race_no: number;
    race_date: string;
    source_file: string;
    entries_count: number;
  }> = [];
  for (const [raceEventId, race] of state.race_events) {
    if (!isEffectiveRace(state, raceEventId)) continue;
    const batch = state.import_batches.get(race.import_batch_id);
    rows.push({
      race_event_id: race.race_event_id,
      category_key: categoryKey(race.category),
      race_no: race.race_no,
      race_date: race.race_date,
      source_file: batch?.source_file ?? "—",
      entries_count: race.entries.length,
    });
  }
  return rows;
}

export function ImportSeasonWalkthroughHarness() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seasonEvents, setSeasonEvents] = useState<DomainEvent[]>([]);
  const [seasonState, setSeasonState] = useState(emptySeasonState(HARNESS_SEASON_ID));
  const [activeSession, setActiveSession] = useState<ImportSession | null>(null);
  const [importLog, setImportLog] = useState<ImportLogEntry[]>([]);
  const [selectedReviewDecision, setSelectedReviewDecision] = useState<string>("");
  const [matchingMode, setMatchingMode] = useState<HarnessMatchingMode>("fuzzy_automatik");
  const [autoThreshold, setAutoThreshold] = useState(DEFAULT_AUTO_MIN);
  const [reviewThreshold, setReviewThreshold] = useState(DEFAULT_REVIEW_MIN);

  const matchingConfig = useMemo(
    () => buildMatchingConfig(matchingMode, autoThreshold, reviewThreshold),
    [matchingMode, autoThreshold, reviewThreshold],
  );
  const effectiveAutoThreshold = useMemo(
    () => effectiveAutoMin(matchingConfig),
    [matchingConfig],
  );
  const pendingReviews = useMemo<PendingReviewItem[]>(() => {
    if (!activeSession) return [];
    return getReviewQueue(activeSession)
      .map((entry) => ({
        entry_id: entry.entry_id,
        section_index: entry.section_index,
        entry_index: entry.entry_index,
        confidence: entry.review_item.confidence,
        item: entry,
      }))
      .sort((a, b) => b.confidence - a.confidence);
  }, [activeSession]);
  const currentReview = pendingReviews[0] ?? null;
  const rankingTables = useMemo(
    () => buildCategoryRankingTables(seasonState),
    [seasonState],
  );
  const importedRaces = useMemo(() => buildImportedRaces(seasonState), [seasonState]);

  function resetAll(): void {
    setBusy(false);
    setError(null);
    setSeasonEvents([]);
    setSeasonState(emptySeasonState(HARNESS_SEASON_ID));
    setActiveSession(null);
    setImportLog([]);
    setSelectedReviewDecision("");
  }

  function pickDefaultDecision(session: ImportSession): void {
    const first = getReviewQueue(session)
      .slice()
      .sort((a, b) => b.review_item.confidence - a.review_item.confidence)[0];
    if (!first) {
      setSelectedReviewDecision("");
      return;
    }
    const topCandidate = first.review_item.candidates[0];
    setSelectedReviewDecision(topCandidate?.team_id ?? NEW_IDENTITY_OPTION);
  }

  function commitSession(session: ImportSession): void {
    const events = finalizeImport(session, { startSeq: seasonEvents.length });
    const nextEvents = [...seasonEvents, ...events];
    const nextState = projectState(HARNESS_SEASON_ID, nextEvents);
    setSeasonEvents(nextEvents);
    setSeasonState(nextState);
    setImportLog((prev) => [
      ...prev,
      {
        file_name: session.source_file,
        imported_at: new Date().toISOString(),
        mode: matchingMode,
        effective_auto_min: effectiveAutoThreshold,
        review_min: matchingConfig.review_min,
        rows_imported: session.report.rows_imported,
        review_items: session.report.review_items,
        events_emitted: events.length,
      },
    ]);
    setActiveSession(null);
    setSelectedReviewDecision("");
  }

  async function handleFileImport(file: File): Promise<void> {
    if (activeSession?.phase === "reviewing") {
      setError("Es gibt offene Prüfungen. Bitte zuerst die aktuelle Prüfliste abschließen.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const started = await startImport(file, seasonState);
      const matched = await runMatching(started, matchingConfig);
      if (matched.phase === "reviewing") {
        setActiveSession(matched);
        pickDefaultDecision(matched);
      } else if (matched.phase === "committing") {
        commitSession(matched);
      } else {
        throw new Error(`Unerwartete Phase nach Matching: ${matched.phase}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function applyCurrentReviewDecision(): void {
    if (!activeSession || currentReview == null) return;
    try {
      const updated = resolveReviewEntry(
        activeSession,
        currentReview.entry_id,
        selectedReviewDecision === NEW_IDENTITY_OPTION
          ? { type: "create_new_identity" }
          : { type: "link_existing", team_id: selectedReviewDecision },
      );
      if (updated.phase === "committing") {
        commitSession(updated);
      } else {
        setActiveSession(updated);
        pickDefaultDecision(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main id="app" style={{ padding: "16px" }}>
      <h1>Import Season Walkthrough Harness</h1>
      <p>
        Praktischer Dev-Harness für komplette Saison-Imports: Datei für Datei laden, Reviews
        manuell per Radio-Auswahl entscheiden und laufend akkumulierte Ergebnisse ansehen.
      </p>

      <section style={{ marginBottom: "16px", border: "1px solid var(--color-border)", padding: "12px" }}>
        <h2>Matching-Strategie</h2>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <label>
            Modus:
            <select
              value={matchingMode}
              disabled={busy || activeSession?.phase === "reviewing"}
              onChange={(event) => {
                setMatchingMode(event.target.value as HarnessMatchingMode);
              }}
            >
              <option value="strict">Strikt</option>
              <option value="fuzzy_automatik">Fuzzy-Automatik</option>
              <option value="manuell">Manuell</option>
            </select>
          </label>
          <span>
            Effektive Auto-Schwelle: <strong>{thresholdLabel(effectiveAutoThreshold)}</strong>
          </span>
        </div>
        <div style={{ marginTop: "10px", display: "grid", gap: "10px" }}>
          <label>
            Auto-Schwelle ({thresholdLabel(autoThreshold)})
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.01}
              disabled={
                busy ||
                activeSession?.phase === "reviewing" ||
                matchingMode !== "fuzzy_automatik"
              }
              value={autoThreshold}
              onChange={(event) => {
                setAutoThreshold(clampThreshold(Number(event.target.value)));
              }}
            />
          </label>
          <label>
            Mindest-Ähnlichkeit Prüfliste ({thresholdLabel(reviewThreshold)})
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.01}
              disabled={busy || activeSession?.phase === "reviewing"}
              value={reviewThreshold}
              onChange={(event) => {
                setReviewThreshold(clampThreshold(Number(event.target.value)));
              }}
            />
          </label>
        </div>
      </section>

      <section style={{ marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <label>
          Import-Datei:
          <input
            type="file"
            accept=".xlsx"
            disabled={busy || activeSession?.phase === "reviewing"}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void handleFileImport(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <button type="button" onClick={resetAll} disabled={busy}>
          Saison-Reset
        </button>
      </section>

      <p>
        <strong>Status:</strong>{" "}
        {busy
          ? "Import läuft..."
          : activeSession?.phase === "reviewing"
            ? `Prüfliste offen (${pendingReviews.length})`
            : "Bereit"}
      </p>
      {error ? (
        <p role="alert" style={{ color: "var(--color-danger)" }}>
          Fehler: {error}
        </p>
      ) : null}

      {currentReview ? (
        <section style={{ marginBottom: "16px", border: "1px solid var(--color-border)", padding: "12px" }}>
          <h2>Review ({pendingReviews.length} offen, sortiert nach Confidence)</h2>
          <table style={{ marginBottom: "12px" }}>
            <tbody>
              <tr>
                <th>Abschnitt</th>
                <td>
                  #{currentReview.section_index + 1} / Eintrag #{currentReview.entry_index + 1}
                </td>
              </tr>
              <tr>
                <th>Incoming Name</th>
                <td>{currentReview.item.review_item.incoming_display_name}</td>
              </tr>
              <tr>
                <th>Incoming Jahrgang</th>
                <td>{currentReview.item.review_item.incoming_yob || "—"}</td>
              </tr>
              <tr>
                <th>Incoming Verein</th>
                <td>{currentReview.item.review_item.incoming_club ?? "—"}</td>
              </tr>
              <tr>
                <th>Confidence</th>
                <td>{currentReview.item.review_item.confidence.toFixed(3)}</td>
              </tr>
            </tbody>
          </table>

          <fieldset style={{ border: "1px solid var(--color-border)", padding: "10px" }}>
            <legend>Zuordnung wählen</legend>
            <div style={{ display: "grid", gap: "8px" }}>
              {currentReview.item.review_item.candidates.map((candidate) => (
                <label key={candidate.team_id}>
                  <input
                    type="radio"
                    name={`review-${currentReview.entry_id}`}
                    value={candidate.team_id}
                    checked={selectedReviewDecision === candidate.team_id}
                    onChange={(event) => {
                      setSelectedReviewDecision(event.target.value);
                    }}
                  />{" "}
                  {candidate.display_name} ({candidate.team_id}) - Score {candidate.score.toFixed(3)}
                </label>
              ))}
              <label>
                <input
                  type="radio"
                  name={`review-${currentReview.entry_id}`}
                  value={NEW_IDENTITY_OPTION}
                  checked={selectedReviewDecision === NEW_IDENTITY_OPTION}
                  onChange={(event) => {
                    setSelectedReviewDecision(event.target.value);
                  }}
                />{" "}
                Neue Identität anlegen
              </label>
            </div>
          </fieldset>

          <div style={{ marginTop: "12px" }}>
            <button
              type="button"
              onClick={applyCurrentReviewDecision}
              disabled={!selectedReviewDecision}
            >
              Auswahl übernehmen
            </button>
          </div>
        </section>
      ) : null}

      <section style={{ marginBottom: "16px" }}>
        <h2>Import-Historie</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Datei</th>
              <th>Modus</th>
              <th>Auto / Review</th>
              <th>Rows</th>
              <th>Review</th>
              <th>Events</th>
            </tr>
          </thead>
          <tbody>
            {importLog.length > 0 ? (
              importLog.map((entry, idx) => (
                <tr key={`${entry.file_name}-${entry.imported_at}`}>
                  <td>{idx + 1}</td>
                  <td>{entry.file_name}</td>
                  <td>{modeLabel(entry.mode)}</td>
                  <td>
                    {thresholdLabel(entry.effective_auto_min)} /{" "}
                    {thresholdLabel(entry.review_min)}
                  </td>
                  <td>{entry.rows_imported}</td>
                  <td>{entry.review_items}</td>
                  <td>{entry.events_emitted}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>Noch keine Imports.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section style={{ marginBottom: "16px" }}>
        <h2>Importierte Läufe (effektiv)</h2>
        <table>
          <thead>
            <tr>
              <th>Lauf-Nr.</th>
              <th>Kategorie</th>
              <th>Datum</th>
              <th>Datei</th>
              <th>Einträge</th>
            </tr>
          </thead>
          <tbody>
            {importedRaces.length > 0 ? (
              importedRaces.map((row) => (
                <tr key={row.race_event_id}>
                  <td>{row.race_no}</td>
                  <td>{row.category_key}</td>
                  <td>{row.race_date}</td>
                  <td>{row.source_file}</td>
                  <td>{row.entries_count}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>Noch keine Ergebnisse importiert.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Akkumulierte Ergebnisse (pro Kategorie, Punkte absteigend)</h2>
        {rankingTables.length > 0 ? (
          rankingTables.map((table) => (
            <div key={table.category_key} style={{ marginBottom: "16px" }}>
              <h3>{table.category_key}</h3>
              <table>
                <thead>
                  <tr>
                    <th>Rang</th>
                    <th>Team</th>
                    <th>Punkte</th>
                    <th>Distanz (m)</th>
                    <th>Läufe</th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, idx) => (
                    <tr key={`${table.category_key}-${row.team_id}`}>
                      <td>{idx + 1}</td>
                      <td>{row.team_label}</td>
                      <td>{row.total_points}</td>
                      <td>{row.total_distance_m}</td>
                      <td>{row.races_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        ) : (
          <p>Noch keine Ergebnisse importiert.</p>
        )}
      </section>
    </main>
  );
}
