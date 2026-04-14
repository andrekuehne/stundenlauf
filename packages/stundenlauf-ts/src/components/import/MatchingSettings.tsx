/**
 * Collapsible matching settings panel: strict/fuzzy/manual mode tabs, threshold sliders.
 */

import { STR } from "@/strings.ts";

type MatchingMode = "strict" | "fuzzy_automatik" | "manuell";

interface MatchingSettingsProps {
  disabled: boolean;
  mode: MatchingMode;
  autoThreshold: number;
  reviewThreshold: number;
  effectiveAutoThreshold: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onModeChange: (mode: MatchingMode) => void;
  onAutoThresholdChange: (value: number) => void;
  onReviewThresholdChange: (value: number) => void;
}

function thresholdLabel(value: number): string {
  return value.toFixed(2);
}

export function MatchingSettings({
  disabled,
  mode,
  autoThreshold,
  reviewThreshold,
  effectiveAutoThreshold,
  expanded,
  onExpandedChange,
  onModeChange,
  onAutoThresholdChange,
  onReviewThresholdChange,
}: MatchingSettingsProps) {
  const isFuzzy = mode === "fuzzy_automatik";

  const hint =
    mode === "strict"
      ? STR.views.import.matchingHintStrict
      : mode === "manuell"
        ? STR.views.import.matchingHintManual
        : STR.views.import.matchingHintFuzzyThreshold;

  return (
    <section className="foundation-view">
      <button
        type="button"
        className="button button--ghost"
        aria-expanded={expanded}
        disabled={disabled}
        onClick={() => {
          onExpandedChange(!expanded);
        }}
      >
        {STR.views.import.matchingSettings}
      </button>

      {expanded ? (
        <div className="import-settings">
          <div className="import-settings__modes">
            <button
              type="button"
              className={`button ${mode === "strict" ? "button--primary" : ""}`}
              disabled={disabled}
              onClick={() => {
                onModeChange("strict");
              }}
            >
              {STR.views.import.matchingModeStrict}
            </button>
            <button
              type="button"
              className={`button ${mode === "fuzzy_automatik" ? "button--primary" : ""}`}
              disabled={disabled}
              onClick={() => {
                onModeChange("fuzzy_automatik");
              }}
            >
              {STR.views.import.matchingModeFuzzy}
            </button>
            <button
              type="button"
              className={`button ${mode === "manuell" ? "button--primary" : ""}`}
              disabled={disabled}
              onClick={() => {
                onModeChange("manuell");
              }}
            >
              {STR.views.import.matchingModeManual}
            </button>
          </div>

          <label className="import-controls__label">
            {STR.views.import.matchingThresholdLabel} ({thresholdLabel(autoThreshold)})
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.01}
              disabled={disabled || !isFuzzy}
              value={autoThreshold}
              onChange={(event) => {
                onAutoThresholdChange(Number(event.target.value));
              }}
            />
          </label>

          <label className="import-controls__label">
            {STR.views.import.matchingReviewThresholdLabel} ({thresholdLabel(reviewThreshold)})
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.01}
              disabled={disabled}
              value={reviewThreshold}
              onChange={(event) => {
                onReviewThresholdChange(Number(event.target.value));
              }}
            />
          </label>

          <p className="foundation-view__meta">
            {STR.views.import.effectiveAutoThresholdLabel}:{" "}
            <strong>{thresholdLabel(effectiveAutoThreshold)}</strong>
          </p>
          <p className="foundation-view__meta">{hint}</p>
        </div>
      ) : null}
    </section>
  );
}
