import type { DomainEvent } from "@/domain/events.ts";
import { categoryKey, isEffectiveRace, projectState } from "@/domain/projection.ts";
import type {
  PersonIdentity,
  RaceCategory,
  SeasonDescriptor,
  SeasonState,
  Team,
} from "@/domain/types.ts";
import {
  finalizeImport,
  getReviewQueue,
  resolveReviewEntry,
  runMatching,
  startImport,
  type ImportSession,
  type OrchestratedReviewEntry,
  type ReviewAction,
} from "@/import/orchestrator.ts";
import { defaultMatchingConfig, type MatchingConfig } from "@/matching/config.ts";
import {
  alignCoupleMembersForDisplay,
  buildCoupleLineHighlights,
  fieldHighlightsForPersonLine,
} from "@/matching/review-display.ts";
import { canonicalPersonIdentityFromIncoming, normalizeClub } from "@/matching/normalize.ts";
import {
  exportSeason as exportSeasonArchive,
  importSeason as importSeasonArchive,
  type ImportSeasonOptions,
} from "@/portability/index.ts";
import { applyExclusions, computeStandings, exclusionsForCategory, markExclusions } from "@/ranking/index.ts";
import { getSeasonRepository, type SeasonRepository } from "@/services/season-repository.ts";
import { EventAppendValidationError } from "@/storage/event-store.ts";
import type { LegacyApiErrorResponse, LegacyApiResponse } from "./types.ts";

const ADAPTER_APP_VERSION = "stundenlauf-ts-legacy-adapter-0.1.0";
const ALIAS_STORAGE_KEY = "stundenlauf-ts:legacy-season-aliases";
const MATCHING_STORAGE_KEY = "stundenlauf-ts:legacy-matching-config";

type SaveRegistryEntry = {
  token: string;
  suggestedName: string;
  dialogKind: string | null;
  handle?: unknown;
};

type LegacySeasonAliases = Record<string, number>;

interface TimelineItem {
  timestamp?: string;
  event_type?: string;
  race_event_uid?: string;
  [key: string]: unknown;
}

interface SeasonSnapshot {
  descriptor: SeasonDescriptor;
  eventLog: DomainEvent[];
  seasonState: SeasonState;
}

interface LegacyPreviewMember {
  member: "a" | "b";
  uid: string;
  name: string;
  yob: number;
  club: string | null;
}

interface LegacyEntityPreview {
  uid: string;
  kind: "participant" | "team";
  display_name: string;
  yob: number | string | null;
  club: string | null;
  member_a?: { uid: string; name: string; yob: number; club: string | null };
  member_b?: { uid: string; name: string; yob: number; club: string | null };
}

interface PendingImportState {
  seasonId: string;
  session: ImportSession;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readStorageJson<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorageJson(key: string, value: unknown): void {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore persistence failures in compatibility-only storage
  }
}

function ok(requestId: string, payload: Record<string, unknown> = {}): LegacyApiResponse {
  return {
    status: "ok",
    request_id: requestId,
    payload,
  };
}

