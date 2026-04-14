/**
 * Season management screen: list, create, open, delete, reset, import, export.
 */

import { useState } from "react";
import { ConfirmModal } from "@/components/shared/ConfirmModal.tsx";
import { STR } from "@/strings.ts";
import type { FoundationViewProps } from "@/components/foundation-view-props.ts";
import { useSeasonStore } from "@/stores/season.ts";
import { useStatusStore } from "@/stores/status.ts";

export function SeasonEntryView({ seasonLabel, reviewLabel }: FoundationViewProps) {
  const seasons = useSeasonStore((state) => state.seasons);
  const activeSeasonId = useSeasonStore((state) => state.activeSeasonId);
  const loading = useSeasonStore((state) => state.loading);
  const createSeason = useSeasonStore((state) => state.createSeason);
  const openSeason = useSeasonStore((state) => state.openSeason);
  const deleteSeason = useSeasonStore((state) => state.deleteSeason);
  const resetSeason = useSeasonStore((state) => state.resetSeason);
  const setStatus = useStatusStore((state) => state.setStatus);

  const [newSeasonLabel, setNewSeasonLabel] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [resetCandidate, setResetCandidate] = useState<string | null>(null);

  return (
    <section className="foundation-view foundation-view--scroll" aria-label={STR.views.season.title}>
      <h2>{STR.views.season.title}</h2>
      <p>{STR.views.season.placeholder}</p>
      <div className="season-entry__create">
        <label>
          {STR.views.season.createLabel}
          <input
            value={newSeasonLabel}
            onChange={(event) => {
              setNewSeasonLabel(event.target.value);
            }}
          />
        </label>
        <button
          type="button"
          className="button button--primary"
          disabled={loading}
          onClick={() => {
            void createSeason(newSeasonLabel).then(() => {
              if (!newSeasonLabel.trim()) return;
              setStatus({
                message: STR.views.season.createdDone(newSeasonLabel.trim()),
                severity: "success",
                source: "season-entry",
              });
              setNewSeasonLabel("");
            });
          }}
        >
          {STR.views.season.createAction}
        </button>
      </div>

      <div className="season-entry__list">
        {seasons.length === 0 ? <p>{STR.views.season.noSeasons}</p> : null}
        {seasons.map((season) => (
          <article key={season.season_id} className="season-entry__item">
            <header>
              <strong>{season.label}</strong>{" "}
              {season.season_id === activeSeasonId ? (
                <span className="season-entry__active">{STR.views.season.activeTag}</span>
              ) : null}
            </header>
            <div className="season-entry__actions">
              <button
                type="button"
                className="button"
                disabled={loading}
                onClick={() => {
                  void openSeason(season.season_id);
                }}
              >
                {STR.views.season.openAction}
              </button>
              <button
                type="button"
                className="button"
                disabled={loading}
                onClick={() => {
                  setResetCandidate(season.season_id);
                }}
              >
                {STR.views.season.resetAction}
              </button>
              <button
                type="button"
                className="button"
                disabled={loading}
                onClick={() => {
                  setDeleteCandidate(season.season_id);
                }}
              >
                {STR.views.season.deleteAction}
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="season-entry__deferred">
        <button type="button" className="button" disabled>
          {STR.views.season.importAction}
        </button>
        <button type="button" className="button" disabled>
          {STR.views.season.exportAction}
        </button>
        <p>{STR.views.season.importHint}</p>
        <p>{STR.views.season.exportHint}</p>
      </div>
      <p className="foundation-view__meta">
        <span>{seasonLabel}</span>
        <span>{reviewLabel}</span>
      </p>

      <ConfirmModal
        isOpen={deleteCandidate != null}
        title={STR.views.season.deleteConfirmTitle}
        body={STR.views.season.deleteConfirmBody}
        onCancel={() => {
          setDeleteCandidate(null);
        }}
        onConfirm={() => {
          if (!deleteCandidate) return;
          void deleteSeason(deleteCandidate).then(() => {
            setStatus({
              message: STR.views.season.deletedDone,
              severity: "warn",
              source: "season-entry",
            });
            setDeleteCandidate(null);
          });
        }}
      />

      <ConfirmModal
        isOpen={resetCandidate != null}
        title={STR.views.season.resetConfirmTitle}
        body={STR.views.season.resetConfirmBody}
        onCancel={() => {
          setResetCandidate(null);
        }}
        onConfirm={() => {
          if (!resetCandidate) return;
          void resetSeason(resetCandidate).then(() => {
            setStatus({
              message: STR.views.season.resetDone,
              severity: "warn",
              source: "season-entry",
            });
            setResetCandidate(null);
          });
        }}
      />
    </section>
  );
}
