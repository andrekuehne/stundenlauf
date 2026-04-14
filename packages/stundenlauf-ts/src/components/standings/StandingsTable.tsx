import { STR } from "@/strings.ts";
import type { StandingsTableRowVm } from "./adapters.ts";

interface StandingsTableProps {
  rows: StandingsTableRowVm[];
}

export function StandingsTable({ rows }: StandingsTableProps) {
  if (rows.length === 0) {
    return <p>{STR.views.standings.noRows}</p>;
  }

  return (
    <table className="ui-table">
      <thead>
        <tr>
          <th>{STR.views.standings.rank}</th>
          <th>{STR.views.standings.team}</th>
          <th>{STR.views.standings.points}</th>
          <th>{STR.views.standings.distance}</th>
          <th>{STR.views.standings.races}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.team_id}>
            <td>{row.rank ?? "—"}</td>
            <td>
              {row.team_label}
              {row.excluded ? ` (${STR.views.standings.statusExcluded})` : ""}
            </td>
            <td>{row.total_points}</td>
            <td>{row.total_km}</td>
            <td>{row.races_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