function errorResponse(
  requestId: string,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): LegacyApiErrorResponse {
  return {
    status: "error",
    request_id: requestId,
    error: {
      code,
      message,
      details: {
        message,
        ...details,
      },
    },
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asOptionalString(value: unknown): string | null {
  const trimmed = asString(value).trim();
  return trimmed ? trimmed : null;
}

function asInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseCategoryKeyValue(key: string): RaceCategory | null {
  const [duration, division] = key.split(":");
  if (!duration || !division) return null;
  return {
    duration: duration as RaceCategory["duration"],
    division: division as RaceCategory["division"],
  };
}

function germanCategoryLabel(category: RaceCategory): string {
  const duration = category.duration === "half_hour" ? "30 Minuten" : "60 Minuten";
  const divisionLabels: Record<RaceCategory["division"], string> = {
    men: "Männer",
    women: "Frauen",
    couples_men: "Paare Männer",
    couples_women: "Paare Frauen",
    couples_mixed: "Paare Mixed",
  };
  return `${duration} ${divisionLabels[category.division]}`;
}

function km(distanceM: number): number {
  return Math.round((distanceM / 1000) * 1000) / 1000;
}

function eventEnvelope(seq: number, type: DomainEvent["type"], payload: unknown): DomainEvent {
  return {
    event_id: crypto.randomUUID(),
    seq,
    recorded_at: new Date().toISOString(),
    type,
    schema_version: 1,
    payload,
    metadata: {
      app_version: ADAPTER_APP_VERSION,
    },
  } as DomainEvent;
}

function extractYearCandidate(label: string, createdAt: string): number {
  const explicit = label.match(/\b(19|20)\d{2}\b/);
  if (explicit) {
    return Number(explicit[0]);
  }
  const created = new Date(createdAt);
  if (!Number.isNaN(created.getTime())) {
    return created.getFullYear();
  }
  return new Date().getFullYear();
}

function uniqueAlias(baseYear: number, used: Set<number>): number {
  let next = baseYear;
  while (used.has(next)) {
    next += 1;
  }
  return next;
}

function sortTimeline(items: TimelineItem[]): TimelineItem[] {
  return items.sort((a, b) => timelineTimestamp(b).localeCompare(timelineTimestamp(a)));
}

function timelineTimestamp(item: TimelineItem): string {
  return item.timestamp ?? "";
}

function teamMembersForPreview(team: Team, state: SeasonState): LegacyPreviewMember[] {
  return team.member_person_ids
    .slice(0, 2)
    .map((personId, index) => {
      const person = state.persons.get(personId);
      const member: LegacyPreviewMember["member"] = index === 0 ? "a" : "b";
      return {
        member,
        uid: personId,
        name: person?.display_name ?? personId,
        yob: person?.yob ?? 0,
        club: person?.club ?? null,
      };
    })
    .filter((member) => Boolean(member.uid));
}

function previewForTeam(teamId: string, state: SeasonState): LegacyEntityPreview | null {
  const team = state.teams.get(teamId);
  if (!team) return null;

  if (team.team_kind === "solo") {
    const personId = team.member_person_ids[0];
    if (!personId) return null;
    const person = state.persons.get(personId);
    return {
      uid: personId,
      kind: "participant",
      display_name: person?.display_name ?? personId,
      yob: person?.yob ?? null,
      club: person?.club ?? null,
    };
  }

  const members = teamMembersForPreview(team, state);
  const memberA = members[0];
  const memberB = members[1];
  return {
    uid: team.team_id,
    kind: "team",
    display_name: members.map((member) => member.name).join(" / "),
    yob: members.map((member) => String(member.yob || "-")).join(" / "),
    club: members.map((member) => member.club).filter(Boolean).join(" / ") || null,
    ...(memberA
      ? {
          member_a: {
            uid: memberA.uid,
            name: memberA.name,
            yob: memberA.yob,
            club: memberA.club,
          },
        }
      : {}),
    ...(memberB
      ? {
          member_b: {
            uid: memberB.uid,
            name: memberB.name,
            yob: memberB.yob,
            club: memberB.club,
          },
        }
      : {}),
  };
}

function teamIdForEntityUid(state: SeasonState, entityUid: string): string | null {
  if (state.teams.has(entityUid)) {
    return entityUid;
  }
  for (const team of state.teams.values()) {
    if (team.team_kind !== "solo") continue;
    if (team.member_person_ids[0] === entityUid) {
      return team.team_id;
    }
  }
  return null;
}

function personIdForIdentityUpdate(
  state: SeasonState,
  payload: Record<string, unknown>,
): { personId: string; teamContext: Team | null; member: "a" | "b" | null } | null {
  const participantUid = asOptionalString(payload.participant_uid);
  if (participantUid) {
    return { personId: participantUid, teamContext: null, member: null };
  }

  const teamUid = asOptionalString(payload.team_uid);
  if (!teamUid) return null;
  const team = state.teams.get(teamUid);
  if (!team) return null;
  const member = asString(payload.member) === "b" ? "b" : "a";
  const index = member === "a" ? 0 : 1;
  const personId = team.member_person_ids[index];
  if (!personId) return null;
  return { personId, teamContext: team, member };
}

function parseNameForCorrection(name: string): {
  given_name: string;
  family_name: string;
  display_name: string;
  name_normalized: string;
} {
  return canonicalPersonIdentityFromIncoming(name.trim());
}

function reviewDisplayForCandidate(
  incomingPreview: LegacyEntityPreview,
  candidatePreview: LegacyEntityPreview,
  candidatePeople: PersonIdentity[],
): Record<string, unknown> | null {
  const incomingDisplayName = incomingPreview.display_name;
  const incomingYob = typeof incomingPreview.yob === "number" ? incomingPreview.yob : 0;
  if (candidatePreview.kind === "participant") {
    const person = candidatePeople[0];
    if (!person) return null;
    return {
      lines: [
        fieldHighlightsForPersonLine(
          incomingDisplayName,
          incomingYob,
          incomingPreview.club ?? null,
          person.display_name,
          person.yob,
          person.club,
        ),
      ],
    };
  }

  const memberA = candidatePeople[0];
  const memberB = candidatePeople[1];
  if (!memberA || !memberB) return null;
  const [, aligned] = alignCoupleMembersForDisplay(
    {
      display_name: incomingDisplayName,
      yob: incomingPreview.yob ?? null,
      club: incomingPreview.club ?? null,
    },
    memberA,
    memberB,
  );
  return {
    lines: buildCoupleLineHighlights(
      {
        display_name: incomingDisplayName,
        yob: incomingPreview.yob ?? null,
        club: incomingPreview.club ?? null,
      },
      aligned,
    ),
  };
}

async function promptForFile(kind: string | null): Promise<File | null> {
  if (typeof document === "undefined") return null;
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.style.position = "fixed";
    input.style.left = "-10000px";
    input.style.top = "-10000px";
    input.accept = kind === "season_export" ? ".zip,.stundenlauf-season.zip,application/zip" : ".xlsx,.xls";
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0] ?? null;
        input.remove();
        resolve(file);
      },
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
    window.setTimeout(() => {
      if (!input.isConnected) return;
      input.remove();
      resolve(null);
    }, 30000);
  });
}

export class LegacyApiRuntime {
  private activeSeasonId: string | null = null;
  private pendingImport: PendingImportState | null = null;
  private readonly selectedFiles = new Map<string, File>();
  private readonly saveTargets = new Map<string, SaveRegistryEntry>();
  private matchingConfig: MatchingConfig = {
    ...defaultMatchingConfig(),
    ...readStorageJson<Partial<MatchingConfig>>(MATCHING_STORAGE_KEY, {}),
  };

  async invoke(request: unknown): Promise<LegacyApiResponse> {
    if (!isRecord(request)) {
      return errorResponse("legacy_invalid_request", "INVALID_REQUEST", "Ungültige API-Anfrage.");
    }
    const requestId = asOptionalString(request.request_id) ?? "legacy_invalid_request";
    if (request.api_version !== "v1") {
      return errorResponse(requestId, "INVALID_REQUEST", "Ungültige API-Anfrage.");
    }
    if (typeof request.method !== "string" || !isRecord(request.payload)) {
      return errorResponse(
        requestId,
        "INVALID_REQUEST",
        "Ungültige API-Anfrage.",
      );
    }
    const payload = request.payload;
    const method = request.method;

    try {
      switch (method) {
        case "list_series_years":
          return ok(requestId, { items: await this.listSeriesYears() });
        case "create_series_year":
          return ok(requestId, await this.createSeriesYear(payload));
        case "open_series_year":
          return ok(requestId, await this.openSeriesYear(payload));
        case "delete_series_year":
          return ok(requestId, await this.deleteSeriesYear(payload));
        case "reset_series_year":
          return ok(requestId, await this.resetSeriesYear(payload));
        case "get_year_overview":
          return ok(requestId, await this.getYearOverview(payload));
        case "get_matching_config":
          return ok(requestId, this.matchingConfigPayload());
        case "set_matching_config":
          return ok(requestId, this.setMatchingConfig(payload));
        case "get_standings":
          return ok(requestId, await this.getStandings(payload));
        case "get_category_current_results_table":
          return ok(requestId, await this.getCategoryCurrentResultsTable(payload));
        case "set_ranking_eligibility":
          return ok(requestId, await this.setRankingEligibility(payload));
        case "update_participant_identity":
          return ok(requestId, await this.updateParticipantIdentity(payload));
        case "merge_standings_entities":
          return ok(requestId, await this.mergeStandingsEntities(payload));
        case "get_year_timeline":
          return ok(requestId, await this.getYearTimeline(payload));
        case "rollback_source_batch":
          return ok(requestId, await this.rollbackSourceBatch(payload));
        case "pick_file":
          return ok(requestId, await this.pickFile(payload));
        case "pick_save_file":
          return ok(requestId, this.pickSaveFile(payload));
        case "import_race":
          return ok(requestId, await this.importRace(payload));
        case "get_review_queue":
          return ok(requestId, await this.reviewQueuePayload());
        case "apply_match_decision":
          return ok(requestId, await this.applyMatchDecision(payload));
        case "list_pdf_export_layout_presets":
          return ok(requestId, { presets: [] });
        case "export_series_year":
          return ok(requestId, await this.exportSeriesYear(payload));
        case "import_series_year":
          return ok(requestId, await this.importSeriesYear(payload));
        case "export_standings_pdf":
          return errorResponse(
            requestId,
            "NOT_IMPLEMENTED",
            "Diese Funktion ist im TypeScript-Port noch nicht implementiert.",
          );
        default:
          return errorResponse(
            requestId,
            "UNKNOWN_METHOD",
            `Unbekannte Methode: ${method}`,
          );
      }
    } catch (error) {
      return this.mapError(requestId, error);
    }
  }

