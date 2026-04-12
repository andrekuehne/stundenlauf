"""
Human-in-the-loop fixture import: ordered Excel imports and standings export.

Uses the same pipeline as the main CLI (`import_excel_into_project`).
Example data (*.xlsx) is typically gitignored; place files under ./example/ or pass --data-dir.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.domain.enums import Division
from backend.domain.models import Couple, Person, ProjectDocument
from backend.ingestion.service import import_excel_into_project
from backend.storage.repository import JsonProjectRepository
from backend.tools.fixture_session import (
    ordered_import_paths,
    people_couples_maps,
    safe_filename_stem,
    standings_snapshot_to_csv,
)


def _person_label(uid: str, people: dict[str, Person]) -> str:
    p = people.get(uid)
    return f"{p.name} ({p.yob})" if p else uid


def _team_label(uid: str, couples: dict[str, Couple]) -> str:
    c = couples.get(uid)
    if c is None:
        return uid
    return f"{c.member_a.name} ({c.member_a.yob}) + {c.member_b.name} ({c.member_b.yob})"


def _print_review_and_conflicts(document: ProjectDocument, merged_event_uids: tuple[str, ...]) -> None:
    if not merged_event_uids:
        return
    uid_set = set(merged_event_uids)
    people, couples = people_couples_maps(document)

    printed = False
    for event in document.events:
        if event.race_event_uid not in uid_set:
            continue
        for entry in event.entries:
            meta = entry.match_meta
            if meta is None:
                continue
            show = meta.route == "review" or bool(meta.conflict_flags)
            if not show:
                continue
            if not printed:
                print()
                print("Review / Konflikte (bitte gegen Ground Truth prüfen):")
                printed = True

            cat = event.category
            if cat.division in (Division.MEN, Division.WOMEN):
                linked = _person_label(entry.participant_uid or "", people)
                cands = [_person_label(u, people) for u in meta.candidate_uids]
            else:
                linked = _team_label(entry.team_uid or "", couples)
                cands = [_team_label(u, couples) for u in meta.candidate_uids]

            print(
                f"  [{cat.year} {cat.duration.value} {cat.division.value}] "
                f"Startnr.={entry.startnr} route={meta.route} confidence={meta.confidence:.3f}"
            )
            print(f"    entry_uid={entry.entry_uid} event_uid={event.race_event_uid}")
            print(f"    verknüpft: {linked}")
            print(f"    top_candidate_uid={meta.top_candidate_uid}")
            if cands:
                print(f"    Kandidaten: {', '.join(cands)}")
            if meta.conflict_flags:
                print(f"    conflict_flags={list(meta.conflict_flags)}")

    if printed:
        print()


def run_session(
    *,
    data_dir: Path,
    project_file: Path,
    series_year: int,
    out_dir: Path | None,
    no_pause: bool,
) -> None:
    paths = ordered_import_paths(data_dir)
    print(f"Import-Reihenfolge ({len(paths)} Dateien):")
    for i, p in enumerate(paths, start=1):
        kind = "Paare" if "paare" in p.name.lower() else "Einzel"
        print(f"  {i}. [{kind}] {p.name}")

    for idx, excel_path in enumerate(paths, start=1):
        result = import_excel_into_project(
            project_file=project_file,
            excel_file=excel_path,
            series_year=series_year,
        )
        if result.noop:
            print(f"\n[{idx}/{len(paths)}] Übersprungen (bereits importiert): {excel_path.name}")
        else:
            print(f"\n[{idx}/{len(paths)}] Import OK: {excel_path.name}")
            print(
                f"  Zeilen={result.rows_imported}, Events={len(result.merged_event_uids)}, Datei={result.source_file}"
            )
            if result.matching_report is not None:
                mr = result.matching_report
                print(
                    "  Matching: "
                    f"auto={mr.auto_links}, review={mr.review_queue}, neu={mr.new_identities}, "
                    f"Konflikte={mr.conflicts}, replay={mr.replay_overrides}"
                )

        repo = JsonProjectRepository(project_file)
        document = repo.load()
        if not result.noop and result.merged_event_uids:
            _print_review_and_conflicts(document, result.merged_event_uids)

        people, couples = people_couples_maps(document)
        csv_text = standings_snapshot_to_csv(document.standings, people, couples)
        if out_dir is not None:
            out_dir.mkdir(parents=True, exist_ok=True)
            out_name = f"standings_{idx:02d}_{safe_filename_stem(excel_path)}.csv"
            out_path = out_dir / out_name
            out_path.write_text(csv_text, encoding="utf-8")
            print(f"  Tabellen exportiert: {out_path}")
        else:
            print("  --- Standings (CSV) ---")
            print(csv_text.rstrip() or "(keine Tabellen)")

        if not no_pause and idx < len(paths):
            input("Enter für nächste Datei… ")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fixture-Import in Lauf-Reihenfolge mit Standings-Export für Ground-Truth-Vergleich."
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path("example"),
        help="Verzeichnis mit .xlsx-Dateien (Standard: example).",
    )
    parser.add_argument(
        "--project",
        type=Path,
        default=Path("example/session_project.json"),
        help="Projekt-JSON (Standard: example/session_project.json).",
    )
    parser.add_argument("--series-year", type=int, required=True, help="Serienjahr (z. B. 2023).")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Optional: Verzeichnis für CSV-Export pro Schritt; sonst stdout.",
    )
    parser.add_argument(
        "--no-pause",
        action="store_true",
        help="Keine interaktive Pause zwischen Dateien.",
    )
    args = parser.parse_args()
    run_session(
        data_dir=args.data_dir,
        project_file=args.project,
        series_year=args.series_year,
        out_dir=args.out_dir,
        no_pause=args.no_pause,
    )


if __name__ == "__main__":
    main()
