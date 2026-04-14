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
  if (shouldShowImportSeasonHarness()) {
    return <ImportSeasonWalkthroughHarness />;
  }
  if (shouldShowImportHarness()) {
    return <ImportOrchestrationHarness />;
  }

  return <div id="app">Stundenlauf TS</div>;
}