  private async repository(): Promise<SeasonRepository> {
    return getSeasonRepository();
  }

  private loadAliases(): LegacySeasonAliases {
    return readStorageJson<LegacySeasonAliases>(ALIAS_STORAGE_KEY, {});
  }

  private saveAliases(aliases: LegacySeasonAliases): void {
    writeStorageJson(ALIAS_STORAGE_KEY, aliases);
  }

  private ensureAliases(seasons: SeasonDescriptor[]): LegacySeasonAliases {
    const knownSeasonIds = new Set(seasons.map((season) => season.season_id));
    const aliases = Object.fromEntries(
      Object.entries(this.loadAliases()).filter(([seasonId]) => knownSeasonIds.has(seasonId)),
    ) as LegacySeasonAliases;
    const used = new Set<number>(Object.values(aliases));
    let changed = Object.keys(aliases).length !== Object.keys(this.loadAliases()).length;

    for (const season of seasons) {
      if (aliases[season.season_id] != null) continue;
      const base = extractYearCandidate(season.label, season.created_at);
      const next = uniqueAlias(base, used);
      aliases[season.season_id] = next;
      used.add(next);
      changed = true;
    }

    if (changed) {
      this.saveAliases(aliases);
    }
    return aliases;
  }

  private async resolveSeasonId(seriesYear: number): Promise<string> {
    const repo = await this.repository();
    const seasons = await repo.listSeasons();
    const aliases = this.ensureAliases(seasons);
    const seasonId = Object.entries(aliases).find(([, year]) => year === seriesYear)?.[0] ?? null;
    if (!seasonId) {
      throw new Error(`Saison ${seriesYear} wurde nicht gefunden.`);
    }
    return seasonId;
  }

  private async getSnapshotBySeasonId(seasonId: string): Promise<SeasonSnapshot> {
    const repo = await this.repository();
    const seasons = await repo.listSeasons();
    const descriptor = seasons.find((season) => season.season_id === seasonId);
    if (!descriptor) {
      throw new Error(`Saison ${seasonId} wurde nicht gefunden.`);
    }
    const eventLog = await repo.getEventLog(seasonId);
    return {
      descriptor,
      eventLog,
      seasonState: projectState(seasonId, eventLog),
    };
  }

  private async getSnapshotFromPayload(payload: Record<string, unknown>): Promise<SeasonSnapshot> {
    const requestedYear = asInteger(payload.series_year);
    const seasonId =
      requestedYear != null
        ? await this.resolveSeasonId(requestedYear)
        : this.activeSeasonId;
    if (!seasonId) {
      throw new Error("Keine Saison geöffnet.");
    }
    return this.getSnapshotBySeasonId(seasonId);
  }

  private matchingConfigPayload(): Record<string, unknown> {
    return {
      auto_min: this.matchingConfig.auto_min,
      review_min: this.matchingConfig.review_min,
      auto_merge_enabled: this.matchingConfig.auto_merge_enabled,
      perfect_match_auto_merge: this.matchingConfig.perfect_match_auto_merge,
      strict_normalized_auto_only: this.matchingConfig.strict_normalized_auto_only,
    };
  }

  private setMatchingConfig(payload: Record<string, unknown>): Record<string, unknown> {
    const autoMin = Math.max(0, Math.min(1, asNumber(payload.auto_min) ?? this.matchingConfig.auto_min));
    const reviewMin = Math.max(0, Math.min(1, asNumber(payload.review_min) ?? this.matchingConfig.review_min));
    this.matchingConfig = {
      ...this.matchingConfig,
      auto_min: autoMin,
      review_min: Math.min(reviewMin, autoMin),
      auto_merge_enabled: Boolean(payload.auto_merge_enabled),
      perfect_match_auto_merge: Boolean(payload.perfect_match_auto_merge),
      strict_normalized_auto_only: Boolean(payload.strict_normalized_auto_only),
    };
    writeStorageJson(MATCHING_STORAGE_KEY, this.matchingConfigPayload());
    return this.matchingConfigPayload();
  }

  private async listSeriesYears(): Promise<Record<string, unknown>[]> {
    const repo = await this.repository();
    const seasons = await repo.listSeasons();
    const aliases = this.ensureAliases(seasons);

    const items = await Promise.all(
      seasons.map(async (season) => {
        const eventLog = await repo.getEventLog(season.season_id);
        const state = projectState(season.season_id, eventLog);
        const activeRaces = [...state.race_events.values()].filter((race) =>
          isEffectiveRace(state, race.race_event_id),
        );
        const singlesRaceNumbers = [...new Set(
          activeRaces
            .filter((race) => !race.category.division.startsWith("couples_"))
            .map((race) => race.race_no),
        )].sort((a, b) => a - b);
        const couplesRaceNumbers = [...new Set(
          activeRaces
            .filter((race) => race.category.division.startsWith("couples_"))
            .map((race) => race.race_no),
        )].sort((a, b) => a - b);
        const maxRaceNo = Math.max(5, ...singlesRaceNumbers, ...couplesRaceNumbers, 0);
        const reviewQueueCount =
          this.pendingImport?.seasonId === season.season_id
            ? getReviewQueue(this.pendingImport.session).length
            : 0;
        const latestImportedAt =
          activeRaces
            .map((race) => race.imported_at)
            .sort((a, b) => b.localeCompare(a))[0] ?? null;
        return {
          series_year: aliases[season.season_id],
          display_name: season.label,
          review_queue_count: reviewQueueCount,
          latest_imported_at: latestImportedAt,
          race_coverage: {
            singles_race_numbers: singlesRaceNumbers,
            couples_race_numbers: couplesRaceNumbers,
            race_columns: Array.from({ length: maxRaceNo }, (_, index) => index + 1),
          },
        };
      }),
    );

    return items.sort((a, b) => (a.series_year ?? 0) - (b.series_year ?? 0));
  }

