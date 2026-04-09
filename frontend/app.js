(function () {
  const state = {
    seriesYear: null,
    categories: [],
    raceHistoryGroups: [],
    selectedCategory: "",
    currentView: "standings",
    reviewQueue: [],
    reviewIndex: 0,
    reviewSelections: {},
  };

  let requestCounter = 0;

  const seasonEntryView = document.getElementById("seasonEntryView");
  const shellView = document.getElementById("shellView");
  const headerContext = document.getElementById("headerContext");
  const seasonLabel = document.getElementById("seasonLabel");
  const reviewLabel = document.getElementById("reviewLabel");
  const globalStatus = document.getElementById("globalStatus");
  const standingsView = document.getElementById("viewStandings");
  const importView = document.getElementById("viewImport");
  const historyView = document.getElementById("viewHistory");

  const tabs = Array.from(document.querySelectorAll(".tab[data-view]"));
  for (const tab of tabs) {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  }
  document.getElementById("switchSeasonBtn").addEventListener("click", showSeasonEntry);

  async function api(method, payload) {
    await waitForBridge();
    requestCounter += 1;
    const request = {
      api_version: "v1",
      request_id: `web_${Date.now()}_${requestCounter}`,
      method,
      payload: payload || {},
    };
    if (window.pywebview && window.pywebview.api && window.pywebview.api.invoke) {
      return window.pywebview.api.invoke(request);
    }
    throw new Error("pywebview bridge nicht verfügbar.");
  }

  async function waitForBridge() {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.invoke) {
      return;
    }
    await waitForPywebviewReadyEvent();
    const maxAttempts = 40;
    for (let i = 0; i < maxAttempts; i += 1) {
      if (window.pywebview && window.pywebview.api && window.pywebview.api.invoke) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async function waitForPywebviewReadyEvent() {
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) {
          return;
        }
        done = true;
        resolve();
      };
      window.addEventListener("pywebviewready", finish, { once: true });
      setTimeout(finish, 1200);
    });
  }

  function setStatus(text, isError) {
    globalStatus.textContent = text || "";
    globalStatus.className = isError ? "status-line danger-text" : "status-line";
  }

  function getApiErrorMessage(error, fallbackMessage) {
    const code = (error && error.code) || "";
    if (code === "IMPORT_DUPLICATE") {
      return "Diese Datei ist bereits aktiv importiert. Bitte nehmen Sie den bisherigen Import zuerst in der Historie zurück.";
    }
    if (code === "REIMPORT_PARTIAL_ROLLBACK_REQUIRED") {
      return "Import abgebrochen: Es wurde nichts importiert. Korrektur nur teilweise zurückgenommen. Bitte zuerst alle noch aktiven Läufe dieser Quelle zurücknehmen und dann erneut importieren.";
    }
    return (error && error.details && error.details.message) || fallbackMessage;
  }

  function renderSeasonEntry(items) {
    const rows = items
      .map(
        (item) =>
          `<tr>
            <td>${item.series_year}</td>
            <td>${item.events_total}</td>
            <td>${item.review_queue_count}</td>
            <td>${item.latest_imported_at || "-"}</td>
            <td><button class="secondary" data-open-year="${item.series_year}">Saison öffnen</button></td>
          </tr>`
      )
      .join("");
    seasonEntryView.innerHTML = `
      <h2>Saison öffnen oder neu anlegen</h2>
      <p class="hint">Wählen Sie eine vorhandene Saison oder legen Sie eine neue Saison an.</p>
      <div class="grid-2">
        <div class="card">
          <h3>Bestehende Saison öffnen</h3>
          ${
            items.length === 0
              ? `<p class="hint">Noch keine Saison vorhanden.</p>`
              : `<div class="table-wrap"><table><thead><tr><th>Jahr</th><th>Läufe</th><th>Prüfungen offen</th><th>Letzter Import</th><th>Aktion</th></tr></thead><tbody>${rows}</tbody></table></div>`
          }
        </div>
        <div class="card">
          <h3>Neue Saison anlegen</h3>
          <p class="hint">Legen Sie eine Saison an und starten Sie mit dem ersten Import.</p>
          <div class="row">
            <label for="newYearInput">Jahr</label>
            <input id="newYearInput" type="number" placeholder="Beispiel: 2026" />
          </div>
          <div class="row">
            <label for="newNameInput">Bezeichnung (optional)</label>
            <input id="newNameInput" type="text" placeholder="z. B. Stundenlauf 2026" />
          </div>
          <div class="row">
            <button id="createSeasonBtn" class="primary">Neue Saison erstellen</button>
          </div>
        </div>
      </div>
    `;

    for (const button of seasonEntryView.querySelectorAll("button[data-open-year]")) {
      button.addEventListener("click", async () => {
        const year = Number(button.getAttribute("data-open-year"));
        await openSeason(year);
      });
    }
    document.getElementById("createSeasonBtn").addEventListener("click", async () => {
      const yearInput = document.getElementById("newYearInput");
      const nameInput = document.getElementById("newNameInput");
      const year = Number(yearInput.value);
      if (!Number.isInteger(year)) {
        setStatus("Bitte geben Sie ein gültiges Jahr ein.", true);
        return;
      }
      const created = await api("create_series_year", { series_year: year, display_name: nameInput.value });
      if (created.status === "error") {
        setStatus(created.error.details.message || "Saison konnte nicht angelegt werden.", true);
        return;
      }
      setStatus("Saison wurde angelegt. Sie können jetzt den ersten Lauf importieren.");
      await openSeason(year);
      switchView("import");
    });
  }

  async function showSeasonEntry() {
    shellView.classList.add("hidden");
    seasonEntryView.classList.remove("hidden");
    headerContext.classList.add("hidden");
    seasonEntryView.innerHTML = `
      <h2>Saison öffnen oder neu anlegen</h2>
      <p class="hint">Lädt...</p>
    `;
    try {
      const response = await api("list_series_years", {});
      if (response.status === "error") {
        seasonEntryView.innerHTML = `
          <h2>Saison öffnen oder neu anlegen</h2>
          <p class="danger-text">Saisonliste konnte nicht geladen werden.</p>
          <p class="hint">Bitte starten Sie die Anwendung neu.</p>
        `;
        setStatus("Saisonliste konnte nicht geladen werden.", true);
        return;
      }
      renderSeasonEntry(response.payload.items || []);
    } catch (error) {
      seasonEntryView.innerHTML = `
        <h2>Saison öffnen oder neu anlegen</h2>
        <p class="danger-text">Verbindung zur Desktop-API ist noch nicht bereit.</p>
        <p class="hint">Bitte warten Sie kurz oder starten Sie die Anwendung neu.</p>
      `;
      setStatus(error.message || "Desktop-API nicht verfügbar.", true);
    }
  }

  async function openSeason(year) {
    const opened = await api("open_series_year", { series_year: year });
    if (opened.status === "error") {
      setStatus("Saison konnte nicht geöffnet werden.", true);
      return;
    }
    const seasonChanged = state.seriesYear !== year;
    state.seriesYear = year;
    if (seasonChanged) {
      state.selectedCategory = "";
    }
    seasonLabel.textContent = `Saison: ${year}`;
    await loadOverview();
    seasonEntryView.classList.add("hidden");
    shellView.classList.remove("hidden");
    headerContext.classList.remove("hidden");
    switchView("standings");
  }

  async function loadOverview() {
    const response = await api("get_year_overview", { series_year: state.seriesYear });
    if (response.status === "error") {
      setStatus("Übersicht konnte nicht geladen werden.", true);
      return;
    }
    state.categories = response.payload.categories || [];
    state.raceHistoryGroups = response.payload.race_history_groups || [];
    if (!state.categories.some((category) => category.category_key === state.selectedCategory)) {
      state.selectedCategory = state.categories[0] ? state.categories[0].category_key : "";
    }
    reviewLabel.textContent = `Prüfungen offen: ${response.payload.totals.review_queue}`;
    await Promise.all([renderStandingsView(), renderImportView(), renderHistoryView()]);
  }

  function raceListLabel(raceNumbers) {
    if (!raceNumbers.length) {
      return "Keine";
    }
    return raceNumbers.map((raceNo) => `${raceNo}. Lauf`).join(", ");
  }

  function durationSortKey(duration) {
    const normalized = String(duration || "").toLowerCase();
    if (normalized.includes("half")) {
      return 0;
    }
    if (normalized.includes("hour")) {
      return 1;
    }
    return 9;
  }

  function normalizeDivision(division) {
    return String(division || "").toLowerCase();
  }

  function buildCategoryQuickSelectModel() {
    const categoriesByKey = new Map(state.categories.map((category) => [category.category_key, category]));
    const slots = {
      einzel: [
        { key: "half_men", label: "1/2 h - M", match: (category) => durationSortKey(category.duration) === 0 && normalizeDivision(category.division) === "men" },
        { key: "half_women", label: "1/2 h - F", match: (category) => durationSortKey(category.duration) === 0 && normalizeDivision(category.division) === "women" },
        { key: "hour_men", label: "1 h - M", match: (category) => durationSortKey(category.duration) === 1 && normalizeDivision(category.division) === "men" },
        { key: "hour_women", label: "1 h - F", match: (category) => durationSortKey(category.duration) === 1 && normalizeDivision(category.division) === "women" },
      ],
      paare: [
        {
          key: "half_couples_men",
          label: "1/2 h - M",
          match: (category) => durationSortKey(category.duration) === 0 && normalizeDivision(category.division) === "couples_men",
        },
        {
          key: "half_couples_women",
          label: "1/2 h - F",
          match: (category) => durationSortKey(category.duration) === 0 && normalizeDivision(category.division) === "couples_women",
        },
        {
          key: "half_couples_mixed",
          label: "1/2 h - Mix",
          match: (category) => durationSortKey(category.duration) === 0 && normalizeDivision(category.division) === "couples_mixed",
        },
        {
          key: "hour_couples_men",
          label: "1 h - M",
          match: (category) => durationSortKey(category.duration) === 1 && normalizeDivision(category.division) === "couples_men",
        },
        {
          key: "hour_couples_women",
          label: "1 h - F",
          match: (category) => durationSortKey(category.duration) === 1 && normalizeDivision(category.division) === "couples_women",
        },
        {
          key: "hour_couples_mixed",
          label: "1 h - Mix",
          match: (category) => durationSortKey(category.duration) === 1 && normalizeDivision(category.division) === "couples_mixed",
        },
      ],
    };

    for (const groupKey of ["einzel", "paare"]) {
      for (const slot of slots[groupKey]) {
        const match = state.categories.find((category) => slot.match(category));
        slot.categoryKey = match ? match.category_key : "";
        slot.categoryLabel = match ? match.category_label : "";
        slot.isActive = match ? match.category_key === state.selectedCategory : false;
        slot.disabled = !match;
      }
    }

    const selectedCategory = categoriesByKey.get(state.selectedCategory);
    return {
      slots,
      selectedCategoryLabel: selectedCategory ? selectedCategory.category_label : "",
    };
  }

  function buildImportedRaceInfo() {
    const categoryByKey = new Map(state.categories.map((category) => [category.category_key, category]));
    const singlesRaceNumbers = new Set();
    const couplesRaceNumbers = new Set();
    const byCategory = [];
    for (const group of state.raceHistoryGroups) {
      const category = categoryByKey.get(group.category_key);
      const activeEvents = (group.events || []).filter((event) => {
        const raceNo = Number(event.race_no);
        return Number.isInteger(raceNo) && raceNo > 0;
      });
      const raceNumbers = [...new Set(activeEvents.map((event) => Number(event.race_no)))].sort((a, b) => a - b);
      if (raceNumbers.length === 0) {
        continue;
      }
      const isCouples = Boolean(category && String(category.division).startsWith("couples_"));
      for (const raceNo of raceNumbers) {
        if (isCouples) {
          couplesRaceNumbers.add(raceNo);
        } else {
          singlesRaceNumbers.add(raceNo);
        }
      }
      byCategory.push({
        label: group.category_label,
        raceNumbers,
      });
    }
    byCategory.sort((a, b) => a.label.localeCompare(b.label, "de"));
    return {
      singlesRaceNumbers: [...singlesRaceNumbers].sort((a, b) => a - b),
      couplesRaceNumbers: [...couplesRaceNumbers].sort((a, b) => a - b),
      byCategory,
    };
  }

  function switchView(viewName) {
    state.currentView = viewName;
    standingsView.classList.toggle("hidden", viewName !== "standings");
    importView.classList.toggle("hidden", viewName !== "import");
    historyView.classList.toggle("hidden", viewName !== "history");
    for (const tab of tabs) {
      tab.classList.toggle("active", tab.dataset.view === viewName);
    }
  }

  async function renderStandingsView() {
    const importedRaceInfo = buildImportedRaceInfo();
    const quickSelectModel = buildCategoryQuickSelectModel();
    const renderQuickGrid = (groupKey) =>
      quickSelectModel.slots[groupKey]
        .map((slot) => {
          const activeClass = slot.isActive ? " active" : "";
          return `<button class="category-quick-btn${activeClass}" data-category-btn="${slot.categoryKey}" ${slot.disabled ? "disabled" : ""} title="${
            slot.categoryLabel || "Nicht verfügbar"
          }">${slot.label}</button>`;
        })
        .join("");

    if (!state.selectedCategory) {
      standingsView.innerHTML = `
        <div class="standings-layout">
          <aside class="card standings-sidebar">
            <button id="goToImportBtn" class="primary sidebar-top-action">Lauf hinzufügen</button>
            <div class="sidebar-section">
              <h3>Importierte Läufe</h3>
              <p class="hint"><strong>Einzel:</strong> ${raceListLabel(importedRaceInfo.singlesRaceNumbers)}</p>
              <p class="hint"><strong>Paare:</strong> ${raceListLabel(importedRaceInfo.couplesRaceNumbers)}</p>
            </div>
            <div class="sidebar-section">
              <h3>Einzel</h3>
              <div class="category-grid">${renderQuickGrid("einzel")}</div>
            </div>
            <div class="sidebar-section">
              <h3>Paare</h3>
              <div class="category-grid">${renderQuickGrid("paare")}</div>
            </div>
          </aside>
          <div class="standings-content">
            <div class="card"><h2>Aktuelle Wertung</h2><p class="hint">Noch keine Ergebnisse vorhanden.</p></div>
          </div>
        </div>
      `;
      document.getElementById("goToImportBtn").addEventListener("click", () => switchView("import"));
      for (const button of standingsView.querySelectorAll("button[data-category-btn]")) {
        button.addEventListener("click", async () => {
          const categoryKey = button.getAttribute("data-category-btn");
          if (!categoryKey) {
            return;
          }
          state.selectedCategory = categoryKey;
          await renderStandingsView();
        });
      }
      return;
    }

    const standingsResponse = await api("get_standings", { category_key: state.selectedCategory });
    const resultsResponse = await api("get_category_current_results_table", { category_key: state.selectedCategory });
    if (standingsResponse.status === "error" || resultsResponse.status === "error") {
      standingsView.innerHTML = `<div class="card"><p class="danger-text">Wertung konnte nicht geladen werden.</p></div>`;
      return;
    }

    const standingsRows = (standingsResponse.payload.rows || [])
      .map(
        (row) =>
          `<tr><td>${row.platz}</td><td>${row.display_name}</td><td>${row.yob || "-"}</td><td>${row.club || "-"}</td><td>${row.distanz_gesamt}</td><td>${row.punkte_gesamt}</td></tr>`
      )
      .join("");

    const resultHeaders = (resultsResponse.payload.meta.race_headers || []).map((item) => `<th>${item}</th>`).join("");
    const resultRows = (resultsResponse.payload.rows || [])
      .map((row) => {
        const cells = row.race_cells
          .map((cell) => {
            if (cell.distance_km == null) {
              return "<td>—</td>";
            }
            return `<td>${cell.distance_km} km / ${cell.points} P</td>`;
          })
          .join("");
        return `<tr><td>${row.platz}</td><td>${row.display_name}</td>${cells}<td>${row.distanz_gesamt}</td><td>${row.punkte_gesamt}</td></tr>`;
      })
      .join("");
    standingsView.innerHTML = `
      <div class="standings-layout">
        <aside class="card standings-sidebar">
          <button id="goToImportBtn" class="primary sidebar-top-action">Lauf hinzufügen</button>
          <div class="sidebar-section">
            <h3>Importierte Läufe</h3>
            <p class="hint"><strong>Einzel:</strong> ${raceListLabel(importedRaceInfo.singlesRaceNumbers)}</p>
            <p class="hint"><strong>Paare:</strong> ${raceListLabel(importedRaceInfo.couplesRaceNumbers)}</p>
          </div>
          <div class="sidebar-section">
            <h3>Einzel</h3>
            <div class="category-grid">${renderQuickGrid("einzel")}</div>
          </div>
          <div class="sidebar-section">
            <h3>Paare</h3>
            <div class="category-grid">${renderQuickGrid("paare")}</div>
          </div>
        </aside>
        <div class="standings-content">
          <div class="card">
            <h2>Aktuelle Wertung</h2>
            <p class="hint">Ausgewählte Kategorie: ${quickSelectModel.selectedCategoryLabel || "-"}</p>
            <p class="hint">Die Gesamtwertung basiert auf den importierten Läufen und dem aktuellen Regelwerk.</p>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Platz</th><th>Name</th><th>Jahrgang</th><th>Verein</th><th>Gesamtdistanz (km)</th><th>Gesamtpunkte</th></tr></thead>
                <tbody>${standingsRows || `<tr><td colspan="6">Noch keine Ergebnisse vorhanden</td></tr>`}</tbody>
              </table>
            </div>
          </div>
          <div class="card">
            <h3>Laufübersicht je Kategorie</h3>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Platz</th><th>Name</th>${resultHeaders}<th>Gesamtdistanz</th><th>Gesamtpunkte</th></tr></thead>
                <tbody>${resultRows || `<tr><td colspan="5">Noch keine Laufdaten vorhanden</td></tr>`}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
    document.getElementById("goToImportBtn").addEventListener("click", () => switchView("import"));
    for (const button of standingsView.querySelectorAll("button[data-category-btn]")) {
      button.addEventListener("click", async () => {
        const categoryKey = button.getAttribute("data-category-btn");
        if (!categoryKey) {
          return;
        }
        state.selectedCategory = categoryKey;
        await renderStandingsView();
      });
    }
  }

  function formatEntityPreview(preview) {
    if (!preview) {
      return "Unbekannt";
    }
    const parts = [preview.display_name || "Unbekannt"];
    if (preview.yob) {
      parts.push(`Jg. ${preview.yob}`);
    }
    if (preview.club) {
      parts.push(preview.club);
    }
    return parts.join(" | ");
  }

  function getDefaultCandidateUid(review) {
    const candidateUids = review.candidate_uids || [];
    if (!candidateUids.length) {
      return "";
    }
    if (review.top_candidate_uid && candidateUids.includes(review.top_candidate_uid)) {
      return review.top_candidate_uid;
    }
    return candidateUids[0];
  }

  function confidenceLabel(confidence) {
    const value = Number(confidence || 0);
    if (value >= 0.85) {
      return "hoch";
    }
    if (value >= 0.65) {
      return "mittel";
    }
    return "niedrig";
  }

  function reviewSelectionKey(review) {
    return `${review.race_event_uid}::${review.entry_uid}`;
  }

  function displayDistance(distanceKm) {
    if (distanceKm == null) {
      return "-";
    }
    return `${distanceKm} km`;
  }

  function renderIncomingTableRow(preview, resultPreview, startnr) {
    return `<tr class="incoming-row">
      <td>${preview?.display_name || "Unbekannt"}</td>
      <td>${preview?.yob || "-"}</td>
      <td>${preview?.club || "-"}</td>
      <td>${startnr || "-"}</td>
      <td>${displayDistance(resultPreview?.distance_km)}</td>
      <td>${resultPreview?.points ?? "-"}</td>
    </tr>`;
  }

  function renderCandidateTableRows(review, selectedCandidateUid) {
    const previewByUid = new Map((review.candidate_previews || []).filter(Boolean).map((item) => [item.uid, item]));
    const candidateUids = review.candidate_uids || [];
    if (!candidateUids.length) {
      return `<tr><td colspan="6">Keine Kandidaten vorhanden</td></tr>`;
    }
    return candidateUids
      .map((candidateUid, index) => {
        const preview = previewByUid.get(candidateUid);
        const rank = index + 1;
        const selectedClass = selectedCandidateUid === candidateUid ? " selected-candidate-row" : "";
        const selectedText = selectedCandidateUid === candidateUid ? " (ausgewählt)" : "";
        return `<tr class="candidate-row${selectedClass}" data-candidate-row="${candidateUid}">
          <td>${rank}${selectedText}</td>
          <td>${preview?.display_name || "Unbekannt"}</td>
          <td>${preview?.yob || "-"}</td>
          <td>${preview?.club || "-"}</td>
          <td>${confidenceLabel(review.confidence)}</td>
          <td><button class="secondary select-candidate-btn" data-candidate-uid="${candidateUid}">Diesen wählen</button></td>
        </tr>`;
      })
      .join("");
  }

  async function renderImportView() {
    if (!state.seriesYear) {
      return;
    }
    const queueResponse = await api("get_review_queue", {});
    if (queueResponse.status === "ok") {
      state.reviewQueue = queueResponse.payload.items || [];
      state.reviewIndex = Math.min(state.reviewIndex, Math.max(state.reviewQueue.length - 1, 0));
    }
    const review = state.reviewQueue[state.reviewIndex];
    importView.innerHTML = `
      <div class="card">
        <h2>Lauf hinzufügen</h2>
        <p class="hint">Bitte wählen Sie die Ergebnisdatei des aktuellen Laufs aus.</p>
        <div class="row">
          <label for="filePathInput">Ergebnisdatei</label>
          <input id="filePathInput" type="text" placeholder="Bitte Datei auswählen..." />
          <button id="pickFileBtn" class="secondary">Datei auswählen</button>
        </div>
        <div class="row">
          <label for="sourceTypeSelect">Lauftyp</label>
          <select id="sourceTypeSelect">
            <option value="">Automatisch erkennen</option>
            <option value="singles">Einzel</option>
            <option value="couples">Paare</option>
          </select>
        </div>
        <div class="row"><button id="importRaceBtn" class="primary">Lauf importieren</button></div>
      </div>
      <div class="card">
        <h3>Zusammenführungen prüfen</h3>
        ${
          !review
            ? `<p class="ok">Keine offenen Prüfungen.</p>`
            : `<p>Prüfung ${state.reviewIndex + 1} von ${state.reviewQueue.length}</p>
               <p class="hint">Links sehen Sie den neu eingehenden Eintrag. Rechts sehen Sie nur bereits vorhandene Personen/Teams aus der Datenbasis.</p>
               <p class="hint">Wenn rechts niemand dieselbe reale Person/dasselbe reale Team ist, wählen Sie unten "Keine passt: neue Person anlegen".</p>
               <p class="hint">Treffersicherheit: <strong>${confidenceLabel(review.confidence)}</strong> (${Math.round(
                (review.confidence || 0) * 100
              )}%).</p>
               <div class="merge-review-layout">
                 <section class="merge-review-column">
                   <h4>Neuer eingehender Eintrag</h4>
                   <div class="table-wrap">
                     <table>
                       <thead><tr><th>Name</th><th>Jahrgang</th><th>Verein</th><th>Startnr.</th><th>Distanz</th><th>Punkte</th></tr></thead>
                       <tbody>${renderIncomingTableRow(review.entry_preview, review.result_preview, review.startnr)}</tbody>
                     </table>
                   </div>
                 </section>
                 <section class="merge-review-column">
                   <h4>Mögliche Treffer (beste Übereinstimmung zuerst)</h4>
                   <div class="table-wrap">
                     <table>
                       <thead><tr><th>Rang</th><th>Name</th><th>Jahrgang</th><th>Verein</th><th>Treffer</th><th>Aktion</th></tr></thead>
                       <tbody>${renderCandidateTableRows(
                         review,
                         state.reviewSelections[reviewSelectionKey(review)] || getDefaultCandidateUid(review)
                       )}</tbody>
                     </table>
                   </div>
                 </section>
               </div>
               <p class="hint">Auswahl rechts verknüpft mit bestehender Person/Team; "neue Person anlegen" erstellt bewusst einen zusätzlichen Datensatz.</p>
               <div class="row merge-actions-row">
                 <button id="acceptReviewBtn" class="primary">Mit ausgewählter Person/Team zusammenführen</button>
                 <button id="newIdentityReviewBtn" class="secondary">Keine passt: neue Person anlegen</button>
                 <button id="skipReviewBtn" class="secondary">Überspringen</button>
               </div>`
        }
      </div>
    `;
    document.getElementById("importRaceBtn").addEventListener("click", async () => {
      const filePath = document.getElementById("filePathInput").value.trim();
      const sourceType = document.getElementById("sourceTypeSelect").value || undefined;
      if (!filePath) {
        setStatus("Bitte wählen Sie eine Datei aus.", true);
        return;
      }
      setStatus("Import läuft...");
      const response = await api("import_race", {
        file_path: filePath,
        series_year: state.seriesYear,
        source_type: sourceType,
      });
      if (response.status === "error") {
        setStatus(getApiErrorMessage(response.error, "Import konnte nicht abgeschlossen werden."), true);
        return;
      }
      setStatus("Import abgeschlossen. Bitte prüfen Sie offene Zuordnungen.");
      await loadOverview();
      await renderImportView();
    });
    document.getElementById("pickFileBtn").addEventListener("click", async () => {
      const picked = await api("pick_file", {});
      if (picked.status !== "ok") {
        setStatus("Dateiauswahl konnte nicht geöffnet werden.", true);
        return;
      }
      const filePath = (picked.payload && picked.payload.file_path ? picked.payload.file_path : "").trim();
      if (filePath) {
        document.getElementById("filePathInput").value = filePath;
      }
    });
    if (review) {
      const reviewKey = reviewSelectionKey(review);
      if (!state.reviewSelections[reviewKey]) {
        state.reviewSelections[reviewKey] = getDefaultCandidateUid(review);
      }
      for (const button of importView.querySelectorAll("button[data-candidate-uid]")) {
        button.addEventListener("click", async () => {
          const candidateUid = button.getAttribute("data-candidate-uid") || "";
          if (!candidateUid) {
            return;
          }
          state.reviewSelections[reviewKey] = candidateUid;
          await renderImportView();
        });
      }
      document.getElementById("skipReviewBtn").addEventListener("click", async () => {
        state.reviewIndex = Math.min(state.reviewIndex + 1, state.reviewQueue.length - 1);
        await renderImportView();
      });
      document.getElementById("acceptReviewBtn").addEventListener("click", async () => {
        const target = state.reviewSelections[reviewKey] || getDefaultCandidateUid(review);
        if (!target) {
          setStatus("Für diesen Eintrag ist kein Kandidat verfügbar.", true);
          return;
        }
        const response = await api("apply_match_decision", {
          race_event_uid: review.race_event_uid,
          entry_uid: review.entry_uid,
          target_participant_uid: target,
          rationale: "manual review accept",
        });
        if (response.status === "error") {
          setStatus("Zusammenführung konnte nicht gespeichert werden.", true);
          return;
        }
        setStatus("Zusammenführung wurde übernommen.");
        delete state.reviewSelections[reviewKey];
        state.reviewIndex = 0;
        await loadOverview();
        await renderImportView();
      });
      document.getElementById("newIdentityReviewBtn").addEventListener("click", async () => {
        const response = await api("apply_match_decision", {
          race_event_uid: review.race_event_uid,
          entry_uid: review.entry_uid,
          decision_action: "create_new_identity",
          rationale: "manual review create new",
        });
        if (response.status === "error") {
          setStatus(response.error.details.message || "Neue Person konnte nicht angelegt werden.", true);
          return;
        }
        setStatus("Eintrag wurde als neue Person angelegt.");
        delete state.reviewSelections[reviewKey];
        state.reviewIndex = 0;
        await loadOverview();
        await renderImportView();
      });
    }
  }

  async function renderHistoryView() {
    if (!state.seriesYear) {
      return;
    }
    const timelineResponse = await api("get_year_timeline", { series_year: state.seriesYear });
    if (timelineResponse.status === "error") {
      historyView.innerHTML = `<div class="card"><p class="danger-text">Historie konnte nicht geladen werden.</p></div>`;
      return;
    }
    const rows = (timelineResponse.payload.items || [])
      .map((item) => {
        const rollbackAction =
          item.event_type === "race_import"
            ? `<button class="danger" data-rollback="${item.race_event_uid}">Lauf zurücknehmen</button>`
            : "";
        return `<tr>
          <td>${item.event_type}</td>
          <td>${item.timestamp || "-"}</td>
          <td>${item.race_event_uid || "-"}</td>
          <td>${item.category_key || "-"}</td>
          <td>${rollbackAction}</td>
        </tr>`;
      })
      .join("");
    historyView.innerHTML = `
      <div class="card">
        <h2>Historie & Korrektur</h2>
        <p class="hint">Alle Änderungen werden protokolliert.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Ereignis</th><th>Zeitpunkt</th><th>Lauf-ID</th><th>Kategorie</th><th>Aktion</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="5">Noch keine Historie vorhanden</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `;
    for (const button of historyView.querySelectorAll("button[data-rollback]")) {
      button.addEventListener("click", async () => {
        const eventUid = button.getAttribute("data-rollback");
        const confirmed = window.confirm(
          "Die Ergebnisse dieses Laufs werden aus der Wertung entfernt und anschließend neu berechnet."
        );
        if (!confirmed) {
          return;
        }
        const response = await api("rollback_race", { race_event_uid: eventUid, reason: "ui.history.rollback" });
        if (response.status === "error") {
          setStatus(getApiErrorMessage(response.error, "Lauf konnte nicht zurückgenommen werden."), true);
          return;
        }
        setStatus("Lauf wurde zurückgenommen.");
        await loadOverview();
      });
    }
  }

  showSeasonEntry().catch((error) => {
    setStatus(error.message || "Anwendung konnte nicht gestartet werden.", true);
  });
})();
