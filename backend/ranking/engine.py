from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime

from backend.domain.enums import Division, RaceEventState
from backend.domain.models import (
    CategoryStandingsTable,
    ProjectDocument,
    RaceContribution,
    RaceEvent,
    RaceSeriesCategory,
    StandingsRow,
    StandingsSnapshot,
)
from backend.ranking.aggregation import sum_top_n_or_all_points_and_distance
from backend.ranking.rules import RULESET_V1_LEGACY_TOP4, Ruleset, default_ruleset_v1


def _is_singles_division(division: Division) -> bool:
    return division in (Division.MEN, Division.WOMEN)


def _entity_key_for_entry(entry, division: Division) -> tuple[str, str] | None:
    """Returns (kind, uid) or None if identity missing."""
    if _is_singles_division(division):
        uid = entry.participant_uid
        if uid:
            return ("participant", uid)
        return None
    uid = entry.team_uid
    if uid:
        return ("team", uid)
    return None


def _collect_race_rows_for_entity(
    events: Iterable[RaceEvent],
    category: RaceSeriesCategory,
    kind: str,
    uid: str,
) -> list[tuple[str, float, float]]:
    rows: list[tuple[str, float, float]] = []
    for event in events:
        if event.state != RaceEventState.ACTIVE:
            continue
        if event.category != category:
            continue
        for entry in event.entries:
            ek = _entity_key_for_entry(entry, category.division)
            if ek is None:
                continue
            if ek[0] != kind or ek[1] != uid:
                continue
            rows.append(
                (
                    event.race_event_uid,
                    float(entry.result.points),
                    float(entry.result.distance_km),
                )
            )
    return rows


def _category_keys_from_active_events(events: Iterable[RaceEvent]) -> list[str]:
    keys: set[str] = set()
    for event in events:
        if event.state == RaceEventState.ACTIVE:
            keys.add(event.category.key)
    return sorted(keys)


def _entities_in_category(events: Iterable[RaceEvent], category: RaceSeriesCategory) -> set[tuple[str, str]]:
    out: set[tuple[str, str]] = set()
    for event in events:
        if event.state != RaceEventState.ACTIVE:
            continue
        if event.category != category:
            continue
        for entry in event.entries:
            ek = _entity_key_for_entry(entry, category.division)
            if ek is not None:
                out.add(ek)
    return out


def compute_standings_snapshot(
    document: ProjectDocument,
    *,
    ruleset: Ruleset | None = None,
    calculated_at: str | None = None,
) -> StandingsSnapshot:
    """Pure computation: active events only, deterministic ordering."""
    rs = ruleset or default_ruleset_v1()
    ts = calculated_at or datetime.now(UTC).isoformat()

    active = tuple(e for e in document.events if e.state == RaceEventState.ACTIVE)
    cat_keys = _category_keys_from_active_events(active)

    tables: list[CategoryStandingsTable] = []

    for cat_key in cat_keys:
        # Reconstruct category from first matching event
        sample = next(e for e in active if e.category.key == cat_key)
        category = sample.category

        entities = sorted(_entities_in_category(active, category), key=lambda t: (t[0], t[1]))
        rows_out: list[StandingsRow] = []

        for kind, uid in entities:
            race_rows = tuple(_collect_race_rows_for_entity(active, category, kind, uid))
            if not race_rows:
                continue

            agg = sum_top_n_or_all_points_and_distance(
                race_rows,
                n=rs.top_n,
                distance_decimals=rs.distance_decimals,
            )

            selected_set = set(agg.selected_race_event_uids)
            contributions: list[RaceContribution] = []
            for race_uid, pts, dist in sorted(race_rows, key=lambda r: (r[0])):
                contributions.append(
                    RaceContribution(
                        race_event_uid=race_uid,
                        points=pts,
                        distance_km=dist,
                        counts_toward_total=race_uid in selected_set,
                    )
                )

            rows_out.append(
                StandingsRow(
                    entity_kind=kind,  # type: ignore[arg-type]
                    entity_uid=uid,
                    punkte_gesamt=agg.punkte_gesamt,
                    distanz_gesamt=agg.distanz_gesamt,
                    platz=0,
                    race_contributions=tuple(contributions),
                )
            )

        # Sort: points desc, distance desc, then stable (kind, uid)
        sorted_rows = sorted(
            rows_out,
            key=lambda r: (-r.punkte_gesamt, -r.distanz_gesamt, r.entity_kind, r.entity_uid),
        )
        placed = tuple(
            replace(row, platz=i + 1)
            for i, row in enumerate(sorted_rows)
        )
        if placed:
            tables.append(CategoryStandingsTable(category_key=cat_key, rows=placed))

    return StandingsSnapshot(
        ruleset_version=rs.version_id,
        calculated_at=ts,
        category_tables=tuple(tables),
    )


def recompute_project_standings(
    document: ProjectDocument,
    *,
    ruleset_version: str | None = None,
) -> ProjectDocument:
    """Attach fresh standings to a project document."""
    if ruleset_version is None or ruleset_version == RULESET_V1_LEGACY_TOP4:
        rs = default_ruleset_v1()
    else:
        raise ValueError(f"Unsupported ruleset_version: {ruleset_version!r}")

    snapshot = compute_standings_snapshot(document, ruleset=rs)
    return replace(document, standings=snapshot)
