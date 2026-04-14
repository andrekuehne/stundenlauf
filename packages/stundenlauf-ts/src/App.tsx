import { useEffect, useMemo, useState } from "react";
import { seasonLabel, reviewOpenCount } from "@/format.ts";
import { SHELL_TABS, STR, type ShellTab } from "@/strings.ts";
import { ImportView } from "@/components/import/ImportView.tsx";
import { HistoryView } from "@/components/history/HistoryView.tsx";
import { SeasonEntryView } from "@/components/season/SeasonEntryView.tsx";
import { StandingsView } from "@/components/standings/StandingsView.tsx";
import { StatusBar } from "@/components/shared/StatusBar.tsx";
import { useSeasonStore } from "@/stores/season.ts";
import { useStatusStore } from "@/stores/status.ts";
import { ImportOrchestrationHarness } from "./devtools/ImportOrchestrationHarness.tsx";
import { ImportSeasonWalkthroughHarness } from "./devtools/ImportSeasonWalkthroughHarness.tsx";

function shouldShowImportHarness(): boolean {
  if (!import.meta.env.DEV) return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("harness") === "import";
}

function shouldShowImportSeasonHarness(): boolean {
  if (!import.meta.env.DEV) return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("harness") === "import-season";
}

export function App() {
  const [activeTab, setActiveTab] = useState<ShellTab>("standings");
  const bootstrapWorkspace = useSeasonStore((state) => state.bootstrapWorkspace);
  const activeSeasonId = useSeasonStore((state) => state.activeSeasonId);
  const seasonError = useSeasonStore((state) => state.error);
  const setStatus = useStatusStore((state) => state.setStatus);
  const showImportSeasonHarness = shouldShowImportSeasonHarness();
  const showImportHarness = shouldShowImportHarness();

  useEffect(() => {
    void bootstrapWorkspace();
  }, [bootstrapWorkspace]);

  useEffect(() => {
    if (!seasonError) return;
    setStatus({
      message: seasonError,
      severity: "error",
      source: "season-store",
    });
  }, [seasonError, setStatus]);

  const viewProps = useMemo(
    () => ({
      seasonLabel: seasonLabel(activeSeasonId ?? "-"),
      reviewLabel: reviewOpenCount(0),
    }),
    [activeSeasonId],
  );

  if (showImportSeasonHarness) {
    return <ImportSeasonWalkthroughHarness />;
  }
  if (showImportHarness) {
    return <ImportOrchestrationHarness />;
  }

  const activeView = (() => {
    switch (activeTab) {
      case "standings":
        return <StandingsView {...viewProps} />;
      case "import":
        return <ImportView {...viewProps} />;
      case "history":
        return <HistoryView {...viewProps} />;
      case "season":
        return <SeasonEntryView {...viewProps} />;
      default:
        return null;
    }
  })();

  return (
    <div id="app" className="app-shell">
      <header className="app-shell__header">
        <h1>{STR.shell.appTitle}</h1>
      </header>

      <nav className="app-shell__tabs" role="tablist" aria-label={STR.shell.appTitle}>
        {SHELL_TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            id={`tab-${tab}`}
            type="button"
            aria-selected={activeTab === tab}
            aria-controls={`panel-${tab}`}
            className={`button button--tab ${activeTab === tab ? "is-active" : ""}`}
            onClick={() => {
              setActiveTab(tab);
            }}
          >
            {STR.shell.tabs[tab]}
          </button>
        ))}
      </nav>

      <main
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="app-shell__main"
      >
        {activeView}
      </main>

      <StatusBar />
    </div>
  );
}
