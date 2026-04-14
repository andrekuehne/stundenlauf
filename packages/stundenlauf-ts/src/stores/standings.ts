import { create } from "zustand";

export type StandingsMode = "overview" | "correct_identity" | "merge_duplicates";

interface StandingsStoreState {
  selectedCategoryKey: string | null;
  mode: StandingsMode;
  selectedPersonId: string | null;
  mergeSurvivorTeamId: string | null;
  mergeAbsorbedTeamId: string | null;
  selectCategory: (categoryKey: string) => void;
  setMode: (mode: StandingsMode) => void;
  setSelectedPerson: (personId: string | null) => void;
  setMergeSurvivor: (teamId: string | null) => void;
  setMergeAbsorbed: (teamId: string | null) => void;
  resetMergeSelection: () => void;
}

export const useStandingsStore = create<StandingsStoreState>((set) => ({
  selectedCategoryKey: null,
  mode: "overview",
  selectedPersonId: null,
  mergeSurvivorTeamId: null,
  mergeAbsorbedTeamId: null,
  selectCategory: (categoryKey) => {
    set({ selectedCategoryKey: categoryKey });
  },
  setMode: (mode) => {
    set({ mode });
  },
  setSelectedPerson: (personId) => {
    set({ selectedPersonId: personId });
  },
  setMergeSurvivor: (teamId) => {
    set({ mergeSurvivorTeamId: teamId });
  },
  setMergeAbsorbed: (teamId) => {
    set({ mergeAbsorbedTeamId: teamId });
  },
  resetMergeSelection: () => {
    set({ mergeSurvivorTeamId: null, mergeAbsorbedTeamId: null });
  },
}));
