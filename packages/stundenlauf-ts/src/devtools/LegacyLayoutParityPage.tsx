import { useState } from "react";
import { STR } from "@/strings.ts";

type LegacyView = "standings" | "import" | "history";

export function LegacyLayoutParityPage() {
  const [activeView, setActiveView] = useState<LegacyView>("standings");

  return (
    <div id="legacyParityRoot" className="legacy-parity">
      <header className="legacy-parity__app-header">
        <h1>{STR.shell.appTitle}</h1>
        <div className="legacy-parity__header-context">
          <span>{STR.shell.seasonLabelPlaceholder}</span>
          <span>{STR.shell.reviewLabelPlaceholder}</span>
        </div>
      </header>

      <main className="legacy-parity__app-main">
        <section id="legacySeasonEntryView" className="legacy-parity__card legacy-parity__season-entry">
          <h2>Saison öffnen oder neu anlegen</h2>
          <p>
            Dieser Bereich dient als statischer Layout-Referenzblock für die Legacy-Parität und
            enthält noch keine Live-Daten.
          </p>
          <div className="legacy-parity__table-wrap">
            <table className="legacy-parity__table">
              <thead>
                <tr>
                  <th>Jahr</th>
                  <th>Prüfungen offen</th>
                  <th>Letzter Import</th>
                  <th>Läufe enthalten</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>2026</td>
                  <td>0</td>
                  <td>—</td>
                  <td>Einzel/Paare</td>
                  <td>
                    <button type="button" className="legacy-parity__button legacy-parity__button-secondary">
                      Öffnen
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="legacyShellView" className="legacy-parity__shell-view">
          <nav className="legacy-parity__tabs">
            <button
              type="button"
              className={`legacy-parity__tab ${activeView === "standings" ? "is-active" : ""}`}
              onClick={() => {
                setActiveView("standings");
              }}
            >
              {STR.shell.tabs.standings}
            </button>
            <button
              type="button"
              className={`legacy-parity__tab ${activeView === "import" ? "is-active" : ""}`}
              onClick={() => {
                setActiveView("import");
              }}
            >
              {STR.shell.tabs.import}
            </button>
            <button
              type="button"
              className={`legacy-parity__tab ${activeView === "history" ? "is-active" : ""}`}
              onClick={() => {
                setActiveView("history");
              }}
            >
              {STR.shell.tabs.history}
            </button>
            <button type="button" className="legacy-parity__tab legacy-parity__tab-subtle">
              {STR.shell.tabs.season}
            </button>
          </nav>

          <section id="legacyGlobalStatus" className="legacy-parity__status-line">
            Status: Bereit
          </section>

          <section
            id="legacyViewStandings"
            className={`legacy-parity__view ${activeView === "standings" ? "" : "is-hidden"}`}
          >
            <div className="legacy-parity__card">
              <h2>Aktuelle Wertung</h2>
              <p>Layout-Referenz mit Tabelle, Scrollcontainern und typischer Feldbreite.</p>
              <div className="legacy-parity__table-wrap">
                <table className="legacy-parity__table">
                  <thead>
                    <tr>
                      <th>Platz</th>
                      <th>Name</th>
                      <th>Verein</th>
                      <th>Gesamtdistanz (km)</th>
                      <th>Gesamtpunkte</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>1</td>
                      <td>Max Mustermann</td>
                      <td>HSG Triathlon</td>
                      <td>48,123</td>
                      <td>75</td>
                    </tr>
                    <tr>
                      <td>2</td>
                      <td>Erika Musterfrau</td>
                      <td>Greifswald Laufteam</td>
                      <td>45,678</td>
                      <td>71</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section
            id="legacyViewImport"
            className={`legacy-parity__view ${activeView === "import" ? "" : "is-hidden"}`}
          >
            <div className="legacy-parity__card legacy-parity__import-view-layout">
              <div className="legacy-parity__import-controls-column">
                <h2>Lauf Importieren</h2>
                <div className="legacy-parity__form-row">
                  <label>Datei</label>
                  <input type="text" readOnly value="Keine Datei" />
                </div>
                <div className="legacy-parity__form-row">
                  <label>Lauftyp</label>
                  <div className="legacy-parity__toggle-grid">
                    <button type="button" className="legacy-parity__button legacy-parity__button-secondary">
                      Einzel
                    </button>
                    <button type="button" className="legacy-parity__button legacy-parity__button-secondary">
                      Paare
                    </button>
                  </div>
                </div>
                <button type="button" className="legacy-parity__button legacy-parity__button-primary">
                  Lauf importieren
                </button>
              </div>
              <div className="legacy-parity__import-review-column">
                <h3>Zusammenführungen prüfen</h3>
                <p>Statischer Platzhalter für Prüflistenbereich und differenzierte Tabellenbreiten.</p>
                <div className="legacy-parity__table-wrap">
                  <table className="legacy-parity__table">
                    <thead>
                      <tr>
                        <th>Rang</th>
                        <th>Name</th>
                        <th>Verein</th>
                        <th>Treffer %</th>
                        <th>Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Neu</td>
                        <td>Maria Beispiel</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                      </tr>
                      <tr>
                        <td>1</td>
                        <td>Maria B.</td>
                        <td>Laufgruppe Nord</td>
                        <td>88</td>
                        <td>☐</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          <section
            id="legacyViewHistory"
            className={`legacy-parity__view ${activeView === "history" ? "" : "is-hidden"}`}
          >
            <div className="legacy-parity__card">
              <h2>Historie & Korrektur</h2>
              <p>Statischer Platzhalter für Import-Historie und Audit-Protokoll mit Scrollcontainern.</p>
              <div className="legacy-parity__table-wrap">
                <table className="legacy-parity__table">
                  <thead>
                    <tr>
                      <th>Ereignis</th>
                      <th>Zeitpunkt</th>
                      <th>Quelldatei</th>
                      <th>Läufe</th>
                      <th>Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Datei-Import</td>
                      <td>2026-04-14 17:35</td>
                      <td>Ergebnisliste MW_2.xlsx</td>
                      <td>2</td>
                      <td>
                        <button type="button" className="legacy-parity__button legacy-parity__button-secondary">
                          Datei zurücknehmen
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
