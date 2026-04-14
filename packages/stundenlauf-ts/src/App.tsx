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
  const showImportSeasonHarness = shouldShowImportSeasonHarness();
  const showImportHarness = shouldShowImportHarness();
  const showLegacyLayoutHarness = shouldShowLegacyLayoutHarness();

  if (showImportSeasonHarness) {
    return <ImportSeasonWalkthroughHarness />;
  }
  if (showImportHarness) {
    return <ImportOrchestrationHarness />;
  }
  if (showLegacyLayoutHarness) {
    return <LegacyLayoutParityPage />;
  }
  const legacyUrl = `${import.meta.env.BASE_URL}legacy/index.html`;

  return (
    <iframe
      title="Stundenlauf Legacy Frontend"
      src={legacyUrl}
      style={{
        width: "100vw",
        height: "100vh",
        border: "0",
        display: "block",
      }}
    />
  );
}
