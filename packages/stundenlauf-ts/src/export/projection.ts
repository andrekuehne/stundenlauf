import { categoryKey, isEffectiveRace } from "@/domain/projection.ts";
import type { RaceCategory, RaceEvent, SeasonState, Team } from "@/domain/types.ts";
import {
  applyExclusions,
  computeStandings,
  exclusionsForCategory,
  markExclusions,
  type CategoryStandingsTable,
  type CategoryStandingsTableWithExclusions,
  type RaceContribution,
  type StandingsSnapshot,
  type StandingsRow,
  type StandingsRowWithExclusion,
} from "@/ranking/index.ts";
import {
  EXPORT_EMPTY_CELL,
  categoryFooterLabel,
  categoryLabel,
  displayNameYobLine,
  exportPdfCategoryTitle,
  formatDistanceKm,
  formatPoints,
  laufuebersichtClubCell,
  laufuebersichtSectionTitle,
  parseCategoryKey,
} from "./formatting.ts";
import { GERMAN_HEADER_BY_COLUMN, resolvedLaufuebersichtNotice, resolveColumns, type ExportColumnId, type ExportSpec } from "./spec.ts";

export type ExportTextAlign = "left" | "right" | "center";
export type ExportCellEmphasis = "normal" | "bold";
export type HeaderRowKind = "primary" | "secondary" | "units";
export type BodyRowKind = "single" | "team_primary" | "team_secondary";
export type RuleStyle = "thin" | "normal" | "thick" | "dashed" | "double";
export type ColumnRole =
  | "platz"
  | "identity_name"
  | "identity_club"
  | "yob"
  | "points_total"
  | "distance_total"
  | "ausser_wertung"
  | "entity_uid"
  | "entity_kind"
  | "team_members"
  | "points_per_race"
  | "race_km"
  | "race_pkt"
  | "total_km"
  | "total_pkt";

export interface ExportCell {
  readonly text: string;
  readonly emphasis: ExportCellEmphasis;
  readonly colorRole?: "headerRunRed";
}

export interface ColumnDef {
  readonly id: string;
  readonly header: string;
  readonly align: ExportTextAlign;
  readonly role: ColumnRole;
  readonly raceEventId?: string;
  readonly raceNo?: number;
}

export interface ExportHeaderRow {
  readonly kind: HeaderRowKind;
  readonly cells: readonly ExportCell[];
}

export interface ExportBodyRow {
  readonly kind: BodyRowKind;
  readonly cells: readonly ExportCell[];
  readonly bandGroup: number;
  readonly podium: boolean;
}

export interface CellSpan {
  readonly area: "header" | "body";
  readonly startCol: number;
  readonly startRow: number;
  readonly endCol: number;
  readonly endRow: number;
}

export interface ColumnRule {
  readonly afterColumn: number;
  readonly style: RuleStyle;
}

export interface RowRule {
  readonly afterBodyRow: number;
  readonly style: Exclude<RuleStyle, "dashed">;
}

export interface ExportCover {
  readonly seasonYear: number;
  readonly notice: string;
}

export interface ExportFooterContext {
  readonly seasonYear: number;
  readonly categoryLabel: string;
}

export interface ExportSection {
  readonly categoryKey: string;
  readonly category: RaceCategory;
  readonly title: string;
  readonly subtitle: string;
  readonly columns: readonly ColumnDef[];
  readonly headerRows: readonly ExportHeaderRow[];
  readonly bodyRows: readonly ExportBodyRow[];
  readonly spans: readonly CellSpan[];
  readonly columnRules: readonly ColumnRule[];
  readonly rowRules: readonly RowRule[];
  readonly headerSeparatorStyle: "normal" | "double";
  readonly footerContext: ExportFooterContext;
  readonly cover?: ExportCover;
}

export interface ExportProjectionOptions {
  readonly seasonYear: number;
  readonly standings?: StandingsSnapshot;
}

interface ExportTeamMember {
  readonly member: "a" | "b";
  readonly uid: string;
  readonly name: string;
  readonly yob: number;
  readonly club: string | null;
}

interface StandingsIdentity {
  readonly entity_uid: string;
  readonly entity_kind: "participant" | "team";
  readonly display_name: string;
  readonly yob: number | string | null;
  readonly club: string | null;
  readonly team_members?: readonly ExportTeamMember[];
}

