from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import UTC, datetime

from backend.domain.enums import Division, Gender
from backend.domain.models import (
    Couple,
    EntryResult,
    MatchingDecision,
    Person,
    ProjectDocument,
    RaceEntry,
    RaceEntryMatchMeta,
    RaceEvent,
    RaceSeriesCategory,
)
from backend.ingestion.types import ImportRowCouples, ParsedSectionCouples, ParsedSectionSingles
from backend.storage.schema_v2 import SCHEMA_VERSION_V2
from backend.matching.candidates import build_person_block_index, gather_candidates
from backend.matching.config import MatchingConfig
from backend.matching.decisions import (
    identity_fingerprint,
    latest_decisions_by_fingerprint,
    rejected_participant_uids,
    rejected_team_uids,
    team_fingerprint,
)
from backend.matching.normalize import ParsedName, normalize_club, parse_person_name
from backend.matching.report import MatchingReport
from backend.matching.score import (
    route_from_score,
    score_person_match,
    should_review_strong_couple_yob_mismatch,
    should_review_strong_name_yob_mismatch,
)
from backend.matching.strict_identity import couple_matches_strict_row, person_matches_strict_incoming
from backend.matching.teams import _couple_division_ok, build_couple_block_index, gather_couple_candidates, score_couple_match


def _gender_for_division(division: Division) -> Gender:
    if division == Division.MEN:
        return Gender.M
    if division == Division.WOMEN:
        return Gender.F
    raise ValueError(f"No single-runner gender mapping for division {division.value}.")


def _iso_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _member_genders_for_couples(division: Division) -> tuple[Gender, Gender]:
    if division == Division.COUPLES_MEN:
        return Gender.M, Gender.M
    if division == Division.COUPLES_WOMEN:
        return Gender.F, Gender.F
    if division == Division.COUPLES_MIXED:
        return Gender.M, Gender.F
    raise ValueError(f"Unexpected couples division: {division.value}.")


def _person_row_candidate_confidences(
    *,
    parsed: ParsedName,
    yob: int,
    club_norm: str,
    config: MatchingConfig,
    candidate_people: tuple[Person, ...],
    scored: list[tuple[float, Person, dict[str, float]]],
    candidate_uids: tuple[str, ...],
) -> tuple[float, ...]:
    by_uid = {c.uid: sc for sc, c, _ in scored}
    out: list[float] = []
    for uid in candidate_uids:
        if uid in by_uid:
            out.append(by_uid[uid])
            continue
        cand = next((c for c in candidate_people if c.uid == uid), None)
        if cand is None:
            out.append(0.0)
            continue
        sc, _ = score_person_match(parsed, yob, club_norm, cand, config)
        out.append(sc)
    return tuple(out)


def _couple_row_candidate_confidences(
    *,
    row: ImportRowCouples,
    parsed_a: ParsedName,
    parsed_b: ParsedName,
    club_norm_a: str,
    club_norm_b: str,
    config: MatchingConfig,
    couples: tuple[Couple, ...],
    scored: list[tuple[float, Couple, dict[str, float]]],
    candidate_uids: tuple[str, ...],
) -> tuple[float, ...]:
    by_uid = {c.uid: sc for sc, c, _ in scored}
    out: list[float] = []
    for uid in candidate_uids:
        if uid in by_uid:
            out.append(by_uid[uid])
            continue
        cand = next((c for c in couples if c.uid == uid), None)
        if cand is None:
            out.append(0.0)
            continue
        sc, _ = score_couple_match(
            parsed_a,
            row.yob_a,
            club_norm_a,
            parsed_b,
            row.yob_b,
            club_norm_b,
            cand,
            config,
        )
        out.append(sc)
    return tuple(out)


@dataclass
class _RunStats:
    auto_links: int = 0
    review_queue: int = 0
    new_identities: int = 0
    conflicts: int = 0
    replay_overrides: int = 0
    candidate_counts: list[int] = field(default_factory=list)

    def to_report(self) -> MatchingReport:
        return MatchingReport(
            auto_links=self.auto_links,
            review_queue=self.review_queue,
            new_identities=self.new_identities,
            conflicts=self.conflicts,
            replay_overrides=self.replay_overrides,
            candidate_counts=list(self.candidate_counts),
        )


