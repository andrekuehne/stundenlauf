from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.ingestion.adapters.couples import parse_couples_workbook
from backend.ingestion.adapters.singles import parse_singles_workbook


def test_readable_import_preview(file_path: Path, series_year: int = 2023) -> None:
    """Read one singles or couples file and print a readable preview."""
    is_couples = "paare" in file_path.name.lower()
    parsed = parse_couples_workbook(file_path, series_year) if is_couples else parse_singles_workbook(file_path, series_year)

    print("=" * 80)
    print(f"Datei: {file_path}")
    print(f"Typ: {'Paarlauf' if is_couples else 'Einzellauf'}")
    print(f"SHA256: {parsed.meta.source_sha256}")
    print(f"Schema-Fingerprint: {parsed.meta.schema_fingerprint}")
    print("=" * 80)

    if is_couples:
        for idx, section in enumerate(parsed.couples_sections, start=1):
            print(
                f"\nAbschnitt {idx}: year={section.context.series_year}, "
                f"race_no={section.context.race_no}, duration={section.context.duration.value}, "
                f"division={section.context.division.value}, rows={len(section.rows)}"
            )
            for row in section.rows:
                print(
                    f"  #{row.startnr:>4} | "
                    f"{row.name_a} ({row.yob_a}) + {row.name_b} ({row.yob_b}) | "
                    f"dist={row.distance_km:.3f} km | points={row.points:.1f}"
                )
    else:
        for idx, section in enumerate(parsed.singles_sections, start=1):
            print(
                f"\nAbschnitt {idx}: year={section.context.series_year}, "
                f"race_no={section.context.race_no}, duration={section.context.duration.value}, "
                f"division={section.context.division.value}, rows={len(section.rows)}"
            )
            for row in section.rows:
                club = row.club or "-"
                print(
                    f"  #{row.startnr:>4} | {row.name} ({row.yob}) | "
                    f"club={club} | dist={row.distance_km:.3f} km | points={row.points:.1f}"
                )


def main() -> None:
    parser = argparse.ArgumentParser(description="Preview parsed import rows for one Excel file.")
    parser.add_argument("--file", required=True, type=Path, help="Path to one singles or couples .xlsx file.")
    parser.add_argument("--year", type=int, default=2023, help="Series year used in parse context.")
    args = parser.parse_args()
    test_readable_import_preview(args.file, args.year)


if __name__ == "__main__":
    main()
