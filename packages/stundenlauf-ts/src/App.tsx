import { ImportOrchestrationHarness } from "./devtools/ImportOrchestrationHarness.tsx";

function shouldShowImportHarness(): boolean {
  if (!import.meta.env.DEV) return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("harness") === "import";
}

export function App() {
  if (shouldShowImportHarness()) {
    return <ImportOrchestrationHarness />;
  }

  return <div id="app">Stundenlauf TS</div>;
}
