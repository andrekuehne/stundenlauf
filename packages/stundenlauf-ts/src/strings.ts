/**
 * German string catalog for all user-facing text.
 * Ported from frontend/strings.js, minus dead strings and bridge-specific errors.
 *
 * Reference: F-TS06 §7 (German String Catalog)
 */

export const SHELL_TABS = ["standings", "import", "history", "season"] as const;
export type ShellTab = (typeof SHELL_TABS)[number];

export const STR = {
  shell: {
    appTitle: "HSG Uni Greifswald Triathlon Laufgruppe - Stundenlauf-Auswertung",
    tabs: {
      standings: "Aktuelle Wertung",
      import: "Lauf Importieren",
      history: "Historie & Korrektur",
      season: "Saison wechseln",
    } as Record<ShellTab, string>,
    seasonLabelPlaceholder: "Saison: -",
    reviewLabelPlaceholder: "Prüfungen offen: 0",
  },
  status: {
    prefix: "Status:",
    defaultReady: "Bereit",
  },
  confirmModal: {
    confirm: "Bestätigen",
    cancel: "Abbrechen",
    closeAria: "Dialog schließen",
  },
  views: {
    standings: {
      title: "Aktuelle Wertung",
      placeholder: "Noch keine Daten in dieser Kategorie.",
      modeOverview: "Übersicht",
      modeCorrectIdentity: "Identität korrigieren",
      modeMergeDuplicates: "Duplikate zusammenführen",
      exportPdf: "PDF exportieren",
      exportExcel: "Excel exportieren",
      raceOverviewTitle: "Laufübersicht",
      overallTitle: "Gesamtwertung",
      importedRunsTitle: "Importierte Läufe",
      noCategory: "Keine Kategorie vorhanden.",
      noRows: "Noch keine Wertungsdaten vorhanden.",
      rank: "Rang",
      team: "Team",
      points: "Punkte",
      distance: "Distanz (km)",
      races: "Läufe",
      statusExcluded: "außer Wertung",
    },
    import: {
      title: "Lauf Importieren",
      placeholder: "Die Importansicht folgt in F-TS06c.",
    },
    history: {
      title: "Historie & Korrektur",
      placeholder: "Noch keine Historie vorhanden.",
      importHistoryTitle: "Import-Historie",
      auditTrailTitle: "Audit-Protokoll",
      sourceFile: "Quelle",
      importedAt: "Importiert am",
      state: "Status",
      rows: "Zeilen",
      rollback: "Rollback",
      noImports: "Keine Imports vorhanden.",
      noAuditRows: "Keine Korrekturen protokolliert.",
      rollbackConfirmTitle: "Import zurückrollen?",
      rollbackConfirmBody:
        "Der ausgewählte Import und zugehörige Läufe werden als zurückgerollt markiert.",
      rolledBack: "zurückgerollt",
      active: "aktiv",
    },
    season: {
      title: "Saison wechseln",
      placeholder: "Bitte Saison auswählen oder neu anlegen.",
      createTitle: "Neue Saison",
      createLabel: "Saisonname",
      createAction: "Saison anlegen",
      openAction: "Öffnen",
      deleteAction: "Löschen",
      resetAction: "Zurücksetzen",
      importAction: "Saison importieren",
      exportAction: "Saison exportieren",
      noSeasons: "Noch keine Saisons vorhanden.",
      activeTag: "Aktiv",
      deleteConfirmTitle: "Saison löschen?",
      deleteConfirmBody: "Diese Saison wird dauerhaft entfernt.",
      resetConfirmTitle: "Saison zurücksetzen?",
      resetConfirmBody: "Alle Event-Daten der Saison werden gelöscht.",
      exportHint: "Export folgt in F-TS07/F-TS08.",
      importHint: "Import folgt in F-TS07.",
    },
  },
  category: {
    "hour:men": "60 Minuten Herren",
    "hour:women": "60 Minuten Damen",
    "hour:couples_men": "60 Minuten Paare Herren",
    "hour:couples_women": "60 Minuten Paare Damen",
    "hour:couples_mixed": "60 Minuten Paare Mixed",
    "half_hour:men": "30 Minuten Herren",
    "half_hour:women": "30 Minuten Damen",
    "half_hour:couples_men": "30 Minuten Paare Herren",
    "half_hour:couples_women": "30 Minuten Paare Damen",
    "half_hour:couples_mixed": "30 Minuten Paare Mixed",
  } as Record<string, string>,
  actions: {
    save: "Speichern",
    close: "Schließen",
    apply: "Übernehmen",
  },
  identityModal: {
    title: "Identität korrigieren",
    givenName: "Vorname",
    familyName: "Nachname",
    displayName: "Anzeigename",
    yob: "Jahrgang",
    club: "Verein",
  },
  mergeModal: {
    title: "Duplikate zusammenführen",
    survivor: "Ziel-Team",
    absorbed: "Aufzulösendes Team",
    help: "Alle übertragbaren Einträge werden vom aufzulösenden Team zum Ziel-Team verschoben.",
  },
  confidence: {
    high: "hoch",
    medium: "mittel",
    low: "niedrig",
  },
} as const;
