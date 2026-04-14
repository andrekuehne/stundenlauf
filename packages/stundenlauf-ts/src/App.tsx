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

  return (
    <main id="app" style={{ padding: "16px" }}>
      <h1>Stundenlauf TS Harness-Only Build</h1>
      <p>Die produktive TS-Oberflaeche wurde entfernt.</p>
      <p>Verfuegbare Dev-Harnesses:</p>
      <ul>
        <li>?harness=import</li>
        <li>?harness=import-season</li>
        <li>?harness=legacy-layout</li>
      </ul>
    </main>
  );
}