  private async createSeriesYear(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const requestedYear = asInteger(payload.series_year);
    const seasonLabel =
      asOptionalString(payload.display_name) ??
      (requestedYear != null ? `Stundenlauf ${requestedYear}` : null);
    if (!seasonLabel) {
      throw new Error("Bitte einen Saisonnamen angeben.");
    }

    const repo = await this.repository();
    const seasons = await repo.listSeasons();
    const aliases = this.ensureAliases(seasons);
    if (requestedYear != null && Object.values(aliases).includes(requestedYear)) {
      throw new Error(`Saison ${requestedYear} existiert bereits.`);
    }

    const created = await repo.createSeason(seasonLabel);
    const assignedYear =
      requestedYear ??
      (Object.values(aliases).length > 0
        ? Math.max(...Object.values(aliases).map((value) => value || 0)) + 1
        : 1);
    this.saveAliases({
      ...aliases,
      [created.season_id]: assignedYear,
    });
    return {
      series_year: assignedYear,
      season_id: created.season_id,
      display_name: created.label,
    };
  }

  private async openSeriesYear(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const requestedYear = asInteger(payload.series_year);
    if (requestedYear == null) {
      throw new Error("Bitte eine gültige Saison wählen.");
    }
    const seasonId = await this.resolveSeasonId(requestedYear);
    if (this.activeSeasonId !== seasonId) {
      this.pendingImport = null;
    }
    this.activeSeasonId = seasonId;
    return {
      series_year: requestedYear,
      active: true,
    };
  }

  private async deleteSeriesYear(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const requestedYear = asInteger(payload.series_year);
    const confirmedYear = asInteger(payload.confirm_series_year);
    if (requestedYear == null || confirmedYear !== requestedYear) {
      throw new Error("Saison-Löschung nicht bestätigt.");
    }
    const seasonId = await this.resolveSeasonId(requestedYear);
    const repo = await this.repository();
    await repo.deleteSeason(seasonId);
    const aliases = this.loadAliases();
    const remainingAliases = Object.fromEntries(
      Object.entries(aliases).filter(([aliasSeasonId]) => aliasSeasonId !== seasonId),
    );
    this.saveAliases(remainingAliases);
    if (this.activeSeasonId === seasonId) {
      this.activeSeasonId = null;
      this.pendingImport = null;
    }
    return { series_year: requestedYear, deleted: true };
  }

  private async resetSeriesYear(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const requestedYear = asInteger(payload.series_year);
    const confirmedYear = asInteger(payload.confirm_series_year);
    if (requestedYear == null || confirmedYear !== requestedYear) {
      throw new Error("Saison-Zurücksetzen nicht bestätigt.");
    }
    const seasonId = await this.resolveSeasonId(requestedYear);
    const repo = await this.repository();
    await repo.clearEventLog(seasonId);
    if (this.pendingImport?.seasonId === seasonId) {
      this.pendingImport = null;
    }
    return { series_year: requestedYear, reset: true };
  }

  private async getYearOverview(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const snapshot = await this.getSnapshotFromPayload(payload);
    const pendingReviewCount =
      this.pendingImport?.seasonId === snapshot.descriptor.season_id
        ? getReviewQueue(this.pendingImport.session).length
        : 0;

    const effectiveRaces = [...snapshot.seasonState.race_events.values()]
      .filter((race) => isEffectiveRace(snapshot.seasonState, race.race_event_id))
      .sort((a, b) => {
        if (a.race_no !== b.race_no) return a.race_no - b.race_no;
        return a.race_event_id.localeCompare(b.race_event_id);
      });

    const categories = [...new Map(
      effectiveRaces.map((race) => {
        const key = categoryKey(race.category);
        return [
          key,
          {
            category_key: key,
            category_label: germanCategoryLabel(race.category),
            duration: race.category.duration,
            division: race.category.division,
          },
        ];
      }),
    ).values()].sort((a, b) => a.category_label.localeCompare(b.category_label, "de"));

    const raceHistoryGroups = categories.map((category) => ({
      category_key: category.category_key,
      category_label: category.category_label,
      events: effectiveRaces
        .filter((race) => categoryKey(race.category) === category.category_key)
        .map((race) => ({
          race_event_uid: race.race_event_id,
          race_no: race.race_no,
          race_date: race.race_date,
          source_file:
            snapshot.seasonState.import_batches.get(race.import_batch_id)?.source_file ?? "",
        })),
    }));

    return {
      categories,
      race_history_groups: raceHistoryGroups,
      totals: {
        review_queue: pendingReviewCount,
      },
    };
  }

  private standingsIdentity(teamId: string, state: SeasonState): {
    entity_uid: string;
    entity_kind: "participant" | "team";
    display_name: string;
    yob: number | string | null;
    club: string | null;
    team_members?: Array<Record<string, unknown>>;
  } {
    const preview = previewForTeam(teamId, state);
    if (!preview) {
      return {
        entity_uid: teamId,
        entity_kind: "team",
        display_name: teamId,
        yob: null,
        club: null,
      };
    }

    if (preview.kind === "participant") {
      return {
        entity_uid: preview.uid,
        entity_kind: "participant",
        display_name: preview.display_name,
        yob: preview.yob,
        club: preview.club,
      };
    }

    return {
      entity_uid: preview.uid,
      entity_kind: "team",
      display_name: preview.display_name,
      yob: preview.yob,
      club: preview.club,
      team_members: ([
        preview.member_a
          ? {
              member: "a",
              uid: preview.member_a.uid,
              name: preview.member_a.name,
              yob: preview.member_a.yob,
              club: preview.member_a.club,
            }
          : null,
        preview.member_b
          ? {
              member: "b",
              uid: preview.member_b.uid,
              name: preview.member_b.name,
              yob: preview.member_b.yob,
              club: preview.member_b.club,
            }
          : null,
      ].filter((item): item is NonNullable<typeof item> => item != null)),
    };
  }