def _resolve_person(
    *,
    raw_name: str,
    yob: int,
    club_raw: str | None,
    gender: Gender,
    candidate_people: tuple[Person, ...],
    people: list[Person],
    decision_index: dict[str, MatchingDecision],
    rejected_map: dict[str, set[str]],
    used_candidate_uids: dict[str, str],
    config: MatchingConfig,
    race_event_uid: str,
    entry_uid: str,
    new_decisions: list[MatchingDecision],
    stats: _RunStats,
) -> tuple[Person, RaceEntryMatchMeta]:
    parsed = parse_person_name(raw_name)
    club_norm = normalize_club(club_raw)
    fp = identity_fingerprint(parsed, yob, gender)

    replay = decision_index.get(fp)
    if replay is not None and replay.kind in {"manual_link", "replay"} and replay.target_participant_uid:
        target = next((p for p in people if p.uid == replay.target_participant_uid), None)
        if target is not None:
            stats.replay_overrides += 1
            meta = RaceEntryMatchMeta(
                route="auto",
                confidence=1.0,
                top_candidate_uid=target.uid,
                candidate_uids=(target.uid,),
                candidate_confidences=(1.0,),
                features={"replay": 1.0},
            )
            new_decisions.append(
                MatchingDecision(
                    decided_at=_iso_now(),
                    kind="replay",
                    row_fingerprint=fp,
                    race_event_uid=race_event_uid,
                    entry_uid=entry_uid,
                    target_participant_uid=target.uid,
                    feature_scores={"replay": 1.0},
                )
            )
            return target, meta

    block_index = build_person_block_index(candidate_people, gender)
    candidates = gather_candidates(parsed, yob, gender, block_index, config)
    excluded = rejected_map.get(fp, set())
    scored: list[tuple[float, Person, dict[str, float]]] = []
    for cand in candidates:
        if cand.uid in excluded:
            continue
        score, feats = score_person_match(parsed, yob, club_norm, cand, config)
        scored.append((score, cand, feats))
    scored.sort(key=lambda item: item[0], reverse=True)
    stats.candidate_counts.append(len(scored))

    top: Person | None = scored[0][1] if scored else None
    top_score = scored[0][0] if scored else 0.0
    top_feats: dict[str, float] = dict(scored[0][2]) if scored else {}
    candidate_uids = tuple(s[1].uid for s in scored[:5])

    strict_hits: list[Person] = []
    strict_multi_review = False
    if config.strict_normalized_auto_only:
        strict_hits = [
            p
            for p in candidate_people
            if p.gender == gender
            and person_matches_strict_incoming(
                incoming_parsed=parsed,
                incoming_yob=yob,
                incoming_club_norm=club_norm,
                gender=gender,
                person=p,
            )
        ]
        if len(strict_hits) == 1:
            top = strict_hits[0]
            top_score = 1.0
            top_feats = {"strict_identity_auto": 1.0, "total": 1.0}
            merged_uids = [strict_hits[0].uid] + [u for u in candidate_uids if u != strict_hits[0].uid]
            candidate_uids = tuple(merged_uids[:5])
        elif len(strict_hits) > 1:
            strict_multi_review = True
            merged_uids = [p.uid for p in strict_hits]
            for uid in candidate_uids:
                if uid not in merged_uids:
                    merged_uids.append(uid)
                if len(merged_uids) >= 5:
                    break
            candidate_uids = tuple(merged_uids[:5])
            score_by_uid = {c.uid: (sc, ft) for sc, c, ft in scored}
            best_p = strict_hits[0]
            best_sc = -1.0
            best_ft: dict[str, float] = {}
            for p in strict_hits:
                sc, ft = score_by_uid.get(p.uid, (0.0, {}))
                if sc > best_sc:
                    best_sc, best_p, best_ft = sc, p, dict(ft)
            top = best_p
            top_score = best_sc if best_sc >= 0.0 else 0.0
            top_feats = best_ft if best_ft else {"strict_collision": 1.0}

    route = route_from_score(top_score, config) if top is not None else "new_identity"
    meta_route: str
    if top is None:
        meta_route = "new_identity"
    elif strict_multi_review:
        meta_route = "review"
    elif route == "auto":
        meta_route = "auto"
    elif route == "review":
        meta_route = "review"
    else:
        meta_route = "new_identity"

    if config.strict_normalized_auto_only and not strict_hits and top is not None and meta_route == "auto":
        meta_route = "review"

    if (
        top is not None
        and meta_route == "new_identity"
        and should_review_strong_name_yob_mismatch(top_score, top_feats, config)
    ):
        meta_route = "review"

    conflict_flags: list[str] = []
    if top is not None and meta_route == "auto":
        prev_entry = used_candidate_uids.get(top.uid)
        if prev_entry is not None:
            conflict_flags.append(f"candidate_reused:{top.uid}")
            stats.conflicts += 1
            meta_route = "review"
        else:
            used_candidate_uids[top.uid] = entry_uid

    candidate_confidences = _person_row_candidate_confidences(
        parsed=parsed,
        yob=yob,
        club_norm=club_norm,
        config=config,
        candidate_people=candidate_people,
        scored=scored,
        candidate_uids=candidate_uids,
    )

    if meta_route == "new_identity" or top is None:
        person = Person(
            name=raw_name.strip(),
            yob=yob,
            gender=gender,
            club=club_raw,
            canonical_given=parsed.given,
            canonical_family=parsed.family,
            club_normalized=club_norm,
        )
        people.append(person)
        meta = RaceEntryMatchMeta(
            route="new_identity",
            confidence=top_score,
            top_candidate_uid=top.uid if top else None,
            candidate_uids=candidate_uids,
            candidate_confidences=candidate_confidences,
            features=top_feats,
            conflict_flags=tuple(conflict_flags),
        )
        new_decisions.append(
            MatchingDecision(
                decided_at=_iso_now(),
                kind="auto",
                row_fingerprint=fp,
                race_event_uid=race_event_uid,
                entry_uid=entry_uid,
                target_participant_uid=person.uid,
                feature_scores=top_feats,
            )
        )
        stats.new_identities += 1
        return person, meta

    assert top is not None
    if meta_route == "auto":
        stats.auto_links += 1
    elif meta_route == "review":
        stats.review_queue += 1

    meta = RaceEntryMatchMeta(
        route=meta_route,  # type: ignore[arg-type]
        confidence=top_score,
        top_candidate_uid=top.uid,
        candidate_uids=candidate_uids,
        candidate_confidences=candidate_confidences,
        features=top_feats,
        conflict_flags=tuple(conflict_flags),
    )
    new_decisions.append(
        MatchingDecision(
            decided_at=_iso_now(),
            kind="auto",
            row_fingerprint=fp,
            race_event_uid=race_event_uid,
            entry_uid=entry_uid,
            target_participant_uid=top.uid,
            feature_scores=top_feats,
        )
    )
    return top, meta


