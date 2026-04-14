import { useEffect, useMemo, useState } from "react";
import { seasonLabel, reviewOpenCount } from "@/format.ts";
import { SHELL_TABS, STR, type ShellTab } from "@/strings.ts";
import { ImportView } from "@/components/import/ImportView.tsx";
import { HistoryView } from "@/components/history/HistoryView.tsx";
import { SeasonEntryView } from "@/components/season/SeasonEntryView.tsx";
import { StandingsView } from "@/components/standings/StandingsView.tsx";
import { StatusBar } from "@/components/shared/StatusBar.tsx";
import { useImportStore } from "@/stores/import.ts";
import { useSeasonStore } from "@/stores/season.ts";
import { useStatusStore } from "@/stores/status.ts";
import { ImportOrchestrationHarness } from "./devtools/ImportOrchestrationHarness.tsx";
import { ImportSeasonWalkthroughHarness } from "./devtools/ImportSeasonWalkthroughHarness.tsx";
import { LegacyLayoutParityPage } from "./devtools/LegacyLayoutParityPage.tsx";

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

function shouldShowLegacyLayoutHarness(): boolean {
  if (!import.meta.env.DEV) return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("harness") === "legacy-layout";
}

export function App() {
  const [activeTab, setActiveTab] = useState<ShellTab>("standings");
  const bootstrapWorkspace = useSeasonStore((state) => state.bootstrapWorkspace);
  const seasons = useSeasonStore((state) => state.seasons);
  const activeSeasonId = useSeasonStore((state) => state.activeSeasonId);
  const seasonError = useSeasonStore((state) => state.error);
  const reviewCount = useImportStore((state) => state.openReviewCount);
  const setStatus = useStatusStore((state) => state.setStatus);
  const showImportSeasonHarness = shouldShowImportSeasonHarness();
  const showImportHarness = shouldShowImportHarness();
  const showLegacyLayoutHarness = shouldShowLegacyLayoutHarness();

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
      seasonLabel: seasonLabel(
        activeSeasonId ? (seasons.find((entry) => entry.season_id === activeSeasonId)?.label ?? activeSeasonId) : "-",
      ),
      reviewLabel: reviewOpenCount(reviewCount),
    }),
    [activeSeasonId, reviewCount, seasons],
  );

  if (showImportSeasonHarness) {
    return <ImportSeasonWalkthroughHarness />;
  }
  if (showImportHarness) {
    return <ImportOrchestrationHarness />;
  }
  if (showLegacyLayoutHarness) {
    return <LegacyLayoutParityPage />;
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
        <div className="header-context">
          <span>{viewProps.seasonLabel}</span>
          <span>{viewProps.reviewLabel}</span>
        </div>
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
            className={`button button--tab ${tab === "season" ? "button--tab-subtle" : ""} ${
              activeTab === tab ? "is-active" : ""
            }`}
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