  private async getStandings(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const snapshot = await this.getSnapshotFromPayload(payload);
    const selectedCategory = asString(payload.category_key).trim();
    if (!selectedCategory) {
      return { rows: [] };
    }

    const standings = computeStandings(snapshot.seasonState);
    const table = standings.category_tables.find((entry) => entry.category_key === selectedCategory);
    if (!table) {
      return { rows: [] };
    }
    const visible = applyExclusions(
      table,
      exclusionsForCategory(snapshot.seasonState, selectedCategory),
    );

    return {
      rows: visible.rows.map((row) => {
        const identity = this.standingsIdentity(row.team_id, snapshot.seasonState);
        return {
          platz: row.rank,
          display_name: identity.display_name,
          yob: identity.yob,
          club: identity.club,
          distanz_gesamt: km(row.total_distance_m),
          punkte_gesamt: row.total_points,
          entity_uid: identity.entity_uid,
          entity_kind: identity.entity_kind,
          ...(identity.team_members ? { team_members: identity.team_members } : {}),
        };
      }),
    };
  }

  private async getCategoryCurrentResultsTable(
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const snapshot = await this.getSnapshotFromPayload(payload);
    const selectedCategory = asString(payload.category_key).trim();
    if (!selectedCategory) {
      return { rows: [], meta: { race_headers: [] } };
    }

    const standings = computeStandings(snapshot.seasonState);
    const table = standings.category_tables.find((entry) => entry.category_key === selectedCategory);
    if (!table) {
      return { rows: [], meta: { race_headers: [] } };
    }

    const marked = markExclusions(
      table,
      exclusionsForCategory(snapshot.seasonState, selectedCategory),
    );
    const races = [...snapshot.seasonState.race_events.values()]
      .filter(
        (race) =>
          categoryKey(race.category) === selectedCategory &&
          isEffectiveRace(snapshot.seasonState, race.race_event_id),
      )
      .sort((a, b) => a.race_no - b.race_no || a.race_event_id.localeCompare(b.race_event_id));
    const headers = races.map((race) => String(race.race_no));

    return {
      rows: marked.rows.map((row) => {
        const identity = this.standingsIdentity(row.team_id, snapshot.seasonState);
        return {
          platz: row.rank,
          ausser_wertung: row.excluded,
          display_name: identity.display_name,
          entity_uid: identity.entity_uid,
          entity_kind: identity.entity_kind,
          distanz_gesamt: km(row.total_distance_m),
          punkte_gesamt: row.total_points,
          race_cells: races.map((race) => {
            const contribution = row.race_contributions.find(
              (candidate) => candidate.race_event_id === race.race_event_id,
            );
            return {
              race_no: race.race_no,
              distance_km: contribution ? km(contribution.distance_m) : null,
              points: contribution?.points ?? null,
            };
          }),
        };
      }),
      meta: {
        race_headers: headers,
      },
    };
  }

  private async setRankingEligibility(
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const snapshot = await this.getSnapshotFromPayload(payload);
    const categoryKeyValue = asString(payload.category_key).trim();
    const category = parseCategoryKeyValue(categoryKeyValue);
    if (!category) {
      throw new Error("Ungültige Kategorie.");
    }
    const entityUid = asString(payload.entity_uid).trim();
    const teamId = teamIdForEntityUid(snapshot.seasonState, entityUid);
    if (!teamId) {
      throw new Error(`Wertungseintrag ${entityUid} wurde nicht gefunden.`);
    }
    const ausserWertung = Boolean(payload.ausser_wertung);
    const event = eventEnvelope(snapshot.eventLog.length, "ranking.eligibility_set", {
      category,
      team_id: teamId,
      eligible: !ausserWertung,
    });
    const repo = await this.repository();
    await repo.appendEvents(snapshot.descriptor.season_id, [event]);
    return {
      category_key: categoryKeyValue,
      entity_uid: entityUid,
      ausser_wertung: ausserWertung,
    };
  }

  private async updateParticipantIdentity(
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const snapshot = await this.getSnapshotFromPayload(payload);
    const target = personIdForIdentityUpdate(snapshot.seasonState, payload);
    if (!target) {
      throw new Error("Zielperson für die Korrektur wurde nicht gefunden.");
    }

    const name = asString(payload.name).trim();
    const yob = asInteger(payload.yob);
    if (!name || yob == null) {
      throw new Error("Name und Jahrgang sind für die Korrektur erforderlich.");
    }
    const club = asOptionalString(payload.club);
    const parsed = parseNameForCorrection(name);
    const event = eventEnvelope(snapshot.eventLog.length, "person.corrected", {
      person_id: target.personId,
      updated_fields: {
        given_name: parsed.given_name,
        family_name: parsed.family_name,
        display_name: parsed.display_name,
        name_normalized: parsed.name_normalized,
        yob,
        club,
        club_normalized: normalizeClub(club),
      },
      rationale:
        target.teamContext == null
          ? "Korrektur über Legacy-Kompatibilitätsadapter"
          : `Korrektur für Paar-Mitglied ${target.member ?? "a"} über Legacy-Kompatibilitätsadapter`,
    });
    const repo = await this.repository();
    await repo.appendEvents(snapshot.descriptor.season_id, [event]);
    return {
      person_uid: target.personId,
      updated: true,
    };
  }

