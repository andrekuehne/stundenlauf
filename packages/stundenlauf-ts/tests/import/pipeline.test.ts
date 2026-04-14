/**
 * Integration tests for the full import orchestration pipeline:
 * createSession → runMatching → (review) → finalizeImport.
 *
 * Uses the real matching engine — no mocking.
 */

import { describe, expect, it } from "vitest";
import { emptySeasonState, projectState } from "@/domain/projection.ts";
import type { DomainEvent } from "@/domain/events.ts";
import { defaultMatchingConfig } from "@/matching/config.ts";
import type { ParsedWorkbook } from "@/ingestion/types.ts";
import { createSession } from "@/import/session.ts";
import { runMatching } from "@/import/run-matching.ts";
import { finalizeImport } from "@/import/finalize.ts";
import { getReviewQueue, resolveReviewEntry } from "@/import/review.ts";
import { canStartImport } from "@/import/session.ts";
import { validateImport } from "@/import/validate.ts";
import {
  importBatchRecorded,
  importBatchRolledBack,
  personRegistered,
  teamRegistered,
  raceRegistered,
  resetSeqCounter,
  defaultEntry,
} from "../helpers/event-factories.ts";

function makeWorkbook(overrides?: Partial<ParsedWorkbook>): ParsedWorkbook {
  return {
    meta: {
      source_file: "test.xlsx",
      source_sha256: `sha-${crypto.randomUUID().slice(0, 8)}`,
      parser_version: "f-ts02-v1",
      schema_fingerprint: "fp",
      file_mtime: 0,
      imported_at: new Date().toISOString(),
    },
    singles_sections: [],
    couples_sections: [],
    ...overrides,
  };
}

const AUTO_CONFIG = defaultMatchingConfig({
  auto_merge_enabled: true,
  auto_min: 0.5,
  review_min: 0.3,
});

describe("all-auto import into empty season", () => {
  it("produces correct event batch for two singles rows", async () => {
    const state = emptySeasonState("s1");
    const parsed = makeWorkbook({
      singles_sections: [
        {
          context: {
            race_no: 1,
            duration: "hour",
            division: "men",
            event_date: "2025-06-01",
          },
          rows: [
            { startnr: "1", name: "Müller, Max", yob: 1990, club: "LG A", distance_km: 12.5, points: 10 },
            { startnr: "2", name: "Schmidt, Hans", yob: 1985, club: "LG B", distance_km: 10.0, points: 8 },
          ],
        },
      ],
    });

    const session = createSession(parsed, state);
    expect(session.phase).toBe("matching");

    const matched = await runMatching(session, AUTO_CONFIG);
    expect(matched.phase).toBe("committing");
    expect(matched.review_queue).toHaveLength(0);
    expect(matched.section_results).toHaveLength(1);

    const section = matched.section_results[0]!;
    expect(section.staged_entries).toHaveLength(2);
    expect(section.all_resolved).toBe(true);

    for (const entry of section.staged_entries) {
      expect(entry.team_id).not.toBeNull();
      expect(entry.resolution).not.toBeNull();
      expect(entry.resolution!.method).toBe("new_identity");
    }

    const events = finalizeImport(matched, { startSeq: 0 });

    const types = events.map((e) => e.type);
    expect(types[0]).toBe("import_batch.recorded");

    const personEvents = events.filter((e) => e.type === "person.registered");
    const teamEvents = events.filter((e) => e.type === "team.registered");
    const raceEvents = events.filter((e) => e.type === "race.registered");

    expect(personEvents).toHaveLength(2);
    expect(teamEvents).toHaveLength(2);
    expect(raceEvents).toHaveLength(1);

    const racePayload = raceEvents[0]!.payload as {
      entries: { distance_m: number; team_id: string }[];
    };
    expect(racePayload.entries).toHaveLength(2);
    expect(racePayload.entries[0]!.distance_m).toBe(12500);
    expect(racePayload.entries[1]!.distance_m).toBe(10000);

    for (let i = 0; i < events.length; i++) {
      expect(events[i]!.seq).toBe(i);
    }
  });

  it("report counts are correct", async () => {
    const state = emptySeasonState("s1");
    const parsed = makeWorkbook({
      singles_sections: [
        {
          context: { race_no: 1, duration: "hour", division: "men", event_date: null },
          rows: [
            { startnr: "1", name: "A, B", yob: 1990, club: null, distance_km: 10, points: 8 },
          ],
        },
      ],
    });

    const session = createSession(parsed, state);
    const matched = await runMatching(session, AUTO_CONFIG);

    expect(matched.report.new_identities).toBe(1);
    expect(matched.report.rows_imported).toBe(1);
    expect(matched.report.sections_imported).toBe(1);
  });
});

