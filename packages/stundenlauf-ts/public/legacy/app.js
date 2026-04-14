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
      auto_min: 0.5,
      review_min: 0.5,
      auto_merge_enabled: false,
      perfect_match_auto_merge: true,
      strict_normalized_auto_only: false,
    },
    importFilePath: "",
    importSourceType: "",
    importRaceNo: null,
    matchingSettingsExpanded: false,
    standingsCorrectionMode: false,
    standingsMergeMode: false,
    mergeSurvivor: null,
    mergeAbsorbed: null,
    pdfExportLayoutPresets: null,
    pdfExportLayoutPresetId: "default",
  };

  let requestCounter = 0;
  let lastStandingsRows = [];
  let identityModalRow = null;
  let importMergeCorrectContext = null;

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

  function clampReviewMin(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return state.matchingConfig.review_min;
    }
    return Math.min(1.0, Math.max(0.0, numeric));
  }

  function effectiveAutoMinForMatchingCap(cfg) {
    if (cfg.auto_merge_enabled) {
      return clampAutoMin(cfg.auto_min);
    }
    if (cfg.perfect_match_auto_merge) {
      return 1.0;
    }
    return 1.01;
  }

  function capReviewMinForConfig(reviewMin, cfg) {
    const cap = effectiveAutoMinForMatchingCap(cfg);
    return Math.min(clampReviewMin(reviewMin), cap);
  }

  async function loadMatchingConfig() {
    const response = await api("get_matching_config", {});
    if (response.status !== "ok") {
      return;
    }
    state.matchingConfig = {
      auto_min: Number(
        response.payload.auto_min != null ? response.payload.auto_min : state.matchingConfig.auto_min
      ),
      review_min: Number(
        response.payload.review_min != null ? response.payload.review_min : state.matchingConfig.review_min
      ),
      auto_merge_enabled: Boolean(response.payload.auto_merge_enabled),
      perfect_match_auto_merge: Boolean(response.payload.perfect_match_auto_merge),
      strict_normalized_auto_only: Boolean(response.payload.strict_normalized_auto_only),
    };
  }

  async function saveMatchingConfig(autoMin, reviewMin, autoMergeEnabled, perfectMatchAutoMerge, strictNormalizedAutoOnly) {
    const cfgForCap = {
      auto_min: autoMin,
      auto_merge_enabled: autoMergeEnabled,
      perfect_match_auto_merge: perfectMatchAutoMerge,
      strict_normalized_auto_only: strictNormalizedAutoOnly,
    };
    const reviewCapped = capReviewMinForConfig(reviewMin, cfgForCap);
    const response = await api("set_matching_config", {
      auto_min: autoMin,
      review_min: reviewCapped,
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
      review_min: Number(
        response.payload.review_min != null ? response.payload.review_min : reviewCapped
      ),
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

  function isSeasonImportConflict(response) {
    return Boolean(
      response &&
        response.status === "error" &&
        response.error &&
        response.error.code === "SEASON_IMPORT_CONFLICT"
    );
  }

  function seasonArchiveSuggestedName(seasonName, year) {
    const fallback = `stundenlauf-${year}`;
    const rawBase = String(seasonName || "").trim() || fallback;
    const normalized = rawBase.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const safeBase = normalized
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    return `${safeBase || fallback}.stundenlauf-season.zip`;
  }

  function renderSeasonEntry(items) {
    const se = STR.seasonEntry;
    const normalizeCoverage = (raceCoverage) => {
      const coverage = raceCoverage || {};
      const singlesRaceNumbers = Array.isArray(coverage.singles_race_numbers) ? coverage.singles_race_numbers : [];
      const couplesRaceNumbers = Array.isArray(coverage.couples_race_numbers) ? coverage.couples_race_numbers : [];
      const raceColumns = Array.isArray(coverage.race_columns) && coverage.race_columns.length
        ? coverage.race_columns
        : [1, 2, 3, 4, 5];
      return {
        raceColumns,
        matrixRows: [
          { label: STR.matrix.rowSingles, raceNumbers: singlesRaceNumbers },
          { label: STR.matrix.rowCouples, raceNumbers: couplesRaceNumbers },
        ],
      };
    };
    const formatSeasonTimestamp = (value) => {
      const raw = String(value || "").trim();
      if (!raw) {
        return "-";
      }
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        return "-";
      }
      const pad2 = (num) => String(num).padStart(2, "0");
      return `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())} ${pad2(parsed.getDate())}.${pad2(parsed.getMonth() + 1)}.${parsed.getFullYear()}`;
    };
    const rows = items
      .map(
        (item) =>
          `<tr>
            <td>${escapeHtml(item.display_name || String(item.series_year))}</td>
            <td>${item.review_queue_count}</td>
            <td>${formatSeasonTimestamp(item.latest_imported_at)}</td>
            <td class="season-coverage-col">${renderImportedRunsMatrix(normalizeCoverage(item.race_coverage), { compact: true })}</td>
            <td>
              <div class="row">
                <button class="secondary" data-open-year="${item.series_year}">${se.openSeason}</button>
                <button class="secondary" data-export-year="${item.series_year}" data-season-name="${escapeHtml(item.display_name || String(item.series_year))}">⇪ ${se.exportSeason}</button>
                <button class="secondary" data-reset-year="${item.series_year}" data-season-name="${escapeHtml(item.display_name || String(item.series_year))}" title="${se.resetSeasonTitle}">↺ ${se.resetSeason}</button>
                <button class="danger" data-delete-year="${item.series_year}" data-season-name="${escapeHtml(item.display_name || String(item.series_year))}" title="${se.deleteSeasonTitle}">🗑 ${se.deleteSeason}</button>
              </div>
            </td>
          </tr>`
      )
      .join("");
    seasonEntryView.innerHTML = `
      <h2>${se.pageTitle}</h2>
      <p class="hint">${se.intro}</p>
      <div class="season-entry-layout">
        <div class="card">
          <h3>${se.existingHeading}</h3>
          ${
            items.length === 0
              ? `<p class="hint">${se.noSeasonsYet}</p>`
              : `<div class="table-wrap"><table class="table--banded"><thead><tr><th>${se.tableYear}</th><th class="season-review-col">Prüfungen<br>offen</th><th>${se.tableLastImport}</th><th class="season-coverage-col">${se.tableCoverage}</th><th>${se.tableAction}</th></tr></thead><tbody>${rows}</tbody></table></div>`
          }
        </div>
        <div class="card season-entry-create-card">
          <h3>${se.newHeading}</h3>
          <p class="hint">${se.newHint}</p>
          <div class="season-entry-form-grid">
            <label for="newSeasonNameInput" class="season-entry-form-label">${se.labelSeasonName}</label>
            <input id="newSeasonNameInput" type="text" placeholder="${se.placeholderSeasonName}" />
          </div>
          <div class="row season-entry-form-actions">
            <button id="createSeasonBtn" class="primary">${se.createSeason}</button>
            <button id="importSeasonBtn" class="secondary">${se.importSeason}</button>
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
        const seasonName = String(button.getAttribute("data-season-name") || year);
        const warningAccepted = window.confirm(se.deleteConfirm(seasonName));
        if (!warningAccepted) {
          return;
        }
        const typed = window.prompt(se.deletePrompt(seasonName), "");
        if (typed === null) {
          return;
        }
        const confirmedName = String(typed).trim();
        if (confirmedName !== seasonName) {
          setStatus(se.deleteInputMismatch(seasonName), true);
          return;
        }
        const deleted = await api("delete_series_year", {
          series_year: year,
          confirm_series_year: year,
        });
        if (deleted.status === "error") {
          setStatus(deleted.error.details.message || se.deleteFailed, true);
          return;
        }
        setStatus(se.deleteDone(seasonName));
        await showSeasonEntry();
      });
    }
    for (const button of seasonEntryView.querySelectorAll("button[data-reset-year]")) {
      button.addEventListener("click", async () => {
        const year = Number(button.getAttribute("data-reset-year"));
        const seasonName = String(button.getAttribute("data-season-name") || year);
        const warningAccepted = window.confirm(se.resetConfirm(seasonName));
        if (!warningAccepted) {
          return;
        }
        const typed = window.prompt(se.resetPrompt(seasonName), "");
        if (typed === null) {
          return;
        }
        const confirmedName = String(typed).trim();
        if (confirmedName !== seasonName) {
          setStatus(se.resetInputMismatch(seasonName), true);
          return;
        }
        const reset = await api("reset_series_year", {
          series_year: year,
          confirm_series_year: year,
        });
        if (reset.status === "error") {
          setStatus(reset.error.details.message || se.resetFailed, true);
          return;
        }
        if (state.seriesYear === year) {
          resetImportDraft();
        }
        setStatus(se.resetDone(seasonName));
        await showSeasonEntry();
      });
    }
    for (const button of seasonEntryView.querySelectorAll("button[data-export-year]")) {
      button.addEventListener("click", async () => {
        const year = Number(button.getAttribute("data-export-year"));
        const seasonName = String(button.getAttribute("data-season-name") || year).trim();
        const suggestedName = seasonArchiveSuggestedName(seasonName, year);
        const picked = await api("pick_save_file", { suggested_name: suggestedName, dialog_kind: "season_zip" });
        if (picked.status !== "ok") {
          setStatus(se.exportPickFailed, true);
          return;
        }
        const destinationPath = (picked.payload && picked.payload.file_path ? picked.payload.file_path : "").trim();
        if (!destinationPath) {
          return;
        }
        const exported = await api("export_series_year", {
          series_year: year,
          destination_path: destinationPath,
        });
        if (exported.status === "error") {
          setStatus(exported.error.details.message || se.exportFailed, true);
          return;
        }
        setStatus(
          se.exportDone(
            String(exported.payload.display_name || seasonName || year),
            year,
            exported.payload.export_file
          ),
          false
        );
      });
    }
    document.getElementById("createSeasonBtn").addEventListener("click", async () => {
      const nameInput = document.getElementById("newSeasonNameInput");
      const seasonName = String(nameInput.value || "").trim();
      if (!seasonName) {
        setStatus(se.invalidSeasonName, true);
        return;
      }
      const created = await api("create_series_year", { display_name: seasonName });
      if (created.status === "error") {
        setStatus(created.error.details.message || se.createFailed, true);
        return;
      }
      const createdYear = Number(created.payload && created.payload.series_year);
      if (!Number.isInteger(createdYear)) {
        setStatus(se.openFailed, true);
        return;
      }
      setStatus(se.createDone(seasonName));
      await openSeason(createdYear);
      switchView("import");
    });
    document.getElementById("importSeasonBtn").addEventListener("click", async () => {
      const picked = await api("pick_file", { kind: "season_export" });
      if (picked.status !== "ok") {
        setStatus(se.importPickFailed, true);
        return;
      }
      const filePath = (picked.payload && picked.payload.file_path ? picked.payload.file_path : "").trim();
      if (!filePath) {
        return;
      }
      let imported = await api("import_series_year", { file_path: filePath });
      if (isSeasonImportConflict(imported)) {
        const importAsNewSeason = window.confirm(se.importConflictAskNewName);
        if (importAsNewSeason) {
          const suggestedDisplayName =
            (imported.error &&
              imported.error.details &&
              String(imported.error.details.suggested_display_name || "").trim()) ||
            "";
          const displayNameRaw = window.prompt(se.importConflictNewNamePrompt, suggestedDisplayName);
          if (displayNameRaw === null) {
            setStatus(se.importCancelled, false);
            return;
          }
          const displayName = String(displayNameRaw).trim();
          if (!displayName) {
            setStatus(se.invalidSeasonName, true);
            return;
          }
          imported = await api("import_series_year", {
            file_path: filePath,
            display_name: displayName,
          });
        } else {
          const replaceExisting = window.confirm(se.importConflictAskReplace);
          if (!replaceExisting) {
            setStatus(se.importCancelled, false);
            return;
          }
          const targetNameRaw = window.prompt(se.importConflictReplaceNamePrompt, "");
          if (targetNameRaw === null) {
            setStatus(se.importCancelled, false);
            return;
          }
          const targetName = String(targetNameRaw).trim();
          if (!targetName) {
            setStatus(se.invalidSeasonName, true);
            return;
          }
          const confirmTyped = window.prompt(se.importConflictReplaceConfirmPrompt(targetName), "");
          if (confirmTyped === null) {
            setStatus(se.importCancelled, false);
            return;
          }
          imported = await api("import_series_year", {
            file_path: filePath,
            display_name: targetName,
            replace_existing: true,
            confirm_replace_display_name: String(confirmTyped).trim(),
          });
        }
      }
      if (imported.status === "error") {
        setStatus(getApiErrorMessage(imported.error, se.importFailed), true);
        return;
      }
      const importedYear = Number(imported.payload.series_year);
      setStatus(
        se.importDone(
          String(imported.payload.display_name || "").trim(),
          Number.isInteger(importedYear) ? importedYear : null
        ),
        false
      );
      await showSeasonEntry();
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
      // Grid: columns = 1/2 h (left), 1 h (right); rows = F, M.
      einzel: [
        { key: "half_women", label: cs.half_women, match: (category) => durationSortKey(category.duration) === 0 && normalizeDivision(category.division) === "women" },
        { key: "hour_women", label: cs.hour_women, match: (category) => durationSortKey(category.duration) === 1 && normalizeDivision(category.division) === "women" },
        { key: "half_men", label: cs.half_men, match: (category) => durationSortKey(category.duration) === 0 && normalizeDivision(category.division) === "men" },
        { key: "hour_men", label: cs.hour_men, match: (category) => durationSortKey(category.duration) === 1 && normalizeDivision(category.division) === "men" },
      ],
      // Grid: columns = 1/2 h (left), 1 h (right); rows = F, M, Mix.
      paare: [
        {
          key: "half_couples_women",
          label: cs.half_couples_women,
          match: (category) => durationSortKey(category.duration) === 0 && normalizeDivision(category.division) === "couples_women",
        },
        {
          key: "hour_couples_women",
          label: cs.hour_couples_women,
          match: (category) => durationSortKey(category.duration) === 1 && normalizeDivision(category.division) === "couples_women",
        },
        {
          key: "half_couples_men",
          label: cs.half_couples_men,
          match: (category) => durationSortKey(category.duration) === 0 && normalizeDivision(category.division) === "couples_men",
        },
        {
          key: "hour_couples_men",
          label: cs.hour_couples_men,
          match: (category) => durationSortKey(category.duration) === 1 && normalizeDivision(category.division) === "couples_men",
        },
        {
          key: "half_couples_mixed",
          label: cs.half_couples_mixed,
          match: (category) => durationSortKey(category.duration) === 0 && normalizeDivision(category.division) === "couples_mixed",
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

  function renderImportedRunsMatrix(importedRaceInfo, options) {
    const opts = options || {};
    const mx = STR.matrix;
    const matrixClass = opts.compact ? "imported-runs-matrix imported-runs-matrix--compact" : "imported-runs-matrix";
    const wrapClass = opts.compact ? "imported-runs-matrix-wrap imported-runs-matrix-wrap--compact" : "imported-runs-matrix-wrap";
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
      <div class="${wrapClass}">
        <table class="${matrixClass}">
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

  const PDF_LAYOUT_PRESET_LS = "stundenlauf_pdf_layout_preset";

  function syncPdfLayoutPresetFromStorage(validIds) {
    if (!validIds || !validIds.size) {
      return;
    }
    try {
      const raw = localStorage.getItem(PDF_LAYOUT_PRESET_LS);
      if (raw) {
        const id = String(raw).trim().toLowerCase();
        if (validIds.has(id)) {
          state.pdfExportLayoutPresetId = id;
          return;
        }
      }
    } catch {
      /* ignore */
    }
    if (!validIds.has(state.pdfExportLayoutPresetId)) {
      state.pdfExportLayoutPresetId = validIds.has("default") ? "default" : Array.from(validIds)[0];
    }
  }

  function wireStandingsPdfExport() {
    const st = STR.standings;
    const buttons = standingsView.querySelectorAll("button[data-export-standings-pdf]");
    if (!buttons.length) {
      return;
    }
    for (const sel of standingsView.querySelectorAll(".pdf-layout-preset-select")) {
      sel.value = state.pdfExportLayoutPresetId || "default";
      sel.addEventListener("change", () => {
        const v = String(sel.value || "").trim().toLowerCase();
        state.pdfExportLayoutPresetId = v || "default";
        try {
          localStorage.setItem(PDF_LAYOUT_PRESET_LS, state.pdfExportLayoutPresetId);
        } catch {
          /* ignore */
        }
        for (const other of standingsView.querySelectorAll(".pdf-layout-preset-select")) {
          if (other !== sel) {
            other.value = state.pdfExportLayoutPresetId;
          }
        }
      });
    }
    const onClick = async () => {
      const year = state.seriesYear;
      const suggestedName = `stundenlauf-${year}-laufuebersicht`;
      const picked = await api("pick_save_file", { suggested_name: suggestedName, dialog_kind: "pdf" });
      if (picked.status !== "ok") {
        setStatus(st.exportPdfPickFailed, true);
        return;
      }
      const destinationPath = (picked.payload && picked.payload.file_path ? picked.payload.file_path : "").trim();
      if (!destinationPath) {
        return;
      }
      const preset = String(state.pdfExportLayoutPresetId || "default").trim().toLowerCase();
      const exportPayload =
        preset && preset !== "default" ? { destination_path: destinationPath, layout_preset: preset } : { destination_path: destinationPath };
      const exported = await api("export_standings_pdf", exportPayload);
      if (exported.status === "error") {
        setStatus(getApiErrorMessage(exported.error, st.exportPdfFailed), true);
        return;
      }
      const paths = (exported.payload && exported.payload.export_files) || [];
      setStatus(st.exportPdfDone(paths), false);
    };
    for (const btn of buttons) {
      btn.addEventListener("click", onClick);
    }
  }

  async function renderStandingsView(options = {}) {
    const preserveStandingsScroll = Boolean(options.preserveStandingsScroll);
    const st = STR.standings;
    const sid = st.identity;
    if (!state.pdfExportLayoutPresets) {
      const presetRes = await api("list_pdf_export_layout_presets", {});
      if (presetRes.status === "ok" && presetRes.payload && Array.isArray(presetRes.payload.presets)) {
        state.pdfExportLayoutPresets = presetRes.payload.presets;
      }
    }
    const presetIds = new Set(
      (state.pdfExportLayoutPresets || [])
        .map((p) => String(p.id || "").trim().toLowerCase())
        .filter(Boolean)
    );
    syncPdfLayoutPresetFromStorage(presetIds);
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
              <div class="category-grid category-grid--einzel">${renderQuickGrid("einzel")}</div>
            </div>
            <div class="sidebar-section">
              <h3>${st.sidebarCouples}</h3>
              <div class="category-grid category-grid--paare">${renderQuickGrid("paare")}</div>
            </div>
            <div class="sidebar-section">
              ${renderPdfExportSidebarBlock(st)}
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
      wireStandingsPdfExport();
      return;
    }

    const standingsResponse = await api("get_standings", { category_key: state.selectedCategory });
    const resultsResponse = await api("get_category_current_results_table", { category_key: state.selectedCategory });
    if (standingsResponse.status === "error" || resultsResponse.status === "error") {
      standingsView.innerHTML = `<div class="card"><p class="danger-text">${st.loadFailed}</p></div>`;
      return;
    }

    let savedStandingsScrollTop = 0;
    let savedPerRaceWrapScroll = { top: 0, left: 0 };
    if (preserveStandingsScroll) {
      const scrollEl = standingsView.querySelector(".standings-content");
      if (scrollEl) {
        savedStandingsScrollTop = scrollEl.scrollTop;
      }
      const perRaceWrap = standingsView.querySelector(".standings-per-race-table")?.closest(".table-wrap");
      if (perRaceWrap) {
        savedPerRaceWrapScroll = { top: perRaceWrap.scrollTop, left: perRaceWrap.scrollLeft };
      }
    }

    const rawStandingsRows = standingsResponse.payload.rows || [];
    lastStandingsRows = rawStandingsRows;
    const standingsEmptyCell = STR.matrix.cellNo;
    const standingsRows = rawStandingsRows
      .map((row, idx) => {
        const rowCells = `<td>${row.platz}</td><td>${row.display_name}</td><td>${row.yob || standingsEmptyCell}</td><td>${row.club || standingsEmptyCell}</td><td>${FMT.formatKm(row.distanz_gesamt)}</td><td>${row.punkte_gesamt}</td>`;
        if (state.standingsCorrectionMode) {
          return `<tr class="standings-row--correctable" data-row-index="${idx}">${rowCells}</tr>`;
        }
        return `<tr>${rowCells}</tr>`;
      })
      .join("");

    const raceHeadersList = resultsResponse.payload.meta.race_headers || [];
    const resultHeaders = raceHeadersList.map((item) => `<th>${item}</th>`).join("");
    const overviewColspan = 5 + raceHeadersList.length;
    const sm = st.merge;
    const canMergeExecute = Boolean(
      state.mergeSurvivor &&
        state.mergeAbsorbed &&
        state.mergeSurvivor.entity_kind === state.mergeAbsorbed.entity_kind &&
        state.mergeSurvivor.uid !== state.mergeAbsorbed.uid
    );
    const survivorLine = state.mergeSurvivor
      ? `${escapeHtml(state.mergeSurvivor.display_name)} <span class="hint">(${
          state.mergeSurvivor.entity_kind === "team" ? "Paar" : "Einzel"
        }; Läufe: ${escapeHtml(state.mergeSurvivor.racesLabel)})</span>`
      : "—";
    const absorbedLine = state.mergeAbsorbed
      ? `${escapeHtml(state.mergeAbsorbed.display_name)} <span class="hint">(${
          state.mergeAbsorbed.entity_kind === "team" ? "Paar" : "Einzel"
        }; Läufe: ${escapeHtml(state.mergeAbsorbed.racesLabel)})</span>`
      : "—";
    const mergePanel =
      state.standingsMergeMode && sm
        ? `<p class="hint merge-mode-banner">${sm.banner}</p>
          <div class="standings-merge-panel">
            <div class="standings-merge-picks">
              <p><strong>${sm.survivorLabel}:</strong> ${survivorLine}</p>
              <p><strong>${sm.absorbedLabel}:</strong> ${absorbedLine}</p>
            </div>
            <div class="standings-merge-actions">
              <button type="button" class="secondary" data-merge-reset>${sm.resetPicks}</button>
              <button type="button" class="primary" data-merge-confirm${canMergeExecute ? "" : " disabled"}>${sm.confirm}</button>
            </div>
          </div>`
        : "";
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
        const platzDisp = row.platz == null ? st.platzExcludedSentinel : row.platz;
        const excludedClass = row.ausser_wertung ? " standings-row--excluded" : "";
        const uid = escapeHtml(row.entity_uid || "");
        const ekind = row.entity_kind === "team" ? "team" : "participant";
        const raceNosRaw = (row.race_cells || [])
          .filter((c) => c.distance_km != null)
          .map((c) => c.race_no)
          .join(",");
        const racesLabel = raceNosRaw ? raceNosRaw.replace(/,/g, ", ") : "—";
        let mergeRowClass = "";
        if (state.standingsMergeMode) {
          mergeRowClass += " standings-per-race-row--mergeable";
        }
        if (state.mergeSurvivor && state.mergeSurvivor.uid === row.entity_uid) {
          mergeRowClass += " standings-merge-survivor";
        }
        if (state.mergeAbsorbed && state.mergeAbsorbed.uid === row.entity_uid) {
          mergeRowClass += " standings-merge-absorbed";
        }
        const aria = escapeHtml(st.ausserWertungAria(row.display_name || ""));
        const checked = row.ausser_wertung ? " checked" : "";
        const awDisabled = state.standingsMergeMode;
        const awTitle =
          awDisabled && sm && sm.awDisabledInMergeMode ? escapeHtml(sm.awDisabledInMergeMode) : "";
        const awCell = `<td class="standings-aw-cell${awDisabled ? " standings-aw-cell--merge-disabled" : ""}"><input type="checkbox"${checked}${
          awDisabled ? " disabled" : ""
        } data-set-ranking-eligibility data-entity-uid="${uid}" aria-label="${aria}"${awTitle ? ` title="${awTitle}"` : ""} /></td>`;
        return `<tr class="standings-per-race-row${excludedClass}${mergeRowClass}" data-merge-pick-row="1" data-entity-uid="${uid}" data-entity-kind="${ekind}" data-display-name="${escapeHtml(
          row.display_name || ""
        )}" data-race-nos="${escapeHtml(raceNosRaw)}" data-races-label="${escapeHtml(racesLabel)}"><td>${platzDisp}</td>${awCell}<td>${escapeHtml(
          row.display_name || ""
        )}</td>${cells}<td>${FMT.formatKm(row.distanz_gesamt)}</td><td>${row.punkte_gesamt}</td></tr>`;
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
            <div class="category-grid category-grid--einzel">${renderQuickGrid("einzel")}</div>
            </div>
            <div class="sidebar-section">
              <h3>${st.sidebarCouples}</h3>
              <div class="category-grid category-grid--paare">${renderQuickGrid("paare")}</div>
            </div>
            <div class="sidebar-section">
              ${renderPdfExportSidebarBlock(st)}
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
              <table class="table--banded">
                <thead><tr><th>${st.thPlatz}</th><th>${st.thName}</th><th>${st.thYob}</th><th>${st.thClub}</th><th>${st.thDistanceTotal}</th><th>${st.thPointsTotal}</th></tr></thead>
                <tbody>${standingsRows || `<tr><td colspan="6">${st.emptyStandings}</td></tr>`}</tbody>
              </table>
            </div>
          </div>
          <div class="card">
            <div class="standings-per-race-head">
              <h3>${st.perRaceTitle}</h3>
              <button type="button" class="secondary" data-merge-toggle>${
                state.standingsMergeMode ? sm.toggleOff : sm.toggleOn
              }</button>
            </div>
            ${mergePanel}
            <div class="table-wrap">
              <table class="standings-per-race-table table--banded">
                <thead><tr><th>${st.thPlatz}</th><th class="standings-aw-col" title="${escapeHtml(
                  st.thAusserWertungTitle
                )}" aria-label="${escapeHtml(st.thAusserWertungTitle)}">${st.thAusserWertungShort}</th><th>${st.thName}</th>${resultHeaders}<th>${st.thDistanceShort}</th><th>${st.thPointsTotal}</th></tr></thead>
                <tbody>${resultRows || `<tr><td colspan="${overviewColspan}">${st.emptyRaceRows}</td></tr>`}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
    for (const input of standingsView.querySelectorAll("input[data-set-ranking-eligibility]")) {
      if (input.disabled) {
        continue;
      }
      input.addEventListener("change", async () => {
        const uid = input.getAttribute("data-entity-uid");
        if (!uid || !state.selectedCategory) {
          return;
        }
        const ausser = input.checked;
        const res = await api("set_ranking_eligibility", {
          category_key: state.selectedCategory,
          entity_uid: uid,
          ausser_wertung: ausser,
        });
        if (res.status === "error") {
          input.checked = !ausser;
          setStatus(`${STR.status.prefix}${res.error?.message || STR.status.mergeSaveFailed}`, true);
          return;
        }
        await renderStandingsView({ preserveStandingsScroll: true });
      });
    }
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
    wireStandingsPdfExport();

    if (preserveStandingsScroll) {
      const applyScrollRestore = () => {
        const scrollEl = standingsView.querySelector(".standings-content");
        if (scrollEl) {
          scrollEl.scrollTop = savedStandingsScrollTop;
        }
        const perRaceWrap = standingsView.querySelector(".standings-per-race-table")?.closest(".table-wrap");
        if (perRaceWrap) {
          perRaceWrap.scrollTop = savedPerRaceWrapScroll.top;
          perRaceWrap.scrollLeft = savedPerRaceWrapScroll.left;
        }
      };
      applyScrollRestore();
      requestAnimationFrame(applyScrollRestore);
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

  function renderPdfExportSidebarBlock(st) {
    const presets = state.pdfExportLayoutPresets;
    const button = `<button type="button" class="secondary sidebar-top-action" data-export-standings-pdf title="${escapeHtml(st.exportPdfSaveHint)}">${st.exportPdfButton}</button>`;
    if (!presets || !presets.length) {
      return `<h3>${st.exportSectionTitle}</h3>${button}`;
    }
    const selId = state.pdfExportLayoutPresetId || "default";
    const opts = presets
      .map((p) => {
        const id = escapeHtml(p.id || "");
        const lab = escapeHtml(p.label_de || p.id || "");
        const sel = p.id === selId ? " selected" : "";
        return `<option value="${id}"${sel}>${lab}</option>`;
      })
      .join("");
    const aria = escapeHtml(st.exportPdfLayoutAria);
    const label = escapeHtml(st.exportPdfLayoutLabel);
    return `<h3>${st.exportSectionTitle}</h3>
      <div class="pdf-export-layout-row">
        <span class="pdf-export-layout-label">${label}</span>
        <select class="pdf-layout-preset-select" aria-label="${aria}">${opts}</select>
      </div>
      ${button}`;
  }

  function identityYobBounds() {
    const maxYear = new Date().getUTCFullYear() + 1;
    return { min: 1900, max: maxYear };
  }

  function closeIdentityModal() {
    identityModalRow = null;
    importMergeCorrectContext = null;
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
    importMergeCorrectContext = null;
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
      if (state.standingsCorrectionMode) {
        state.standingsMergeMode = false;
        state.mergeSurvivor = null;
        state.mergeAbsorbed = null;
      }
      await renderStandingsView({ preserveStandingsScroll: true });
      return;
    }
    const mergeToggle = ev.target.closest("[data-merge-toggle]");
    if (mergeToggle) {
      ev.preventDefault();
      state.standingsMergeMode = !state.standingsMergeMode;
      if (state.standingsMergeMode) {
        state.standingsCorrectionMode = false;
      }
      state.mergeSurvivor = null;
      state.mergeAbsorbed = null;
      await renderStandingsView({ preserveStandingsScroll: true });
      return;
    }
    if (ev.target.closest("[data-merge-reset]")) {
      ev.preventDefault();
      state.mergeSurvivor = null;
      state.mergeAbsorbed = null;
      await renderStandingsView({ preserveStandingsScroll: true });
      return;
    }
    const mergeGo = ev.target.closest("[data-merge-confirm]");
    if (mergeGo) {
      ev.preventDefault();
      if (mergeGo.disabled) {
        return;
      }
      const m = STR.standings.merge;
      if (!state.seriesYear || !state.selectedCategory) {
        setStatus(`${STR.status.prefix}${m.needSeriesYear}`, true);
        return;
      }
      if (!state.mergeSurvivor || !state.mergeAbsorbed) {
        setStatus(`${STR.status.prefix}${m.needTwoPicks}`, true);
        return;
      }
      if (state.mergeSurvivor.entity_kind !== state.mergeAbsorbed.entity_kind) {
        setStatus(`${STR.status.prefix}${m.kindMismatch}`, true);
        return;
      }
      if (!window.confirm(m.confirmDialog(state.mergeSurvivor.display_name, state.mergeAbsorbed.display_name))) {
        return;
      }
      const res = await api("merge_standings_entities", {
        series_year: state.seriesYear,
        category_key: state.selectedCategory,
        entity_kind: state.mergeSurvivor.entity_kind,
        survivor_uid: state.mergeSurvivor.uid,
        absorbed_uid: state.mergeAbsorbed.uid,
      });
      if (res.status === "error") {
        setStatus(`${STR.status.prefix}${res.error?.details?.message || res.error?.message || STR.status.mergeSaveFailed}`, true);
        return;
      }
      state.mergeSurvivor = null;
      state.mergeAbsorbed = null;
      state.standingsMergeMode = false;
      setStatus(m.success, false);
      await renderStandingsView({ preserveStandingsScroll: true });
      return;
    }
    const mergeRow = ev.target.closest("tr[data-merge-pick-row]");
    if (mergeRow && state.standingsMergeMode) {
      if (ev.target.closest("input[data-set-ranking-eligibility]") || ev.target.closest("button")) {
        return;
      }
      ev.preventDefault();
      const uid = mergeRow.getAttribute("data-entity-uid") || "";
      const entity_kind = mergeRow.getAttribute("data-entity-kind") || "participant";
      const display_name = mergeRow.getAttribute("data-display-name") || uid;
      const racesLabel = mergeRow.getAttribute("data-races-label") || "—";
      const pick = { uid, entity_kind, display_name, racesLabel };
      if (state.mergeSurvivor && state.mergeSurvivor.uid === uid) {
        state.mergeSurvivor = null;
        await renderStandingsView({ preserveStandingsScroll: true });
        return;
      }
      if (state.mergeAbsorbed && state.mergeAbsorbed.uid === uid) {
        state.mergeAbsorbed = null;
        await renderStandingsView({ preserveStandingsScroll: true });
        return;
      }
      if (!state.mergeSurvivor) {
        state.mergeSurvivor = pick;
        await renderStandingsView({ preserveStandingsScroll: true });
        return;
      }
      if (entity_kind !== state.mergeSurvivor.entity_kind) {
        setStatus(`${STR.status.prefix}${STR.standings.merge.kindMismatch}`, true);
        return;
      }
      state.mergeAbsorbed = pick;
      await renderStandingsView({ preserveStandingsScroll: true });
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
    const s = String(name).trim();
    const mLauf = s.match(/Lauf\s+(\d+)/i);
    if (mLauf) {
      const n = parseInt(mLauf[1], 10);
      return Number.isFinite(n) && n >= 1 ? n : null;
    }
    const isolated = [...s.matchAll(/(?<!\d)\d(?!\d)/g)];
    if (isolated.length !== 1) {
      return null;
    }
    const n = parseInt(isolated[0][0], 10);
    return Number.isFinite(n) && n >= 1 ? n : null;
  }

  function inferImportSourceTypeFromBasename(name) {
    const lower = String(name).trim().toLowerCase();
    return lower.includes("paare") ? "couples" : "singles";
  }

  function buildImportInferenceLine(basename) {
    const iv = STR.importView;
    const base = String(basename).trim();
    if (!base) {
      return "";
    }
    const inferredType = inferImportSourceTypeFromBasename(base);
    const inferredRace = inferImportRaceNoFromBasename(base);
    const typeLabel = inferredType === "singles" ? iv.singles : iv.couples;
    const racePart = inferredRace != null ? `${iv.raceWord} ${inferredRace}` : null;
    if (racePart) {
      return iv.inferenceDetectedBoth(typeLabel, racePart);
    }
    return iv.inferenceDetectedTypeOnly(typeLabel);
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
    state.importSourceType = base.trim() ? inferredType : "";
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

  function confidencePercent(confidence) {
    const value = Number(confidence || 0);
    const bounded = Math.max(0, Math.min(1, value));
    return Math.round(bounded * 100);
  }

  function reviewSelectionKey(review) {
    return `${review.race_event_uid}::${review.entry_uid}`;
  }

  function buildApplyMatchLinkPayload(review, targetUid, candidatePreview, rationale) {
    const base = {
      race_event_uid: review.race_event_uid,
      entry_uid: review.entry_uid,
      rationale: rationale || "manual review accept",
    };
    if (candidatePreview && candidatePreview.kind === "team") {
      return { ...base, target_team_uid: targetUid };
    }
    return { ...base, target_participant_uid: targetUid };
  }

  function mergeCellLines(innerHtml) {
    return `<span class="merge-cell-lines">${innerHtml}</span>`;
  }

  /** Name+YOB for merge table: singles one line; Paare two stacked lines (parity with granular candidate cells). */
  function renderMergeNameYobStackedHtml(preview) {
    const pr = STR.preview;
    if (!preview) {
      return escapeHtml(pr.unknown);
    }
    const sep = " / ";
    const display = (preview.display_name && String(preview.display_name).trim()) || "";
    const nameTokens = display ? display.split(sep).map((t) => t.trim()).filter(Boolean) : [];
    const yobRaw = preview.yob;
    const yobJoined = yobRaw == null || yobRaw === "" ? "" : String(yobRaw);
    const yobTokens = yobJoined ? yobJoined.split(sep).map((t) => t.trim()).filter((t) => t.length) : [];
    const yFor = (i) => (yobTokens[i] != null && yobTokens[i] !== "" ? yobTokens[i] : "-");

    const isTeam = preview.kind === "team" || nameTokens.length >= 2;
    if (isTeam && nameTokens.length >= 2) {
      return nameTokens
        .map((name, i) => `${escapeHtml(name)} (${escapeHtml(String(yFor(i)))})`)
        .join("<br />");
    }
    const name = escapeHtml(nameTokens[0] || pr.unknown);
    const y =
      yobTokens[0] || (preview.yob != null && preview.yob !== "" ? String(preview.yob) : "-");
    return `${name} (${escapeHtml(String(y))})`;
  }

  /** Club column: singles one line; Paare stacked when composite uses ` / ` (matches name lines). */
  function renderMergeClubStackedHtml(preview) {
    const emptyClub = STR.matrix.cellNo;
    if (!preview) {
      return escapeHtml(emptyClub);
    }
    const sep = " / ";
    const raw = preview.club;
    if (raw == null || raw === "") {
      return escapeHtml(emptyClub);
    }
    const s = String(raw).trim();
    if (!s) {
      return escapeHtml(emptyClub);
    }
    if (preview.kind === "team") {
      const parts = s.split(sep).map((t) => t.trim()).filter(Boolean);
      if (parts.length >= 2) {
        return parts.map((p) => escapeHtml(p)).join("<br />");
      }
    }
    return escapeHtml(s);
  }

  /** Same pattern as standings per-race cells: `x km / y P`, or em dash if no distance. */
  function formatIncomingWertung(resultPreview) {
    const d = resultPreview?.distance_km;
    if (d == null) {
      return STR.matrix.cellNo;
    }
    const p = resultPreview?.points;
    if (p == null || p === "") {
      return `${FMT.formatKm(d)} km / ${STR.matrix.cellNo}`;
    }
    return STR.units.raceCell(d, p);
  }

  function normalizeForDiff(val) {
    if (val == null || val === "") return "";
    return String(val).trim().toLowerCase();
  }

  function nameDiffClass(incomingPreview, candidatePreview) {
    const nameSame = normalizeForDiff(incomingPreview?.display_name) === normalizeForDiff(candidatePreview?.display_name);
    const yobSame = normalizeForDiff(incomingPreview?.yob) === normalizeForDiff(candidatePreview?.yob);
    return nameSame && yobSame ? "" : "merge-diff-cell";
  }

  function clubDiffClass(incomingPreview, candidatePreview) {
    return normalizeForDiff(incomingPreview?.club) === normalizeForDiff(candidatePreview?.club) ? "" : "merge-diff-cell";
  }

  function teamPreviewToTeamMembers(preview) {
    if (!preview || preview.kind !== "team" || !preview.member_a || !preview.member_b) {
      return null;
    }
    return [
      { member: "a", name: preview.member_a.name || "", yob: preview.member_a.yob, club: preview.member_a.club },
      { member: "b", name: preview.member_b.name || "", yob: preview.member_b.yob, club: preview.member_b.club },
    ];
  }

  function buildImportMergeCorrectModalBodyHtml(review, targetUid, candidatePreview) {
    const iv = STR.importView;
    const mc = iv.mergeCorrect;
    const st = STR.standings;
    const id = st.identity;
    const bounds = identityYobBounds();
    const err = `<p id="identityModalInlineError" class="danger-text hidden"></p>`;
    const incoming = review.entry_preview;
    const incName = mergeCellLines(renderMergeNameYobStackedHtml(incoming));
    const incClub = mergeCellLines(renderMergeClubStackedHtml(incoming));
    const candName = mergeCellLines(renderMergeNameYobStackedHtml(candidatePreview));
    const candClub = mergeCellLines(renderMergeClubStackedHtml(candidatePreview));
    const compare = `<div class="import-merge-correct-compare">
      <div class="import-merge-correct-col">
        <h4 class="import-merge-correct-heading">${escapeHtml(mc.compareIncoming)}</h4>
        <p class="import-merge-correct-preview"><span class="import-merge-correct-label">${escapeHtml(st.thName)} / ${escapeHtml(st.thYob)}</span><br />${incName}</p>
        <p class="import-merge-correct-preview"><span class="import-merge-correct-label">${escapeHtml(st.thClub)}</span><br />${incClub}</p>
      </div>
      <div class="import-merge-correct-col">
        <h4 class="import-merge-correct-heading">${escapeHtml(mc.compareExisting)}</h4>
        <p class="import-merge-correct-preview"><span class="import-merge-correct-label">${escapeHtml(st.thName)} / ${escapeHtml(st.thYob)}</span><br />${candName}</p>
        <p class="import-merge-correct-preview"><span class="import-merge-correct-label">${escapeHtml(st.thClub)}</span><br />${candClub}</p>
      </div>
    </div>
    <p class="hint">${escapeHtml(mc.editHint)}</p>`;

    if (candidatePreview.kind === "team") {
      const members = teamPreviewToTeamMembers(candidatePreview);
      if (!members || members.length < 2) {
        return `${err}<p class="danger-text">${id.errTeamMembers}</p>`;
      }
      const mA = members.find((m) => m.member === "a") || members[0];
      const mB = members.find((m) => m.member === "b") || members[1];
      function memberInputs(memberKey, label, m) {
        const yDisplay = typeof m.yob === "number" && m.yob >= bounds.min ? String(m.yob) : "";
        return `<div class="identity-member-block">
        <h4>${escapeHtml(label)}</h4>
        <div class="identity-field-grid">
          <div><label for="importMergeInName_${memberKey}">${st.thName}</label><input id="importMergeInName_${memberKey}" type="text" value="${escapeHtml(m.name || "")}" autocomplete="off" /></div>
          <div><label for="importMergeInClub_${memberKey}">${st.thClub}</label><input id="importMergeInClub_${memberKey}" type="text" value="${escapeHtml(m.club == null ? "" : m.club)}" autocomplete="off" /></div>
          <div><label for="importMergeInYob_${memberKey}">${st.thYob}</label><input id="importMergeInYob_${memberKey}" type="number" min="${bounds.min}" max="${bounds.max}" step="1" value="${escapeHtml(yDisplay)}" /></div>
        </div>
      </div>`;
      }
      return `${compare}${err}<p class="hint">${escapeHtml(id.excelHint)}</p>
        ${memberInputs("a", id.memberA, mA)}${memberInputs("b", id.memberB, mB)}
        <div class="identity-member-actions"><button type="button" class="primary" id="importMergeCorrectSubmit">${escapeHtml(mc.submit)}</button></div>`;
    }

    const y = candidatePreview.yob;
    const yDisplay = typeof y === "number" && y >= bounds.min ? String(y) : "";
    const nm = candidatePreview.display_name || "";
    const cl = candidatePreview.club == null ? "" : candidatePreview.club;
    return `${compare}${err}<p class="hint">${escapeHtml(id.excelHint)}</p>
      <div class="identity-field-grid">
        <div><label for="importMergeInName">${st.thName}</label><input id="importMergeInName" type="text" value="${escapeHtml(nm)}" autocomplete="off" /></div>
        <div><label for="importMergeInClub">${st.thClub}</label><input id="importMergeInClub" type="text" value="${escapeHtml(cl)}" autocomplete="off" /></div>
        <div><label for="importMergeInYob">${st.thYob}</label><input id="importMergeInYob" type="number" min="${bounds.min}" max="${bounds.max}" step="1" value="${escapeHtml(yDisplay)}" /></div>
      </div>
      <div class="identity-member-actions"><button type="button" class="primary" id="importMergeCorrectSubmit">${escapeHtml(mc.submit)}</button></div>`;
  }

  function openImportMergeCorrectModal(review, targetUid, candidatePreview, reviewKey) {
    const mc = STR.importView.mergeCorrect;
    if (!identityModalTitle || !identityModalBody || !identityCorrectionModal || !candidatePreview) {
      return;
    }
    identityModalRow = null;
    const initialSingle =
      candidatePreview.kind === "team"
        ? null
        : {
            name: String(candidatePreview.display_name || "").trim(),
            yob: typeof candidatePreview.yob === "number" ? candidatePreview.yob : null,
            club: candidatePreview.club == null ? "" : String(candidatePreview.club).trim(),
          };
    let initialTeam = null;
    if (candidatePreview.kind === "team") {
      const members = teamPreviewToTeamMembers(candidatePreview);
      if (members) {
        initialTeam = {};
        for (const m of members) {
          initialTeam[m.member] = {
            name: String(m.name || "").trim(),
            yob: typeof m.yob === "number" ? m.yob : null,
            club: m.club == null ? "" : String(m.club).trim(),
          };
        }
      }
    }
    importMergeCorrectContext = {
      review,
      targetUid,
      candidatePreview,
      reviewKey,
      initialSingle,
      initialTeam,
    };
    identityModalTitle.textContent = mc.modalTitle;
    identityModalBody.innerHTML = buildImportMergeCorrectModalBodyHtml(review, targetUid, candidatePreview);
    identityCorrectionModal.classList.remove("hidden");
    identityCorrectionModal.setAttribute("aria-hidden", "false");
    const submitBtn = document.getElementById("importMergeCorrectSubmit");
    if (submitBtn) {
      submitBtn.addEventListener("click", () => void submitImportMergeCorrect());
    }
  }

  async function submitImportMergeCorrect() {
    const ctx = importMergeCorrectContext;
    if (!ctx) {
      return;
    }
    const id = STR.standings.identity;
    const mc = STR.importView.mergeCorrect;
    clearIdentityModalInlineError();
    const bounds = identityYobBounds();
    const rationale = "import review merge and correct";
    const linkPayload = buildApplyMatchLinkPayload(ctx.review, ctx.targetUid, ctx.candidatePreview, rationale);
    const linkResp = await api("apply_match_decision", linkPayload);
    if (linkResp.status === "error") {
      showIdentityModalInlineError(getApiErrorMessage(linkResp.error, STR.status.mergeSaveFailed));
      return;
    }

    const normClub = (v) => (v == null || String(v).trim() === "" ? "" : String(v).trim());

    if (ctx.candidatePreview.kind === "team") {
      if (!ctx.initialTeam) {
        showIdentityModalInlineError(id.errTeamMembers);
        return;
      }
      for (const member of ["a", "b"]) {
        const nameEl = document.getElementById(`importMergeInName_${member}`);
        const clubEl = document.getElementById(`importMergeInClub_${member}`);
        const yobEl = document.getElementById(`importMergeInYob_${member}`);
        const name = (nameEl && nameEl.value.trim()) || "";
        const clubVal = normClub(clubEl && clubEl.value);
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
        const init = ctx.initialTeam[member];
        if (
          init &&
          init.name === name &&
          init.yob === yob &&
          normClub(init.club) === clubVal
        ) {
          continue;
        }
        const resp = await api("update_participant_identity", {
          series_year: state.seriesYear,
          team_uid: ctx.targetUid,
          member,
          name,
          yob,
          club: clubVal,
        });
        if (resp.status === "error") {
          showIdentityModalInlineError(getApiErrorMessage(resp.error, STR.errors.desktopApiUnavailable));
          return;
        }
      }
    } else {
      const nameEl = document.getElementById("importMergeInName");
      const clubEl = document.getElementById("importMergeInClub");
      const yobEl = document.getElementById("importMergeInYob");
      const name = (nameEl && nameEl.value.trim()) || "";
      const clubVal = normClub(clubEl && clubEl.value);
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
      const init = ctx.initialSingle;
      if (
        init &&
        init.name === name &&
        init.yob === yob &&
        normClub(init.club) === clubVal
      ) {
        closeIdentityModal();
        delete state.reviewSelections[ctx.reviewKey];
        state.reviewIndex = 0;
        await loadOverview();
        await renderImportView();
        setStatus(mc.successStatus, false);
        return;
      }
      const resp = await api("update_participant_identity", {
        series_year: state.seriesYear,
        participant_uid: ctx.targetUid,
        name,
        yob,
        club: clubVal,
      });
      if (resp.status === "error") {
        showIdentityModalInlineError(getApiErrorMessage(resp.error, STR.errors.desktopApiUnavailable));
        return;
      }
    }

    closeIdentityModal();
    delete state.reviewSelections[ctx.reviewKey];
    state.reviewIndex = 0;
    await loadOverview();
    await renderImportView();
    setStatus(mc.successStatus, false);
  }

  function candidateReviewDisplayForRow(review, index) {
    const list = review.candidate_review_displays;
    if (!Array.isArray(list) || index < 0 || index >= list.length) {
      return null;
    }
    return list[index] || null;
  }

  function renderMergeNameYobHtmlFromDisplay(display) {
    if (!display || !Array.isArray(display.lines) || display.lines.length === 0) {
      return "";
    }
    const lineHtmls = display.lines.map((line) => {
      const segs = line.name_segments || [];
      const nameInner = segs
        .map((seg) => {
          const inner = escapeHtml(seg.text ?? "");
          return seg.diff ? `<span class="merge-diff-part">${inner}</span>` : inner;
        })
        .join("");
      const y = line.yob || {};
      const yInner = escapeHtml(y.text ?? "-");
      const yHtml = y.diff ? `<span class="merge-diff-part">(${yInner})</span>` : `(${yInner})`;
      return `${nameInner} ${yHtml}`.trim();
    });
    return lineHtmls.join("<br />");
  }

  function renderMergeClubHtmlFromDisplay(display) {
    const emptyClub = STR.matrix.cellNo;
    if (!display || !Array.isArray(display.lines) || display.lines.length === 0) {
      return escapeHtml(emptyClub);
    }
    if (display.lines.length === 1) {
      const c = display.lines[0].club || {};
      const inner = escapeHtml(c.text ?? emptyClub);
      return c.diff ? `<span class="merge-diff-part">${inner}</span>` : inner;
    }
    const part = (line) => {
      const c = line.club || {};
      const inner = escapeHtml(c.text ?? emptyClub);
      return c.diff ? `<span class="merge-diff-part">${inner}</span>` : inner;
    };
    return `${part(display.lines[0])}<br />${part(display.lines[1])}`;
  }

  function renderIncomingTableRow(preview, resultPreview, startnr) {
    const iv = STR.importView;
    return `<tr class="incoming-row merge-incoming-separator">
      <td>${mergeCellLines(escapeHtml(iv.incomingRangLabel))}</td>
      <td>${mergeCellLines(renderMergeNameYobStackedHtml(preview))}</td>
      <td>${mergeCellLines(renderMergeClubStackedHtml(preview))}</td>
      <td></td>
      <td>${mergeCellLines(escapeHtml(`${startnr || "-"}`))}</td>
      <td>${mergeCellLines(escapeHtml(formatIncomingWertung(resultPreview)))}</td>
      <td></td>
    </tr>`;
  }

  function renderCandidateTableRows(review, selectedCandidateUid) {
    const rt = STR.reviewTable;
    const iv = STR.importView;
    const incomingPreview = review.entry_preview;
    const previewByUid = new Map((review.candidate_previews || []).filter(Boolean).map((item) => [item.uid, item]));
    const candidateUids = review.candidate_uids || [];
    if (!candidateUids.length) {
      return `<tr><td colspan="7">${mergeCellLines(escapeHtml(rt.noCandidates))}</td></tr>`;
    }
    return candidateUids
      .map((candidateUid, index) => {
        const preview = previewByUid.get(candidateUid);
        const rank = index + 1;
        const isSelected = selectedCandidateUid === candidateUid;
        const selectedClass = isSelected ? " selected-candidate-row" : "";
        const buttonLabel = isSelected ? iv.selectedCandidate : iv.selectCandidate;
        const buttonAria = isSelected ? iv.selectedCandidateAria : iv.selectCandidateAria;
        const confidences = review.candidate_confidences;
        const aligned = Array.isArray(confidences) && confidences.length === candidateUids.length;
        const rowConfidence = aligned ? confidences[index] : null;
        const matchCell =
          aligned && rowConfidence != null ? `${confidencePercent(rowConfidence)}%` : "-";
        const escapedLabel = escapeHtml(buttonLabel);
        const escapedAria = escapeHtml(buttonAria);
        const reviewDisplay = candidateReviewDisplayForRow(review, index);
        const useGranular =
          reviewDisplay &&
          Array.isArray(reviewDisplay.lines) &&
          reviewDisplay.lines.length > 0 &&
          preview;
        const nameDiff = nameDiffClass(incomingPreview, preview);
        const clubDiff = clubDiffClass(incomingPreview, preview);
        const nameCellInner = useGranular
          ? mergeCellLines(renderMergeNameYobHtmlFromDisplay(reviewDisplay))
          : mergeCellLines(renderMergeNameYobStackedHtml(preview));
        const clubCellInner = useGranular
          ? mergeCellLines(renderMergeClubHtmlFromDisplay(reviewDisplay))
          : mergeCellLines(renderMergeClubStackedHtml(preview));
        const nameTdClass = useGranular ? "" : nameDiff;
        const clubTdClass = useGranular ? "" : clubDiff;
        return `<tr class="candidate-row${selectedClass}" data-candidate-row="${candidateUid}" tabindex="0" role="button" aria-label="${escapedAria}">
          <td>${mergeCellLines(escapeHtml(String(rank)))}</td>
          <td class="${nameTdClass}">${nameCellInner}</td>
          <td class="${clubTdClass}">${clubCellInner}</td>
          <td>${mergeCellLines(escapeHtml(matchCell))}</td>
          <td></td>
          <td></td>
          <td><span class="merge-cell-lines merge-cell-lines--action"><button type="button" class="secondary select-candidate-btn" tabindex="-1" aria-hidden="true">${escapedLabel}</button></span></td>
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
    const reviewMinValue = capReviewMinForConfig(state.matchingConfig.review_min, state.matchingConfig);
    const autoMergeEnabled = Boolean(state.matchingConfig.auto_merge_enabled);
    const perfectMatchAutoMerge = Boolean(state.matchingConfig.perfect_match_auto_merge);
    const strictNormalizedOnly = Boolean(state.matchingConfig.strict_normalized_auto_only);
    const primaryManual =
      !strictNormalizedOnly && !autoMergeEnabled && !perfectMatchAutoMerge;
    const primaryFuzzy =
      !strictNormalizedOnly && !primaryManual;
    const fuzzySubThreshold = primaryFuzzy && autoMergeEnabled;
    const fuzzySubPerfect = primaryFuzzy && !autoMergeEnabled;
    const matchingHint = strictNormalizedOnly
      ? iv.matchingHintStrict
      : primaryManual
        ? iv.matchingHintManual
        : fuzzySubThreshold
          ? iv.matchingHintFuzzyThreshold
          : iv.matchingHintFuzzyPerfect;
    const importBasename = basenameFromPath(state.importFilePath);
    const singlesActive = state.importSourceType === "singles" ? " import-type-btn-active" : "";
    const couplesActive = state.importSourceType === "couples" ? " import-type-btn-active" : "";
    const raceOptions = importedRaceInfo.raceColumns
      .map((n) => `<option value="${n}"${state.importRaceNo === n ? " selected" : ""}>${n}</option>`)
      .join("");
    const importReady = isImportReady();
    const reviewsOpen = state.reviewQueue.length > 0;
    const importAllowed = importReady && !reviewsOpen;
    const inferenceText = importBasename
      ? buildImportInferenceLine(importBasename)
      : iv.pickResultFile;
    const confidencePct = confidencePercent(review && review.confidence ? review.confidence : 0);
    importView.innerHTML = `
      <div class="import-view-layout">
        <aside class="card import-controls-column">
          <div class="sidebar-section">
            <h3>${iv.sidebarImportedRuns}</h3>
            ${renderImportedRunsMatrix(importedRaceInfo)}
          </div>
          ${
            reviewsOpen
              ? `<p class="hint import-blocked-by-reviews-hint">${escapeHtml(iv.importBlockedByOpenReviews)}</p>`
              : ""
          }
          <div class="import-file-row">
            <button id="pickFileBtn" class="secondary" type="button"${reviewsOpen ? " disabled" : ""}>${iv.pickFile}</button>
            <input id="filePathInput" type="text" class="import-file-name" readonly value="${escapeHtml(
              importBasename
            )}" placeholder="${iv.noFilePlaceholder}" />
          </div>
          <p class="import-inference-hint">${escapeHtml(inferenceText)}</p>
          <div class="import-type-toggle">
            <button type="button" id="sourceTypeSinglesBtn" class="secondary${singlesActive}"${reviewsOpen ? " disabled" : ""}>${iv.singles}</button>
            <button type="button" id="sourceTypeCouplesBtn" class="secondary${couplesActive}"${reviewsOpen ? " disabled" : ""}>${iv.couples}</button>
          </div>
          <div class="import-race-row">
            <label for="raceNoSelect">${iv.raceNumber}</label>
            <select id="raceNoSelect"${reviewsOpen ? " disabled" : ""}>
              <option value=""${state.importRaceNo == null ? " selected" : ""}>${iv.raceSelectPlaceholder}</option>
              ${raceOptions}
            </select>
          </div>
          <div class="row">
            <button id="importRaceBtn" class="primary"${importAllowed ? "" : " disabled"}>${iv.importRace}</button>
          </div>
          <div class="import-settings-panel${state.matchingSettingsExpanded ? "" : " is-collapsed"}">
            <button type="button" class="matching-settings-toggle" id="matchingSettingsToggle" aria-expanded="${state.matchingSettingsExpanded}" aria-controls="matchingSettingsBody">
              <span class="matching-settings-chevron" aria-hidden="true"></span>
              <span class="matching-settings-toggle-label">${iv.matchingSettings}</span>
            </button>
            <div id="matchingSettingsBody" class="matching-settings-body"${state.matchingSettingsExpanded ? "" : " hidden"}>
            <div class="tabs matching-mode-tabs" role="tablist" aria-label="${iv.matchingSettings}">
              <button type="button" class="tab matching-mode-tab${strictNormalizedOnly ? " active" : ""}" data-matching-primary="strict" role="tab" aria-selected="${strictNormalizedOnly}">${iv.matchingModeStrict}</button>
              <button type="button" class="tab matching-mode-tab${primaryFuzzy ? " active" : ""}" data-matching-primary="fuzzy" role="tab" aria-selected="${primaryFuzzy}">${iv.matchingModeFuzzy}</button>
              <button type="button" class="tab matching-mode-tab${primaryManual ? " active" : ""}" data-matching-primary="manual" role="tab" aria-selected="${primaryManual}">${iv.matchingModeManual}</button>
            </div>
            <hr class="matching-settings-divider" />
            ${
              primaryFuzzy
                ? `<div class="tabs matching-subtabs" role="tablist" aria-label="${iv.matchingModeFuzzy}">
              <button type="button" class="tab matching-subtab${fuzzySubPerfect ? " active" : ""}" data-matching-fuzzy-sub="perfect" role="tab" aria-selected="${fuzzySubPerfect}">${iv.matchingFuzzySubPerfect}</button>
              <button type="button" class="tab matching-subtab${fuzzySubThreshold ? " active" : ""}" data-matching-fuzzy-sub="threshold" role="tab" aria-selected="${fuzzySubThreshold}">${iv.matchingFuzzySubThreshold}</button>
            </div>
            ${
              fuzzySubThreshold
                ? `<hr class="matching-settings-divider" />
            <div class="matching-threshold-group">
              <div class="matching-settings-grid-row">
                <label for="autoMergeThresholdRange">${iv.matchingThresholdLabel}</label>
                <div class="matching-settings-controls">
                  <input id="autoMergeThresholdRange" type="range" min="0.00" max="1.00" step="0.01" value="${autoMinValue.toFixed(2)}" />
                  <input id="autoMergeThresholdInput" type="number" min="0.00" max="1.00" step="0.01" value="${autoMinValue.toFixed(2)}" />
                </div>
              </div>
            </div>`
                : ""
            }`
                : ""
            }
            <hr class="matching-settings-divider" />
            <div class="matching-threshold-group matching-review-threshold-group">
              <div class="matching-settings-grid-row">
                <label for="reviewMinThresholdRange">${iv.matchingReviewThresholdLabel}</label>
                <div class="matching-settings-controls">
                  <input id="reviewMinThresholdRange" type="range" min="0.00" max="1.00" step="0.01" value="${reviewMinValue.toFixed(2)}" />
                  <input id="reviewMinThresholdInput" type="number" min="0.00" max="1.00" step="0.01" value="${reviewMinValue.toFixed(2)}" />
                </div>
              </div>
            </div>
            <p class="hint matching-settings-hint">${matchingHint}</p>
            </div>
          </div>
        </aside>
        <section class="card import-review-column">
        <h3>${iv.reviewTitle}</h3>
        ${
          !review
            ? `<p class="ok">${iv.noOpenReviews}</p>`
            : `<p>${iv.reviewProgress(state.reviewIndex + 1, state.reviewQueue.length)}</p>
               <p class="hint">${iv.reviewHintLayout}</p>
               <p class="hint">${iv.reviewHintNoMatch}</p>
               <p class="hint">${FMT.reviewConfidenceHtml(confidenceLabel(review.confidence), confidencePct)}</p>
               <p class="hint">${iv.mergeHint}</p>
               <div class="row merge-actions-row">
                 <button id="acceptReviewBtn" class="primary">${iv.mergeAccept}</button>
                 <button id="mergeCorrectReviewBtn" class="secondary">${iv.mergeCorrect.button}</button>
                 <button id="newIdentityReviewBtn" class="secondary">${iv.mergeNewIdentity}</button>
               </div>
               <div class="table-wrap">
                 <table class="merge-review-table merge-review-table--unified">
                   <colgroup>
                     <col class="merge-col-rank" />
                     <col class="merge-col-name" />
                     <col class="merge-col-club" />
                     <col class="merge-col-match" />
                     <col class="merge-col-startnr" />
                     <col class="merge-col-wertung" />
                     <col class="merge-col-action" />
                   </colgroup>
                   <thead><tr><th>${iv.thRank}</th><th>${iv.thNameYear}</th><th>${stStandings.thClub}</th><th>${iv.thMatch}</th><th>${iv.thStartnr}</th><th>${iv.thWertung}</th><th>${iv.thAction}</th></tr></thead>
                   <tbody>
                     ${renderIncomingTableRow(review.entry_preview, review.result_preview, review.startnr)}
                     ${renderCandidateTableRows(
                       review,
                       state.reviewSelections[reviewSelectionKey(review)] || getDefaultCandidateUid(review)
                     )}
                   </tbody>
                 </table>
               </div>`
        }
        </section>
      </div>
    `;
    const readThresholdFromDom = () => {
      const input = document.getElementById("autoMergeThresholdInput");
      if (input) {
        return clampAutoMin(input.value);
      }
      return clampAutoMin(state.matchingConfig.auto_min);
    };

    const matchingConfigSnapshotForReviewCap = () => ({
      ...state.matchingConfig,
      auto_min: readThresholdFromDom(),
    });

    const readReviewMinFromDom = () => {
      const input = document.getElementById("reviewMinThresholdInput");
      if (input) {
        return clampReviewMin(input.value);
      }
      return clampReviewMin(state.matchingConfig.review_min);
    };

    const applyMatchingPrimaryMode = async (mode) => {
      const threshold = readThresholdFromDom();
      const reviewMin = readReviewMinFromDom();
      let strict;
      let auto;
      let perfect;
      if (mode === "strict") {
        strict = true;
        auto = state.matchingConfig.auto_merge_enabled;
        perfect = state.matchingConfig.perfect_match_auto_merge;
      } else if (mode === "manual") {
        strict = false;
        auto = false;
        perfect = false;
      } else {
        strict = false;
        if (!state.matchingConfig.auto_merge_enabled && !state.matchingConfig.perfect_match_auto_merge) {
          auto = false;
          perfect = true;
        } else {
          auto = state.matchingConfig.auto_merge_enabled;
          perfect = state.matchingConfig.perfect_match_auto_merge;
        }
      }
      const unchanged =
        Boolean(state.matchingConfig.strict_normalized_auto_only) === strict &&
        Boolean(state.matchingConfig.auto_merge_enabled) === auto &&
        Boolean(state.matchingConfig.perfect_match_auto_merge) === perfect;
      if (unchanged) {
        return;
      }
      const ok = await saveMatchingConfig(threshold, reviewMin, auto, perfect, strict);
      if (!ok) {
        return;
      }
      if (mode === "strict") {
        setStatus(STR.status.strictNormalizedOn);
      } else if (mode === "manual") {
        setStatus(STR.status.matchingModeManualOn);
      } else if (auto) {
        setStatus(STR.status.autoMergeOn);
      } else {
        setStatus(STR.status.perfectAutoMergeOn);
      }
      await renderImportView();
    };

    document.getElementById("matchingSettingsToggle").addEventListener("click", async () => {
      state.matchingSettingsExpanded = !state.matchingSettingsExpanded;
      await renderImportView();
    });

    for (const btn of document.querySelectorAll("[data-matching-primary]")) {
      btn.addEventListener("click", () => {
        applyMatchingPrimaryMode(btn.getAttribute("data-matching-primary"));
      });
    }

    for (const btn of document.querySelectorAll("[data-matching-fuzzy-sub]")) {
      btn.addEventListener("click", async () => {
        const sub = btn.getAttribute("data-matching-fuzzy-sub");
        const threshold = readThresholdFromDom();
        const reviewMin = readReviewMinFromDom();
        let auto;
        let perfect;
        if (sub === "perfect") {
          auto = false;
          perfect = true;
        } else {
          auto = true;
          perfect = state.matchingConfig.perfect_match_auto_merge;
        }
        const unchanged =
          !state.matchingConfig.strict_normalized_auto_only &&
          Boolean(state.matchingConfig.auto_merge_enabled) === auto &&
          Boolean(state.matchingConfig.perfect_match_auto_merge) === perfect;
        if (unchanged) {
          return;
        }
        const ok = await saveMatchingConfig(threshold, reviewMin, auto, perfect, false);
        if (!ok) {
          return;
        }
        if (auto) {
          setStatus(STR.status.autoMergeOn);
        } else {
          setStatus(STR.status.perfectAutoMergeOn);
        }
        await renderImportView();
      });
    }

    const autoMergeThresholdRange = document.getElementById("autoMergeThresholdRange");
    const autoMergeThresholdInput = document.getElementById("autoMergeThresholdInput");
    if (autoMergeThresholdRange && autoMergeThresholdInput) {
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
      const syncReviewInputsFromState = () => {
        const rIn = document.getElementById("reviewMinThresholdInput");
        const rR = document.getElementById("reviewMinThresholdRange");
        if (rIn && rR) {
          const v = capReviewMinForConfig(state.matchingConfig.review_min, state.matchingConfig).toFixed(2);
          rIn.value = v;
          rR.value = v;
        }
      };
      autoMergeThresholdRange.addEventListener("change", async () => {
        const threshold = syncThresholdInputs(autoMergeThresholdRange.value);
        if (
          await saveMatchingConfig(
            threshold,
            readReviewMinFromDom(),
            true,
            state.matchingConfig.perfect_match_auto_merge,
            false
          )
        ) {
          syncReviewInputsFromState();
          setStatus(STR.status.autoMergeThresholdUpdated);
        }
      });
      autoMergeThresholdInput.addEventListener("blur", async () => {
        const threshold = syncThresholdInputs(autoMergeThresholdInput.value);
        if (
          await saveMatchingConfig(
            threshold,
            readReviewMinFromDom(),
            true,
            state.matchingConfig.perfect_match_auto_merge,
            false
          )
        ) {
          syncReviewInputsFromState();
          setStatus(STR.status.autoMergeThresholdUpdated);
        }
      });
    }

    const reviewMinThresholdRange = document.getElementById("reviewMinThresholdRange");
    const reviewMinThresholdInput = document.getElementById("reviewMinThresholdInput");
    if (reviewMinThresholdRange && reviewMinThresholdInput) {
      const syncReviewInputs = (nextValue) => {
        const capped = capReviewMinForConfig(nextValue, matchingConfigSnapshotForReviewCap());
        reviewMinThresholdRange.value = capped.toFixed(2);
        reviewMinThresholdInput.value = capped.toFixed(2);
        return capped;
      };
      reviewMinThresholdRange.addEventListener("input", () => {
        syncReviewInputs(reviewMinThresholdRange.value);
      });
      reviewMinThresholdInput.addEventListener("change", () => {
        syncReviewInputs(reviewMinThresholdInput.value);
      });
      reviewMinThresholdRange.addEventListener("change", async () => {
        const reviewMin = syncReviewInputs(reviewMinThresholdRange.value);
        if (
          await saveMatchingConfig(
            readThresholdFromDom(),
            reviewMin,
            state.matchingConfig.auto_merge_enabled,
            state.matchingConfig.perfect_match_auto_merge,
            state.matchingConfig.strict_normalized_auto_only
          )
        ) {
          setStatus(STR.status.reviewMinThresholdUpdated);
        }
      });
      reviewMinThresholdInput.addEventListener("blur", async () => {
        const reviewMin = syncReviewInputs(reviewMinThresholdInput.value);
        if (
          await saveMatchingConfig(
            readThresholdFromDom(),
            reviewMin,
            state.matchingConfig.auto_merge_enabled,
            state.matchingConfig.perfect_match_auto_merge,
            state.matchingConfig.strict_normalized_auto_only
          )
        ) {
          setStatus(STR.status.reviewMinThresholdUpdated);
        }
      });
    }
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
      if (state.reviewQueue.length > 0) {
        setStatus(`${STR.status.prefix}${iv.importBlockedByOpenReviews}`, true);
        return;
      }
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
      if (state.reviewQueue.length > 0) {
        setStatus(`${STR.status.prefix}${iv.importBlockedByOpenReviews}`, true);
        return;
      }
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
      const selectReviewCandidate = async (candidateUid) => {
        if (!candidateUid) {
          return;
        }
        state.reviewSelections[reviewKey] = candidateUid;
        await renderImportView();
      };
      for (const row of importView.querySelectorAll("tr[data-candidate-row]")) {
        row.addEventListener("click", async () => {
          await selectReviewCandidate(row.getAttribute("data-candidate-row") || "");
        });
        row.addEventListener("keydown", async (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            await selectReviewCandidate(row.getAttribute("data-candidate-row") || "");
          }
        });
      }
      const previewByUidForReview = new Map(
        (review.candidate_previews || []).filter(Boolean).map((item) => [item.uid, item])
      );
      document.getElementById("acceptReviewBtn").addEventListener("click", async () => {
        const target = state.reviewSelections[reviewKey] || getDefaultCandidateUid(review);
        if (!target) {
          setStatus(STR.status.noCandidate, true);
          return;
        }
        const candidatePreview = previewByUidForReview.get(target);
        const response = await api(
          "apply_match_decision",
          buildApplyMatchLinkPayload(review, target, candidatePreview, "manual review accept")
        );
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
      document.getElementById("mergeCorrectReviewBtn").addEventListener("click", async () => {
        const target = state.reviewSelections[reviewKey] || getDefaultCandidateUid(review);
        if (!target) {
          setStatus(STR.status.noCandidate, true);
          return;
        }
        const candidatePreview = previewByUidForReview.get(target);
        if (!candidatePreview) {
          setStatus(STR.status.noCandidate, true);
          return;
        }
        openImportMergeCorrectModal(review, target, candidatePreview, reviewKey);
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

  function formatHistoryAuditDetail(item, hi) {
    const it = item.identity_timeline;
    const fallbackMerge = () => {
      const keep = item.target_team_uid || item.target_participant_uid || "—";
      const drop = item.merged_absorbed_uid || "—";
      return `${escapeHtml(String(keep))} ← ${escapeHtml(String(drop))}`;
    };
    const fallbackCorrection = () => {
      const t = item.target_team_uid || item.target_participant_uid || "—";
      return escapeHtml(String(t));
    };
    if (!it || typeof it !== "object") {
      if (item.kind === "identity_merge") {
        return fallbackMerge();
      }
      if (item.kind === "result_reassignment") {
        return fallbackMerge();
      }
      if (item.kind === "identity_correction") {
        return fallbackCorrection();
      }
      return "—";
    }

    const esc = escapeHtml;
    const fmtClub = (c) => {
      const s = c == null ? "" : String(c).trim();
      return s ? esc(s) : "—";
    };
    const fmtYob = (y) => (y != null && y !== "" ? esc(String(y)) : "—");

    const actorHtml = (title, actor) => {
      if (!actor || typeof actor !== "object") {
        return "";
      }
      let body = `${esc(String(actor.display_name || "—"))}<br>`;
      body += `${fmtYob(actor.yob)} · ${fmtClub(actor.club)}`;
      const members = actor.team_members;
      if (Array.isArray(members) && members.length) {
        for (const m of members) {
          const ml = m.member === "a" ? hi.auditMemberA : hi.auditMemberB;
          const c = m.club != null && String(m.club).trim() ? String(m.club) : "—";
          body += `<br><span class="history-audit-meta">${esc(ml)}:</span> ${esc(String(m.name || "—"))} · Jg. ${fmtYob(m.yob)} · ${esc(c)}`;
        }
      }
      body += `<br><span class="history-audit-meta">${esc(hi.auditUid)}:</span> ${esc(String(actor.uid || "—"))}`;
      return `<div class="history-audit-detail__block"><strong>${esc(title)}</strong><br>${body}</div>`;
    };

    if (it.kind === "identity_merge") {
      const parts = [];
      if (it.category_key) {
        parts.push(`<div class="history-audit-meta">${esc(hi.auditCategory)}: ${esc(String(it.category_key))}</div>`);
      }
      parts.push(actorHtml(hi.auditMergeSurvivor, it.survivor));
      parts.push(actorHtml(hi.auditMergeAbsorbed, it.absorbed));
      return `<div class="history-audit-detail">${parts.join("")}</div>`;
    }

    if (it.kind === "result_reassignment") {
      const parts = [];
      if (it.category_key) {
        parts.push(`<div class="history-audit-meta">${esc(hi.auditCategory)}: ${esc(String(it.category_key))}</div>`);
      }
      parts.push(actorHtml(hi.auditReassignmentTarget, it.survivor));
      parts.push(actorHtml(hi.auditReassignmentSource, it.absorbed));
      if (it.rationale) {
        parts.push(`<div class="history-audit-meta">${esc(String(it.rationale))}</div>`);
      }
      return `<div class="history-audit-detail">${parts.join("")}</div>`;
    }

    if (it.kind === "identity_correction") {
      const parts = [];
      if (it.team_display_name) {
        parts.push(
          `<div class="history-audit-meta">${esc(hi.auditTeamContext)}: ${esc(String(it.team_display_name))}</div>`,
        );
        const mem = it.member === "a" ? hi.auditMemberA : it.member === "b" ? hi.auditMemberB : null;
        if (mem) {
          parts.push(`<div class="history-audit-meta">${esc(mem)}</div>`);
        }
      }
      const line = (label, f) => {
        const name = f && typeof f === "object" ? f.name : null;
        const yob = f && typeof f === "object" ? f.yob : null;
        const club = f && typeof f === "object" ? f.club : null;
        return `<div class="history-audit-detail__block"><strong>${esc(label)}</strong><br>${esc(String(name || "—"))} · Jg. ${fmtYob(yob)} · ${fmtClub(club)}</div>`;
      };
      parts.push(line(hi.auditBefore, it.before));
      parts.push(line(hi.auditAfter, it.after));
      const uid = item.target_team_uid || item.target_participant_uid;
      if (uid) {
        parts.push(`<div class="history-audit-meta">${esc(hi.auditUid)}: ${esc(String(uid))}</div>`);
      }
      return `<div class="history-audit-detail">${parts.join("")}</div>`;
    }

    if (item.kind === "identity_merge") {
      return fallbackMerge();
    }
    if (item.kind === "result_reassignment") {
      return fallbackMerge();
    }
    if (item.kind === "identity_correction") {
      return fallbackCorrection();
    }
    return "—";
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

    const auditItems = timelineItems.filter((item) => item.event_type === "matching_decision");
    const kindLabel = (kind) => {
      if (kind === "identity_merge") {
        return hi.kindIdentityMerge;
      }
      if (kind === "result_reassignment") {
        return hi.kindResultReassignment;
      }
      if (kind === "identity_correction") {
        return hi.kindIdentityCorrection;
      }
      return hi.kindMatchingOther;
    };
    const auditRows = auditItems
      .filter(
        (item) =>
          item.kind === "identity_merge" ||
          item.kind === "identity_correction" ||
          item.kind === "result_reassignment"
      )
      .map((item) => {
        const detail = formatHistoryAuditDetail(item, hi);
        return `<tr>
          <td>${escapeHtml(String(item.timestamp || "-"))}</td>
          <td>${escapeHtml(kindLabel(item.kind))}</td>
          <td class="history-audit-detail-cell">${detail}</td>
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
      <div class="card history-audit-card">
        <h3>${hi.auditTitle}</h3>
        <p class="hint">${hi.auditHint}</p>
        <div class="table-wrap">
          <table class="table--banded">
            <thead><tr><th>${hi.thAuditTime}</th><th>${hi.thAuditKind}</th><th>${hi.thAuditDetail}</th></tr></thead>
            <tbody>${auditRows || `<tr><td colspan="3">${hi.auditEmpty}</td></tr>`}</tbody>
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
