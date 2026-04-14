import { useMemo, useState } from "react";
import { seasonLabel, reviewOpenCount } from "@/format.ts";
import { SHELL_TABS, STR, type ShellTab } from "@/strings.ts";
import { ImportView } from "@/components/import/ImportView.tsx";
import { HistoryView } from "@/components/history/HistoryView.tsx";
import { SeasonEntryView } from "@/components/season/SeasonEntryView.tsx";
import { StandingsView } from "@/components/standings/StandingsView.tsx";
import { StatusBar } from "@/components/shared/StatusBar.tsx";
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

  if (shouldShowImportSeasonHarness()) {
    return <ImportSeasonWalkthroughHarness />;
  }
  if (shouldShowImportHarness()) {
    return <ImportOrchestrationHarness />;
  }

  const viewProps = useMemo(
    () => ({
      seasonLabel: seasonLabel("-"),
      reviewLabel: reviewOpenCount(0),
    }),
    [],
  );

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