describe("couples import into empty season", () => {
  it("creates two persons and one couple team per row", async () => {
    const state = emptySeasonState("s1");
    const parsed = makeWorkbook({
      couples_sections: [
        {
          context: {
            race_no: 1,
            duration: "hour",
            division: "couples_mixed",
            event_date: "2025-06-01",
          },
          rows: [
            {
              startnr: "1",
              name_a: "Müller, Max",
              yob_a: 1990,
              club_a: "LG A",
              name_b: "Müller, Anna",
              yob_b: 1992,
              club_b: "LG A",
              distance_km: 15,
              points: 12,
            },
          ],
        },
      ],
    });

    const session = createSession(parsed, state);
    const matched = await runMatching(session, AUTO_CONFIG);

    expect(matched.phase).toBe("committing");
    expect(matched.accumulated_person_payloads).toHaveLength(2);
    expect(matched.accumulated_team_payloads).toHaveLength(1);
    expect(matched.accumulated_team_payloads[0]!.team_kind).toBe("couple");

    const events = finalizeImport(matched, { startSeq: 0 });
    const personEvents = events.filter((e) => e.type === "person.registered");
    const teamEvents = events.filter((e) => e.type === "team.registered");
    const raceEvents = events.filter((e) => e.type === "race.registered");

    expect(personEvents).toHaveLength(2);
    expect(teamEvents).toHaveLength(1);
    expect(raceEvents).toHaveLength(1);

    const racePayload = raceEvents[0]!.payload as {
      entries: { distance_m: number; incoming: { row_kind: string } }[];
    };
    expect(racePayload.entries[0]!.distance_m).toBe(15000);
    expect(racePayload.entries[0]!.incoming.row_kind).toBe("team");
  });
});

describe("import with review", () => {
  it("routes review entries and resolves them via link_existing", async () => {
    resetSeqCounter();
    const batchId = "batch-existing";
    const personId = "person-existing";
    const teamId = "team-existing";

    const existingEvents: DomainEvent[] = [
      importBatchRecorded({ import_batch_id: batchId, source_sha256: "sha-old" }),
      personRegistered({
        person_id: personId,
        given_name: "Max",
        family_name: "Müller",
        yob: 1990,
        gender: "M",
        club: "LG A",
        club_normalized: "lg a",
      }),
      teamRegistered({
        team_id: teamId,
        member_person_ids: [personId],
        team_kind: "solo",
      }),
      raceRegistered({
        import_batch_id: batchId,
        category: { duration: "hour", division: "men" },
        race_no: 1,
        entries: [
          defaultEntry({
            team_id: teamId,
            incoming: {
              display_name: "Müller, Max",
              yob: 1990,
              yob_text: null,
              club: "LG A",
              row_kind: "solo",
              sheet_name: "old.xlsx",
              section_name: "Herren 60min",
              row_index: 0,
            },
          }),
        ],
      }),
    ];

    const state = projectState("s1", existingEvents);

    const parsed = makeWorkbook({
      singles_sections: [
        {
          context: { race_no: 2, duration: "hour", division: "men", event_date: null },
          rows: [
            { startnr: "1", name: "Müller, Max", yob: 1990, club: "LG A", distance_km: 13, points: 11 },
          ],
        },
      ],
    });

    const conservativeConfig = defaultMatchingConfig({
      auto_merge_enabled: false,
      perfect_match_auto_merge: false,
    });

    const session = createSession(parsed, state);
    const matched = await runMatching(session, conservativeConfig);

    if (matched.phase === "reviewing") {
      const queue = getReviewQueue(matched);
      expect(queue.length).toBeGreaterThan(0);
      expect(queue[0]!.review_item.candidates[0]!.team_id).toBe(teamId);
      expect(queue[0]!.review_item.candidates[0]!.team_id).not.toBe(personId);

      let resolved = matched;
      for (const entry of queue) {
        const topCandidate = entry.review_item.candidates[0];
        if (topCandidate) {
          resolved = resolveReviewEntry(resolved, entry.entry_id, {
            type: "link_existing",
            team_id: topCandidate.team_id,
          });
        } else {
          resolved = resolveReviewEntry(resolved, entry.entry_id, {
            type: "create_new_identity",
          });
        }
      }

      expect(resolved.phase).toBe("committing");
      const events = finalizeImport(resolved, { startSeq: existingEvents.length });

      expect(events[0]!.type).toBe("import_batch.recorded");
      const raceEvents = events.filter((e) => e.type === "race.registered");
      expect(raceEvents).toHaveLength(1);

      for (let i = 0; i < events.length; i++) {
        expect(events[i]!.seq).toBe(existingEvents.length + i);
      }
    } else {
      expect(matched.phase).toBe("committing");
      const events = finalizeImport(matched, { startSeq: existingEvents.length });
      expect(events.length).toBeGreaterThan(0);
    }
  });
});

