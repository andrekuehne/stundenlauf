/**
 * History screen: import history + audit trail layout.
 */

import { useMemo, useState } from "react";
import { ConfirmModal } from "@/components/shared/ConfirmModal.tsx";
import { STR } from "@/strings.ts";
import type { FoundationViewProps } from "@/components/foundation-view-props.ts";
import { useSeasonStore } from "@/stores/season.ts";
import { useStatusStore } from "@/stores/status.ts";
import { AuditTrailTable } from "./AuditTrailTable.tsx";
import { buildAuditRows, buildImportBatchRows } from "./adapters.ts";
import { ImportHistoryTable } from "./ImportHistoryTable.tsx";

export function HistoryView({ seasonLabel, reviewLabel }: FoundationViewProps) {
  const seasonState = useSeasonStore((state) => state.seasonState);
  const eventLog = useSeasonStore((state) => state.eventLog);
  const rollbackBatch = useSeasonStore((state) => state.rollbackBatch);
  const setStatus = useStatusStore((state) => state.setStatus);
  const [rollbackCandidate, setRollbackCandidate] = useState<string | null>(null);

  const importRows = useMemo(() => buildImportBatchRows(seasonState), [seasonState]);
  const auditRows = useMemo(() => buildAuditRows(eventLog), [eventLog]);

  return (
    <section className="foundation-view" aria-label={STR.views.history.title}>
      <h2>{STR.views.history.title}</h2>
      <h3>{STR.views.history.importHistoryTitle}</h3>
      <ImportHistoryTable
        rows={importRows}
        onRollback={(batchId) => {
          setRollbackCandidate(batchId);
        }}
      />

      <h3>{STR.views.history.auditTrailTitle}</h3>
      <AuditTrailTable rows={auditRows} />

      <p className="foundation-view__meta">
        <span>{seasonLabel}</span>
        <span>{reviewLabel}</span>
      </p>

      <ConfirmModal
        isOpen={rollbackCandidate != null}
        title={STR.views.history.rollbackConfirmTitle}
        body={STR.views.history.rollbackConfirmBody}
        onCancel={() => {
          setRollbackCandidate(null);
        }}
        onConfirm={() => {
          if (!rollbackCandidate) return;
          void rollbackBatch(rollbackCandidate, "Rollback über Historie").then(() => {
            setStatus({
              message: "Import wurde zurückgerollt.",
              severity: "warn",
              source: "history",
            });
            setRollbackCandidate(null);
          });
        }}
      />
    </section>
  );
}
