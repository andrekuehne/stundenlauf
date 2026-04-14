/**
 * Import controls: file input, type toggle, race-number select, import button.
 */

import { STR } from "@/strings.ts";

interface ImportControlsProps {
  disabled: boolean;
  fileName: string;
  sourceType: "singles" | "couples";
  raceNo: number | null;
  inferredHint: string;
  onPickFile: (file: File | null) => void;
  onSourceTypeChange: (sourceType: "singles" | "couples") => void;
  onRaceNoChange: (raceNo: number | null) => void;
  onImport: () => void;
}

const RACE_OPTIONS = Array.from({ length: 12 }, (_, idx) => idx + 1);

export function ImportControls({
  disabled,
  fileName,
  sourceType,
  raceNo,
  inferredHint,
  onPickFile,
  onSourceTypeChange,
  onRaceNoChange,
  onImport,
}: ImportControlsProps) {
  return (
    <section className="foundation-view">
      <h3>{STR.views.import.title}</h3>

      <label className="import-controls__label">
        {STR.views.import.pickFile}
        <input
          type="file"
          accept=".xlsx"
          disabled={disabled}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] ?? null;
            onPickFile(file);
            event.currentTarget.value = "";
          }}
        />
      </label>

      <p className="import-controls__file">
        <strong>{STR.views.import.noFilePlaceholder}:</strong> {fileName || "—"}
      </p>
      <p className="foundation-view__meta">{inferredHint}</p>

      <div className="import-controls__toggle">
        <button
          type="button"
          className={`button ${sourceType === "singles" ? "button--primary" : ""}`}
          disabled={disabled}
          onClick={() => {
            onSourceTypeChange("singles");
          }}
        >
          {STR.views.import.singles}
        </button>
        <button
          type="button"
          className={`button ${sourceType === "couples" ? "button--primary" : ""}`}
          disabled={disabled}
          onClick={() => {
            onSourceTypeChange("couples");
          }}
        >
          {STR.views.import.couples}
        </button>
      </div>

      <label className="import-controls__label">
        {STR.views.import.raceNumber}
        <select
          disabled={disabled}
          value={raceNo ?? ""}
          onChange={(event) => {
            const raw = Number(event.target.value);
            onRaceNoChange(Number.isFinite(raw) && raw > 0 ? raw : null);
          }}
        >
          <option value="">{STR.views.import.raceSelectPlaceholder}</option>
          {RACE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {STR.views.import.raceWord} {n}
            </option>
          ))}
        </select>
      </label>

      <button type="button" className="button button--primary" disabled={disabled} onClick={onImport}>
        {STR.views.import.importRace}
      </button>
    </section>
  );
}
