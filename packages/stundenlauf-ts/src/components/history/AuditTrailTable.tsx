/**
 * Audit trail table: correction/merge history entries with rich detail rendering.
 */

import { STR } from "@/strings.ts";
import type { AuditRow } from "./adapters.ts";

interface AuditTrailTableProps {
  rows: AuditRow[];
}

export function AuditTrailTable({ rows }: AuditTrailTableProps) {
  if (rows.length === 0) {
    return <p>{STR.views.history.noAuditRows}</p>;
  }

  return (
    <table className="ui-table">
      <thead>
        <tr>
          <th>Zeitpunkt</th>
          <th>Typ</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.event_id}>
            <td>{row.recorded_at}</td>
            <td>{row.type}</td>
            <td>{row.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
