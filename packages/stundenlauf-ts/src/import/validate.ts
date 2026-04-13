/**
 * Pre-import validation: duplicate import, category/race-no conflict,
 * and intra-file duplicate row detection.
 *
 * Reference: F-TS05 §2 (Validate Phase)
 */

import { categoryKey, isEffectiveRace } from "@/domain/projection.ts";
import type { SeasonState } from "@/domain/types.ts";
import type { ParsedWorkbook } from "@/ingestion/types.ts";
import type { ValidationResult } from "./types.ts";

export function validateDuplicateImport(
  sha256: string,
  state: SeasonState,
): ValidationResult {
  for (const batch of state.import_batches.values()) {
    if (batch.source_sha256 === sha256 && batch.state === "active") {
      return {
        valid: false,
        code: "duplicate_import",
        message: `Diese Datei wurde bereits importiert (Batch ${batch.import_batch_id}).`,
      };
    }
  }
  return { valid: true };
}

export function validateCategoryRaceNoConflicts(
  parsed: ParsedWorkbook,
  state: SeasonState,
): ValidationResult {
  const allSections = [
    ...parsed.singles_sections.map((s) => s.context),
    ...parsed.couples_sections.map((s) => s.context),
  ];

  for (const ctx of allSections) {
    const key = categoryKey({ duration: ctx.duration, division: ctx.division });
    for (const [raceEventId, race] of state.race_events) {
      if (!isEffectiveRace(state, raceEventId)) continue;
      const raceKey = categoryKey(race.category);
      if (raceKey === key && race.race_no === ctx.race_no) {
        return {
          valid: false,
          code: "category_race_no_conflict",
          message:
            `Kategorie ${key} Lauf ${ctx.race_no} existiert bereits ` +
            `(Rennen ${raceEventId}).`,
        };
      }
    }
  }
  return { valid: true };
}

export function validateNoDuplicateRows(parsed: ParsedWorkbook): ValidationResult {
  for (const section of parsed.singles_sections) {
    const seen = new Set<string>();
    for (const row of section.rows) {
      const key = [
        row.name.trim().toLowerCase(),
        String(row.yob),
        (row.club ?? "").trim().toLowerCase(),
        row.startnr.trim(),
      ].join("|");
      if (seen.has(key)) {
        return {
          valid: false,
          code: "duplicate_row",
          message:
            "Doppelte Teilnehmerzeile im selben Lauf " +
            `(Name/Jahrgang/Verein/Startnr): ${row.name}`,
        };
      }
      seen.add(key);
    }
  }

  for (const section of parsed.couples_sections) {
    const seen = new Set<string>();
    for (const row of section.rows) {
      const key = [
        row.name_a.trim().toLowerCase(),
        String(row.yob_a),
        (row.club_a ?? "").trim().toLowerCase(),
        row.name_b.trim().toLowerCase(),
        String(row.yob_b),
        (row.club_b ?? "").trim().toLowerCase(),
        row.startnr.trim(),
      ].join("|");
      if (seen.has(key)) {
        return {
          valid: false,
          code: "duplicate_row",
          message:
            "Doppelte Paarzeile im selben Lauf " +
            `(Namen/Jahrgänge/Vereine/Startnr): ${row.name_a} / ${row.name_b}`,
        };
      }
      seen.add(key);
    }
  }

  return { valid: true };
}

export function validateImport(
  parsed: ParsedWorkbook,
  state: SeasonState,
): ValidationResult {
  const dupCheck = validateDuplicateImport(parsed.meta.source_sha256, state);
  if (!dupCheck.valid) return dupCheck;

  const conflictCheck = validateCategoryRaceNoConflicts(parsed, state);
  if (!conflictCheck.valid) return conflictCheck;

  return validateNoDuplicateRows(parsed);
}