def _resolve_team_row(
    *,
    row: ImportRowCouples,
    division: Division,
    gender_a: Gender,
    gender_b: Gender,
    people: list[Person],
    couples: list[Couple],
    decision_index: dict[str, MatchingDecision],
    rejected_map: dict[str, set[str]],
    used_team_uids: dict[str, str],
    config: MatchingConfig,
    race_event_uid: str,
    entry_uid: str,
    new_decisions: list[MatchingDecision],
    stats: _RunStats,
) -> tuple[Couple, RaceEntryMatchMeta]:
    """Match a Paarlauf row to an existing team or create a new couple (and members)."""
    parsed_a = parse_person_name(row.name_a)
    parsed_b = parse_person_name(row.name_b)
    club_norm_a = normalize_club(row.club_a)
    club_norm_b = normalize_club(row.club_b)
    fp = team_fingerprint(parsed_a, row.yob_a, gender_a, parsed_b, row.yob_b, gender_b)

    replay = decision_index.get(fp)
    if replay is not None and replay.kind in {"manual_link", "replay"} and replay.target_team_uid:
        target = next((c for c in couples if c.uid == replay.target_team_uid), None)
        if target is not None:
            stats.replay_overrides += 1
            meta = RaceEntryMatchMeta(
                route="auto",
                confidence=1.0,
                top_candidate_uid=target.uid,
                candidate_uids=(target.uid,),
                candidate_confidences=(1.0,),
                features={"replay": 1.0},
            )
            new_decisions.append(
                MatchingDecision(
                    decided_at=_iso_now(),
                    kind="replay",
                    row_fingerprint=fp,
                    race_event_uid=race_event_uid,
                    entry_uid=entry_uid,
                    target_team_uid=target.uid,
                    feature_scores={"replay": 1.0},
                )
            )
            return target, meta

    couple_index = build_couple_block_index(tuple(couples), division)
    candidates = gather_couple_candidates(parsed_a, row.yob_a, parsed_b, row.yob_b, couple_index, config)
    excluded = rejected_map.get(fp, set())
    scored = []
    for cand in candidates:
        if cand.uid in excluded:
            continue
        score, feats = score_couple_match(
            parsed_a,
            row.yob_a,
            club_norm_a,
            parsed_b,
            row.yob_b,
            club_norm_b,
            cand,
            config,
        )
        scored.append((score, cand, feats))
    scored.sort(key=lambda item: item[0], reverse=True)
    stats.candidate_counts.append(len(scored))

    top: Couple | None = scored[0][1] if scored else None
    top_score = scored[0][0] if scored else 0.0
    top_feats: dict[str, float] = dict(scored[0][2]) if scored else {}
    candidate_uids = tuple(s[1].uid for s in scored[:5])

    strict_team_hits: list[Couple] = []
    strict_team_multi_review = False
    if config.strict_normalized_auto_only:
        strict_team_hits = [
            c
            for c in couples
            if _couple_division_ok(c, division)
            and couple_matches_strict_row(row, gender_a=gender_a, gender_b=gender_b, couple=c)
        ]
        if len(strict_team_hits) == 1:
            top = strict_team_hits[0]
            top_score = 1.0
            top_feats = {"strict_identity_auto": 1.0, "pair_score": 1.0}
            merged_uids = [strict_team_hits[0].uid] + [u for u in candidate_uids if u != strict_team_hits[0].uid]
            candidate_uids = tuple(merged_uids[:5])
        elif len(strict_team_hits) > 1:
            strict_team_multi_review = True
            merged_uids = [c.uid for c in strict_team_hits]
            for uid in candidate_uids:
                if uid not in merged_uids:
                    merged_uids.append(uid)
                if len(merged_uids) >= 5:
                    break
            candidate_uids = tuple(merged_uids[:5])
            score_by_uid = {c.uid: (sc, ft) for sc, c, ft in scored}
            best_c = strict_team_hits[0]
            best_sc = -1.0
            best_ft: dict[str, float] = {}
            for c in strict_team_hits:
                sc, ft = score_by_uid.get(c.uid, (0.0, {}))
                if sc > best_sc:
                    best_sc, best_c, best_ft = sc, c, dict(ft)
            top = best_c
            top_score = best_sc if best_sc >= 0.0 else 0.0
            top_feats = best_ft if best_ft else {"strict_collision": 1.0}

    route = route_from_score(top_score, config) if top is not None else "new_identity"
    meta_route: str
    if top is None:
        meta_route = "new_identity"
    elif strict_team_multi_review:
        meta_route = "review"
    elif route == "auto":
        meta_route = "auto"
    elif route == "review":
        meta_route = "review"
    else:
        meta_route = "new_identity"

    if config.strict_normalized_auto_only and not strict_team_hits and top is not None and meta_route == "auto":
        meta_route = "review"

    if (
        top is not None
        and meta_route == "new_identity"
        and should_review_strong_couple_yob_mismatch(top_score, top_feats, config)
    ):
        meta_route = "review"

    conflict_flags: list[str] = []
    if top is not None and meta_route == "auto":
        prev_entry = used_team_uids.get(top.uid)
        if prev_entry is not None:
            conflict_flags.append(f"team_reused:{top.uid}")
            stats.conflicts += 1
            meta_route = "review"
        else:
            used_team_uids[top.uid] = entry_uid

    candidate_confidences = _couple_row_candidate_confidences(
        row=row,
        parsed_a=parsed_a,
        parsed_b=parsed_b,
        club_norm_a=club_norm_a,
        club_norm_b=club_norm_b,
        config=config,
        couples=tuple(couples),
        scored=scored,
        candidate_uids=candidate_uids,
    )

    if meta_route == "new_identity" or top is None:
        person_a = Person(
            name=row.name_a.strip(),
            yob=row.yob_a,
            gender=gender_a,
            club=row.club_a,
            canonical_given=parsed_a.given,
            canonical_family=parsed_a.family,
            club_normalized=club_norm_a,
        )
        person_b = Person(
            name=row.name_b.strip(),
            yob=row.yob_b,
            gender=gender_b,
            club=row.club_b,
            canonical_given=parsed_b.given,
            canonical_family=parsed_b.family,
            club_normalized=club_norm_b,
        )
        people.append(person_a)
        people.append(person_b)
        team = Couple(member_a=person_a, member_b=person_b)
        couples.append(team)
        meta = RaceEntryMatchMeta(
            route="new_identity",
            confidence=top_score,
            top_candidate_uid=top.uid if top else None,
            candidate_uids=candidate_uids,
            candidate_confidences=candidate_confidences,
            features=top_feats,
            conflict_flags=tuple(conflict_flags),
        )
        new_decisions.append(
            MatchingDecision(
                decided_at=_iso_now(),
                kind="auto",
                row_fingerprint=fp,
                race_event_uid=race_event_uid,
                entry_uid=entry_uid,
                target_team_uid=team.uid,
                feature_scores=top_feats,
            )
        )
        stats.new_identities += 1
        return team, meta

    assert top is not None
    if meta_route == "auto":
        stats.auto_links += 1
    elif meta_route == "review":
        stats.review_queue += 1

    meta = RaceEntryMatchMeta(
        route=meta_route,  # type: ignore[arg-type]
        confidence=top_score,
        top_candidate_uid=top.uid,
        candidate_uids=candidate_uids,
        candidate_confidences=candidate_confidences,
        features=top_feats,
        conflict_flags=tuple(conflict_flags),
    )
    new_decisions.append(
        MatchingDecision(
            decided_at=_iso_now(),
            kind="auto",
            row_fingerprint=fp,
            race_event_uid=race_event_uid,
            entry_uid=entry_uid,
            target_team_uid=top.uid,
            feature_scores=top_feats,
        )
    )
    return top, meta