  private async mergeStandingsEntities(
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const snapshot = await this.getSnapshotFromPayload(payload);
    const category = parseCategoryKeyValue(asString(payload.category_key).trim());
    if (!category) {
      throw new Error("Ungültige Kategorie.");
    }
    const survivorUid = asString(payload.survivor_uid).trim();
    const absorbedUid = asString(payload.absorbed_uid).trim();
    const survivorTeamId = teamIdForEntityUid(snapshot.seasonState, survivorUid);
    const absorbedTeamId = teamIdForEntityUid(snapshot.seasonState, absorbedUid);
    if (!survivorTeamId || !absorbedTeamId) {
      throw new Error("Zusammenzuführende Wertungseinträge wurden nicht gefunden.");
    }
    if (survivorTeamId === absorbedTeamId) {
      throw new Error("Bitte zwei unterschiedliche Einträge auswählen.");
    }

    const events: DomainEvent[] = [];
    let seq = snapshot.eventLog.length;
    for (const race of snapshot.seasonState.race_events.values()) {
      if (!isEffectiveRace(snapshot.seasonState, race.race_event_id)) continue;
      if (categoryKey(race.category) !== categoryKey(category)) continue;
      const entry = race.entries.find((candidate) => candidate.team_id === absorbedTeamId);
      if (!entry) continue;
      const survivorAlreadyPresent = race.entries.some(
        (candidate) => candidate.team_id === survivorTeamId,
      );
      if (survivorAlreadyPresent) continue;
      events.push(
        eventEnvelope(seq++, "entry.reassigned", {
          entry_id: entry.entry_id,
          race_event_id: race.race_event_id,
          from_team_id: absorbedTeamId,
          to_team_id: survivorTeamId,
          rationale: "Legacy merge_standings_entities mapped to entry.reassigned",
        }),
      );
    }

    if (events.length === 0) {
      throw new Error("Für diese Kombination wurden keine zusammenführbaren Ergebnisse gefunden.");
    }

    const repo = await this.repository();
    await repo.appendEvents(snapshot.descriptor.season_id, events);
    return {
      survivor_uid: survivorUid,
      absorbed_uid: absorbedUid,
      reassigned_entry_count: events.length,
    };
  }

  private buildCorrectionTimelineItem(
    event: Extract<DomainEvent, { type: "person.corrected" }>,
    stateBefore: SeasonState,
    stateAfter: SeasonState,
  ): TimelineItem | null {
    const personId = event.payload.person_id;
    const before = stateBefore.persons.get(personId);
    const after = stateAfter.persons.get(personId);
    if (!before || !after) return null;

    const team = [...stateAfter.teams.values()].find((candidate) =>
      candidate.member_person_ids.includes(personId),
    );
    const teamMembers =
      team?.team_kind === "couple" ? teamMembersForPreview(team, stateAfter) : [];
    const member = teamMembers.find((candidate) => candidate.uid === personId)?.member ?? null;

    return {
      event_type: "matching_decision",
      kind: "identity_correction",
      timestamp: event.recorded_at,
      target_participant_uid: team?.team_kind === "solo" ? personId : undefined,
      target_team_uid: team?.team_kind === "couple" ? team.team_id : undefined,
      identity_timeline: {
        kind: "identity_correction",
        team_display_name:
          team?.team_kind === "couple"
            ? previewForTeam(team.team_id, stateAfter)?.display_name ?? team.team_id
            : undefined,
        member,
        before: {
          name: before.display_name,
          yob: before.yob,
          club: before.club,
        },
        after: {
          name: after.display_name,
          yob: after.yob,
          club: after.club,
        },
      },
    };
  }

  private buildReassignmentTimelineItem(
    event: Extract<DomainEvent, { type: "entry.reassigned" }>,
    stateBefore: SeasonState,
    stateAfter: SeasonState,
  ): TimelineItem {
    const raceBefore = stateBefore.race_events.get(event.payload.race_event_id);
    const survivor = previewForTeam(event.payload.to_team_id, stateAfter);
    const absorbed = previewForTeam(event.payload.from_team_id, stateBefore);
    return {
      event_type: "matching_decision",
      kind: "result_reassignment",
      timestamp: event.recorded_at,
      target_team_uid: event.payload.to_team_id,
      merged_absorbed_uid: event.payload.from_team_id,
      identity_timeline: {
        kind: "result_reassignment",
        category_key: raceBefore ? categoryKey(raceBefore.category) : "",
        survivor,
        absorbed,
        rationale: event.payload.rationale,
      },
    };
  }

  private async getYearTimeline(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const snapshot = await this.getSnapshotFromPayload(payload);
    const items: TimelineItem[] = [];
    let transient = projectState(snapshot.descriptor.season_id, []);

    for (const event of snapshot.eventLog) {
      switch (event.type) {
        case "race.registered": {
          const batch = transient.import_batches.get(event.payload.import_batch_id);
          items.push({
            event_type: "race_import",
            timestamp: event.recorded_at,
            race_event_uid: event.payload.race_event_id,
            category_key: categoryKey(event.payload.category),
            source_file: batch?.source_file ?? "",
            source_sha256: batch?.source_sha256 ?? "",
          });
          break;
        }
        case "person.corrected": {
          const nextState = projectState(snapshot.descriptor.season_id, [...snapshot.eventLog.filter((candidate) => candidate.seq <= event.seq)]);
          const correction = this.buildCorrectionTimelineItem(
            event,
            transient,
            nextState,
          );
          if (correction) {
            items.push(correction);
          }
          break;
        }
        case "entry.reassigned": {
          const nextState = projectState(snapshot.descriptor.season_id, [...snapshot.eventLog.filter((candidate) => candidate.seq <= event.seq)]);
          items.push(this.buildReassignmentTimelineItem(event, transient, nextState));
          break;
        }
        default:
          break;
      }
      transient = projectState(
        snapshot.descriptor.season_id,
        snapshot.eventLog.filter((candidate) => candidate.seq <= event.seq),
      );
    }

    const effectiveRaceIds = new Set(
      [...snapshot.seasonState.race_events.values()]
        .filter((race) => isEffectiveRace(snapshot.seasonState, race.race_event_id))
        .map((race) => race.race_event_id),
    );
    const filtered = items.filter((item) => {
      if (item.event_type !== "race_import") return true;
      return typeof item.race_event_uid === "string" && effectiveRaceIds.has(item.race_event_uid);
    });

    const limit = asInteger(payload.limit) ?? filtered.length;
    return {
      items: sortTimeline(filtered).slice(0, limit),
    };
  }

