from __future__ import annotations

import argparse
from pathlib import Path

from backend.ingestion.service import import_excel_into_project


def main() -> None:
    parser = argparse.ArgumentParser(description="Stundenlauf CLI")
    parser.add_argument("--project", type=Path, help="Pfad zur Projektdatei (JSON).")
    parser.add_argument("--excel", type=Path, help="Pfad zur Ergebnis-Exceldatei.")
    parser.add_argument("--year", type=int, help="Serienjahr für den Import.")
    args = parser.parse_args()

    if args.project and args.excel and args.year:
        result = import_excel_into_project(project_file=args.project, excel_file=args.excel, series_year=args.year)
        if result.noop:
            print(f"Kein Import notwendig: Datei bereits vorhanden ({result.source_file}).")
            return
        print(
            "Import erfolgreich: "
            f"Datei={result.source_file}, Zeilen={result.rows_imported}, "
            f"Events={len(result.merged_event_uids)}"
        )
        return
    print("Hello from stundenlauf!")


if __name__ == "__main__":
    main()
