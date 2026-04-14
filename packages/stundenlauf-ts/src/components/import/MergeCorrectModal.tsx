import { ConfirmModal } from "@/components/shared/ConfirmModal.tsx";
import { STR } from "@/strings.ts";

interface MergeCorrectModalProps {
  isOpen: boolean;
  teams: Array<{ team_id: string; label: string }>;
  survivorTeamId: string | null;
  absorbedTeamId: string | null;
  onChangeSurvivor: (teamId: string) => void;
  onChangeAbsorbed: (teamId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function MergeCorrectModal({
  isOpen,
  teams,
  survivorTeamId,
  absorbedTeamId,
  onChangeSurvivor,
  onChangeAbsorbed,
  onCancel,
  onConfirm,
}: MergeCorrectModalProps) {
  const body = (
    <div className="form-grid">
      <p>{STR.mergeModal.help}</p>
      <label>
        {STR.mergeModal.survivor}
        <select
          value={survivorTeamId ?? ""}
          onChange={(event) => {
            onChangeSurvivor(event.target.value);
          }}
        >
          <option value="">-</option>
          {teams.map((team) => (
            <option key={team.team_id} value={team.team_id}>
              {team.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        {STR.mergeModal.absorbed}
        <select
          value={absorbedTeamId ?? ""}
          onChange={(event) => {
            onChangeAbsorbed(event.target.value);
          }}
        >
          <option value="">-</option>
          {teams.map((team) => (
            <option key={team.team_id} value={team.team_id}>
              {team.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  return (
    <ConfirmModal
      isOpen={isOpen}
      title={STR.mergeModal.title}
      body={body}
      confirmLabel={STR.actions.apply}
      cancelLabel={STR.actions.close}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