  private async rollbackSourceBatch(
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const snapshot = await this.getSnapshotFromPayload(payload);
    const sourceSha = asString(payload.source_sha256).trim();
    const anchorRaceId = asString(payload.race_event_uid).trim();
    const reason =
      asOptionalString(payload.reason) ?? "Legacy rollback_source_batch";

    let targetBatchId: string | null = null;
    if (anchorRaceId) {
      const race = snapshot.seasonState.race_events.get(anchorRaceId);
      if (race) {
        targetBatchId = race.import_batch_id;
      }
    }
    if (!targetBatchId && sourceSha) {
      targetBatchId =
        [...snapshot.seasonState.import_batches.values()]
          .find((batch) => batch.source_sha256 === sourceSha && batch.state === "active")
          ?.import_batch_id ?? null;
    }
    if (!targetBatchId) {
      throw new Error("Import-Batch für das Zurückrollen wurde nicht gefunden.");
    }

    const events: DomainEvent[] = [];
    let seq = snapshot.eventLog.length;
    const racesToRollback = [...snapshot.seasonState.race_events.values()].filter(
      (race) => race.import_batch_id === targetBatchId && race.state === "active",
    );
    for (const race of racesToRollback) {
      events.push(
        eventEnvelope(seq++, "race.rolled_back", {
          race_event_id: race.race_event_id,
          reason,
        }),
      );
    }
    events.push(
      eventEnvelope(seq++, "import_batch.rolled_back", {
        import_batch_id: targetBatchId,
        reason,
      }),
    );

    const repo = await this.repository();
    await repo.appendEvents(snapshot.descriptor.season_id, events);
    return {
      rolled_back_event_count: racesToRollback.length,
    };
  }

  private async pickFile(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const file = await promptForFile(asOptionalString(payload.kind));
    if (!file) {
      return {
        file_path: "",
      };
    }
    const token = crypto.randomUUID();
    this.selectedFiles.set(token, file);
    return {
      file_path: `legacy://file/${token}/${file.name}`,
    };
  }

  private pickSaveFile(payload: Record<string, unknown>): Record<string, unknown> {
    const suggestedName = asOptionalString(payload.suggested_name) ?? "export";
    const dialogKind = asOptionalString(payload.dialog_kind);
    const token = crypto.randomUUID();
    this.saveTargets.set(token, {
      token,
      suggestedName,
      dialogKind,
    });
    return {
      file_path: `legacy://save/${token}/${suggestedName}`,
    };
  }

