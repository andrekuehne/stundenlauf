/**
 * Reusable confirmation modal, replacing all window.confirm() / window.prompt() usage.
 *
 * Reference: F-TS06 §6 (Confirmation Modal Migration)
 */

import { useEffect, useId } from "react";
import type { ReactNode } from "react";
import { STR } from "@/strings.ts";

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  closeOnBackdrop?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  body,
  confirmLabel = STR.confirmModal.confirm,
  cancelLabel = STR.confirmModal.cancel,
  closeOnBackdrop = true,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="confirm-modal__backdrop"
      onClick={(event) => {
        if (!closeOnBackdrop) return;
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="confirm-modal__header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="button button--ghost"
            onClick={onCancel}
            aria-label={STR.confirmModal.closeAria}
          >
            ×
          </button>
        </header>
        <div className="confirm-modal__body">{body}</div>
        <footer className="confirm-modal__actions">
          <button type="button" className="button button--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="button button--primary" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
