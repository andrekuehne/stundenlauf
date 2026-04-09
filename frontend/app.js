(function () {
  const STR = window.UIStrings;
  const FMT = window.UIFormat;

  function applyShellChrome() {
    const sh = STR.shell;
    document.title = sh.appTitle;
    const h1 = document.querySelector(".app-header h1");
    if (h1) {
      h1.textContent = sh.appTitle;
    }
    const tabLabels = {
      standings: sh.tabStandings,
      import: sh.tabImport,
      history: sh.tabHistory,
    };
    for (const tab of document.querySelectorAll(".tab[data-view]")) {
      const key = tab.dataset.view;
      if (tabLabels[key]) {
        tab.textContent = tabLabels[key];
      }
    }
    const switchBtn = document.getElementById("switchSeasonBtn");
    if (switchBtn) {
      switchBtn.textContent = sh.switchSeason;
    }
    const seasonEl = document.getElementById("seasonLabel");
    const reviewEl = document.getElementById("reviewLabel");
    if (seasonEl) {
      seasonEl.textContent = sh.seasonLabelPlaceholder;
    }
    if (reviewEl) {
      reviewEl.textContent = sh.reviewLabelPlaceholder;
    }
  }

  applyShellChrome();

  function applyIdentityModalChrome() {
    const id = STR.standings.identity;
    if (identityModalCancel) {
      identityModalCancel.textContent = id.cancel;
    }
    if (identityModalClose) {
      identityModalClose.setAttribute("aria-label", id.closeAria);
    }
  }

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
      strict_normalized_auto_only: false,
    },
    importFilePath: "",
    importSourceType: "",
    importRaceNo: null,
    standingsCorrectionMode: false,
  };

  let requestCounter = 0;
  let lastStandingsRows = [];
  let identityModalRow = null;

  const seasonEntryView = document.getElementById("seasonEntryView");
  const shellView = document.getElementById("shellView");
  const headerContext = document.getElementById("headerContext");
  const seasonLabel = document.getElementById("seasonLabel");
  const reviewLabel = document.getElementById("reviewLabel");
  const globalStatus = document.getElementById("globalStatus");
  const standingsView = document.getElementById("viewStandings");
  const importView = document.getElementById("viewImport");
  const historyView = document.getElementById("viewHistory");
  const identityCorrectionModal = document.getElementById("identityCorrectionModal");
  const identityModalTitle = document.getElementById("identityModalTitle");
  const identityModalBody = document.getElementById("identityModalBody");
  const identityModalCancel = document.getElementById("identityModalCancel");
  const identityModalClose = document.getElementById("identityModalClose");

  applyIdentityModalChrome();

  const tabs = Array.from(document.querySelectorAll(".tab[data-view]"));
  setStatus("", false);
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
    throw new Error(STR.errors.bridgeUnavailable);
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
    const st = STR.status;
    const message = text && String(text).trim() ? String(text).trim() : st.defaultReady;
    globalStatus.textContent = st.prefix + message;
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
      strict_normalized_auto_only: Boolean(response.payload.strict_normalized_auto_only),
    };
  }

  async function saveMatchingConfig(autoMin, autoMergeEnabled, perfectMatchAutoMerge, strictNormalizedAutoOnly) {
    const response = await api("set_matching_config", {
      auto_min: autoMin,
      auto_merge_enabled: autoMergeEnabled,
      perfect_match_auto_merge: perfectMatchAutoMerge,
      strict_normalized_auto_only: Boolean(strictNormalizedAutoOnly),
    });
    if (response.status !== "ok") {
      setStatus(STR.status.matchingSaveFailed, true);
      return false;
    }
    state.matchingConfig = {
      auto_min: Number(response.payload.auto_min || autoMin),
      auto_merge_enabled: Boolean(response.payload.auto_merge_enabled),
      perfect_match_auto_merge: Boolean(response.payload.perfect_match_auto_merge),
      strict_normalized_auto_only: Boolean(response.payload.strict_normalized_auto_only),
    };
    return true;
  }

  function getApiErrorMessage(error, fallbackMessage) {
    const code = (error && error.code) || "";
    if (code === "IMPORT_DUPLICATE") {
      return STR.errors.importDuplicate;
    }
    if (code === "REIMPORT_PARTIAL_ROLLBACK_REQUIRED") {
      return STR.errors.reimportPartialRollback;
    }
    return (error && error.details && error.details.message) || fallbackMessage;
  }

  function renderSeasonEntry(items) {
    const se = STR.seasonEntry;
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
                <button class="secondary" data-open-year="${item.series_year}">${se.openSeason}</button>
                <button class="danger" data-delete-year="${item.series_year}" title="${se.deleteSeasonTitle}">🗑 ${se.deleteSeason}</button>
              </div>
            </td>
          </tr>`
      )
      .join("");
    seasonEntryView.innerHTML = `
      <h2>${se.pageTitle}</h2>
      <p class="hint">${se.intro}</p>
      <div class="grid-2">
        <div class="card">
          <h3>${se.existingHeading}</h3>
          ${
            items.length === 0
              ? `<p class="hint">${se.noSeasonsYet}</p>`
              : `<div class="table-wrap"><table><thead><tr><th>${se.tableYear}</th><th>${se.tableRaces}</th><th>${se.tableReview}</th><th>${se.tableLastImport}</th><th>${se.tableAction}</th></tr></thead><tbody>${rows}</tbody></table></div>`
          }
        </div>
        <div class="card">
          <h3>${se.newHeading}</h3>
          <p class="hint">${se.newHint}</p>
          <div class="row">
            <label for="newYearInput">${se.labelYear}</label>
            <input id="newYearInput" type="number" placeholder="${se.placeholderYear}" />
          </div>
          <div class="row">
            <label for="newNameInput">${se.labelDisplayName}</label>
            <input id="newNameInput" type="text" placeholder="${se.placeholderDisplayName}" />
          </div>
          <div class="row">
            <button id="createSeasonBtn" class="primary">${se.createSeason}</button>
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
        const warningAccepted = window.confirm(se.deleteConfirm(year));
        if (!warningAccepted) {
          return;
        }
        const typed = window.prompt(se.deletePrompt(year), "");
        if (typed === null) {
          return;
        }
        const confirmedYear = Number(String(typed).trim());
        if (!Number.isInteger(confirmedYear) || confirmedYear !== year) {
          setStatus(se.deleteInputMismatch(year), true);
          return;
        }
        const deleted = await api("delete_series_year", {
          series_year: year,
          confirm_series_year: confirmedYear,
        });
        if (deleted.status === "error") {
          setStatus(deleted.error.details.message || se.deleteFailed, true);
          return;
        }
        setStatus(se.deleteDone(year));
        await showSeasonEntry();
      });
    }
    document.getElementById("createSeasonBtn").addEventListener("click", async () => {
      const yearInput = document.getElementById("newYearInput");
      const nameInput = document.getElementById("newNameInput");
      const year = Number(yearInput.value);
      if (!Number.isInteger(year)) {
        setStatus(se.invalidYear, true);
        return;
      }
      const created = await api("create_series_year", { series_year: year, display_name: nameInput.value });
      if (created.status === "error") {
        setStatus(created.error.details.message || se.createFailed, true);
        return;
      }
      setStatus(se.createDone);
      await openSeason(year);
      switchView("import");
    });
  }

  async function showSeasonEntry() {
    const se = STR.seasonEntry;
    closeIdentityModal();
    shellView.classList.add("hidden");
    seasonEntryView.classList.remove("hidden");
    headerContext.classList.add("hidden");
    seasonEntryView.innerHTML = `
      <h2>${se.pageTitle}</h2>
      <p class="hint">${se.loading}</p>
    `;
    try {
      const response = await api("list_series_years", {});
      if (response.status === "error") {
        seasonEntryView.innerHTML = `
          <h2>${se.pageTitle}</h2>
          <p class="danger-text">${se.listLoadFailed}</p>
          <p class="hint">${se.listLoadHint}</p>
        `;
        setStatus(se.listLoadFailed, true);
        return;
      }
      renderSeasonEntry(response.payload.items || []);
    } catch (error) {
      seasonEntryView.innerHTML = `
        <h2>${se.pageTitle}</h2>
        <p class="danger-text">${se.apiNotReady}</p>
        <p class="hint">${se.apiNotReadyHint}</p>
      `;
      setStatus(error.message || STR.errors.desktopApiUnavailable, true);
    }
  }

  async function openSeason(year) {
    const se = STR.seasonEntry;
    const opened = await api("open_series_year", { series_year: year });
    if (opened.status === "error") {
      setStatus(se.openFailed, true);
      return;
    }
    const seasonChanged = state.seriesYear !== year;
    state.seriesYear = year;
    if (seasonChanged) {
      state.selectedCategory = "";
      resetImportDraft();
      state.standingsCorrectionMode = false;
      closeIdentityModal();
    }
    seasonLabel.textContent = FMT.seasonLabel(year);
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
      setStatus(STR.overview.loadFailed, true);
      return;
    }
    state.categories = response.payload.categories || [];
    state.raceHistoryGroups = response.payload.race_history_groups || [];
    if (!state.categories.some((category) => category.category_key === state.selectedCategory)) {
      state.selectedCategory = state.categories[0] ? state.categories[0].category_key : "";
    }
    reviewLabel.textContent = FMT.reviewOpenCount(response.payload.totals.review_queue);
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
    const cs = STR.categorySlots;
    const categoriesByKey = new Map(state.categories.map((category) => [category.category_key, category]));
    const slots = {
      einzel: [
        { key: "half_men", label: cs.half_men, match: (category) => durationSortKey(category.duration) === 0 && normalizeDivision(category.division) === "men" },
        { key: "half_women", label: cs.half_women, match: (category) => durationSortKey(category.duration) === 0 && normalizeDivision(category.division) === "women" },
        { key: "hour_men", label: cs.hour_men, match: (category) => durationSortKey(category.duration) === 1 && normalizeDivision(category.division) === "men" },
        { key: "hour_women", label: cs.hour_women, match: (category) => durationSortKey(category.duration) === 1 && normalizeDivision(category.division) === "women" },
      ],
      paare: [
        {
          key: "half_couples_men",
          label: cs.half_couples_men,
          match: (category) => durationSortKey(category.duration) === 0 && normalizeDivision(category.division) === "couples_men",
        },
        {
          key: "half_couples_women",
          label: cs.half_couples_women,
          match: (category) => durationSortKey(category.duration) === 0 && normalizeDivision(category.division) === "couples_women",
        },
        {
          key: "half_couples_mixed",
          label: cs.half_couples_mixed,
          match: (category) => durationSortKey(category.duration) === 0 && normalizeDivision(category.division) === "couples_mixed",
        },
        {
          key: "hour_couples_men",
          label: cs.hour_couples_men,
          match: (category) => durationSortKey(category.duration) === 1 && normalizeDivision(category.division) === "couples_men",
        },
        {
          key: "hour_couples_women",
          label: cs.hour_couples_women,
          match: (category) => durationSortKey(category.duration) === 1 && normalizeDivision(category.division) === "couples_women",
        },
        {
          key: "hour_couples_mixed",
          label: cs.hour_couples_mixed,
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
    const mx = STR.matrix;
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
        { label: mx.rowSingles, raceNumbers: singlesRaceList },
        { label: mx.rowCouples, raceNumbers: couplesRaceList },
      ],
    };
  }

  function renderImportedRunsMatrix(importedRaceInfo) {
    const mx = STR.matrix;
    const headers = importedRaceInfo.raceColumns.map((raceNo) => `<th>${raceNo}</th>`).join("");
    const rows = importedRaceInfo.matrixRows
      .map((row) => {
        const raceNumberSet = new Set(row.raceNumbers || []);
        const cells = importedRaceInfo.raceColumns
          .map((raceNo) => `<td class="imported-runs-matrix-cell">${raceNumberSet.has(raceNo) ? mx.cellYes : mx.cellNo}</td>`)
          .join("");
        return `<tr><th scope="row">${row.label}</th>${cells}</tr>`;
      })
      .join("");
    return `
      <div class="imported-runs-matrix-wrap">
        <table class="imported-runs-matrix">
          <thead><tr><th>${mx.colRun}</th>${headers}</tr></thead>
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
    const st = STR.standings;
    const sid = st.identity;
    const importedRaceInfo = buildImportedRaceInfo();
    const quickSelectModel = buildCategoryQuickSelectModel();
    const renderQuickGrid = (groupKey) =>
      quickSelectModel.slots[groupKey]
        .map((slot) => {
          const activeClass = slot.isActive ? " active" : "";
          return `<button class="category-quick-btn${activeClass}" data-category-btn="${slot.categoryKey}" ${slot.disabled ? "disabled" : ""} title="${
            slot.categoryLabel || st.categoryUnavailable
          }">${slot.label}</button>`;
        })
        .join("");

    if (!state.selectedCategory) {
      standingsView.innerHTML = `
        <div class="standings-layout">
          <aside class="card standings-sidebar">
            <div class="sidebar-section">
              <h3>${st.sidebarImportedRuns}</h3>
              ${renderImportedRunsMatrix(importedRaceInfo)}
            </div>
            <div class="sidebar-section">
              <h3>${st.sidebarSingles}</h3>
              <div class="category-grid">${renderQuickGrid("einzel")}</div>
            </div>
            <div class="sidebar-section">
              <h3>${st.sidebarCouples}</h3>
              <div class="category-grid">${renderQuickGrid("paare")}</div>
            </div>
          </aside>
          <div class="standings-content">
            <div class="card"><h2>${st.titleCurrent}</h2><p class="hint">${st.emptyNoCategory}</p></div>
          </div>
        </div>
      `;
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
      standingsView.innerHTML = `<div class="card"><p class="danger-text">${st.loadFailed}</p></div>`;
      return;
    }

    const rawStandingsRows = standingsResponse.payload.rows || [];
    lastStandingsRows = rawStandingsRows;
    const standingsRows = rawStandingsRows
      .map((row, idx) => {
        const rowCells = `<td>${row.platz}</td><td>${row.display_name}</td><td>${row.yob || "-"}</td><td>${row.club || "-"}</td><td>${row.distanz_gesamt}</td><td>${row.punkte_gesamt}</td>`;
        if (state.standingsCorrectionMode) {
          return `<tr class="standings-row--correctable" data-row-index="${idx}">${rowCells}</tr>`;
        }
        return `<tr>${rowCells}</tr>`;
      })
      .join("");

    const resultHeaders = (resultsResponse.payload.meta.race_headers || []).map((item) => `<th>${item}</th>`).join("");
    const resultRows = (resultsResponse.payload.rows || [])
      .map((row) => {
        const cells = row.race_cells
          .map((cell) => {
            if (cell.distance_km == null) {
              return `<td>${STR.matrix.cellNo}</td>`;
            }
            return `<td>${STR.units.raceCell(cell.distance_km, cell.points)}</td>`;
          })
          .join("");
        return `<tr><td>${row.platz}</td><td>${row.display_name}</td>${cells}<td>${row.distanz_gesamt}</td><td>${row.punkte_gesamt}</td></tr>`;
      })
      .join("");
    standingsView.innerHTML = `
      <div class="standings-layout">
        <aside class="card standings-sidebar">
          <div class="sidebar-section">
            <h3>${st.sidebarImportedRuns}</h3>
            ${renderImportedRunsMatrix(importedRaceInfo)}
          </div>
          <div class="sidebar-section">
            <h3>${st.sidebarSingles}</h3>
            <div class="category-grid">${renderQuickGrid("einzel")}</div>
          </div>
          <div class="sidebar-section">
            <h3>${st.sidebarCouples}</h3>
            <div class="category-grid">${renderQuickGrid("paare")}</div>
          </div>
        </aside>
        <div class="standings-content">
          <div class="card">
            <div class="standings-main-head">
              <h2>${st.titleCurrent}</h2>
              <button type="button" class="secondary" data-correction-toggle>${
                state.standingsCorrectionMode ? sid.correctionOff : sid.correctionOn
              }</button>
            </div>
            <p class="hint">${st.selectedCategory(quickSelectModel.selectedCategoryLabel || "-")}</p>
            <p class="hint">${st.rulesHint}</p>
            ${state.standingsCorrectionMode ? `<p class="hint correction-mode-banner">${sid.correctionBanner}</p>` : ""}
            <div class="table-wrap">
              <table>
                <thead><tr><th>${st.thPlatz}</th><th>${st.thName}</th><th>${st.thYob}</th><th>${st.thClub}</th><th>${st.thDistanceTotal}</th><th>${st.thPointsTotal}</th></tr></thead>
                <tbody>${standingsRows || `<tr><td colspan="6">${st.emptyStandings}</td></tr>`}</tbody>
              </table>
            </div>
          </div>
          <div class="card">
            <h3>${st.perRaceTitle}</h3>
            <div class="table-wrap">
              <table>
                <thead><tr><th>${st.thPlatz}</th><th>${st.thName}</th>${resultHeaders}<th>${st.thDistanceShort}</th><th>${st.thPointsTotal}</th></tr></thead>
                <tbody>${resultRows || `<tr><td colspan="5">${st.emptyRaceRows}</td></tr>`}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
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

  function escapeHtml(text) {
    const s = text == null ? "" : String(text);
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function identityYobBounds() {
    const maxYear = new Date().getUTCFullYear() + 1;
    return { min: 1900, max: maxYear };
  }

  function closeIdentityModal() {
    identityModalRow = null;
    if (identityModalBody) {
      identityModalBody.innerHTML = "";
    }
    if (identityCorrectionModal) {
      identityCorrectionModal.classList.add("hidden");
      identityCorrectionModal.setAttribute("aria-hidden", "true");
    }
  }

  function clearIdentityModalInlineError() {
    const el = document.getElementById("identityModalInlineError");
    if (el) {
      el.textContent = "";
      el.classList.add("hidden");
    }
  }

  function showIdentityModalInlineError(message) {
    const el = document.getElementById("identityModalInlineError");
    if (el) {
      el.textContent = message;
      el.classList.remove("hidden");
    }
  }

  function buildIdentityModalBodyHtml(row) {
    const st = STR.standings;
    const id = st.identity;
    const bounds = identityYobBounds();
    const hint = `<p class="hint">${id.excelHint}</p>`;
    const err = `<p id="identityModalInlineError" class="danger-text hidden"></p>`;

    if (row.entity_kind === "participant") {
      const y = row.yob;
      const yDisplay = typeof y === "number" && y >= bounds.min ? String(y) : "";
      return `${hint}${err}
        <div class="identity-field-grid">
          <div><label for="identityInName">${st.thName}</label><input id="identityInName" type="text" value="${escapeHtml(row.display_name || "")}" autocomplete="off" /></div>
          <div><label for="identityInClub">${st.thClub}</label><input id="identityInClub" type="text" value="${escapeHtml(row.club == null ? "" : row.club)}" autocomplete="off" /></div>
          <div><label for="identityInYob">${st.thYob}</label><input id="identityInYob" type="number" min="${bounds.min}" max="${bounds.max}" step="1" value="${escapeHtml(yDisplay)}" /></div>
        </div>
        <div class="identity-member-actions"><button type="button" class="primary" id="identityBtnSaveSingle">${id.save}</button></div>`;
    }

    const members = row.team_members;
    if (!members || members.length < 2) {
      return `${hint}${err}<p class="danger-text">${id.errTeamMembers}</p>`;
    }
    const mA = members.find((m) => m.member === "a") || members[0];
    const mB = members.find((m) => m.member === "b") || members[1];

    function memberHtml(memberKey, label, m) {
      const yDisplay = typeof m.yob === "number" && m.yob >= bounds.min ? String(m.yob) : "";
      return `<div class="identity-member-block">
        <h4>${label}</h4>
        <div class="identity-field-grid">
          <div><label for="identityInName_${memberKey}">${st.thName}</label><input id="identityInName_${memberKey}" type="text" value="${escapeHtml(m.name || "")}" autocomplete="off" /></div>
          <div><label for="identityInClub_${memberKey}">${st.thClub}</label><input id="identityInClub_${memberKey}" type="text" value="${escapeHtml(m.club == null ? "" : m.club)}" autocomplete="off" /></div>
          <div><label for="identityInYob_${memberKey}">${st.thYob}</label><input id="identityInYob_${memberKey}" type="number" min="${bounds.min}" max="${bounds.max}" step="1" value="${escapeHtml(yDisplay)}" /></div>
        </div>
        <div class="identity-member-actions"><button type="button" class="primary" id="identityBtnSaveTeam_${memberKey}">${id.save}</button></div>
      </div>`;
    }

    return `${hint}${err}${memberHtml("a", id.memberA, mA)}${memberHtml("b", id.memberB, mB)}`;
  }

  function openIdentityModal(row) {
    const id = STR.standings.identity;
    if (!identityModalTitle || !identityModalBody || !identityCorrectionModal) {
      return;
    }
    identityModalRow = row;
    identityModalTitle.textContent = id.modalTitle;
    identityModalBody.innerHTML = buildIdentityModalBodyHtml(row);
    identityCorrectionModal.classList.remove("hidden");
    identityCorrectionModal.setAttribute("aria-hidden", "false");

    const singleBtn = document.getElementById("identityBtnSaveSingle");
    if (singleBtn) {
      singleBtn.addEventListener("click", () => void saveIdentityParticipant());
    }
    for (const key of ["a", "b"]) {
      const btn = document.getElementById(`identityBtnSaveTeam_${key}`);
      if (btn) {
        btn.addEventListener("click", () => void saveIdentityTeamMember(key));
      }
    }
  }

  async function saveIdentityParticipant() {
    const id = STR.standings.identity;
    clearIdentityModalInlineError();
    const bounds = identityYobBounds();
    const nameEl = document.getElementById("identityInName");
    const clubEl = document.getElementById("identityInClub");
    const yobEl = document.getElementById("identityInYob");
    const name = (nameEl && nameEl.value.trim()) || "";
    const clubVal = (clubEl && clubEl.value.trim()) || "";
    const yobRaw = (yobEl && yobEl.value.trim()) || "";
    if (!name) {
      showIdentityModalInlineError(id.errName);
      return;
    }
    const yob = parseInt(yobRaw, 10);
    if (!Number.isFinite(yob)) {
      showIdentityModalInlineError(id.errYob);
      return;
    }
    if (yob < bounds.min || yob > bounds.max) {
      showIdentityModalInlineError(id.errYobRange(bounds.min, bounds.max));
      return;
    }
    const row = identityModalRow;
    if (!row || row.entity_kind !== "participant") {
      return;
    }
    const response = await api("update_participant_identity", {
      series_year: state.seriesYear,
      participant_uid: row.entity_uid,
      name,
      yob,
      club: clubVal,
    });
    if (response.status === "error") {
      showIdentityModalInlineError(getApiErrorMessage(response.error, STR.errors.desktopApiUnavailable));
      return;
    }
    closeIdentityModal();
    setStatus(id.successSaved, false);
    await renderStandingsView();
  }

  async function saveIdentityTeamMember(member) {
    const id = STR.standings.identity;
    clearIdentityModalInlineError();
    const bounds = identityYobBounds();
    const nameEl = document.getElementById(`identityInName_${member}`);
    const clubEl = document.getElementById(`identityInClub_${member}`);
    const yobEl = document.getElementById(`identityInYob_${member}`);
    const name = (nameEl && nameEl.value.trim()) || "";
    const clubVal = (clubEl && clubEl.value.trim()) || "";
    const yobRaw = (yobEl && yobEl.value.trim()) || "";
    if (!name) {
      showIdentityModalInlineError(id.errName);
      return;
    }
    const yob = parseInt(yobRaw, 10);
    if (!Number.isFinite(yob)) {
      showIdentityModalInlineError(id.errYob);
      return;
    }
    if (yob < bounds.min || yob > bounds.max) {
      showIdentityModalInlineError(id.errYobRange(bounds.min, bounds.max));
      return;
    }
    const row = identityModalRow;
    if (!row || row.entity_kind !== "team") {
      return;
    }
    const response = await api("update_participant_identity", {
      series_year: state.seriesYear,
      team_uid: row.entity_uid,
      member,
      name,
      yob,
      club: clubVal,
    });
    if (response.status === "error") {
      showIdentityModalInlineError(getApiErrorMessage(response.error, STR.errors.desktopApiUnavailable));
      return;
    }
    closeIdentityModal();
    setStatus(id.successSaved, false);
    await renderStandingsView();
  }

  if (identityModalCancel) {
    identityModalCancel.addEventListener("click", () => closeIdentityModal());
  }
  if (identityModalClose) {
    identityModalClose.addEventListener("click", () => closeIdentityModal());
  }
  if (identityCorrectionModal) {
    identityCorrectionModal.querySelectorAll("[data-modal-dismiss]").forEach((el) => {
      el.addEventListener("click", () => closeIdentityModal());
    });
  }
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") {
      return;
    }
    if (identityCorrectionModal && !identityCorrectionModal.classList.contains("hidden")) {
      closeIdentityModal();
    }
  });

  standingsView.addEventListener("click", async (ev) => {
    const toggle = ev.target.closest("[data-correction-toggle]");
    if (toggle) {
      ev.preventDefault();
      state.standingsCorrectionMode = !state.standingsCorrectionMode;
      await renderStandingsView();
      return;
    }
    const tr = ev.target.closest("tr[data-row-index]");
    if (!tr || !state.standingsCorrectionMode) {
      return;
    }
    const idx = parseInt(tr.getAttribute("data-row-index"), 10);
    if (!Number.isFinite(idx) || idx < 0 || idx >= lastStandingsRows.length) {
      return;
    }
    ev.preventDefault();
    openIdentityModal(lastStandingsRows[idx]);
  });

  function resetImportDraft() {
    state.importFilePath = "";
    state.importSourceType = "";
    state.importRaceNo = null;
  }

  function basenameFromPath(path) {
    if (!path) {
      return "";
    }
    const normalized = String(path).replace(/\\/g, "/");
    const idx = normalized.lastIndexOf("/");
    return idx >= 0 ? normalized.slice(idx + 1) : normalized;
  }

  function inferImportRaceNoFromBasename(name) {
    const m = String(name).match(/Lauf\s+(\d+)/i);
    if (!m) {
      return null;
    }
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n >= 1 ? n : null;
  }

  function inferImportSourceTypeFromBasename(name) {
    const lower = String(name).toLowerCase();
    if (lower.includes("paare")) {
      return "couples";
    }
    if (lower.includes("einzel") || lower.includes("singles")) {
      return "singles";
    }
    return null;
  }

  function buildImportInferenceLine(basename) {
    const iv = STR.importView;
    if (!basename) {
      return "";
    }
    const inferredType = inferImportSourceTypeFromBasename(basename);
    const inferredRace = inferImportRaceNoFromBasename(basename);
    const typeLabel = inferredType === "singles" ? iv.singles : inferredType === "couples" ? iv.couples : null;
    const racePart = inferredRace != null ? `${iv.raceWord} ${inferredRace}` : null;
    if (typeLabel && racePart) {
      return iv.inferenceDetectedBoth(typeLabel, racePart);
    }
    if (typeLabel && !racePart) {
      return iv.inferenceDetectedTypeOnly(typeLabel);
    }
    if (!typeLabel && racePart) {
      return iv.inferenceDetectedRaceOnly(racePart);
    }
    return iv.inferenceNone;
  }

  function isImportReady() {
    const path = state.importFilePath.trim();
    const raceOk = state.importRaceNo != null && Number(state.importRaceNo) >= 1;
    const typeOk = state.importSourceType === "singles" || state.importSourceType === "couples";
    return Boolean(path && typeOk && raceOk);
  }

  function applyInferenceFromImportPath(filePath) {
    state.importFilePath = filePath;
    const base = basenameFromPath(filePath);
    const inferredType = inferImportSourceTypeFromBasename(base);
    const inferredRace = inferImportRaceNoFromBasename(base);
    state.importSourceType = inferredType || "";
    state.importRaceNo = inferredRace;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatEntityPreview(preview) {
    const pr = STR.preview;
    if (!preview) {
      return pr.unknown;
    }
    const parts = [preview.display_name || pr.unknown];
    if (preview.yob) {
      parts.push(pr.yob(preview.yob));
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
    const c = STR.confidence;
    const value = Number(confidence || 0);
    if (value >= 0.85) {
      return c.high;
    }
    if (value >= 0.65) {
      return c.medium;
    }
    return c.low;
  }

  function reviewSelectionKey(review) {
    return `${review.race_event_uid}::${review.entry_uid}`;
  }

  function displayDistance(distanceKm) {
    if (distanceKm == null) {
      return "-";
    }
    return `${distanceKm}${STR.units.kmSuffix}`;
  }

  function renderIncomingTableRow(preview, resultPreview, startnr) {
    const pr = STR.preview;
    return `<tr class="incoming-row">
      <td>${preview?.display_name || pr.unknown}</td>
      <td>${preview?.yob || "-"}</td>
      <td>${preview?.club || "-"}</td>
      <td>${startnr || "-"}</td>
      <td>${displayDistance(resultPreview?.distance_km)}</td>
      <td>${resultPreview?.points ?? "-"}</td>
    </tr>`;
  }

  function renderCandidateTableRows(review, selectedCandidateUid) {
    const rt = STR.reviewTable;
    const iv = STR.importView;
    const previewByUid = new Map((review.candidate_previews || []).filter(Boolean).map((item) => [item.uid, item]));
    const candidateUids = review.candidate_uids || [];
    if (!candidateUids.length) {
      return `<tr><td colspan="6">${rt.noCandidates}</td></tr>`;
    }
    return candidateUids
      .map((candidateUid, index) => {
        const preview = previewByUid.get(candidateUid);
        const rank = index + 1;
        const selectedClass = selectedCandidateUid === candidateUid ? " selected-candidate-row" : "";
        const selectedText = selectedCandidateUid === candidateUid ? rt.selectedSuffix : "";
        return `<tr class="candidate-row${selectedClass}" data-candidate-row="${candidateUid}">
          <td>${rank}${selectedText}</td>
          <td>${preview?.display_name || STR.preview.unknown}</td>
          <td>${preview?.yob || "-"}</td>
          <td>${preview?.club || "-"}</td>
          <td>${confidenceLabel(review.confidence)}</td>
          <td><button class="secondary select-candidate-btn" data-candidate-uid="${candidateUid}">${iv.selectCandidate}</button></td>
        </tr>`;
      })
      .join("");
  }

  async function renderImportView() {
    if (!state.seriesYear) {
      return;
    }
    const iv = STR.importView;
    const stStandings = STR.standings;
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
    const strictNormalizedOnly = Boolean(state.matchingConfig.strict_normalized_auto_only);
    const fuzzyControlsDisabled = strictNormalizedOnly ? " disabled" : "";
    const importBasename = basenameFromPath(state.importFilePath);
    const singlesActive = state.importSourceType === "singles" ? " import-type-btn-active" : "";
    const couplesActive = state.importSourceType === "couples" ? " import-type-btn-active" : "";
    const raceOptions = importedRaceInfo.raceColumns
      .map((n) => `<option value="${n}"${state.importRaceNo === n ? " selected" : ""}>${n}</option>`)
      .join("");
    const importReady = isImportReady();
    const inferenceText = importBasename
      ? buildImportInferenceLine(importBasename)
      : iv.pickResultFile;
    const confidencePct = Math.round((review && review.confidence ? review.confidence : 0) * 100);
    importView.innerHTML = `
      <div class="import-view-layout">
        <aside class="card import-controls-column">
          <div class="sidebar-section">
            <h3>${iv.sidebarImportedRuns}</h3>
            ${renderImportedRunsMatrix(importedRaceInfo)}
          </div>
          <div class="import-file-row">
            <button id="pickFileBtn" class="secondary" type="button">${iv.pickFile}</button>
            <input id="filePathInput" type="text" class="import-file-name" readonly value="${escapeHtml(
              importBasename
            )}" placeholder="${iv.noFilePlaceholder}" />
          </div>
          <p class="import-inference-hint">${escapeHtml(inferenceText)}</p>
          <div class="import-type-toggle">
            <button type="button" id="sourceTypeSinglesBtn" class="secondary${singlesActive}">${iv.singles}</button>
            <button type="button" id="sourceTypeCouplesBtn" class="secondary${couplesActive}">${iv.couples}</button>
          </div>
          <div class="import-race-row">
            <label for="raceNoSelect">${iv.raceNumber}</label>
            <select id="raceNoSelect">
              <option value=""${state.importRaceNo == null ? " selected" : ""}>${iv.raceSelectPlaceholder}</option>
              ${raceOptions}
            </select>
          </div>
          <div class="row">
            <button id="importRaceBtn" class="primary"${importReady ? "" : " disabled"}>${iv.importRace}</button>
          </div>
          <div class="import-settings-panel">
            <h4>${iv.matchingSettings}</h4>
            <div class="row">
              <label for="strictNormalizedAutoInput">${iv.strictNormalizedAuto}</label>
              <input id="strictNormalizedAutoInput" type="checkbox" ${strictNormalizedOnly ? "checked" : ""} />
            </div>
            <div class="row">
              <label for="autoMergeEnabledInput">${iv.autoMerge}</label>
              <input id="autoMergeEnabledInput" type="checkbox" ${autoMergeEnabled ? "checked" : ""}${fuzzyControlsDisabled} />
            </div>
            <div class="row">
              <label for="perfectAutoMergeInput">${iv.perfectAutoMerge}</label>
              <input id="perfectAutoMergeInput" type="checkbox" ${perfectMatchAutoMerge ? "checked" : ""}${fuzzyControlsDisabled} />
            </div>
            <div class="row">
              <label for="autoMergeThresholdRange">${iv.autoMergeThreshold}</label>
              <input id="autoMergeThresholdRange" type="range" min="0.00" max="1.00" step="0.01" value="${autoMinValue.toFixed(2)}"${fuzzyControlsDisabled} />
              <input id="autoMergeThresholdInput" type="number" min="0.00" max="1.00" step="0.01" value="${autoMinValue.toFixed(2)}"${fuzzyControlsDisabled} />
            </div>
            <p class="hint">${strictNormalizedOnly ? iv.strictNormalizedHint : iv.matchingDefaultHint}</p>
          </div>
        </aside>
        <section class="card import-review-column">
        <h3>${iv.reviewTitle}</h3>
        ${
          !review
            ? `<p class="ok">${iv.noOpenReviews}</p>`
            : `<p>${iv.reviewProgress(state.reviewIndex + 1, state.reviewQueue.length)}</p>
               <p class="hint">${iv.reviewHintLeftRight}</p>
               <p class="hint">${iv.reviewHintNoMatch}</p>
               <p class="hint">${FMT.reviewConfidenceHtml(confidenceLabel(review.confidence), confidencePct)}</p>
               <div class="merge-review-layout">
                 <section class="merge-review-column">
                   <h4>${iv.incomingHeading}</h4>
                   <div class="table-wrap">
                     <table>
                       <thead><tr><th>${iv.thName}</th><th>${stStandings.thYob}</th><th>${stStandings.thClub}</th><th>${iv.thStartnr}</th><th>${iv.thDistance}</th><th>${iv.thPoints}</th></tr></thead>
                       <tbody>${renderIncomingTableRow(review.entry_preview, review.result_preview, review.startnr)}</tbody>
                     </table>
                   </div>
                 </section>
                 <section class="merge-review-column">
                   <h4>${iv.candidatesHeading}</h4>
                   <div class="table-wrap">
                     <table>
                       <thead><tr><th>${iv.thRank}</th><th>${iv.thName}</th><th>${stStandings.thYob}</th><th>${stStandings.thClub}</th><th>${iv.thMatch}</th><th>${iv.thAction}</th></tr></thead>
                       <tbody>${renderCandidateTableRows(
                         review,
                         state.reviewSelections[reviewSelectionKey(review)] || getDefaultCandidateUid(review)
                       )}</tbody>
                     </table>
                   </div>
                 </section>
               </div>
               <p class="hint">${iv.mergeHint}</p>
               <div class="row merge-actions-row">
                 <button id="acceptReviewBtn" class="primary">${iv.mergeAccept}</button>
                 <button id="newIdentityReviewBtn" class="secondary">${iv.mergeNewIdentity}</button>
                 <button id="skipReviewBtn" class="secondary">${iv.skipReview}</button>
               </div>`
        }
        </section>
      </div>
    `;
    const autoMergeEnabledInput = document.getElementById("autoMergeEnabledInput");
    const perfectAutoMergeInput = document.getElementById("perfectAutoMergeInput");
    const strictNormalizedAutoInput = document.getElementById("strictNormalizedAutoInput");
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
      const ok = await saveMatchingConfig(
        threshold,
        autoMergeEnabledInput.checked,
        perfectAutoMergeInput.checked,
        strictNormalizedAutoInput.checked
      );
      if (ok) {
        setStatus(
          autoMergeEnabledInput.checked
            ? STR.status.autoMergeOn
            : STR.status.autoMergeOff
        );
      }
    });
    perfectAutoMergeInput.addEventListener("change", async () => {
      const threshold = syncThresholdInputs(autoMergeThresholdInput.value);
      const ok = await saveMatchingConfig(
        threshold,
        autoMergeEnabledInput.checked,
        perfectAutoMergeInput.checked,
        strictNormalizedAutoInput.checked
      );
      if (ok) {
        setStatus(
          perfectAutoMergeInput.checked
            ? STR.status.perfectAutoMergeOn
            : STR.status.perfectAutoMergeOff
        );
      }
    });
    strictNormalizedAutoInput.addEventListener("change", async () => {
      const threshold = syncThresholdInputs(autoMergeThresholdInput.value);
      const ok = await saveMatchingConfig(
        threshold,
        autoMergeEnabledInput.checked,
        perfectAutoMergeInput.checked,
        strictNormalizedAutoInput.checked
      );
      if (ok) {
        setStatus(
          strictNormalizedAutoInput.checked
            ? STR.status.strictNormalizedOn
            : STR.status.strictNormalizedOff
        );
        await renderImportView();
      }
    });
    autoMergeThresholdInput.addEventListener("blur", async () => {
      const threshold = syncThresholdInputs(autoMergeThresholdInput.value);
      if (
        await saveMatchingConfig(
          threshold,
          autoMergeEnabledInput.checked,
          perfectAutoMergeInput.checked,
          strictNormalizedAutoInput.checked
        )
      ) {
        setStatus(STR.status.autoMergeThresholdUpdated);
      }
    });
    document.getElementById("sourceTypeSinglesBtn").addEventListener("click", async () => {
      state.importSourceType = "singles";
      await renderImportView();
    });
    document.getElementById("sourceTypeCouplesBtn").addEventListener("click", async () => {
      state.importSourceType = "couples";
      await renderImportView();
    });
    document.getElementById("raceNoSelect").addEventListener("change", async () => {
      const raw = document.getElementById("raceNoSelect").value;
      if (raw === "") {
        state.importRaceNo = null;
      } else {
        const n = parseInt(raw, 10);
        state.importRaceNo = Number.isFinite(n) ? n : null;
      }
      await renderImportView();
    });
    document.getElementById("importRaceBtn").addEventListener("click", async () => {
      const filePath = state.importFilePath.trim();
      if (!isImportReady()) {
        setStatus(STR.status.importIncomplete, true);
        return;
      }
      setStatus(STR.status.importRunning);
      const response = await api("import_race", {
        file_path: filePath,
        series_year: state.seriesYear,
        source_type: state.importSourceType,
        race_no: state.importRaceNo,
      });
      if (response.status === "error") {
        setStatus(getApiErrorMessage(response.error, STR.status.importFailed), true);
        return;
      }
      setStatus(STR.status.importDone);
      resetImportDraft();
      await loadOverview();
    });
    document.getElementById("pickFileBtn").addEventListener("click", async () => {
      const picked = await api("pick_file", {});
      if (picked.status !== "ok") {
        setStatus(STR.status.pickFileFailed, true);
        return;
      }
      const filePath = (picked.payload && picked.payload.file_path ? picked.payload.file_path : "").trim();
      if (filePath) {
        applyInferenceFromImportPath(filePath);
        await renderImportView();
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
          setStatus(STR.status.noCandidate, true);
          return;
        }
        const response = await api("apply_match_decision", {
          race_event_uid: review.race_event_uid,
          entry_uid: review.entry_uid,
          target_participant_uid: target,
          rationale: "manual review accept",
        });
        if (response.status === "error") {
          setStatus(STR.status.mergeSaveFailed, true);
          return;
        }
        setStatus(STR.status.mergeSaved);
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
          setStatus(response.error.details.message || STR.status.newIdentityFailed, true);
          return;
        }
        setStatus(STR.status.newIdentitySaved);
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
    const hi = STR.history;
    const timelineResponse = await api("get_year_timeline", {
      series_year: state.seriesYear,
      limit: 1000,
    });
    if (timelineResponse.status === "error") {
      historyView.innerHTML = `<div class="card"><p class="danger-text">${hi.loadFailed}</p></div>`;
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
        const action = `<button class="danger" data-rollback-batch="${group.sourceSha256}" data-rollback-anchor="${group.anchorEventUid}" data-rollback-count="${group.count}">${hi.rollbackButton}</button>`;
        return `<tr>
          <td>${hi.eventFileImport}</td>
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
        <h2>${hi.title}</h2>
        <p class="hint">${hi.hint}</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>${hi.thEvent}</th><th>${hi.thTime}</th><th>${hi.thSource}</th><th>${hi.thCategories}</th><th>${hi.thRaces}</th><th>${hi.thAction}</th></tr></thead>
            <tbody>${groupedRows || `<tr><td colspan="6">${hi.emptyImports}</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `;
    for (const button of historyView.querySelectorAll("button[data-rollback-batch]")) {
      button.addEventListener("click", async () => {
        const sourceSha = button.getAttribute("data-rollback-batch");
        const anchorUid = button.getAttribute("data-rollback-anchor");
        const count = Number(button.getAttribute("data-rollback-count") || "0");
        const confirmed = window.confirm(hi.rollbackConfirm(count));
        if (!confirmed) {
          return;
        }
        const response = await api("rollback_source_batch", {
          source_sha256: sourceSha,
          race_event_uid: anchorUid,
          reason: "ui.history.rollback_source_batch",
        });
        if (response.status === "error") {
          setStatus(getApiErrorMessage(response.error, STR.errors.rollbackFailed), true);
          return;
        }
        const rolledBackCount = response.payload.rolled_back_event_count || 0;
        setStatus(hi.rollbackDone(rolledBackCount));
        await loadOverview();
      });
    }
  }

  showSeasonEntry().catch((error) => {
    setStatus(error.message || STR.errors.startupFailed, true);
  });
})();
