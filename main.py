from __future__ import annotations

import argparse
from pathlib import Path

from backend.app_paths import default_workspace_dir
from backend.ingestion.service import import_excel_into_project
from backend.ranking.engine import recompute_project_standings
from backend.storage.repository import JsonProjectRepository
from backend.ui_app import launch_ui


def stundenlauf_gui() -> None:
    launch_ui(workspace_dir=default_workspace_dir(), project_file=None)


def main() -> None:
    parser = argparse.ArgumentParser(description="Stundenlauf CLI")
    parser.add_argument("--project", type=Path, help="Pfad zur Projektdatei (JSON).")
    parser.add_argument("--excel", type=Path, help="Pfad zur Ergebnis-Exceldatei.")
    parser.add_argument("--year", type=int, help="Serienjahr für den Import.")
    parser.add_argument("--gui", action="store_true", help="Desktop-GUI im Vollbild-Modus starten.")
    parser.add_argument(
        "--workspace-dir",
        type=Path,
        default=default_workspace_dir(),
        help="Arbeitsverzeichnis für GUI-Daten (Standard: Dokumente/Stundenlauf).",
    )
    parser.add_argument(
        "--recompute-standings",
        action="store_true",
        help="Nur Tabellenstände aus der Projektdatei neu berechnen und speichern.",
    )
    args = parser.parse_args()

    if args.gui:
        launch_ui(workspace_dir=args.workspace_dir, project_file=args.project)
        return

    if args.project and args.recompute_standings:
        repo = JsonProjectRepository(args.project)
        doc = recompute_project_standings(repo.load())
        repo.save(doc)
        snap = doc.standings
        n_tables = len(snap.category_tables) if snap is not None else 0
        print(f"Tabellenstände neu berechnet: ruleset={snap.ruleset_version if snap else 'n/a'}, Kategorien={n_tables}")
        return

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
        if result.matching_report is not None:
            mr = result.matching_report
            print(
                "Matching: "
                f"auto={mr.auto_links}, review={mr.review_queue}, neu={mr.new_identities}, "
                f"Konflikte={mr.conflicts}, replay={mr.replay_overrides}"
            )
        return
    print("Hello from stundenlauf!")


if __name__ == "__main__":
    main()
