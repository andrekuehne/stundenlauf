from __future__ import annotations

import csv
import io
from collections import defaultdict
from pathlib import Path

from backend.domain.models import Couple, Person, ProjectDocument, StandingsSnapshot
from backend.ingestion.adapters.common import parse_race_no


def people_couples_maps(document: ProjectDocument) -> tuple[dict[str, Person], dict[str, Couple]]:
    return {p.uid: p for p in document.people}, {c.uid: c for c in document.couples}


def entity_display_name(
    entity_kind: str,
    entity_uid: str,
    people_by_uid: dict[str, Person],
    couples_by_uid: dict[str, Couple],
) -> str:
    if entity_kind == "participant":
        p = people_by_uid.get(entity_uid)
        return p.name if p else entity_uid
    if entity_kind == "team":
        c = couples_by_uid.get(entity_uid)
        if c is None:
            return entity_uid
        return f"{c.member_a.name} / {c.member_b.name}"
    return entity_uid


def standings_snapshot_to_csv(
    snapshot: StandingsSnapshot | None,
    people_by_uid: dict[str, Person],
    couples_by_uid: dict[str, Couple],
) -> str:
    """Serialize standings to CSV with one header block per run (all categories concatenated)."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["category_key", "platz", "display_name", "entity_kind", "entity_uid", "punkte_gesamt", "distanz_gesamt"]
    )
    if snapshot is None:
        return buf.getvalue()

    for table in snapshot.category_tables:
        for row in table.rows:
            display = entity_display_name(
                row.entity_kind, row.entity_uid, people_by_uid, couples_by_uid
            )
            writer.writerow(
                [
                    table.category_key,
                    row.platz,
                    display,
                    row.entity_kind,
                    row.entity_uid,
                    row.punkte_gesamt,
                    row.distanz_gesamt,
                ]
            )
    return buf.getvalue()


def ordered_import_paths(data_dir: Path) -> list[Path]:
    """
    Discover *.xlsx under data_dir, order by Lauf number then singles before couples.

    Singles: any .xlsx whose name does not contain 'paare' (case-insensitive).
    Couples: name contains 'paare'.

    Raises ValueError if no files, unparsable Lauf number, or more than one file per (race_no, kind).
    """
    if not data_dir.is_dir():
        raise ValueError(f"Not a directory: {data_dir}")
    files = sorted(data_dir.glob("*.xlsx"))
    if not files:
        raise ValueError(f"No .xlsx files found under {data_dir}")

    singles = [f for f in files if "paare" not in f.name.lower()]
    couples = [f for f in files if "paare" in f.name.lower()]

    for f in singles + couples:
        n = parse_race_no(f)
        if n <= 0:
            raise ValueError(
                f"Could not parse Lauf number from filename (expected 'Lauf <n>'): {f.name}"
            )

    singles_by_race: dict[int, list[Path]] = defaultdict(list)
    for f in singles:
        singles_by_race[parse_race_no(f)].append(f)
    for race_no, paths in singles_by_race.items():
        if len(paths) > 1:
            raise ValueError(f"Multiple singles .xlsx files for Lauf {race_no}: {[p.name for p in paths]}")

    couples_by_race: dict[int, list[Path]] = defaultdict(list)
    for f in couples:
        couples_by_race[parse_race_no(f)].append(f)
    for race_no, paths in couples_by_race.items():
        if len(paths) > 1:
            raise ValueError(f"Multiple couples .xlsx files for Lauf {race_no}: {[p.name for p in paths]}")

    race_nos = sorted(set(singles_by_race.keys()) | set(couples_by_race.keys()))
    out: list[Path] = []
    for n in race_nos:
        if n in singles_by_race:
            out.append(singles_by_race[n][0])
        if n in couples_by_race:
            out.append(couples_by_race[n][0])
    return out


def safe_filename_stem(path: Path) -> str:
    stem = path.stem
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in stem)