describe("import with review — create_new_identity", () => {
  it("creates new identity for review entry when no candidate is selected", async () => {
    resetSeqCounter();
    const batchId = "batch-existing";
    const personId = "person-existing";
    const teamId = "team-existing";

    const existingEvents: DomainEvent[] = [
      importBatchRecorded({ import_batch_id: batchId, source_sha256: "sha-old" }),
      personRegistered({
        person_id: personId,
        given_name: "Max",
        family_name: "Müller",
        yob: 1990,
        gender: "M",
        club: "LG A",
        club_normalized: "lg a",
      }),
      teamRegistered({
        team_id: teamId,
        member_person_ids: [personId],
        team_kind: "solo",
      }),
      raceRegistered({
        import_batch_id: batchId,
        category: { duration: "hour", division: "men" },
        race_no: 1,
        entries: [
          defaultEntry({
            team_id: teamId,
            incoming: {
              display_name: "Müller, Max",
              yob: 1990,
              yob_text: null,
              club: "LG A",
              row_kind: "solo",
              sheet_name: "old.xlsx",
              section_name: "Herren 60min",
              row_index: 0,
            },
          }),
        ],
      }),
    ];

    const state = projectState("s1", existingEvents);

    const parsed = makeWorkbook({
      singles_sections: [
        {
          context: { race_no: 2, duration: "hour", division: "men", event_date: null },
          rows: [
            { startnr: "1", name: "Müller, Maximilian", yob: 1990, club: "LG A", distance_km: 13, points: 11 },
          ],
        },
      ],
    });

    const conservativeConfig = defaultMatchingConfig({
      auto_merge_enabled: false,
      perfect_match_auto_merge: false,
    });

    const session = createSession(parsed, state);
    const matched = await runMatching(session, conservativeConfig);

    if (matched.phase === "reviewing") {
      const queue = getReviewQueue(matched);
      expect(queue.length).toBeGreaterThan(0);

      let resolved = matched;
      for (const entry of queue) {
        resolved = resolveReviewEntry(resolved, entry.entry_id, {
          type: "create_new_identity",
        });
      }

      expect(resolved.phase).toBe("committing");
      expect(resolved.accumulated_person_payloads.length).toBeGreaterThan(0);
      expect(resolved.accumulated_team_payloads.length).toBeGreaterThan(0);

      const events = finalizeImport(resolved, { startSeq: existingEvents.length });
      const personEvents = events.filter((e) => e.type === "person.registered");
      expect(personEvents.length).toBeGreaterThan(0);
    }
  });
});

