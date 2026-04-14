/**
 * Grouped import rows with rollback actions.
 */

import { STR } from "@/strings.ts";
import type { ImportBatchHistoryRow } from "./adapters.ts";

interface ImportHistoryTableProps {
  rows: ImportBatchHistoryRow[];
  onRollback: (batchId: string) => void;
}

export function ImportHistoryTable({ rows, onRollback }: ImportHistoryTableProps) {
  if (rows.length === 0) {
    return <p>{STR.views.history.noImports}</p>;
  }

  return (
    <table className="ui-table">
      <thead>
        <tr>
          <th>Batch</th>
          <th>{STR.views.history.sourceFile}</th>
          <th>{STR.views.history.importedAt}</th>
          <th>{STR.views.history.state}</th>
          <th>{STR.views.history.rows}</th>
          <th>{STR.views.history.rollback}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.import_batch_id}>
            <td>{row.import_batch_id.slice(0, 8)}</td>
            <td>{row.source_file}</td>
            <td>{row.imported_at}</td>
            <td>{row.state === "rolled_back" ? STR.views.history.rolledBack : STR.views.history.active}</td>
            <td>{row.races_count}</td>
            <td>
              <button
                type="button"
                className="button"
                disabled={row.state === "rolled_back"}
                onClick={() => {
                  onRollback(row.import_batch_id);
                }}
              >
                {STR.views.history.rollback}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