interface ProjectedRaceCell {
  readonly raceEventId: string;
  readonly raceNo: number;
  readonly distanceKm: number | null;
  readonly points: number | null;
}

interface ProjectedStandingsRow {
  readonly platz: number | null;
  readonly ausserWertung: boolean;
  readonly display_name: string;
  readonly yob: number | string | null;
  readonly club: string | null;
  readonly entity_uid: string;
  readonly entity_kind: "participant" | "team";
  readonly team_members?: readonly ExportTeamMember[];
  readonly distanz_gesamt: number;
  readonly punkte_gesamt: number;
  readonly race_cells: readonly ProjectedRaceCell[];
}

function km(distanceM: number): number {
  return Math.round((distanceM / 1000) * 1000) / 1000;
}

function teamMembersForPreview(team: Team, state: SeasonState): ExportTeamMember[] {
  return team.member_person_ids
    .slice(0, 2)
    .map((personId, index) => {
      const person = state.persons.get(personId);
      return {
        member: index === 0 ? "a" : "b",
        uid: personId,
        name: person?.display_name ?? personId,
        yob: person?.yob ?? 0,
        club: person?.club ?? null,
      } as const;
    })
    .filter((member) => Boolean(member.uid));
}

function standingsIdentity(teamId: string, state: SeasonState): StandingsIdentity {
  const team = state.teams.get(teamId);
  if (!team) {
    return {
      entity_uid: teamId,
      entity_kind: "team",
      display_name: teamId,
      yob: null,
      club: null,
    };
  }

  if (team.team_kind === "solo") {
    const personId = team.member_person_ids[0];
    const person = personId ? state.persons.get(personId) : null;
    return {
      entity_uid: personId ?? teamId,
      entity_kind: "participant",
      display_name: person?.display_name ?? personId ?? teamId,
      yob: person?.yob ?? null,
      club: person?.club ?? null,
    };
  }

  const members = teamMembersForPreview(team, state);
  return {
    entity_uid: team.team_id,
    entity_kind: "team",
    display_name: members.map((member) => member.name).join(" / "),
    yob: members.map((member) => String(member.yob || "-")).join(" / "),
    club: members.map((member) => member.club).filter(Boolean).join(" / ") || null,
    team_members: members,
  };
}

function orderedActiveRacesForCategory(state: SeasonState, categoryKeyValue: string): RaceEvent[] {
  return [...state.race_events.values()]
    .filter(
      (race) =>
        categoryKey(race.category) === categoryKeyValue && isEffectiveRace(state, race.race_event_id),
    )
    .sort((a, b) => a.race_no - b.race_no || a.race_event_id.localeCompare(b.race_event_id));
}

function findStandingsTable(
  standings: StandingsSnapshot,
  categoryKeyValue: string,
): CategoryStandingsTable | null {
  return standings.category_tables.find((table) => table.category_key === categoryKeyValue) ?? null;
}

function projectRowsForCategory(
  state: SeasonState,
  standings: StandingsSnapshot,
  categoryKeyValue: string,
  eligibility: ExportSpec["rows"]["eligibility"],
): ProjectedStandingsRow[] {
  const table = findStandingsTable(standings, categoryKeyValue);
  if (!table) {
    return [];
  }

  const excluded = exclusionsForCategory(state, categoryKeyValue);
  const visibleTable: CategoryStandingsTable | CategoryStandingsTableWithExclusions =
    eligibility === "eligible_only" ? applyExclusions(table, excluded) : markExclusions(table, excluded);
  const races = orderedActiveRacesForCategory(state, categoryKeyValue);

  const visibleRows =
    eligibility === "eligible_only"
      ? (visibleTable as CategoryStandingsTable).rows
      : (visibleTable as CategoryStandingsTableWithExclusions).rows;

  return visibleRows.map((row) => projectStandingsRow(row, state, races, eligibility === "full_grid"));
}

