import { useEffect, useState } from "react";
import { ConfirmModal } from "@/components/shared/ConfirmModal.tsx";
import { STR } from "@/strings.ts";
import type { PersonIdentity } from "@/domain/types.ts";

interface IdentityModalProps {
  person: PersonIdentity | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: {
    person_id: string;
    given_name: string;
    family_name: string;
    display_name: string;
    yob: number;
    club: string | null;
  }) => void;
}

export function IdentityModal({ person, isOpen, onClose, onSave }: IdentityModalProps) {
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [yob, setYob] = useState("");
  const [club, setClub] = useState("");

  useEffect(() => {
    if (!person) return;
    setGivenName(person.given_name);
    setFamilyName(person.family_name);
    setDisplayName(person.display_name);
    setYob(String(person.yob));
    setClub(person.club ?? "");
  }, [person]);

  if (!isOpen || person == null) return null;

  const body = (
    <div className="form-grid">
      <label>
        {STR.identityModal.givenName}
        <input
          value={givenName}
          onChange={(event) => {
            setGivenName(event.target.value);
          }}
        />
      </label>
      <label>
        {STR.identityModal.familyName}
        <input
          value={familyName}
          onChange={(event) => {
            setFamilyName(event.target.value);
          }}
        />
      </label>
      <label>
        {STR.identityModal.displayName}
        <input
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value);
          }}
        />
      </label>
      <label>
        {STR.identityModal.yob}
        <input
          value={yob}
          onChange={(event) => {
            setYob(event.target.value);
          }}
        />
      </label>
      <label>
        {STR.identityModal.club}
        <input
          value={club}
          onChange={(event) => {
            setClub(event.target.value);
          }}
        />
      </label>
    </div>
  );

  return (
    <ConfirmModal
      isOpen
      title={STR.identityModal.title}
      body={body}
      confirmLabel={STR.actions.save}
      cancelLabel={STR.actions.close}
      onCancel={onClose}
      onConfirm={() => {
        onSave({
          person_id: person.person_id,
          given_name: givenName.trim(),
          family_name: familyName.trim(),
          display_name: displayName.trim(),
          yob: Number(yob),
          club: club.trim() || null,
        });
        onClose();
      }}
    />
  );
}
