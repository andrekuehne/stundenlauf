/**
 * Zustand store for import draft state, review queue, matching config.
 *
 * Reference: F-TS06 §3 (State Management)
 */

import { create } from "zustand";
import type { SeasonState } from "@/domain/types.ts";
import { finalizeImport, getReviewQueue, resolveReviewEntry, runMatching, startImport } from "@/import/orchestrator.ts";
import type { ImportSession, OrchestratedReviewEntry, ReviewAction } from "@/import/types.ts";
import { detectSourceType, parseRaceNo } from "@/ingestion/helpers.ts";
import {
  DEFAULT_AUTO_MIN,
  DEFAULT_REVIEW_MIN,
  defaultMatchingConfig,
  effectiveAutoMin,
  type MatchingConfig,
} from "@/matching/config.ts";

type SourceType = "singles" | "couples";
type MatchingMode = "strict" | "fuzzy_automatik" | "manuell";

interface ImportStoreState {
  selectedFile: File | null;
  selectedFileName: string;
  sourceType: SourceType;
  raceNo: number | null;
  matchingMode: MatchingMode;
  autoThreshold: number;
  reviewThreshold: number;
  settingsExpanded: boolean;
  busy: boolean;
  error: string | null;
  session: ImportSession | null;
  pendingReviews: OrchestratedReviewEntry[];
  selectedReviewEntryId: string | null;
  selectedDecisionTeamId: string | null;
  openReviewCount: number;
  setSelectedFile: (file: File | null) => void;
  setSourceType: (sourceType: SourceType) => void;
  setRaceNo: (raceNo: number | null) => void;
  setMatchingMode: (mode: MatchingMode) => void;
  setAutoThreshold: (value: number) => void;
  setReviewThreshold: (value: number) => void;
  setSettingsExpanded: (expanded: boolean) => void;
  setSelectedDecisionTeamId: (teamId: string | null) => void;
  startImportFlow: (seasonState: SeasonState) => Promise<ImportSession | null>;
  resolveCurrentReview: (action: ReviewAction) => void;
  finalizeCurrentImport: (startSeq: number) => DomainFinalizeResult;
  clearWorkflow: () => void;
  resetDraft: () => void;
}

interface DomainFinalizeResult {
  eventsCount: number;
  events: ReturnType<typeof finalizeImport>;
}

const MIN_THRESHOLD = 0.5;
const MAX_THRESHOLD = 1;

function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return MIN_THRESHOLD;
  return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, value));
}

function modeToConfig(mode: MatchingMode, auto: number, review: number): MatchingConfig {
  const autoMin = clampThreshold(auto);
  const base = defaultMatchingConfig({
    auto_min: autoMin,
  });
  if (mode === "strict") {
    return {
      ...base,
      review_min: Math.min(clampThreshold(review), 1),
      strict_normalized_auto_only: true,
      auto_merge_enabled: false,
      perfect_match_auto_merge: false,
    };
  }
  if (mode === "manuell") {
    return {
      ...base,
      review_min: Math.min(clampThreshold(review), 1),
      strict_normalized_auto_only: false,
      auto_merge_enabled: false,
      perfect_match_auto_merge: false,
    };
  }
  return {
    ...base,
    review_min: Math.min(clampThreshold(review), autoMin),
    strict_normalized_auto_only: false,
    auto_merge_enabled: false,
    perfect_match_auto_merge: true,
  };
}

function sortPendingReviews(session: ImportSession | null): OrchestratedReviewEntry[] {
  if (!session) return [];
  return getReviewQueue(session)
    .slice()
    .sort((a, b) => b.review_item.confidence - a.review_item.confidence);
}

function defaultDecisionTeamId(entry: OrchestratedReviewEntry | null): string | null {
  if (!entry) return null;
  return entry.review_item.candidates[0]?.team_id ?? null;
}