  private resolvePickedFile(filePath: string): File {
    const match = filePath.match(/^legacy:\/\/file\/([^/]+)\//);
    const token = match?.[1];
    if (!token) {
      throw new Error("Ungültiger Dateiverweis.");
    }
    const file = this.selectedFiles.get(token);
    if (!file) {
      throw new Error("Die ausgewählte Datei steht nicht mehr zur Verfügung.");
    }
    return file;
  }

  private resolveSaveTarget(filePath: string): SaveRegistryEntry | null {
    const match = filePath.match(/^legacy:\/\/save\/([^/]+)\//);
    const token = match?.[1];
    if (!token) {
      return null;
    }
    return this.saveTargets.get(token) ?? null;
  }

  seedSelectedFileForTests(file: File): string {
    const token = crypto.randomUUID();
    this.selectedFiles.set(token, file);
    return `legacy://file/${token}/${file.name}`;
  }

  private async exportSeriesYear(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const requestedYear = asInteger(payload.series_year);
    if (requestedYear == null) {
      throw new Error("Bitte eine gültige Saison wählen.");
    }

    const seasonId = await this.resolveSeasonId(requestedYear);
    const destinationPath = asString(payload.destination_path).trim();
    const saveTarget = this.resolveSaveTarget(destinationPath);
    const repo = await this.repository();
    const exported = await exportSeasonArchive(repo, seasonId, {
      filename: saveTarget?.suggestedName,
    });

    return {
      series_year: requestedYear,
      season_id: exported.season_id,
      display_name: exported.label,
      export_file: saveTarget?.suggestedName ?? exported.filename,
      bytes_written: exported.bytes_written,
      events_total: exported.events_total,
      sha256_eventlog: exported.sha256_eventlog,
    };
  }

  private async importSeriesYear(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const file = this.resolvePickedFile(asString(payload.file_path).trim());
    const repo = await this.repository();
    const seasons = await repo.listSeasons();
    const aliases = this.ensureAliases(seasons);
    const targetYear = asInteger(payload.target_series_year);
    const replaceExisting = Boolean(payload.replace_existing);
    const options: ImportSeasonOptions = {};
    const displayName = asOptionalString(payload.display_name);
    if (displayName) {
      options.targetLabel = displayName;
    }

    if (targetYear != null) {
      const existingSeasonId =
        Object.entries(aliases).find(([, year]) => year === targetYear)?.[0] ?? null;
      if (existingSeasonId) {
        if (!replaceExisting) {
          throw new Error(
            `Season alias "${targetYear}" already exists. Use replace_existing=true to overwrite.`,
          );
        }
        const confirmYear = asInteger(payload.confirm_replace_series_year);
        if (confirmYear !== targetYear) {
          throw new Error("Saison-Ersetzung nicht bestätigt.");
        }
        options.targetSeasonId = existingSeasonId;
        options.replaceExisting = true;
        options.confirmSeasonId = existingSeasonId;
      } else {
        if (replaceExisting) {
          throw new Error(`Saison ${targetYear} wurde nicht gefunden.`);
        }
        options.targetSeasonId = crypto.randomUUID();
      }
    }

    const imported = await importSeasonArchive(repo, file, options);
    const seasonsAfter = await repo.listSeasons();
    const nextAliases = this.ensureAliases(seasonsAfter);
    if (targetYear != null) {
      nextAliases[imported.season_id] = targetYear;
      this.saveAliases(nextAliases);
    }

    return {
      series_year: nextAliases[imported.season_id] ?? targetYear,
      season_id: imported.season_id,
      display_name: imported.label,
      replaced_existing: imported.replaced_existing,
      events_total: imported.events_imported,
      source_file: file.name,
    };
  }

  private async importRace(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const snapshot = await this.getSnapshotFromPayload(payload);
    if (this.pendingImport && this.pendingImport.session.phase !== "done") {
      throw new Error("Es gibt noch offene Prüfungen aus einem vorherigen Import.");
    }

    const file = this.resolvePickedFile(asString(payload.file_path).trim());
    const sourceType = asString(payload.source_type) === "couples" ? "couples" : "singles";
    const raceNo = asInteger(payload.race_no);

    let session = await startImport(file, snapshot.seasonState, {
      sourceType,
      raceNoOverride: raceNo ?? undefined,
    });
    session = await runMatching(session, this.matchingConfig);

    const repo = await this.repository();
    if (session.phase === "committing") {
      const events = finalizeImport(session, { startSeq: snapshot.eventLog.length });
      await repo.appendEvents(snapshot.descriptor.season_id, events);
      this.pendingImport = null;
      return {
        review_queue_count: 0,
        imported: true,
      };
    }

    this.pendingImport = {
      seasonId: snapshot.descriptor.season_id,
      session,
    };
    return {
      review_queue_count: getReviewQueue(session).length,
      imported: true,
    };
  }

  private reviewCandidatePayloads(
    review: OrchestratedReviewEntry,
    state: SeasonState,
    incomingTeamYobText: string | null,
  ): {
    candidate_uids: string[];
    top_candidate_uid: string | null;
    candidate_confidences: number[];
    candidate_previews: LegacyEntityPreview[];
    candidate_review_displays: Array<Record<string, unknown> | null>;
  } {
    const candidateUids: string[] = [];
    const candidateConfidences: number[] = [];
    const candidatePreviews: LegacyEntityPreview[] = [];
    const candidateDisplays: Array<Record<string, unknown> | null> = [];

    const incomingPreview: LegacyEntityPreview = {
      uid: review.entry_id,
      kind: review.review_item.incoming_kind === "team" ? "team" : "participant",
      display_name: review.review_item.incoming_display_name,
      yob:
        review.review_item.incoming_kind === "team"
          ? incomingTeamYobText
          : review.review_item.incoming_yob,
      club: review.review_item.incoming_club,
    };

    let mappedTopCandidateUid: string | null = null;
    for (const candidate of review.review_item.candidates) {
      const teamPreview = previewForTeam(candidate.team_id, state);
      if (!teamPreview) continue;

      let publicUid = teamPreview.uid;
      if (teamPreview.kind === "participant") {
        publicUid = teamPreview.uid;
      }
      candidateUids.push(publicUid);
      candidateConfidences.push(candidate.score);
      candidatePreviews.push({
        ...teamPreview,
        uid: publicUid,
      });

      const team = state.teams.get(candidate.team_id);
      const candidatePeople =
        team?.member_person_ids
          .map((personId) => state.persons.get(personId))
          .filter((person): person is PersonIdentity => person != null) ?? [];
      candidateDisplays.push(
        reviewDisplayForCandidate(incomingPreview, teamPreview, candidatePeople),
      );

      if (review.review_item.candidates[0]?.team_id === candidate.team_id) {
        mappedTopCandidateUid = publicUid;
      }
    }

    return {
      candidate_uids: candidateUids,
      top_candidate_uid: mappedTopCandidateUid,
      candidate_confidences: candidateConfidences,
      candidate_previews: candidatePreviews,
      candidate_review_displays: candidateDisplays,
    };
  }

  private async reviewQueuePayload(): Promise<Record<string, unknown>> {
    if (!this.pendingImport) {
      return { items: [] };
    }
    const snapshot = await this.getSnapshotBySeasonId(this.pendingImport.seasonId);
    const pending = getReviewQueue(this.pendingImport.session);
    const items = pending.map((review) => {
      const section = this.pendingImport?.session.section_results[review.section_index];
      const staged = section?.staged_entries[review.entry_index];
      const incomingPreview: LegacyEntityPreview = {
        uid: review.entry_id,
        kind: review.review_item.incoming_kind === "team" ? "team" : "participant",
        display_name: review.review_item.incoming_display_name,
        yob:
          review.review_item.incoming_kind === "team"
            ? staged?.incoming.yob_text ?? null
            : review.review_item.incoming_yob,
        club: review.review_item.incoming_club,
      };
      const candidates = this.reviewCandidatePayloads(
        review,
        snapshot.seasonState,
        staged?.incoming.yob_text ?? null,
      );
      return {
        race_event_uid: `pending:${this.pendingImport?.session.session_id}:${review.section_index}`,
        entry_uid: review.entry_id,
        confidence: review.review_item.confidence,
        startnr: staged?.startnr ?? "",
        entry_preview: incomingPreview,
        result_preview: {
          distance_km: staged ? km(staged.distance_m) : null,
          points: staged?.points ?? null,
        },
        ...candidates,
      };
    });
    return { items };
  }

  private async applyMatchDecision(
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.pendingImport) {
      throw new Error("Es gibt keine offenen Prüfungen.");
    }

    const entryUid = asString(payload.entry_uid).trim();
    if (!entryUid) {
      throw new Error("Review-Eintrag fehlt.");
    }

    let action: ReviewAction;
    if (asString(payload.decision_action).trim() === "create_new_identity") {
      action = { type: "create_new_identity" };
    } else {
      const snapshot = await this.getSnapshotBySeasonId(this.pendingImport.seasonId);
      const targetParticipantUid = asOptionalString(payload.target_participant_uid);
      const targetTeamUid = asOptionalString(payload.target_team_uid);
      const teamId = targetTeamUid ?? (targetParticipantUid ? teamIdForEntityUid(snapshot.seasonState, targetParticipantUid) : null);
      if (!teamId) {
        throw new Error("Zielkandidat für die Prüfung wurde nicht gefunden.");
      }
      action = { type: "link_existing", team_id: teamId };
    }

    const session = resolveReviewEntry(this.pendingImport.session, entryUid, action);
    const repo = await this.repository();
    if (session.phase === "committing") {
      const snapshot = await this.getSnapshotBySeasonId(this.pendingImport.seasonId);
      const events = finalizeImport(session, { startSeq: snapshot.eventLog.length });
      await repo.appendEvents(this.pendingImport.seasonId, events);
      this.pendingImport = null;
      return {
        review_queue_count: 0,
        committed: true,
      };
    }

    this.pendingImport = {
      ...this.pendingImport,
      session,
    };
    return {
      review_queue_count: getReviewQueue(session).length,
      committed: false,
    };
  }

  private mapError(requestId: string, error: unknown): LegacyApiErrorResponse {
    if (error instanceof EventAppendValidationError) {
      return errorResponse(
        requestId,
        "VALIDATION_ERROR",
        error.reasons.join("; "),
        {
          season_id: error.season_id,
          event_type: error.event_type,
          batch_index: error.batch_index,
          reasons: error.reasons,
        },
      );
    }
    if (error instanceof Error) {
      const duplicateImport =
        error.message.includes("bereits importiert") ||
        error.message.toLowerCase().includes("duplicate");
      return errorResponse(
        requestId,
        duplicateImport ? "IMPORT_DUPLICATE" : "VALIDATION_ERROR",
        error.message,
      );
    }
    return errorResponse(
      requestId,
      "INTERNAL_ERROR",
      "Unbekannter Legacy-Adapter-Fehler.",
    );
  }
}

export const legacyApiRuntime = new LegacyApiRuntime();
