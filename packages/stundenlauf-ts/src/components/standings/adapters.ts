import { categoryKey, isEffectiveRace } from "@/domain/projection.ts";
import type { PersonIdentity, SeasonState } from "@/domain/types.ts";
import { formatKm } from "@/format.ts";
import { computeStandings, exclusionsForCategory, markExclusions } from "@/ranking/index.ts";
import type { CategoryStandingsTable, StandingsRowWithExclusion } from "@/ranking/types.ts";
import { STR } from "@/strings.ts";

export interface CategoryOption {
  key: string;
  label: string;
}

export interface ImportedRunRow {
  race_event_id: string;
  category_key: string;
  category_label: string;
  race_no: number;
  race_date: string;
  source_file: string;
  entries_count: number;
}

export interface StandingsTableRowVm {
  rank: number | null;
  team_id: string;
  team_label: string;
  total_points: number;
  total_km: string;
  races_count: number;
  excluded: boolean;
}

export interface RaceOverviewModel {
  raceColumns: string[];
  rows: Array<{
    team_id: string;
    team_label: string;
    race_values: Record<string, string>;
    total_points: number;
  }>;
}

const LEGACY_CATEGORY_ORDER = [
  "half_hour:women",
  "half_hour:men",
  "hour:women",
  "hour:men",
  "half_hour:couples_women",
  "half_hour:couples_men",
  "half_hour:couples_mixed",
  "hour:couples_women",
  "hour:couples_men",
  "hour:couples_mixed",
] as const;

function categorySortRank(key: string): number {
  const idx = LEGACY_CATEGORY_ORDER.indexOf(key as (typeof LEGACY_CATEGORY_ORDER)[number]);
  return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
}

function categoryLabel(category: string): string {
  return STR.category[category] ?? category;
}

function personLabel(person: PersonIdentity): string {
  return person.display_name;
}

export function teamLabel(state: SeasonState, teamId: string): string {
  const team = state.teams.get(teamId);
  if (!team) return teamId;
  return team.member_person_ids
    .map((personId) => {
      const person = state.persons.get(personId);
      return person ? personLabel(person) : personId;
    })
    .join(" / ");
}

export function buildCategoryOptions(state: SeasonState): CategoryOption[] {
  const standings = computeStandings(state);
  return standings.category_tables
    .map((table) => ({
      key: table.category_key,
      label: categoryLabel(table.category_key),
    }))
    .sort(
      (a, b) =>
        categorySortRank(a.key) - categorySortRank(b.key) || a.label.localeCompare(b.label, "de"),
    );
}

export function buildImportedRunsRows(state: SeasonState): ImportedRunRow[] {
  const rows: ImportedRunRow[] = [];
  for (const [raceEventId, race] of state.race_events) {
    if (!isEffectiveRace(state, raceEventId)) continue;
    const key = categoryKey(race.category);
    rows.push({
      race_event_id: race.race_event_id,
      category_key: key,
      category_label: categoryLabel(key),
      race_no: race.race_no,
      race_date: race.race_date,
      source_file: state.import_batches.get(race.import_batch_id)?.source_file ?? "—",
      entries_count: race.entries.length,
    });
  }
  return rows.sort((a, b) => a.category_key.localeCompare(b.category_key) || a.race_no - b.race_no);
}

function withExclusions(state: SeasonState, table: CategoryStandingsTable): StandingsRowWithExclusion[] {
  const excludedTeamIds = exclusionsForCategory(state, table.category_key);
  return markExclusions(table, excludedTeamIds).rows.slice();
}

export function buildStandingsRows(
  state: SeasonState,
  selectedCategoryKey: string | null,
): StandingsTableRowVm[] {
  const standings = computeStandings(state);
  const firstTable = standings.category_tables[0];
  const category = selectedCategoryKey ?? firstTable?.category_key;
  if (!category) return [];

  const table = standings.category_tables.find((entry) => entry.category_key === category);
  if (!table) return [];

  return withExclusions(state, table).map((row) => ({
    rank: row.rank,
    team_id: row.team_id,
    team_label: teamLabel(state, row.team_id),
    total_points: row.total_points,
    total_km: formatKm(row.total_distance_m / 1000),
    races_count: row.race_contributions.length,
    excluded: row.excluded,
  }));
}

export function buildRaceOverviewModel(
  state: SeasonState,
  selectedCategoryKey: string | null,
): RaceOverviewModel {
  const races = buildImportedRunsRows(state).filter(
    (row) => selectedCategoryKey == null || row.category_key === selectedCategoryKey,
  );
  const raceColumns = races.map((race) => race.race_event_id);

  const teamRows = new Map<
    string,
    {
      team_id: string;
      team_label: string;
      race_values: Record<string, string>;
      total_points: number;
    }
  >();

  for (const race of races) {
    const raceEvent = state.race_events.get(race.race_event_id);
    if (!raceEvent) continue;
    for (const entry of raceEvent.entries) {
      const current = teamRows.get(entry.team_id) ?? {
        team_id: entry.team_id,
        team_label: teamLabel(state, entry.team_id),
        race_values: {},
        total_points: 0,
      };
      current.race_values[race.race_event_id] = `${entry.points} / ${formatKm(entry.distance_m / 1000)}`;
      current.total_points += entry.points;
      teamRows.set(entry.team_id, current);
    }
  }

  const rows = [...teamRows.values()].sort(
    (a, b) => b.total_points - a.total_points || a.team_label.localeCompare(b.team_label, "de"),
  );
  return { raceColumns, rows };
}

export function categoryDisplayName(categoryKeyValue: string): string {
  return categoryLabel(categoryKeyValue);
}
