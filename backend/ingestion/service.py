from __future__ import annotations

from pathlib import Path

from backend.domain.enums import RaceEventState
from backend.ingestion.adapters.couples import parse_couples_workbook
from backend.ingestion.adapters.singles import parse_singles_workbook
from backend.ingestion.mapping import map_couples_section, map_singles_section
from backend.ingestion.types import ImportResult
from backend.matching.report import MatchingReport, aggregate_matching_reports
from backend.ranking.engine import recompute_project_standings
from backend.storage.repository import JsonProjectRepository


def import_excel_into_project(project_file: Path, excel_file: Path, series_year: int) -> ImportResult:
    repo = JsonProjectRepository(project_file)
    document = repo.load()
    lower_name = excel_file.name.lower()
    is_couples = "paare" in lower_name

    parsed = parse_couples_workbook(excel_file, series_year) if is_couples else parse_singles_workbook(excel_file, series_year)

    if any(event.source_sha256 == parsed.meta.source_sha256 for event in document.events):
        return ImportResult(
            noop=True,
            issues=(),
            merged_event_uids=(),
            rows_imported=0,
            source_file=excel_file,
            matching_report=None,
        )

    for event in document.events:
        if event.state != RaceEventState.ACTIVE:
            continue
        if is_couples and not any(section.context.division == event.category.division for section in parsed.couples_sections):
            continue
        if (not is_couples) and not any(section.context.division == event.category.division for section in parsed.singles_sections):
            continue
        candidate_race_no = parsed.couples_sections[0].context.race_no if is_couples else parsed.singles_sections[0].context.race_no
        if event.category.year == series_year and event.race_no == candidate_race_no:
            if (is_couples and event.category.division in {s.context.division for s in parsed.couples_sections}) or (
                (not is_couples) and event.category.division in {s.context.division for s in parsed.singles_sections}
            ):
                raise ValueError("Importkonflikt: Rennen mit gleicher Kategorie und Laufnummer existiert bereits.")

    source_meta = {
        "source_file": parsed.meta.source_file,
        "source_sha256": parsed.meta.source_sha256,
        "imported_at": parsed.meta.imported_at,
        "parser_version": parsed.meta.parser_version,
        "schema_fingerprint": parsed.meta.schema_fingerprint,
    }
    merged_uids: list[str] = []
    row_count = 0
    reports: list[MatchingReport] = []
    if is_couples:
        for section in parsed.couples_sections:
            document, report = map_couples_section(section, document, source_meta)
            merged_uids.append(document.events[-1].race_event_uid)
            row_count += len(section.rows)
            reports.append(report)
    else:
        for section in parsed.singles_sections:
            document, report = map_singles_section(section, document, source_meta)
            merged_uids.append(document.events[-1].race_event_uid)
            row_count += len(section.rows)
            reports.append(report)

    document = recompute_project_standings(document)
    repo.save(document)
    return ImportResult(
        noop=False,
        issues=(),
        merged_event_uids=tuple(merged_uids),
        rows_imported=row_count,
        source_file=excel_file,
        matching_report=aggregate_matching_reports(reports),
    )
