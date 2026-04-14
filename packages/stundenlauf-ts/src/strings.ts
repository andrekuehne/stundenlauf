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
      placeholder: "Die Wertungsansicht folgt in F-TS06b.",
    },
    import: {
      title: "Lauf Importieren",
      placeholder: "Die Importansicht folgt in F-TS06c.",
    },
    history: {
      title: "Historie & Korrektur",
      placeholder: "Die Historienansicht folgt in F-TS06b.",
    },
    season: {
      title: "Saison wechseln",
      placeholder: "Die Saisonverwaltung folgt in F-TS06b.",
    },
  },
  confidence: {
    high: "hoch",
    medium: "mittel",
    low: "niedrig",
  },
} as const;
