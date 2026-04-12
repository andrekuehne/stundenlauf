from __future__ import annotations

from backend.domain.models import ProjectDocument
from backend.ingestion.types import ParsedSectionCouples, ParsedSectionSingles
from backend.matching.config import MatchingConfig
from backend.matching.report import MatchingReport
from backend.matching.workflow import process_couples_section, process_singles_section


def map_singles_section(
    section: ParsedSectionSingles,
    document: ProjectDocument,
    source_meta: dict[str, str],
    *,
    matching_config: MatchingConfig | None = None,
) -> tuple[ProjectDocument, MatchingReport]:
    cfg = matching_config or MatchingConfig()
    return process_singles_section(document, section, source_meta, cfg)


def map_couples_section(
    section: ParsedSectionCouples,
    document: ProjectDocument,
    source_meta: dict[str, str],
    *,
    matching_config: MatchingConfig | None = None,
) -> tuple[ProjectDocument, MatchingReport]:
    cfg = matching_config or MatchingConfig()
    return process_couples_section(document, section, source_meta, cfg)
