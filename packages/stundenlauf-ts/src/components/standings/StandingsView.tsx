/**
 * Standings screen: sidebar + content layout wrapper.
 */

import { useEffect, useMemo } from "react";
import { CategoryGrid } from "@/components/shared/CategoryGrid.tsx";
import { ImportedRunsMatrix } from "@/components/shared/ImportedRunsMatrix.tsx";
import { MergeCorrectModal } from "@/components/import/MergeCorrectModal.tsx";
import { STR } from "@/strings.ts";
import type { FoundationViewProps } from "@/components/foundation-view-props.ts";
import { useSeasonStore } from "@/stores/season.ts";
import { useStandingsStore } from "@/stores/standings.ts";
import { useStatusStore } from "@/stores/status.ts";
import { IdentityModal } from "./IdentityModal.tsx";
import { StandingsTable } from "./StandingsTable.tsx";
import {
  buildCategoryOptions,
  buildImportedRunsRows,
  buildRaceOverviewModel,
  buildStandingsRows,
  categoryDisplayName,
  teamLabel,
} from "./adapters.ts";

export function StandingsView({ seasonLabel, reviewLabel }: FoundationViewProps) {
  const seasonState = useSeasonStore((state) => state.seasonState);
  const correctPersonIdentity = useSeasonStore((state) => state.correctPersonIdentity);
  const mergeTeams = useSeasonStore((state) => state.mergeTeams);
  const selectedCategoryKey = useStandingsStore((state) => state.selectedCategoryKey);
  const selectCategory = useStandingsStore((state) => state.selectCategory);
  const mode = useStandingsStore((state) => state.mode);
  const setMode = useStandingsStore((state) => state.setMode);
  const selectedPersonId = useStandingsStore((state) => state.selectedPersonId);
  const setSelectedPerson = useStandingsStore((state) => state.setSelectedPerson);
  const mergeSurvivorTeamId = useStandingsStore((state) => state.mergeSurvivorTeamId);
  const mergeAbsorbedTeamId = useStandingsStore((state) => state.mergeAbsorbedTeamId);
  const setMergeSurvivor = useStandingsStore((state) => state.setMergeSurvivor);
  const setMergeAbsorbed = useStandingsStore((state) => state.setMergeAbsorbed);
  const resetMergeSelection = useStandingsStore((state) => state.resetMergeSelection);
  const setStatus = useStatusStore((state) => state.setStatus);

  const categoryOptions = useMemo(() => buildCategoryOptions(seasonState), [seasonState]);
  const importedRuns = useMemo(() => buildImportedRunsRows(seasonState), [seasonState]);
  const standingsRows = useMemo(
    () => buildStandingsRows(seasonState, selectedCategoryKey),
    [seasonState, selectedCategoryKey],
  );
  const raceOverview = useMemo(
    () => buildRaceOverviewModel(seasonState, selectedCategoryKey),
    [seasonState, selectedCategoryKey],
  );

  const selectedPerson = selectedPersonId ? seasonState.persons.get(selectedPersonId) ?? null : null;
  const mergeTeamsOptions = [...seasonState.teams.keys()].map((teamId) => ({
    team_id: teamId,
    label: teamLabel(seasonState, teamId),
  }));

  const selectedCategoryDisplay = selectedCategoryKey
    ? categoryDisplayName(selectedCategoryKey)
    : categoryOptions[0]?.label ?? "-";

  useEffect(() => {
    if (selectedCategoryKey) return;
    const firstOption = categoryOptions[0];
    if (!firstOption) return;
    selectCategory(firstOption.key);
  }, [selectedCategoryKey, categoryOptions, selectCategory]);

  return (
    <section className="foundation-view" aria-label={STR.views.standings.title}>
      <h2>{STR.views.standings.title}</h2>
      <div className="standings-view__toolbar">
        <CategoryGrid
          options={categoryOptions}
          selectedKey={selectedCategoryKey}
          onSelect={selectCategory}
        />
        <div className="standings-view__modes">
          <button
            type="button"
            className="button"
            onClick={() => {
              setMode("overview");
            }}
          >
            {STR.views.standings.modeOverview}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              setMode("correct_identity");
            }}
          >
            {STR.views.standings.modeCorrectIdentity}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              setMode("merge_duplicates");
            }}
          >
            {STR.views.standings.modeMergeDuplicates}
          </button>
          <button type="button" className="button" disabled>
            {STR.views.standings.exportPdf}
          </button>
          <button type="button" className="button" disabled>
            {STR.views.standings.exportExcel}
          </button>
        </div>
      </div>

      <h3>{STR.views.standings.importedRunsTitle}</h3>
      <ImportedRunsMatrix rows={importedRuns} />

      <h3>{STR.views.standings.overallTitle}</h3>
      <StandingsTable rows={standingsRows} />

      {mode === "correct_identity" ? (
        <div className="standings-view__mode-panel">
          <label>
            Person auswählen
            <select
              value={selectedPersonId ?? ""}
              onChange={(event) => {
                setSelectedPerson(event.target.value || null);
              }}
            >
              <option value="">-</option>
              {[...seasonState.persons.values()].map((person) => (
                <option key={person.person_id} value={person.person_id}>
                  {person.display_name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button"
            disabled={!selectedPerson}
            onClick={() => {
              if (!selectedPerson) return;
              setSelectedPerson(selectedPerson.person_id);
            }}
          >
            {STR.views.standings.modeCorrectIdentity}
          </button>
        </div>
      ) : null}

      <h3>
        {STR.views.standings.raceOverviewTitle} - {selectedCategoryDisplay}
      </h3>
      <table className="ui-table">
        <thead>
          <tr>
            <th>{STR.views.standings.team}</th>
            {raceOverview.raceColumns.map((column) => (
              <th key={column}>{column.slice(0, 8)}</th>
            ))}
            <th>{STR.views.standings.points}</th>
          </tr>
        </thead>
        <tbody>
          {raceOverview.rows.length > 0 ? (
            raceOverview.rows.map((row) => (
              <tr key={row.team_id}>
                <td>{row.team_label}</td>
                {raceOverview.raceColumns.map((column) => (
                  <td key={`${row.team_id}-${column}`}>{row.race_values[column] ?? "—"}</td>
                ))}
                <td>{row.total_points}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={raceOverview.raceColumns.length + 2}>{STR.views.standings.noRows}</td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="foundation-view__meta">
        <span>{seasonLabel}</span>
        <span>{reviewLabel}</span>
      </p>

      <IdentityModal
        isOpen={mode === "correct_identity" && selectedPerson != null}
        person={selectedPerson}
        onClose={() => {
          setSelectedPerson(null);
          setMode("overview");
        }}
        onSave={(payload) => {
          void correctPersonIdentity(payload).then(() => {
            setStatus({
              message: "Identität gespeichert.",
              severity: "success",
              source: "standings",
            });
          });
        }}
      />

      <MergeCorrectModal
        isOpen={mode === "merge_duplicates"}
        teams={mergeTeamsOptions}
        survivorTeamId={mergeSurvivorTeamId}
        absorbedTeamId={mergeAbsorbedTeamId}
        onChangeSurvivor={setMergeSurvivor}
        onChangeAbsorbed={setMergeAbsorbed}
        onCancel={() => {
          resetMergeSelection();
          setMode("overview");
        }}
        onConfirm={() => {
          if (!mergeSurvivorTeamId || !mergeAbsorbedTeamId) return;
          void mergeTeams(mergeSurvivorTeamId, mergeAbsorbedTeamId).then(() => {
            setStatus({
              message: "Duplikate zusammengeführt.",
              severity: "success",
              source: "standings",
            });
            resetMergeSelection();
            setMode("overview");
          });
        }}
      />
    </section>
  );
}