def process_singles_section(
    document: ProjectDocument,
    section: ParsedSectionSingles,
    source_meta: dict[str, str],
    config: MatchingConfig,
) -> tuple[ProjectDocument, MatchingReport]:
    people = list(document.people)
    decision_index = latest_decisions_by_fingerprint(document.matching_decisions)
    rejected_map = rejected_participant_uids(document.matching_decisions)
    used_candidate_uids: dict[str, str] = {}
    new_decisions: list[MatchingDecision] = []
    stats = _RunStats()

    placeholder = RaceEvent(
        category=RaceSeriesCategory(
            year=section.context.series_year,
            duration=section.context.duration,
            division=section.context.division,
        ),
        race_no=section.context.race_no,
        race_date=section.context.event_date or "",
        source_file=source_meta["source_file"],
        source_sha256=source_meta["source_sha256"],
        imported_at=source_meta["imported_at"],
        parser_version=source_meta["parser_version"],
        schema_fingerprint=source_meta["schema_fingerprint"],
        entries=(),
    )
    race_event_uid = placeholder.race_event_uid

    gender = _gender_for_division(section.context.division)
    entries: list[RaceEntry] = []
    incoming_keys: dict[tuple[str, int, str, str], int] = {}
    for row in section.rows:
        row_key = (row.name.strip().casefold(), int(row.yob or 0), (row.club or "").strip().casefold(), row.startnr.strip())
        incoming_keys[row_key] = incoming_keys.get(row_key, 0) + 1
    duplicate_rows = [
        {"name": key[0], "yob": key[1], "club": key[2], "startnr": key[3], "count": count}
        for key, count in incoming_keys.items()
        if count > 1
    ]
    if duplicate_rows:
        raise ValueError(
            "Importkonflikt: Doppelte Teilnehmerzeile im selben Lauf "
            "(Name/Jahrgang/Verein/Startnr)."
        )

    candidate_people = tuple(document.people)
    for row in section.rows:
        entry = RaceEntry(
            startnr=row.startnr,
            result=EntryResult(distance_km=row.distance_km, points=row.points),
        )
        person, meta = _resolve_person(
            raw_name=row.name,
            yob=row.yob,
            club_raw=row.club,
            gender=gender,
            candidate_people=candidate_people,
            people=people,
            decision_index=decision_index,
            rejected_map=rejected_map,
            used_candidate_uids=used_candidate_uids,
            config=config,
            race_event_uid=race_event_uid,
            entry_uid=entry.entry_uid,
            new_decisions=new_decisions,
            stats=stats,
        )
        entries.append(
            replace(
                entry,
                participant_uid=person.uid,
                match_meta=replace(
                    meta,
                    incoming_display_name=row.name.strip(),
                    incoming_yob=row.yob if row.yob else None,
                    incoming_club=(row.club or "").strip() or None,
                    incoming_kind="participant",
                ),
            )
        )

    event = replace(
        placeholder,
        entries=tuple(entries),
    )
    merged_decisions = tuple([*document.matching_decisions, *new_decisions])
    new_doc = replace(
        document,
        schema_version=SCHEMA_VERSION_V2,
        people=tuple(people),
        events=tuple([*document.events, event]),
        matching_decisions=merged_decisions,
    )
    return new_doc, stats.to_report()