function projectStandingsRow(
  row: StandingsRow | StandingsRowWithExclusion,
  state: SeasonState,
  races: readonly RaceEvent[],
  hasExclusionMarkers: boolean,
): ProjectedStandingsRow {
  const identity = standingsIdentity(row.team_id, state);
  return {
    platz: row.rank,
    ausserWertung: hasExclusionMarkers && "excluded" in row ? row.excluded : false,
    display_name: identity.display_name,
    yob: identity.yob,
    club: identity.club,
    entity_uid: identity.entity_uid,
    entity_kind: identity.entity_kind,
    ...(identity.team_members ? { team_members: identity.team_members } : {}),
    distanz_gesamt: km(row.total_distance_m),
    punkte_gesamt: row.total_points,
    race_cells: races.map((race) => projectRaceCell(race, row.race_contributions)),
  };
}

function projectRaceCell(race: RaceEvent, contributions: readonly RaceContribution[]): ProjectedRaceCell {
  const contribution = contributions.find((candidate) => candidate.race_event_id === race.race_event_id) ?? null;
  return {
    raceEventId: race.race_event_id,
    raceNo: race.race_no,
    distanceKm: contribution ? km(contribution.distance_m) : null,
    points: contribution?.points ?? null,
  };
}

function bodyCell(text: string, emphasis: ExportCellEmphasis = "normal"): ExportCell {
  return { text, emphasis };
}

function headerCell(
  text: string,
  kind: HeaderRowKind,
  colorRole?: ExportCell["colorRole"],
): ExportCell {
  return {
    text,
    emphasis: kind === "primary" ? "bold" : "normal",
    ...(colorRole ? { colorRole } : {}),
  };
}

function buildFlatColumns(resolvedColumns: readonly ExportColumnId[], races: readonly RaceEvent[]): ColumnDef[] {
  const columns: ColumnDef[] = [];
  for (const columnId of resolvedColumns) {
    if (columnId === "points_per_race") {
      for (const race of races) {
        columns.push({
          id: `points_race:${race.race_event_id}`,
          header: `${race.race_no}. Lauf`,
          align: "right",
          role: "points_per_race",
          raceEventId: race.race_event_id,
          raceNo: race.race_no,
        });
      }
      continue;
    }
    columns.push({
      id: columnId,
      header: GERMAN_HEADER_BY_COLUMN[columnId],
      align:
        columnId === "platz" ||
        columnId === "punkte_gesamt" ||
        columnId === "distanz_gesamt" ||
        columnId === "yob"
          ? "right"
          : "left",
      role: flatColumnRole(columnId),
    });
  }
  return columns;
}

function flatColumnRole(columnId: Exclude<ExportColumnId, "points_per_race">): ColumnRole {
  switch (columnId) {
    case "platz":
      return "platz";
    case "display_name":
      return "identity_name";
    case "club":
      return "identity_club";
    case "yob":
      return "yob";
    case "punkte_gesamt":
      return "points_total";
    case "distanz_gesamt":
      return "distance_total";
    case "ausser_wertung":
      return "ausser_wertung";
    case "entity_uid":
      return "entity_uid";
    case "entity_kind":
      return "entity_kind";
    case "team_members":
      return "team_members";
  }
}

function flatBodyRows(columns: readonly ColumnDef[], rows: readonly ProjectedStandingsRow[]): ExportBodyRow[] {
  return rows.map((row, index) => ({
    kind: "single",
    bandGroup: index,
    podium: row.platz != null && row.platz >= 1 && row.platz <= 3,
    cells: columns.map((column) => flatCellForColumn(column, row)),
  }));
}

function flatCellForColumn(column: ColumnDef, row: ProjectedStandingsRow): ExportCell {
  switch (column.role) {
    case "platz":
      return bodyCell(row.platz == null ? "" : String(row.platz));
    case "identity_name":
      return bodyCell(row.display_name);
    case "identity_club":
      return bodyCell(row.club ?? "");
    case "yob":
      return bodyCell(row.yob == null ? "" : String(row.yob));
    case "points_total":
      return bodyCell(formatPoints(row.punkte_gesamt));
    case "distance_total":
      return bodyCell(formatDistanceKm(row.distanz_gesamt));
    case "ausser_wertung":
      return bodyCell(row.ausserWertung ? "Ja" : "Nein");
    case "entity_uid":
      return bodyCell(row.entity_uid);
    case "entity_kind":
      return bodyCell(row.entity_kind);
    case "team_members":
      return bodyCell(
        row.team_members
          ?.map((member) => [member.name, member.yob ? `(${member.yob})` : "", member.club ?? ""].filter(Boolean).join(" "))
          .join("\n") ?? "",
      );
    case "points_per_race": {
      const raceEventId = column.raceEventId;
      const raceCell = row.race_cells.find((candidate) => candidate.raceEventId === raceEventId) ?? null;
      return bodyCell(raceCell?.points == null ? "" : formatPoints(raceCell.points));
    }
    case "race_km":
    case "race_pkt":
    case "total_km":
    case "total_pkt":
      return bodyCell("");
  }
}

