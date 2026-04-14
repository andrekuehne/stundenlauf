/**
 * Review candidate table: incoming row + candidate rows with diff highlighting.
 */

import type { OrchestratedReviewEntry } from "@/import/types.ts";
import { STR } from "@/strings.ts";

interface ReviewTableProps {
  review: OrchestratedReviewEntry;
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string) => void;
}

function scorePercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export function ReviewTable({ review, selectedTeamId, onSelectTeam }: ReviewTableProps) {
  return (
    <table className="ui-table">
      <thead>
        <tr>
          <th>{STR.views.import.reviewName}</th>
          <th>{STR.views.import.reviewYob}</th>
          <th>{STR.views.import.reviewClub}</th>
          <th>{STR.views.import.reviewConfidence}</th>
          <th>{STR.views.import.reviewAction}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{review.review_item.incoming_display_name}</td>
          <td>{review.review_item.incoming_yob || "—"}</td>
          <td>{review.review_item.incoming_club ?? "—"}</td>
          <td>{scorePercent(review.review_item.confidence)}</td>
          <td>{STR.views.import.reviewIncoming}</td>
        </tr>
        {review.review_item.candidates.length > 0 ? (
          review.review_item.candidates.map((candidate) => (
            <tr key={candidate.team_id}>
              <td>{candidate.display_name}</td>
              <td>{candidate.yob || "—"}</td>
              <td>{candidate.club ?? "—"}</td>
              <td>{scorePercent(candidate.score)}</td>
              <td>
                <button
                  type="button"
                  className={`button ${selectedTeamId === candidate.team_id ? "button--primary" : ""}`}
                  onClick={() => {
                    onSelectTeam(candidate.team_id);
                  }}
                >
                  {selectedTeamId === candidate.team_id ? STR.actions.apply : STR.views.import.mergeAccept}
                </button>
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={5}>{STR.views.import.reviewNoCandidates}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