def process_couples_section(
    document: ProjectDocument,
    section: ParsedSectionCouples,
    source_meta: dict[str, str],
    config: MatchingConfig,
) -> tuple[ProjectDocument, MatchingReport]:
    people = list(document.people)
    couples = list(document.couples)
    decision_index = latest_decisions_by_fingerprint(document.matching_decisions)
    rejected_team = rejected_team_uids(document.matching_decisions)
    used_team_uids: dict[str, str] = {}
    new_decisions: list[MatchingDecision] = []
    stats = _RunStats()

    placeholder = RaceEvent(
        category=RaceSeriesCategory(
            year=section.context.series_year,
            duration=section.context.duration,
            division=section.context.division,
        ),
        race_no=section.context.race_no,
        race_date=section.context.event_date or "",
        source_file=source_meta["source_file"],
        source_sha256=source_meta["source_sha256"],
        imported_at=source_meta["imported_at"],
        parser_version=source_meta["parser_version"],
        schema_fingerprint=source_meta["schema_fingerprint"],
        entries=(),
    )
    race_event_uid = placeholder.race_event_uid

    ga, gb = _member_genders_for_couples(section.context.division)
    entries: list[RaceEntry] = []

    for row in section.rows:
        entry = RaceEntry(
            startnr=row.startnr,
            result=EntryResult(distance_km=row.distance_km, points=row.points),
        )
        team, team_meta = _resolve_team_row(
            row=row,
            division=section.context.division,
            gender_a=ga,
            gender_b=gb,
            people=people,
            couples=couples,
            decision_index=decision_index,
            rejected_map=rejected_team,
            used_team_uids=used_team_uids,
            config=config,
            race_event_uid=race_event_uid,
            entry_uid=entry.entry_uid,
            new_decisions=new_decisions,
            stats=stats,
        )

        entries.append(
            replace(
                entry,
                team_uid=team.uid,
                match_meta=replace(
                    team_meta,
                    incoming_display_name=f"{row.name_a.strip()} / {row.name_b.strip()}",
                    incoming_yob=None,
                    incoming_yob_text=(
                        " / ".join([str(value) for value in (row.yob_a, row.yob_b) if value]) or None
                    ),
                    incoming_club=(
                        " / ".join([item.strip() for item in (row.club_a or "", row.club_b or "") if item and item.strip()])
                        or None
                    ),
                    incoming_kind="team",
                ),
            )
        )

    event = replace(placeholder, entries=tuple(entries))
    merged_decisions = tuple([*document.matching_decisions, *new_decisions])
    new_doc = replace(
        document,
        schema_version=SCHEMA_VERSION_V2,
        people=tuple(people),
        couples=tuple(couples),
        events=tuple([*document.events, event]),
        matching_decisions=merged_decisions,
    )
    return new_doc, stats.to_report()
