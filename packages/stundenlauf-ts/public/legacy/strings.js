/**
 * German end-user copy for the pywebview GUI. Edit here to change visible text.
 * Logic stays in app.js; API payloads and rationales remain English.
 */
(function (global) {
  /** Display km with three fractional digits and German decimal comma (e.g. 12,340). */
  function formatKm(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return String(value ?? "");
    }
    return n.toFixed(3).replace(".", ",");
  }

  const UIStrings = {
    shell: {
      appTitle: "HSG Uni Greifswald Triathlon Laufgruppe - Stundenlauf-Auswertung",
      tabStandings: "Aktuelle Wertung",
      tabImport: "Lauf Importieren",
      tabHistory: "Historie & Korrektur",
      switchSeason: "Saison wechseln",
      seasonLabelPlaceholder: "Saison: -",
      reviewLabelPlaceholder: "Prüfungen offen: 0",
    },
    status: {
      prefix: "Status: ",
      defaultReady: "Bereit",
      matchingSaveFailed: "Matching-Einstellungen konnten nicht gespeichert werden.",
      autoMergeOn: "Ab-Schwelle-Automatik aktiv: Zuordnung ab dem eingestellten Ähnlichkeitswert.",
      autoMergeOff: "Ab-Schwelle-Automatik aus.",
      perfectAutoMergeOn:
        "Nur bei 100 %-Ähnlichkeit (Fuzzy-Score): automatische Zuordnung nur beim höchsten Trefferwert.",
      perfectAutoMergeOff: "100 %-Fuzzy-Automatik aus.",
      strictNormalizedOn:
        "Strikt: Automatisch nur bei exakt passender normalisierter Identität (Name, Jahrgang, Verein, Geschlecht).",
      strictNormalizedOff: "Fuzzy-Automatik gewählt – Detailstufe unten einstellbar.",
      matchingModeManualOn:
        "Manuell: Keine automatische Zuordnung per Ähnlichkeit; Sie entscheiden in der Prüfung.",
      autoMergeThresholdUpdated: "Ähnlichkeitsschwelle wurde aktualisiert.",
      reviewMinThresholdUpdated: "Schwelle für Prüfung (statt neue Person) wurde aktualisiert.",
      importIncomplete: "Bitte Datei, Lauftyp und Laufnummer vollständig wählen.",
      importRunning: "Import läuft...",
      importFailed: "Import konnte nicht abgeschlossen werden.",
      importDone: "Import abgeschlossen. Bitte prüfen Sie offene Zuordnungen.",
      pickFileFailed: "Dateiauswahl konnte nicht geöffnet werden.",
      noCandidate: "Für diesen Eintrag ist kein Kandidat verfügbar.",
      mergeSaveFailed: "Zusammenführung konnte nicht gespeichert werden.",
      mergeSaved: "Zusammenführung wurde übernommen.",
      newIdentityFailed: "Neue Person konnte nicht angelegt werden.",
      newIdentitySaved: "Eintrag wurde als neue Person angelegt.",
    },
    errors: {
      bridgeUnavailable: "pywebview bridge nicht verfügbar.",
      importDuplicate:
        "Diese Datei ist bereits aktiv importiert. Bitte nehmen Sie den bisherigen Import zuerst in der Historie zurück.",
      reimportPartialRollback:
        "Import abgebrochen: Es wurde nichts importiert. Korrektur nur teilweise zurückgenommen. Bitte zuerst alle noch aktiven Läufe dieser Quelle zurücknehmen und dann erneut importieren.",
      desktopApiUnavailable: "Desktop-API nicht verfügbar.",
      startupFailed: "Anwendung konnte nicht gestartet werden.",
      rollbackFailed: "Datei-Import konnte nicht zurückgenommen werden.",
    },
    seasonEntry: {
      pageTitle: "Saison öffnen oder neu anlegen",
      intro: "Wählen Sie eine vorhandene Saison oder legen Sie eine neue Saison an.",
      existingHeading: "Bestehende Saison öffnen",
      newHeading: "Neue Saison anlegen",
      noSeasonsYet: "Noch keine Saison vorhanden.",
      newHint: "Legen Sie eine Saison an und starten Sie mit dem ersten Import.",
      tableYear: "Jahr",
      tableRaces: "Läufe",
      tableReview: "Prüfungen offen",
      tableLastImport: "Letzter Import",
      tableCoverage: "Läufe enthalten",
      tableAction: "Aktion",
      openSeason: "Öffnen",
      resetSeason: "Zurücksetzen",
      resetSeasonTitle: "Saisoninhalt zurücksetzen",
      deleteSeason: "Löschen",
      deleteSeasonTitle: "Saison löschen",
      labelYear: "Jahr",
      placeholderYear: "Beispiel: 2026",
      labelDisplayName: "Bezeichnung (optional)",
      placeholderDisplayName: "z. B. Stundenlauf 2026",
      createSeason: "Neue Saison erstellen",
      importSeason: "Saison importieren",
      exportSeason: "Export",
      loading: "Lädt...",
      listLoadFailed: "Saisonliste konnte nicht geladen werden.",
      listLoadHint: "Bitte starten Sie die Anwendung neu.",
      apiNotReady: "Verbindung zur Desktop-API ist noch nicht bereit.",
      apiNotReadyHint: "Bitte warten Sie kurz oder starten Sie die Anwendung neu.",
      deleteConfirm: (year) =>
        `Achtung: Die Saison ${year} wird dauerhaft gelöscht.\n` +
        "Alle Läufe, Prüfdaten und Wertungen dieser Saison gehen verloren.\n\n" +
        "Möchten Sie fortfahren?",
      deletePrompt: (year) =>
        `Sicherheitsabfrage: Bitte geben Sie ${year} ein, um die Löschung zu bestätigen.`,
      deleteInputMismatch: (year) =>
        `Löschung abgebrochen: Die Eingabe muss exakt ${year} sein.`,
      deleteFailed: "Saison konnte nicht gelöscht werden.",
      deleteDone: (year) => `Saison ${year} wurde gelöscht.`,
      resetConfirm: (year) =>
        `Achtung: Alle Daten der Saison ${year} werden dauerhaft zurückgesetzt.\n` +
        "Alle Läufe, Prüfdaten, Zuordnungen und Wertungen werden geleert.\n" +
        "Das Saisonjahr bleibt bestehen.\n\n" +
        "Tipp: Erstellen Sie vorher einen Export als Sicherung.\n\n" +
        "Möchten Sie fortfahren?",
      resetPrompt: (year) =>
        `Sicherheitsabfrage: Bitte geben Sie ${year} ein, um das Zurücksetzen zu bestätigen.`,
      resetInputMismatch: (year) =>
        `Zurücksetzen abgebrochen: Die Eingabe muss exakt ${year} sein.`,
      resetFailed: "Saison konnte nicht zurückgesetzt werden.",
      resetDone: (year) => `Saison ${year} wurde zurückgesetzt.`,
      invalidYear: "Bitte geben Sie ein gültiges Jahr ein.",
      createFailed: "Saison konnte nicht angelegt werden.",
      createDone: "Saison wurde angelegt. Sie können jetzt den ersten Lauf importieren.",
      openFailed: "Saison konnte nicht geöffnet werden.",
      exportPickFailed: "Zielpfad für den Export konnte nicht gewählt werden.",
      exportFailed: "Saison konnte nicht exportiert werden.",
      exportDone: (year, path) => `Saison ${year} wurde exportiert: ${path}`,
      importPickFailed: "Saison-Exportdatei konnte nicht ausgewählt werden.",
      importFailed: "Saison konnte nicht importiert werden.",
      importDone: (year) => `Saison ${year} wurde importiert.`,
      importCancelled: "Import abgebrochen.",
      importConflictAskNewYear:
        "Für dieses Jahr existiert bereits eine Saison.\n\nMöchten Sie den Import als neues Jahr anlegen?",
      importConflictAskReplace:
        "Möchten Sie stattdessen eine bestehende Saison ersetzen?\n\nJa = ersetzen, Nein = Import abbrechen",
      importConflictNewYearPrompt: "Bitte neues Zieljahr eingeben:",
      importConflictReplaceYearPrompt: "Bitte das zu ersetzende Jahr eingeben:",
      importConflictReplaceConfirmPrompt: (year) =>
        `Sicherheitsabfrage: Bitte ${year} eingeben, um das Ersetzen zu bestätigen.`,
    },
    overview: {
      loadFailed: "Übersicht konnte nicht geladen werden.",
    },
    categorySlots: {
      half_men: "1/2 h - Männer",
      half_women: "1/2 h - Frauen",
      hour_men: "1 h - Männer",
      hour_women: "1 h - Frauen",
      half_couples_men: "1/2 h - Männer",
      half_couples_women: "1/2 h - Frauen",
      half_couples_mixed: "1/2 h - Mix",
      hour_couples_men: "1 h - Männer",
      hour_couples_women: "1 h - Frauen",
      hour_couples_mixed: "1 h - Mix",
    },
    matrix: {
      rowSingles: "Einzel",
      rowCouples: "Paare",
      colRun: "Lauf",
      cellYes: "x",
      cellNo: "—",
    },
    standings: {
      sidebarImportedRuns: "Importierte Läufe",
      sidebarSingles: "Einzel",
      sidebarCouples: "Paare",
      exportSectionTitle: "Export",
      exportPdfLayoutLabel: "PDF-Layout",
      exportPdfLayoutAria: "Layout für den PDF-Export wählen",
      exportPdfButton: "Wertungen als PDF speichern",
      exportPdfSaveHint:
        "Basisname ohne Endung wählen (Dateityp „Alle Dateien“). " +
        "Es entstehen …_einzel.pdf und …_paare.pdf — eine alte einzelne …pdf wird dabei nicht überschrieben.",
      exportPdfPickFailed: "Zielpfad für das PDF konnte nicht gewählt werden.",
      exportPdfFailed: "PDF konnte nicht exportiert werden.",
      exportPdfDone: (paths) =>
        Array.isArray(paths) && paths.length
          ? `PDFs gespeichert: ${paths.join(", ")}`
          : "PDFs gespeichert.",
      titleCurrent: "Aktuelle Wertung",
      emptyNoCategory: "Noch keine Ergebnisse vorhanden.",
      loadFailed: "Wertung konnte nicht geladen werden.",
      selectedCategory: (label) =>
        `Ausgewählte Kategorie: ${label}`,
      rulesHint:
        "Die Gesamtwertung basiert auf den importierten Läufen und dem aktuellen Regelwerk.",
      thPlatz: "Platz",
      thName: "Name",
      thYob: "Jahrgang",
      thClub: "Verein",
      thDistanceTotal: "Gesamtdistanz (km)",
      thPointsTotal: "Gesamtpunkte",
      emptyStandings: "Noch keine Ergebnisse vorhanden",
      perRaceTitle: "Laufübersicht je Kategorie",
      thAusserWertungShort: "a. W.",
      thAusserWertungTitle: "Außer Wertung",
      ausserWertungAria: (name) => `Außer Wertung: ${name}`,
      platzExcludedSentinel: "—",
      thDistanceShort: "Gesamtdistanz",
      emptyRaceRows: "Noch keine Laufdaten vorhanden",
      categoryUnavailable: "Nicht verfügbar",
      identity: {
        correctionOn: "Identität korrigieren",
        correctionOff: "Korrekturmodus beenden",
        correctionBanner:
          "Korrekturmodus: Klicken Sie eine Zeile in der Wertungstabelle, um Name, Verein und Jahrgang zu bearbeiten.",
        modalTitle: "Teilnehmerdaten korrigieren",
        memberA: "Läufer A",
        memberB: "Läufer B",
        save: "Speichern",
        cancel: "Schließen",
        closeAria: "Dialog schließen",
        successSaved: "Änderung gespeichert.",
        excelHint:
          "Hinweis: Die Excel-Quelle bleibt unverändert; künftige Imports können erneut prüfen, falls die Datei abweicht.",
        errName: "Bitte einen Namen eingeben.",
        errYob: "Bitte einen gültigen Jahrgang (Zahl) eingeben.",
        errYobRange: (min, max) => `Jahrgang muss zwischen ${min} und ${max} liegen.`,
        errTeamMembers: "Teammitglieder konnten nicht geladen werden.",
      },
      merge: {
        toggleOn: "Duplikate zusammenführen",
        toggleOff: "Zusammenführen beenden",
        banner:
          "Wählen Sie zuerst die Zeile, die erhalten bleibt (Ziel), dann die doppelte Identität. Nur Einzel mit Einzel bzw. Paar mit Paar. Zusammenführung ist blockiert, wenn beide in demselben Lauf dieser Kategorie gemeldet sind.",
        survivorLabel: "Behalten (Ziel)",
        absorbedLabel: "Zusammenführen (wird aufgelöst)",
        resetPicks: "Auswahl leeren",
        confirm: "Zusammenführen ausführen",
        confirmDialog: (keepName, dropName) =>
          `Die Identität „${dropName}“ wird in „${keepName}“ zusammengeführt. Die Wertung wird neu berechnet. Fortfahren?`,
        success: "Zusammenführung wurde gespeichert; die Wertung wurde neu berechnet.",
        kindMismatch: "Beide Zeilen müssen dieselbe Art haben (Einzel oder Paar).",
        needSeriesYear: "Keine aktive Saison.",
        needTwoPicks: "Bitte zuerst Ziel- und zweite Zeile wählen.",
        awDisabledInMergeMode:
          "Außer Wertung ist im Zusammenführungsmodus deaktiviert — bitte Modus zuerst beenden.",
      },
    },
    units: {
      kmSuffix: " km",
      pointsSuffix: " P",
      raceCell: (distanceKm, points) => `${formatKm(distanceKm)} km / ${points} P`,
    },
    importView: {
      sidebarImportedRuns: "Importierte Läufe",
      pickFile: "Datei auswählen",
      noFilePlaceholder: "Keine Datei",
      pickResultFile: "Bitte eine Ergebnisdatei auswählen.",
      singles: "Einzel",
      couples: "Paare",
      thName: "Name",
      thNameYear: "Name (Jg.)",
      raceNumber: "Laufnummer",
      raceSelectPlaceholder: "Bitte wählen…",
      importRace: "Lauf importieren",
      matchingSettings: "Matching-Einstellungen",
      matchingModeStrict: "Strikt",
      matchingModeFuzzy: "Fuzzy-Automatik",
      matchingModeManual: "Manuell",
      matchingFuzzySubPerfect: "Nur 100 %-Ähnlichkeit",
      matchingFuzzySubThreshold: "Ab Schwelle",
      matchingThresholdLabel: "Ähnlichkeit ab der automatisch zugeordnet wird",
      matchingReviewThresholdLabel:
        "Mindest-Ähnlichkeit für Prüfliste",
      matchingHintStrict:
        "Automatische Zuordnung nur, wenn Name (normalisiert), Jahrgang, Verein und Geschlecht exakt einem bestehenden Datensatz entsprechen und genau ein Treffer möglich ist. Kein stiller Fuzzy-Auto-Merge.",
      matchingHintFuzzyPerfect:
        "Automatische Zuordnung nur, wenn der Fuzzy-Ähnlichkeitswert den höchsten Wert (100 %) erreicht – unabhängig von Tippfehlern in der Anzeige, aber nach Gewichtung und Normierung des Systems.",
      matchingHintFuzzyThreshold:
        "Automatische Zuordnung ab dem eingestellten Mindest-Ähnlichkeitswert. Darunter bleiben Einträge in der Prüfung oder werden als neue Person geführt.",
      matchingHintManual:
        "Keine automatische Zuordnung über Ähnlichkeit: alle unsicheren Fälle landen in der Prüfung.",
      reviewTitle: "Zusammenführungen prüfen",
      noOpenReviews: "Keine offenen Prüfungen.",
      reviewProgress: (current, total) => `Prüfung ${current} von ${total}`,
      reviewHintLayout:
        "Oben sehen Sie den eingehenden Eintrag. Darunter die vorhandenen Kandidaten in absteigender Treffersicherheit. Abweichende Felder sind rot hervorgehoben.",
      reviewHintNoMatch:
        'Wenn kein Kandidat dieselbe reale Person/dasselbe reale Team ist, wählen Sie "Keine passt: neue Person anlegen".',
      incomingHeading: "Neuer eingehender Eintrag",
      candidatesHeading: "Mögliche Treffer (beste Übereinstimmung zuerst)",
      thRank: "Rang",
      thMatch: "Treffer %",
      thAction: "Aktion",
      thStartnr: "Startnr.",
      thWertung: "Wertung",
      selectCandidate: "☐",
      selectedCandidate: "✅",
      selectCandidateAria: "Kandidat auswählen",
      selectedCandidateAria: "Ausgewählt",
      incomingRangLabel: "Neu",
      mergeHint:
        'Auswahl verknüpft mit bestehender Person/Team; "neue Person anlegen" erstellt bewusst einen zusätzlichen Datensatz.',
      mergeAccept: "Mit ausgewählter Person/Team zusammenführen",
      mergeCorrect: {
        button: "Zusammenführen und Daten korrigieren",
        modalTitle: "Zusammenführen und Daten korrigieren",
        compareIncoming: "Eingehend (Datei)",
        compareExisting: "Bestehender Datensatz",
        editHint:
          "Unten können Sie den zu verknüpfenden bestehenden Datensatz korrigieren (Name, Jahrgang, Verein). Anschließend werden Verknüpfung und Korrektur gespeichert.",
        submit: "Zusammenführen und speichern",
        successStatus: "Zusammenführung und Datenkorrektur wurden übernommen.",
      },
      mergeNewIdentity: "Keine passt: neue Person anlegen",
      importBlockedByOpenReviews:
        "Solange offene Zusammenführungs-Prüfungen bestehen, kann kein weiterer Lauf importiert werden. Bitte zuerst alle Prüfungen abschließen.",
      inferenceDetectedBoth: (typeLabel, racePart) => `Erkannt: ${typeLabel} · ${racePart}`,
      inferenceDetectedTypeOnly: (typeLabel) =>
        `Erkannt: ${typeLabel} · Laufnummer nicht im Dateinamen – bitte Laufnummer wählen.`,
      raceWord: "Lauf",
    },
    preview: {
      unknown: "Unbekannt",
      yob: (y) => `Jg. ${y}`,
    },
    confidence: {
      high: "hoch",
      medium: "mittel",
      low: "niedrig",
    },
    reviewTable: {
      noCandidates: "Keine Kandidaten vorhanden",
    },
    history: {
      title: "Historie & Korrektur",
      hint:
        "Alle Änderungen werden protokolliert. Rücknahme erfolgt für alle Läufe einer importierten Datei gemeinsam.",
      thEvent: "Ereignis",
      thTime: "Zeitpunkt",
      thSource: "Quelldatei",
      thCategories: "Kategorien",
      thRaces: "Läufe",
      thAction: "Aktion",
      eventFileImport: "Datei-Import",
      rollbackButton: "Datei zurücknehmen",
      emptyImports: "Keine aktiven Datei-Importe vorhanden",
      loadFailed: "Historie konnte nicht geladen werden.",
      rollbackConfirm: (count) =>
        `Die Ergebnisse aller ${count} Läufe aus dieser Datei werden aus der Wertung entfernt und anschließend neu berechnet.`,
      rollbackDone: (count) => `Datei-Import wurde zurückgenommen (${count} Läufe).`,
      auditTitle: "Korrekturen & Zusammenführungen",
      auditHint: "Einträge aus dem Prüf- und Korrekturprotokoll dieser Saison.",
      auditEmpty: "Keine protokollierten Korrekturen oder Zusammenführungen.",
      thAuditTime: "Zeitpunkt",
      thAuditKind: "Art",
      thAuditDetail: "Details",
      kindIdentityMerge: "Duplikate zusammengeführt",
      kindIdentityCorrection: "Identität korrigiert",
      kindResultReassignment: "Ergebnisse neu zugeordnet",
      kindMatchingOther: "Zuordnung",
      auditCategory: "Kategorie",
      auditMergeSurvivor: "Behalten (Ziel)",
      auditMergeAbsorbed: "Zusammengeführt (Quelle)",
      auditReassignmentTarget: "Neu zugeordnet zu",
      auditReassignmentSource: "Ursprünglich zugeordnet",
      auditBefore: "Vorher",
      auditAfter: "Nachher",
      auditMemberA: "Mitglied A",
      auditMemberB: "Mitglied B",
      auditTeamContext: "Paar",
      auditUid: "UID",
    },
  };

  function seasonLabel(year) {
    return `Saison: ${year}`;
  }

  function reviewOpenCount(count) {
    return `Prüfungen offen: ${count}`;
  }

  function reviewConfidenceHtml(label, percent) {
    return `Treffersicherheit: <strong>${label}</strong> (${percent}%).`;
  }

  global.UIStrings = UIStrings;
  global.UIFormat = {
    seasonLabel,
    reviewOpenCount,
    reviewConfidenceHtml,
    formatKm,
  };
})(window);
