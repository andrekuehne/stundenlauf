/**
 * Review queue panel: progress counter, candidate display, action buttons.
 */

import type { OrchestratedReviewEntry } from "@/import/types.ts";
import { STR } from "@/strings.ts";
import { ReviewTable } from "./ReviewTable.tsx";

interface ReviewPanelProps {
  reviews: OrchestratedReviewEntry[];
  selectedReviewEntryId: string | null;
  selectedTeamId: string | null;
  busy: boolean;
  onSelectTeam: (teamId: string) => void;
  onApplyCandidate: () => void;
  onCreateNewIdentity: () => void;
}

export function ReviewPanel({
  reviews,
  selectedReviewEntryId,
  selectedTeamId,
  busy,
  onSelectTeam,
  onApplyCandidate,
  onCreateNewIdentity,
}: ReviewPanelProps) {
  if (reviews.length === 0) {
    return (
      <section className="foundation-view">
        <h3>{STR.views.import.reviewTitle}</h3>
        <p>{STR.views.import.noOpenReviews}</p>
      </section>
    );
  }

  const selected = reviews.find((entry) => entry.entry_id === selectedReviewEntryId) ?? reviews[0];
  if (!selected) {
    return null;
  }
  const currentIndex = reviews.findIndex((entry) => entry.entry_id === selected.entry_id) + 1;

  return (
    <section className="foundation-view">
      <h3>{STR.views.import.reviewTitle}</h3>
      <p>{STR.views.import.reviewProgress(currentIndex, reviews.length)}</p>
      <p className="foundation-view__meta">{STR.views.import.reviewHintLayout}</p>
      <p className="foundation-view__meta">{STR.views.import.reviewHintNoMatch}</p>

      <ReviewTable review={selected} selectedTeamId={selectedTeamId} onSelectTeam={onSelectTeam} />

      <div className="import-review__actions">
        <button
          type="button"
          className="button button--primary"
          disabled={busy || !selectedTeamId}
          onClick={onApplyCandidate}
        >
          {STR.views.import.mergeAccept}
        </button>
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={onCreateNewIdentity}
        >
          {STR.views.import.mergeNewIdentity}
        </button>
      </div>
    </section>
  );
}
