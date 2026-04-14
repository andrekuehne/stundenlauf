/**
 * Zustand store for global status/toast messages.
 *
 * Reference: F-TS06 §3 (State Management)
 */

import { create } from "zustand";

export type StatusSeverity = "info" | "success" | "warn" | "error";

export interface StatusMessage {
  message: string;
  severity: StatusSeverity;
  source?: string;
  timestamp: string;
}

interface StatusStoreState {
  current: StatusMessage | null;
  setStatus: (payload: Omit<StatusMessage, "timestamp">) => void;
  clearStatus: () => void;
}

export const useStatusStore = create<StatusStoreState>((set) => ({
  current: null,
  setStatus: (payload) => {
    set({
      current: {
        ...payload,
        timestamp: new Date().toISOString(),
      },
    });
  },
  clearStatus: () => {
    set({ current: null });
  },
}));