function buildLaufuebersichtColumns(races: readonly RaceEvent[]): ColumnDef[] {
  const columns: ColumnDef[] = [
    { id: "platz", header: "Platz", align: "right", role: "platz" },
    { id: "display_name", header: "Name", align: "left", role: "identity_name" },
    { id: "club", header: "Verein", align: "left", role: "identity_club" },
  ];
  for (const race of races) {
    columns.push({
      id: `race_km:${race.race_event_id}`,
      header: "Laufstr. (km)",
      align: "center",
      role: "race_km",
      raceEventId: race.race_event_id,
      raceNo: race.race_no,
    });
    columns.push({
      id: `race_pkt:${race.race_event_id}`,
      header: "Wertung (Punkte)",
      align: "center",
      role: "race_pkt",
      raceEventId: race.race_event_id,
      raceNo: race.race_no,
    });
  }
  columns.push({ id: "gesamt_km", header: "Laufstr. (km)", align: "center", role: "total_km" });
  columns.push({ id: "gesamt_pkt", header: "Wertung (Punkte)", align: "center", role: "total_pkt" });
  return columns;
}

function buildLaufuebersichtHeaderRows(races: readonly RaceEvent[]): ExportHeaderRow[] {
  const primary: ExportCell[] = [
    headerCell("Platz", "primary"),
    headerCell("Name", "primary"),
    headerCell("Verein", "primary"),
  ];
  const secondary: ExportCell[] = [
    headerCell("", "secondary"),
    headerCell("", "secondary"),
    headerCell("", "secondary"),
  ];
  const units: ExportCell[] = [
    headerCell("", "units"),
    headerCell("", "units"),
    headerCell("", "units"),
  ];

  for (const race of races) {
    primary.push(headerCell(`${race.race_no}. Lauf`, "primary", "headerRunRed"));
    primary.push(headerCell("", "primary"));
    secondary.push(headerCell("Laufstr.", "secondary"));
    secondary.push(headerCell("Wertung", "secondary"));
    units.push(headerCell("(km)", "units"));
    units.push(headerCell("(Punkte)", "units"));
  }

  primary.push(headerCell("Gesamt", "primary", "headerRunRed"));
  primary.push(headerCell("", "primary"));
  secondary.push(headerCell("Laufstr.", "secondary"));
  secondary.push(headerCell("Wertung", "secondary"));
  units.push(headerCell("(km)", "units"));
  units.push(headerCell("(Punkte)", "units"));

  return [
    { kind: "primary", cells: primary },
    { kind: "secondary", cells: secondary },
    { kind: "units", cells: units },
  ];
}

function buildLaufuebersichtSpans(races: readonly RaceEvent[], bodyRows: readonly ExportBodyRow[]): CellSpan[] {
  const spans: CellSpan[] = [];
  for (const columnIndex of [0, 1, 2]) {
    spans.push({
      area: "header",
      startCol: columnIndex,
      startRow: 0,
      endCol: columnIndex,
      endRow: 2,
    });
  }
  for (let raceIndex = 0; raceIndex <= races.length; raceIndex += 1) {
    const startCol = 3 + raceIndex * 2;
    spans.push({
      area: "header",
      startCol,
      startRow: 0,
      endCol: startCol + 1,
      endRow: 0,
    });
  }

  for (let rowIndex = 0; rowIndex < bodyRows.length - 1; rowIndex += 1) {
    const current = bodyRows[rowIndex];
    const next = bodyRows[rowIndex + 1];
    if (!current || !next) {
      continue;
    }
    if (current.kind !== "team_primary" || next.kind !== "team_secondary") {
      continue;
    }
    spans.push({
      area: "body",
      startCol: 0,
      startRow: rowIndex,
      endCol: 0,
      endRow: rowIndex + 1,
    });
    for (let columnIndex = 3; columnIndex < current.cells.length; columnIndex += 1) {
      spans.push({
        area: "body",
        startCol: columnIndex,
        startRow: rowIndex,
        endCol: columnIndex,
        endRow: rowIndex + 1,
      });
    }
  }

  return spans;
}

