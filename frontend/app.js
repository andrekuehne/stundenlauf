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
    matchingConfig: {
      auto_min: 1.0,
      auto_merge_enabled: false,
      perfect_match_auto_merge: true,
    },
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

  function clampAutoMin(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return state.matchingConfig.auto_min;
    }
    return Math.min(1.0, Math.max(0.0, numeric));
  }

  async function loadMatchingConfig() {
    const response = await api("get_matching_config", {});
    if (response.status !== "ok") {
      return;
    }
    state.matchingConfig = {
      auto_min: Number(response.payload.auto_min || 1.0),
      auto_merge_enabled: Boolean(response.payload.auto_merge_enabled),
      perfect_match_auto_merge: Boolean(response.payload.perfect_match_auto_merge),
    };
  }

  async function saveMatchingConfig(autoMin, autoMergeEnabled, perfectMatchAutoMerge) {
    const response = await api("set_matching_config", {
      auto_min: autoMin,
      auto_merge_enabled: autoMergeEnabled,
      perfect_match_auto_merge: perfectMatchAutoMerge,
    });
    if (response.status !== "ok") {
      setStatus("Matching-Einstellungen konnten nicht gespeichert werden.", true);
      return false;
    }
    state.matchingConfig = {
      auto_min: Number(response.payload.auto_min || autoMin),
      auto_merge_enabled: Boolean(response.payload.auto_merge_enabled),
      perfect_match_auto_merge: Boolean(response.payload.perfect_match_auto_merge),
    };
    return true;
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
            <td>
              <div class="row">
                <button class="secondary" data-open-year="${item.series_year}">Saison öffnen</button>
                <button class="danger" data-delete-year="${item.series_year}" title="Saison löschen">🗑 Saison löschen</button>
              </div>
            </td>
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
    for (const button of seasonEntryView.querySelectorAll("button[data-delete-year]")) {
      button.addEventListener("click", async () => {
        const year = Number(button.getAttribute("data-delete-year"));
        const warningAccepted = window.confirm(
          `Achtung: Die Saison ${year} wird dauerhaft gelöscht.\n` +
            "Alle Läufe, Prüfdaten und Wertungen dieser Saison gehen verloren.\n\n" +
            "Möchten Sie fortfahren?"
        );
        if (!warningAccepted) {
          return;
        }
        const typed = window.prompt(
          `Sicherheitsabfrage: Bitte geben Sie ${year} ein, um die Löschung zu bestätigen.`,
          ""
        );
        if (typed === null) {
          return;
        }
        const confirmedYear = Number(String(typed).trim());
        if (!Number.isInteger(confirmedYear) || confirmedYear !== year) {
          setStatus(`Löschung abgebrochen: Die Eingabe muss exakt ${year} sein.`, true);
          return;
        }
        const deleted = await api("delete_series_year", {
          series_year: year,
          confirm_series_year: confirmedYear,
        });
        if (deleted.status === "error") {
          setStatus(deleted.error.details.message || "Saison konnte nicht gelöscht werden.", true);
          return;
        }
        setStatus(`Saison ${year} wurde gelöscht.`);
        await showSeasonEntry();
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
    await loadMatchingConfig();
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
    const singlesRaceList = [...singlesRaceNumbers].sort((a, b) => a - b);
    const couplesRaceList = [...couplesRaceNumbers].sort((a, b) => a - b);
    const maxRaceNo = Math.max(
      0,
      ...singlesRaceList,
      ...couplesRaceList
    );
    const columnMax = Math.max(5, maxRaceNo);
    const raceColumns = Array.from({ length: columnMax }, (_, index) => index + 1);
    return {
      singlesRaceNumbers: singlesRaceList,
      couplesRaceNumbers: couplesRaceList,
      byCategory,
      raceColumns,
      matrixRows: [
        { label: "Einzel", raceNumbers: singlesRaceList },
        { label: "Paare", raceNumbers: couplesRaceList },
      ],
    };
  }

  function renderImportedRunsMatrix(importedRaceInfo) {
    const headers = importedRaceInfo.raceColumns.map((raceNo) => `<th>${raceNo}</th>`).join("");
    const rows = importedRaceInfo.matrixRows
      .map((row) => {
        const raceNumberSet = new Set(row.raceNumbers || []);
        const cells = importedRaceInfo.raceColumns
          .map((raceNo) => `<td class="imported-runs-matrix-cell">${raceNumberSet.has(raceNo) ? "x" : "—"}</td>`)
          .join("");
        return `<tr><th scope="row">${row.label}</th>${cells}</tr>`;
      })
      .join("");
    return `
      <div class="imported-runs-matrix-wrap">
        <table class="imported-runs-matrix">
          <thead><tr><th>Lauf</th>${headers}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
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
              ${renderImportedRunsMatrix(importedRaceInfo)}
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
            ${renderImportedRunsMatrix(importedRaceInfo)}
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
    const importedRaceInfo = buildImportedRaceInfo();
    const queueResponse = await api("get_review_queue", {});
    if (queueResponse.status === "ok") {
      state.reviewQueue = queueResponse.payload.items || [];
      state.reviewIndex = Math.min(state.reviewIndex, Math.max(state.reviewQueue.length - 1, 0));
    }
    const review = state.reviewQueue[state.reviewIndex];
    const autoMinValue = clampAutoMin(state.matchingConfig.auto_min);
    const autoMergeEnabled = Boolean(state.matchingConfig.auto_merge_enabled);
    const perfectMatchAutoMerge = Boolean(state.matchingConfig.perfect_match_auto_merge);
    importView.innerHTML = `
      <div class="import-view-layout">
        <aside class="card import-controls-column">
          <h2>Lauf hinzufügen</h2>
          <p class="hint">Bitte wählen Sie die Ergebnisdatei des aktuellen Laufs aus.</p>
          <div class="row">
            <label for="filePathInput">Ergebnisdatei</label>
            <input id="filePathInput" type="text" placeholder="Bitte Datei auswählen..." />
            <button id="pickFileBtn" class="secondary">Datei auswählen</button>
            <button id="importRaceBtn" class="primary">Lauf importieren</button>
          </div>
          <div class="row">
            <label for="sourceTypeSelect">Lauftyp</label>
            <select id="sourceTypeSelect">
              <option value="">Automatisch erkennen</option>
              <option value="singles">Einzel</option>
              <option value="couples">Paare</option>
            </select>
          </div>
          <div class="sidebar-section">
            <h3>Importierte Läufe</h3>
            ${renderImportedRunsMatrix(importedRaceInfo)}
          </div>
          <div class="import-settings-panel">
            <h4>Matching-Einstellungen</h4>
            <div class="row">
              <label for="autoMergeEnabledInput">Automatisches Zusammenführen</label>
              <input id="autoMergeEnabledInput" type="checkbox" ${autoMergeEnabled ? "checked" : ""} />
            </div>
            <div class="row">
              <label for="perfectAutoMergeInput">Perfekte Treffer automatisch</label>
              <input id="perfectAutoMergeInput" type="checkbox" ${perfectMatchAutoMerge ? "checked" : ""} />
            </div>
            <div class="row">
              <label for="autoMergeThresholdRange">Auto-Merge-Schwelle</label>
              <input id="autoMergeThresholdRange" type="range" min="0.00" max="1.00" step="0.01" value="${autoMinValue.toFixed(2)}" />
              <input id="autoMergeThresholdInput" type="number" min="0.00" max="1.00" step="0.01" value="${autoMinValue.toFixed(2)}" />
            </div>
            <p class="hint">Standard: Nur perfekte Treffer werden automatisch zusammengeführt.</p>
          </div>
        </aside>
        <section class="card import-review-column">
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
        </section>
      </div>
    `;
    const autoMergeEnabledInput = document.getElementById("autoMergeEnabledInput");
    const perfectAutoMergeInput = document.getElementById("perfectAutoMergeInput");
    const autoMergeThresholdRange = document.getElementById("autoMergeThresholdRange");
    const autoMergeThresholdInput = document.getElementById("autoMergeThresholdInput");
    const syncThresholdInputs = (nextValue) => {
      const clamped = clampAutoMin(nextValue);
      autoMergeThresholdRange.value = clamped.toFixed(2);
      autoMergeThresholdInput.value = clamped.toFixed(2);
      return clamped;
    };
    autoMergeThresholdRange.addEventListener("input", () => {
      syncThresholdInputs(autoMergeThresholdRange.value);
    });
    autoMergeThresholdInput.addEventListener("change", () => {
      syncThresholdInputs(autoMergeThresholdInput.value);
    });
    autoMergeEnabledInput.addEventListener("change", async () => {
      const threshold = syncThresholdInputs(autoMergeThresholdInput.value);
      const ok = await saveMatchingConfig(threshold, autoMergeEnabledInput.checked, perfectAutoMergeInput.checked);
      if (ok) {
        setStatus(
          autoMergeEnabledInput.checked
            ? "Auto-Merge ist aktiv."
            : "Auto-Merge ist deaktiviert. Neue Importe landen bei Unsicherheit in der Prüfung."
        );
      }
    });
    perfectAutoMergeInput.addEventListener("change", async () => {
      const threshold = syncThresholdInputs(autoMergeThresholdInput.value);
      const ok = await saveMatchingConfig(threshold, autoMergeEnabledInput.checked, perfectAutoMergeInput.checked);
      if (ok) {
        setStatus(
          perfectAutoMergeInput.checked
            ? "Perfekte Treffer werden automatisch zusammengeführt."
            : "Perfekte Treffer werden nicht mehr automatisch zusammengeführt."
        );
      }
    });
    autoMergeThresholdInput.addEventListener("blur", async () => {
      const threshold = syncThresholdInputs(autoMergeThresholdInput.value);
      if (await saveMatchingConfig(threshold, autoMergeEnabledInput.checked, perfectAutoMergeInput.checked)) {
        setStatus("Auto-Merge-Schwelle wurde aktualisiert.");
      }
    });
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
    const timelineResponse = await api("get_year_timeline", {
      series_year: state.seriesYear,
      limit: 1000,
    });
    if (timelineResponse.status === "error") {
      historyView.innerHTML = `<div class="card"><p class="danger-text">Historie konnte nicht geladen werden.</p></div>`;
      return;
    }
    const timelineItems = timelineResponse.payload.items || [];
    const groupedImports = new Map();
    for (const item of timelineItems) {
      if (item.event_type !== "race_import") {
        continue;
      }
      const sourceHash = String(item.source_sha256 || "").trim();
      if (!sourceHash) {
        continue;
      }
      const existing = groupedImports.get(sourceHash);
      if (existing) {
        existing.count += 1;
        existing.eventUids.push(item.race_event_uid || "");
        if (item.category_key) {
          existing.categories.add(item.category_key);
        }
        continue;
      }
      groupedImports.set(sourceHash, {
        sourceSha256: sourceHash,
        sourceFile: item.source_file || "-",
        timestamp: item.timestamp || "-",
        anchorEventUid: item.race_event_uid || "",
        eventUids: [item.race_event_uid || ""],
        categories: new Set(item.category_key ? [item.category_key] : []),
        count: 1,
      });
    }
    const groupedRows = Array.from(groupedImports.values())
      .map((group) => {
        const categoryLabel = Array.from(group.categories).sort().join(", ") || "-";
        const action = `<button class="danger" data-rollback-batch="${group.sourceSha256}" data-rollback-anchor="${group.anchorEventUid}" data-rollback-count="${group.count}">Datei zurücknehmen</button>`;
        return `<tr>
          <td>Datei-Import</td>
          <td>${group.timestamp}</td>
          <td>${group.sourceFile}</td>
          <td>${categoryLabel}</td>
          <td>${group.count}</td>
          <td>${action}</td>
        </tr>`;
      })
      .join("");
    historyView.innerHTML = `
      <div class="card">
        <h2>Historie & Korrektur</h2>
        <p class="hint">Alle Änderungen werden protokolliert. Rücknahme erfolgt für alle Läufe einer importierten Datei gemeinsam.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Ereignis</th><th>Zeitpunkt</th><th>Quelldatei</th><th>Kategorien</th><th>Läufe</th><th>Aktion</th></tr></thead>
            <tbody>${groupedRows || `<tr><td colspan="6">Keine aktiven Datei-Importe vorhanden</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `;
    for (const button of historyView.querySelectorAll("button[data-rollback-batch]")) {
      button.addEventListener("click", async () => {
        const sourceSha = button.getAttribute("data-rollback-batch");
        const anchorUid = button.getAttribute("data-rollback-anchor");
        const count = Number(button.getAttribute("data-rollback-count") || "0");
        const confirmed = window.confirm(
          `Die Ergebnisse aller ${count} Läufe aus dieser Datei werden aus der Wertung entfernt und anschließend neu berechnet.`
        );
        if (!confirmed) {
          return;
        }
        const response = await api("rollback_source_batch", {
          source_sha256: sourceSha,
          race_event_uid: anchorUid,
          reason: "ui.history.rollback_source_batch",
        });
        if (response.status === "error") {
          setStatus(getApiErrorMessage(response.error, "Datei-Import konnte nicht zurückgenommen werden."), true);
          return;
        }
        const rolledBackCount = response.payload.rolled_back_event_count || 0;
        setStatus(`Datei-Import wurde zurückgenommen (${rolledBackCount} Läufe).`);
        await loadOverview();
      });
    }
  }

  showSeasonEntry().catch((error) => {
    setStatus(error.message || "Anwendung konnte nicht gestartet werden.", true);
  });
})();
