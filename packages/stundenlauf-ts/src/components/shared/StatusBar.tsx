/**
 * Global status bar at the bottom of the app shell.
 */

import { STR } from "@/strings.ts";
import { useStatusStore, type StatusMessage } from "@/stores/status.ts";

interface StatusBarProps {
  current?: StatusMessage | null;
}

export function StatusBar({ current }: StatusBarProps) {
  const storeCurrent = useStatusStore((state) => state.current);
  const status = current ?? storeCurrent;
  const severity = status?.severity ?? "info";

  return (
    <footer className={`status-bar status-bar--${severity}`} role="status" aria-live="polite">
      <span className="status-bar__prefix">{STR.status.prefix}</span>
      <span>{status?.message ?? STR.status.defaultReady}</span>
    </footer>
  );
}