export const useImportStore = create<ImportStoreState>((set, get) => ({
  selectedFile: null,
  selectedFileName: "",
  sourceType: "singles",
  raceNo: null,
  matchingMode: "fuzzy_automatik",
  autoThreshold: DEFAULT_AUTO_MIN,
  reviewThreshold: DEFAULT_REVIEW_MIN,
  settingsExpanded: true,
  busy: false,
  error: null,
  session: null,
  pendingReviews: [],
  selectedReviewEntryId: null,
  selectedDecisionTeamId: null,
  openReviewCount: 0,

  setSelectedFile: (file) => {
    if (!file) {
      set({ selectedFile: null, selectedFileName: "", raceNo: null });
      return;
    }
    const inferredType = detectSourceType(file.name);
    const inferredRace = parseRaceNo(file.name);
    set({
      selectedFile: file,
      selectedFileName: file.name,
      sourceType: inferredType,
      raceNo: inferredRace > 0 ? inferredRace : null,
      error: null,
    });
  },

  setSourceType: (sourceType) => {
    set({ sourceType });
  },

  setRaceNo: (raceNo) => {
    set({ raceNo });
  },

  setMatchingMode: (mode) => {
    set((state) => ({
      matchingMode: mode,
      reviewThreshold:
        mode === "fuzzy_automatik"
          ? Math.min(state.reviewThreshold, clampThreshold(state.autoThreshold))
          : state.reviewThreshold,
    }));
  },

  setAutoThreshold: (value) => {
    const nextAuto = clampThreshold(value);
    set((state) => ({
      autoThreshold: nextAuto,
      reviewThreshold:
        state.matchingMode === "fuzzy_automatik"
          ? Math.min(state.reviewThreshold, nextAuto)
          : state.reviewThreshold,
    }));
  },

  setReviewThreshold: (value) => {
    set((state) => {
      const capped = clampThreshold(value);
      return {
        reviewThreshold:
          state.matchingMode === "fuzzy_automatik"
            ? Math.min(capped, clampThreshold(state.autoThreshold))
            : capped,
      };
    });
  },

  setSettingsExpanded: (expanded) => {
    set({ settingsExpanded: expanded });
  },

  setSelectedDecisionTeamId: (teamId) => {
    set({ selectedDecisionTeamId: teamId });
  },

  startImportFlow: async (seasonState) => {
    const state = get();
    if (state.openReviewCount > 0) {
      set({ error: "Solange offene Prüfungen bestehen, kann kein weiterer Lauf importiert werden." });
      return null;
    }
    if (!state.selectedFile || !state.raceNo) {
      set({ error: "Bitte Datei, Lauftyp und Laufnummer vollständig wählen." });
      return null;
    }

    set({ busy: true, error: null });
    try {
      const started = await startImport(state.selectedFile, seasonState, {
        sourceType: state.sourceType,
        raceNoOverride: state.raceNo,
      });
      const config = modeToConfig(state.matchingMode, state.autoThreshold, state.reviewThreshold);
      const matched = await runMatching(started, config);
      const pending = sortPendingReviews(matched);
      const first = pending[0] ?? null;
      set({
        session: matched,
        pendingReviews: pending,
        selectedReviewEntryId: first?.entry_id ?? null,
        selectedDecisionTeamId: defaultDecisionTeamId(first),
        openReviewCount: pending.length,
      });
      return matched;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), session: null });
      return null;
    } finally {
      set({ busy: false });
    }
  },

  resolveCurrentReview: (action) => {
    const state = get();
    if (!state.session || !state.selectedReviewEntryId) return;
    try {
      const updated = resolveReviewEntry(state.session, state.selectedReviewEntryId, action);
      const pending = sortPendingReviews(updated);
      const first = pending[0] ?? null;
      set({
        session: updated,
        pendingReviews: pending,
        selectedReviewEntryId: first?.entry_id ?? null,
        selectedDecisionTeamId: defaultDecisionTeamId(first),
        openReviewCount: pending.length,
        error: null,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  finalizeCurrentImport: (startSeq) => {
    const state = get();
    if (!state.session || state.session.phase !== "committing") {
      return { eventsCount: 0, events: [] };
    }
    const events = finalizeImport(state.session, { startSeq });
    set({
      session: null,
      pendingReviews: [],
      selectedReviewEntryId: null,
      selectedDecisionTeamId: null,
      openReviewCount: 0,
      selectedFile: null,
      selectedFileName: "",
      raceNo: null,
    });
    return { eventsCount: events.length, events };
  },

  clearWorkflow: () => {
    set({
      session: null,
      pendingReviews: [],
      selectedReviewEntryId: null,
      selectedDecisionTeamId: null,
      openReviewCount: 0,
      busy: false,
      error: null,
    });
  },

  resetDraft: () => {
    set({
      selectedFile: null,
      selectedFileName: "",
      sourceType: "singles",
      raceNo: null,
      matchingMode: "fuzzy_automatik",
      autoThreshold: DEFAULT_AUTO_MIN,
      reviewThreshold: DEFAULT_REVIEW_MIN,
      settingsExpanded: true,
      error: null,
    });
  },
}));

export function effectiveAutoThreshold(mode: MatchingMode, auto: number, review: number): number {
  return effectiveAutoMin(modeToConfig(mode, auto, review));
}