function laufuebersichtNumericCells(row: ProjectedStandingsRow): ExportCell[] {
  const cells: ExportCell[] = [];
  for (const raceCell of row.race_cells) {
    cells.push(bodyCell(raceCell.distanceKm == null ? EXPORT_EMPTY_CELL : formatDistanceKm(raceCell.distanceKm)));
    cells.push(
      bodyCell(
        raceCell.points == null ? EXPORT_EMPTY_CELL : formatPoints(raceCell.points),
        raceCell.points == null ? "normal" : "bold",
      ),
    );
  }
  cells.push(bodyCell(formatDistanceKm(row.distanz_gesamt)));
  cells.push(bodyCell(formatPoints(row.punkte_gesamt), "bold"));
  return cells;
}

function buildLaufuebersichtBodyRows(rows: readonly ProjectedStandingsRow[]): ExportBodyRow[] {
  const bodyRows: ExportBodyRow[] = [];
  let bandGroup = 0;
  for (const row of rows) {
    const platz = row.platz == null ? "" : String(row.platz);
    const podium = row.platz != null && row.platz >= 1 && row.platz <= 3;
    const numericCells = laufuebersichtNumericCells(row);
    if (row.entity_kind === "team" && row.team_members && row.team_members.length >= 2) {
      const firstMember = row.team_members[0];
      const secondMember = row.team_members[1];
      if (!firstMember || !secondMember) {
        continue;
      }
      bodyRows.push({
        kind: "team_primary",
        bandGroup,
        podium,
        cells: [
          bodyCell(platz),
          bodyCell(displayNameYobLine(firstMember.name, firstMember.yob)),
          bodyCell(laufuebersichtClubCell(firstMember.club)),
          ...numericCells,
        ],
      });
      bodyRows.push({
        kind: "team_secondary",
        bandGroup,
        podium,
        cells: [
          bodyCell(""),
          bodyCell(displayNameYobLine(secondMember.name, secondMember.yob)),
          bodyCell(laufuebersichtClubCell(secondMember.club)),
          ...numericCells.map(() => bodyCell("")),
        ],
      });
      bandGroup += 1;
      continue;
    }

    bodyRows.push({
      kind: "single",
      bandGroup,
      podium,
      cells: [
        bodyCell(platz),
        bodyCell(displayNameYobLine(row.display_name, row.yob)),
        bodyCell(laufuebersichtClubCell(row.club)),
        ...numericCells,
      ],
    });
    bandGroup += 1;
  }
  return bodyRows;
}

function buildLaufuebersichtColumnRules(columns: readonly ColumnDef[]): ColumnRule[] {
  return columns
    .slice(0, -1)
    .map((column, columnIndex) => {
      if (column.role === "identity_club") {
        return { afterColumn: columnIndex, style: "thick" } as const;
      }
      if (column.role === "race_km" || column.role === "total_km") {
        return { afterColumn: columnIndex, style: "dashed" } as const;
      }
      if (
        column.role === "race_pkt" &&
        columns[columnIndex + 1]?.role === "total_km"
      ) {
        return { afterColumn: columnIndex, style: "double" } as const;
      }
      return { afterColumn: columnIndex, style: "normal" } as const;
    });
}

function buildLaufuebersichtRowRules(bodyRows: readonly ExportBodyRow[]): RowRule[] {
  let lastPodiumRow = -1;
  bodyRows.forEach((row, index) => {
    if (row.podium) {
      lastPodiumRow = index;
    }
  });

  const rules: RowRule[] = [];
  for (let rowIndex = 0; rowIndex < bodyRows.length - 1; rowIndex += 1) {
    const current = bodyRows[rowIndex];
    const next = bodyRows[rowIndex + 1];
    if (!current || !next) {
      continue;
    }
    if (current.bandGroup === next.bandGroup) {
      rules.push({ afterBodyRow: rowIndex, style: "thin" });
      continue;
    }
    if (rowIndex === lastPodiumRow) {
      rules.push({ afterBodyRow: rowIndex, style: "thick" });
      continue;
    }
    rules.push({ afterBodyRow: rowIndex, style: "normal" });
  }
  return rules;
}

