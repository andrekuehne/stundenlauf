/**
 * German end-user copy for the pywebview GUI. Edit here to change visible text.
 * Logic stays in app.js; API payloads and rationales remain English.
 */
(function (global) {
  const UIStrings = {
    shell: {
      appTitle: "HSG Uni Greifswald Triathlon Laufgruppe - Stundenlauf-Auswertung",
      tabStandings: "Aktuelle Wertung",
      tabImport: "Lauf Importieren",
      tabHistory: "Historie & Korrektur",
      switchSeason: "Saison wechseln",
      seasonLabelPlaceholder: "Saison: -",
      reviewLabelPlaceholder: "Zuordnungen offen: 0",
    },
    status: {
      prefix: "Status: ",
      defaultReady: "Bereit",
      matchingSaveFailed: "Matching-Einstellungen konnten nicht gespeichert werden.",
      autoMergeOn: "Auto_Zusammenführung ist aktiv.",
      autoMergeOff:
        "Auto-Zusammenführung ist deaktiviert. Neue Importe landen bei Unsicherheit in der Zuordnung.",
      perfectAutoMergeOn: "Perfekte Treffer werden automatisch zusammengeführt.",
      perfectAutoMergeOff: "Perfekte Treffer werden nicht mehr automatisch zusammengeführt.",
      autoMergeThresholdUpdated: "Auto-Zusammenführung-Schwelle wurde aktualisiert.",
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
      tableAction: "Aktion",
      openSeason: "Saison öffnen",
      deleteSeason: "Saison löschen",
      deleteSeasonTitle: "Saison löschen",
      labelYear: "Jahr",
      placeholderYear: "Beispiel: 2026",
      labelDisplayName: "Bezeichnung (optional)",
      placeholderDisplayName: "z. B. Stundenlauf 2026",
      createSeason: "Neue Saison erstellen",
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
      invalidYear: "Bitte geben Sie ein gültiges Jahr ein.",
      createFailed: "Saison konnte nicht angelegt werden.",
      createDone: "Saison wurde angelegt. Sie können jetzt den ersten Lauf importieren.",
      openFailed: "Saison konnte nicht geöffnet werden.",
    },
    overview: {
      loadFailed: "Übersicht konnte nicht geladen werden.",
    },
    categorySlots: {
      half_men: "1/2 h - M",
      half_women: "1/2 h - F",
      hour_men: "1 h - M",
      hour_women: "1 h - F",
      half_couples_men: "1/2 h - M",
      half_couples_women: "1/2 h - F",
      half_couples_mixed: "1/2 h - Mix",
      hour_couples_men: "1 h - M",
      hour_couples_women: "1 h - F",
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
      thDistanceShort: "Gesamtdistanz",
      emptyRaceRows: "Noch keine Laufdaten vorhanden",
      categoryUnavailable: "Nicht verfügbar",
    },
    units: {
      kmSuffix: " km",
      pointsSuffix: " P",
      raceCell: (distanceKm, points) => `${distanceKm} km / ${points} P`,
    },
    importView: {
      sidebarImportedRuns: "Importierte Läufe",
      pickFile: "Datei auswählen",
      noFilePlaceholder: "Keine Datei",
      pickResultFile: "Bitte eine Ergebnisdatei auswählen.",
      singles: "Einzel",
      couples: "Paare",
      raceNumber: "Laufnummer",
      raceSelectPlaceholder: "Bitte wählen…",
      importRace: "Lauf importieren",
      matchingSettings: "Matching-Einstellungen",
      autoMerge: "Automatisches Zusammenführen",
      perfectAutoMerge: "Perfekte Treffer automatisch",
      autoMergeThreshold: "Auto-Zusammenführung-Schwelle",
      matchingDefaultHint:
        "Standard: Nur perfekte Treffer werden automatisch zusammengeführt.",
      reviewTitle: "Zusammenführungen prüfen",
      noOpenReviews: "Keine offenen Prüfungen.",
      reviewProgress: (current, total) => `Prüfung ${current} von ${total}`,
      reviewHintLeftRight:
        "Links sehen Sie den neu eingehenden Eintrag. Rechts sehen Sie nur bereits vorhandene Personen/Teams aus der Datenbasis.",
      reviewHintNoMatch:
        'Wenn rechts niemand dieselbe reale Person/dasselbe reale Team ist, wählen Sie unten "Keine passt: neue Person anlegen".',
      incomingHeading: "Neuer eingehender Eintrag",
      candidatesHeading: "Mögliche Treffer (beste Übereinstimmung zuerst)",
      thRank: "Rang",
      thMatch: "Treffer",
      thAction: "Aktion",
      thStartnr: "Startnr.",
      thDistance: "Distanz",
      thPoints: "Punkte",
      selectCandidate: "Diesen wählen",
      mergeHint:
        'Auswahl rechts verknüpft mit bestehender Person/Team; "neue Person anlegen" erstellt bewusst einen zusätzlichen Datensatz.',
      mergeAccept: "Mit ausgewählter Person/Team zusammenführen",
      mergeNewIdentity: "Keine passt: neue Person anlegen",
      skipReview: "Überspringen",
      inferenceDetectedBoth: (typeLabel, racePart) => `Erkannt: ${typeLabel} · ${racePart}`,
      inferenceDetectedTypeOnly: (typeLabel) =>
        `Erkannt: ${typeLabel} · Laufnummer nicht im Dateinamen – bitte Laufnummer wählen.`,
      inferenceDetectedRaceOnly: (racePart) =>
        `Erkannt: ${racePart} · Lauftyp nicht aus dem Dateinamen – bitte Einzel oder Paare wählen.`,
      inferenceNone:
        "Keine Erkennung aus dem Dateinamen – bitte Lauftyp und Laufnummer wählen.",
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
      selectedSuffix: " (ausgewählt)",
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
  };
})(window);
