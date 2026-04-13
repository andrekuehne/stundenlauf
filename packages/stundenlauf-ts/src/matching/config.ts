/**
 * Matching configuration: tunable weights and thresholds.
 *
 * Reference: F-TS03 §13 (Matching Config Defaults)
 */

export interface MatchingConfig {
  auto_merge_enabled: boolean;
  perfect_match_auto_merge: boolean;
  strict_normalized_auto_only: boolean;

  auto_min: number;
  review_min: number;

  yob_match_bonus: number;
  yob_mismatch_penalty: number;
  club_weight: number;
  swapped_boost: number;
  title_exact_bonus: number;
  max_candidates_per_row: number;
  member_mismatch_floor: number;
  pair_unsafe_cap: number;
}

export function defaultMatchingConfig(
  overrides?: Partial<MatchingConfig>,
): MatchingConfig {
  return {
    auto_merge_enabled: false,
    perfect_match_auto_merge: false,
    strict_normalized_auto_only: false,

    auto_min: 0.88,
    review_min: 0.72,

    yob_match_bonus: 0.1,
    yob_mismatch_penalty: 0.45,
    club_weight: 0.08,
    swapped_boost: 0.04,
    title_exact_bonus: 0.02,
    max_candidates_per_row: 48,
    member_mismatch_floor: 0.52,
    pair_unsafe_cap: 0.78,
    ...overrides,
  };
}

/**
 * Compute the effective auto_min from the GUI mode fields.
 * See F-TS03 §8 mode -> config mapping.
 */
export function effectiveAutoMin(config: MatchingConfig): number {
  if (config.auto_merge_enabled) return config.auto_min;
  if (config.perfect_match_auto_merge) return 1.0;
  return 1.01;
}
