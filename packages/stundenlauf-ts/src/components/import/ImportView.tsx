/**
 * Import screen: controls sidebar + review panel layout.
 */

import { useMemo } from "react";
import { ImportControls } from "@/components/import/ImportControls.tsx";
import { MatchingSettings } from "@/components/import/MatchingSettings.tsx";
import { ReviewPanel } from "@/components/import/ReviewPanel.tsx";
import { STR } from "@/strings.ts";
import type { FoundationViewProps } from "@/components/foundation-view-props.ts";
import { effectiveAutoThreshold, useImportStore } from "@/stores/import.ts";
import { useSeasonStore } from "@/stores/season.ts";
import { useStatusStore } from "@/stores/status.ts";

export function ImportView({ seasonLabel, reviewLabel }: FoundationViewProps) {
  const seasonState = useSeasonStore((state) => state.seasonState);
  const activeSeasonId = useSeasonStore((state) => state.activeSeasonId);
  const eventLog = useSeasonStore((state) => state.eventLog);
  const appendImportEvents = useSeasonStore((state) => state.appendImportEvents);
  const setStatus = useStatusStore((state) => state.setStatus);

  const selectedFileName = useImportStore((state) => state.selectedFileName);
  const sourceType = useImportStore((state) => state.sourceType);
  const raceNo = useImportStore((state) => state.raceNo);
  const matchingMode = useImportStore((state) => state.matchingMode);
  const autoThreshold = useImportStore((state) => state.autoThreshold);
  const reviewThreshold = useImportStore((state) => state.reviewThreshold);
  const settingsExpanded = useImportStore((state) => state.settingsExpanded);
  const busy = useImportStore((state) => state.busy);
  const error = useImportStore((state) => state.error);
  const openReviewCount = useImportStore((state) => state.openReviewCount);
  const pendingReviews = useImportStore((state) => state.pendingReviews);
  const selectedReviewEntryId = useImportStore((state) => state.selectedReviewEntryId);
  const selectedDecisionTeamId = useImportStore((state) => state.selectedDecisionTeamId);
  const setSelectedFile = useImportStore((state) => state.setSelectedFile);
  const setSourceType = useImportStore((state) => state.setSourceType);
  const setRaceNo = useImportStore((state) => state.setRaceNo);
  const setMatchingMode = useImportStore((state) => state.setMatchingMode);
  const setAutoThreshold = useImportStore((state) => state.setAutoThreshold);
  const setReviewThreshold = useImportStore((state) => state.setReviewThreshold);
  const setSettingsExpanded = useImportStore((state) => state.setSettingsExpanded);
  const setSelectedDecisionTeamId = useImportStore((state) => state.setSelectedDecisionTeamId);
  const startImportFlow = useImportStore((state) => state.startImportFlow);
  const resolveCurrentReview = useImportStore((state) => state.resolveCurrentReview);
  const finalizeCurrentImport = useImportStore((state) => state.finalizeCurrentImport);

  const controlsBlocked = busy || !activeSeasonId || openReviewCount > 0;
  const inferredHint = useMemo(() => {
    const typeLabel = sourceType === "couples" ? STR.views.import.couples : STR.views.import.singles;
    if (!selectedFileName) return "";
    if (raceNo) {
      return STR.views.import.inferenceDetectedBoth(typeLabel, `${STR.views.import.raceWord} ${raceNo}`);
    }
    return STR.views.import.inferenceDetectedTypeOnly(typeLabel);
  }, [raceNo, selectedFileName, sourceType]);

  async function commitSessionIfReady(): Promise<boolean> {
    const snapshot = useImportStore.getState();
    if (!activeSeasonId || snapshot.session?.phase !== "committing") return false;
    const result = finalizeCurrentImport(eventLog.length);
    if (result.eventsCount === 0) return false;
    await appendImportEvents(result.events);
    setStatus({
      message: STR.views.import.importDone,
      severity: "success",
      source: "import",
    });
    return true;
  }

  async function handleImport(): Promise<void> {
    if (openReviewCount > 0) {
      setStatus({
        message: STR.views.import.importBlockedByOpenReviews,
        severity: "warn",
        source: "import",
      });
      return;
    }
    setStatus({ message: STR.views.import.importRunning, severity: "info", source: "import" });
    const matched = await startImportFlow(seasonState);
    const failedMessage = useImportStore.getState().error;
    if (!matched) {
      setStatus({
        message: failedMessage ?? STR.views.import.importFailed,
        severity: "error",
        source: "import",
      });
      return;
    }
    if (matched.phase === "reviewing") {
      setStatus({
        message: STR.views.import.importDoneWithReviews,
        severity: "warn",
        source: "import",
      });
      return;
    }
    await commitSessionIfReady();
  }

  async function handleApplyExisting(): Promise<void> {
    if (!selectedDecisionTeamId) return;
    resolveCurrentReview({ type: "link_existing", team_id: selectedDecisionTeamId });
    await commitSessionIfReady();
  }

  async function handleCreateIdentity(): Promise<void> {
    resolveCurrentReview({ type: "create_new_identity" });
    await commitSessionIfReady();
  }

  return (
    <section className="foundation-view" aria-label={STR.views.import.title}>
      <h2>{STR.views.import.title}</h2>
      <div className="import-view">
        <div className="import-view__left">
          <ImportControls
            disabled={controlsBlocked}
            fileName={selectedFileName}
            sourceType={sourceType}
            raceNo={raceNo}
            inferredHint={inferredHint}
            onPickFile={setSelectedFile}
            onSourceTypeChange={setSourceType}
            onRaceNoChange={setRaceNo}
            onImport={() => {
              void handleImport();
            }}
          />
          <MatchingSettings
            disabled={controlsBlocked}
            mode={matchingMode}
            autoThreshold={autoThreshold}
            reviewThreshold={reviewThreshold}
            effectiveAutoThreshold={effectiveAutoThreshold(matchingMode, autoThreshold, reviewThreshold)}
            expanded={settingsExpanded}
            onExpandedChange={setSettingsExpanded}
            onModeChange={setMatchingMode}
            onAutoThresholdChange={setAutoThreshold}
            onReviewThresholdChange={setReviewThreshold}
          />
          {openReviewCount > 0 ? (
            <p className="foundation-view__meta">{STR.views.import.importBlockedByOpenReviews}</p>
          ) : null}
        </div>

        <div className="import-view__right">
          <ReviewPanel
            reviews={pendingReviews}
            selectedReviewEntryId={selectedReviewEntryId}
            selectedTeamId={selectedDecisionTeamId}
            busy={busy}
            onSelectTeam={setSelectedDecisionTeamId}
            onApplyCandidate={() => {
              void handleApplyExisting();
            }}
            onCreateNewIdentity={() => {
              void handleCreateIdentity();
            }}
          />
        </div>
      </div>
      {error ? <p className="danger-text">{error}</p> : null}
      <p className="foundation-view__meta">
        <span>{seasonLabel}</span>
        <span>{reviewLabel}</span>
      </p>
    </section>
  );
}