function buildFlatSection(
  state: SeasonState,
  spec: ExportSpec,
  category: RaceCategory,
  categoryKeyValue: string,
  seasonYear: number,
  standings: StandingsSnapshot,
): ExportSection {
  const races = orderedActiveRacesForCategory(state, categoryKeyValue);
  const columns = buildFlatColumns(resolveColumns(spec), races);
  const bodyRows = flatBodyRows(
    columns,
    projectRowsForCategory(state, standings, categoryKeyValue, spec.rows.eligibility),
  );
  return {
    categoryKey: categoryKeyValue,
    category,
    title: spec.pdf.title || exportPdfCategoryTitle(seasonYear, category),
    subtitle: spec.pdf.subtitle,
    columns,
    headerRows: [
      {
        kind: "primary",
        cells: columns.map((column) => headerCell(column.header, "primary")),
      },
    ],
    bodyRows,
    spans: [],
    columnRules: [],
    rowRules: [],
    headerSeparatorStyle: "normal",
    footerContext: {
      seasonYear,
      categoryLabel: categoryFooterLabel(category),
    },
  };
}

function buildLaufuebersichtSection(
  state: SeasonState,
  spec: ExportSpec,
  category: RaceCategory,
  categoryKeyValue: string,
  seasonYear: number,
  standings: StandingsSnapshot,
  sectionNumber: number,
  includeCover: boolean,
): ExportSection {
  const races = orderedActiveRacesForCategory(state, categoryKeyValue);
  const columns = buildLaufuebersichtColumns(races);
  const bodyRows = buildLaufuebersichtBodyRows(
    projectRowsForCategory(state, standings, categoryKeyValue, spec.rows.eligibility),
  );
  return {
    categoryKey: categoryKeyValue,
    category,
    title: spec.pdf.title || laufuebersichtSectionTitle(sectionNumber, category),
    subtitle: spec.pdf.subtitle,
    columns,
    headerRows: buildLaufuebersichtHeaderRows(races),
    bodyRows,
    spans: buildLaufuebersichtSpans(races, bodyRows),
    columnRules: buildLaufuebersichtColumnRules(columns),
    rowRules: buildLaufuebersichtRowRules(bodyRows),
    headerSeparatorStyle: "double",
    footerContext: {
      seasonYear,
      categoryLabel: categoryFooterLabel(category),
    },
    ...(includeCover
      ? {
          cover: {
            seasonYear,
            notice: resolvedLaufuebersichtNotice(spec.pdf),
          },
        }
      : {}),
  };
}

export function buildExportSections(
  state: SeasonState,
  spec: ExportSpec,
  options: ExportProjectionOptions,
): ExportSection[] {
  const standings = options.standings ?? computeStandings(state);
  return spec.categories.map((categoryKeyValue, index) => {
    const category = parseCategoryKey(categoryKeyValue);
    if (!category) {
      throw new Error(`Unknown export category key "${categoryKeyValue}".`);
    }
    if (spec.pdf.tableLayout === "laufuebersicht") {
      return buildLaufuebersichtSection(
        state,
        spec,
        category,
        categoryKeyValue,
        options.seasonYear,
        standings,
        spec.pdf.laufuebersichtSectionNumberStart + index,
        index === 0 && spec.pdf.laufuebersichtShowCover,
      );
    }
    return buildFlatSection(state, spec, category, categoryKeyValue, options.seasonYear, standings);
  });
}

export function effectiveCategoryKeys(state: SeasonState): string[] {
  const keys = new Set<string>();
  for (const [raceEventId, race] of state.race_events) {
    if (!isEffectiveRace(state, raceEventId)) {
      continue;
    }
    keys.add(categoryKey(race.category));
  }
  return [...keys];
}

export function exportCategoryLabel(categoryKeyValue: string): string {
  const category = parseCategoryKey(categoryKeyValue);
  if (!category) {
    return categoryKeyValue;
  }
  return categoryLabel(category);
}
