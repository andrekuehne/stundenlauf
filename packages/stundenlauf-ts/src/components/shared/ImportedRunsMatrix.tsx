import { STR } from "@/strings.ts";
import type { ImportedRunRow } from "@/components/standings/adapters.ts";

interface ImportedRunsMatrixProps {
  rows: ImportedRunRow[];
}

export function ImportedRunsMatrix({ rows }: ImportedRunsMatrixProps) {
  if (rows.length === 0) {
    return <p>{STR.views.standings.noRows}</p>;
  }

  return (
    <table className="ui-table">
      <thead>
        <tr>
          <th>{STR.views.standings.importedRunsRaceCol}</th>
          <th>{STR.views.standings.importedRunsCategoryCol}</th>
          <th>{STR.views.standings.importedRunsDateCol}</th>
          <th>{STR.views.standings.importedRunsFileCol}</th>
          <th>{STR.views.standings.importedRunsEntriesCol}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.race_event_id}>
            <td>{row.race_no}</td>
            <td>{row.category_label}</td>
            <td>{row.race_date}</td>
            <td>{row.source_file}</td>
            <td>{row.entries_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