describe("multi-section progressive enrichment", () => {
  it("second section sees identities from first section", async () => {
    const state = emptySeasonState("s1");
    const parsed = makeWorkbook({
      singles_sections: [
        {
          context: { race_no: 1, duration: "hour", division: "men", event_date: null },
          rows: [
            { startnr: "1", name: "Müller, Max", yob: 1990, club: "LG A", distance_km: 10, points: 8 },
          ],
        },
        {
          context: { race_no: 1, duration: "half_hour", division: "men", event_date: null },
          rows: [
            { startnr: "1", name: "Müller, Max", yob: 1990, club: "LG A", distance_km: 5, points: 4 },
          ],
        },
      ],
    });

    const session = createSession(parsed, state);
    const matched = await runMatching(session, AUTO_CONFIG);

    expect(matched.section_results).toHaveLength(2);
    expect(matched.phase).toBe("committing");

    const events = finalizeImport(matched, { startSeq: 0 });
    const personEvents = events.filter((e) => e.type === "person.registered");
    const teamEvents = events.filter((e) => e.type === "team.registered");
    const raceEvents = events.filter((e) => e.type === "race.registered");

    expect(personEvents).toHaveLength(1);
    expect(teamEvents).toHaveLength(1);
    expect(raceEvents).toHaveLength(2);

    const race1 = raceEvents[0]!.payload as { entries: { team_id: string }[] };
    const race2 = raceEvents[1]!.payload as { entries: { team_id: string }[] };
    expect(race1.entries[0]!.team_id).toBe(race2.entries[0]!.team_id);
  });
});

describe("re-import after rollback", () => {
  it("allows re-import of same file after batch rollback", () => {
    resetSeqCounter();
    const batchId = "batch-rb";
    const sha = "sha-reimport";
    const events: DomainEvent[] = [
      importBatchRecorded({ import_batch_id: batchId, source_sha256: sha }),
      importBatchRolledBack({ import_batch_id: batchId }),
    ];
    const state = projectState("s1", events);

    const parsed = makeWorkbook({
      meta: {
        source_file: "test.xlsx",
        source_sha256: sha,
        parser_version: "v1",
        schema_fingerprint: "fp",
        file_mtime: 0,
        imported_at: new Date().toISOString(),
      },
    });

    const result = validateImport(parsed, state);
    expect(result.valid).toBe(true);
  });
});

describe("eligibility clearing", () => {
  it("clears existing exclusions in the event batch", async () => {
    const state = emptySeasonState("s1");
    state.exclusions.set("hour:men", new Set(["team-excluded"]));

    const parsed = makeWorkbook({
      singles_sections: [
        {
          context: { race_no: 1, duration: "hour", division: "men", event_date: null },
          rows: [
            { startnr: "1", name: "A, B", yob: 1990, club: null, distance_km: 10, points: 8 },
          ],
        },
      ],
    });

    const session = createSession(parsed, state);
    const matched = await runMatching(session, AUTO_CONFIG);
    const events = finalizeImport(matched, { startSeq: 0 });

    const eligEvents = events.filter((e) => e.type === "ranking.eligibility_set");
    expect(eligEvents).toHaveLength(1);

    const payload = eligEvents[0]!.payload as {
      category: { duration: string; division: string };
      team_id: string;
      eligible: boolean;
    };
    expect(payload.eligible).toBe(true);
    expect(payload.team_id).toBe("team-excluded");
    expect(payload.category.duration).toBe("hour");
    expect(payload.category.division).toBe("men");
  });
});

describe("canStartImport", () => {
  it("returns true for null session", () => {
    expect(canStartImport(null)).toBe(true);
  });

  it("returns true for done session", () => {
    const state = emptySeasonState("s1");
    const parsed = makeWorkbook();
    const session = createSession(parsed, state);
    const done = { ...session, phase: "done" as const };
    expect(canStartImport(done)).toBe(true);
  });

  it("returns true for failed session", () => {
    const state = emptySeasonState("s1");
    const parsed = makeWorkbook();
    const session = createSession(parsed, state);
    const failed = { ...session, phase: "failed" as const };
    expect(canStartImport(failed)).toBe(true);
  });

  it("returns false for active session", () => {
    const state = emptySeasonState("s1");
    const parsed = makeWorkbook();
    const session = createSession(parsed, state);
    expect(canStartImport(session)).toBe(false);
  });
});
