from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.domain.enums import Division, Gender, RaceDuration
from backend.domain.models import (
    Couple,
    EntryResult,
    Person,
    ProjectDocument,
    RaceEntry,
    RaceEvent,
    RaceSeriesCategory,
)
from backend.ranking.aggregation import sum_top_n_or_all_points_and_distance
from backend.ranking.engine import compute_standings_snapshot, recompute_project_standings
from backend.ranking.rules import RULESET_V1_LEGACY_TOP4
from backend.storage.repository import JsonProjectRepository
from backend.storage.schema_v2 import SCHEMA_VERSION_V2, from_dict, to_dict


def _cat(year: int = 2026) -> RaceSeriesCategory:
    return RaceSeriesCategory(year=year, duration=RaceDuration.HOUR, division=Division.MEN)


class TestF04Aggregation(unittest.TestCase):
    def test_top4_all_available_when_count_le_4(self) -> None:
        rows = (("e1", 10.0, 1.1), ("e2", 5.0, 2.2), ("e3", 1.0, 3.3))
        agg = sum_top_n_or_all_points_and_distance(rows, n=4)
        self.assertAlmostEqual(agg.punkte_gesamt, 16.0)
        self.assertAlmostEqual(agg.distanz_gesamt, round(1.1 + 2.2 + 3.3, 3))
        self.assertEqual(len(agg.dropped_race_event_uids), 0)

    def test_top4_only_best_values_when_count_gt_4(self) -> None:
        rows = (
            ("a", 1.0, 10.0),
            ("b", 50.0, 1.0),
            ("c", 40.0, 2.0),
            ("d", 30.0, 3.0),
            ("e", 20.0, 4.0),
        )
        agg = sum_top_n_or_all_points_and_distance(rows, n=4)
        self.assertAlmostEqual(agg.punkte_gesamt, 50 + 40 + 30 + 20)
        self.assertEqual(agg.dropped_race_event_uids, ("a",))

    def test_top4_tie_breaker_uses_race_event_uid(self) -> None:
        rows = (
            ("z_last", 10.0, 1.0),
            ("m_mid", 10.0, 2.0),
            ("a_first", 10.0, 3.0),
            ("b_fourth", 9.0, 4.0),
            ("c_fifth", 8.0, 5.0),
        )
        agg = sum_top_n_or_all_points_and_distance(rows, n=4)
        # All three 10-point races tie: sort by (-points, uid) -> a_first, m_mid, z_last, then b_fourth
        self.assertEqual(
            set(agg.selected_race_event_uids),
            {"a_first", "m_mid", "z_last", "b_fourth"},
        )
        self.assertEqual(agg.dropped_race_event_uids, ("c_fifth",))

    def test_distance_total_rounded_to_3_decimals(self) -> None:
        rows = (("e1", 1.0, 1.234), ("e2", 1.0, 2.345))
        agg = sum_top_n_or_all_points_and_distance(rows, n=4)
        self.assertAlmostEqual(agg.distanz_gesamt, round(1.234 + 2.345, 3))


class TestF04RankingEngine(unittest.TestCase):
    def test_rank_sorts_by_points_desc_then_distance_desc(self) -> None:
        c = _cat()
        p_high_pts = Person(uid="p_hi", name="A", yob=1990, gender=Gender.M)
        p_tie_pts = Person(uid="p_lo", name="B", yob=1991, gender=Gender.M)
        events = (
            RaceEvent(
                race_event_uid="r1",
                category=c,
                race_date="2026-01-01",
                entries=(RaceEntry(participant_uid="p_hi", result=EntryResult(100.0, 10.0)),),
            ),
            RaceEvent(
                race_event_uid="r2",
                category=c,
                race_date="2026-02-01",
                entries=(RaceEntry(participant_uid="p_lo", result=EntryResult(200.0, 10.0)),),
            ),
        )
        doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p_high_pts, p_tie_pts), events=events)
        snap = compute_standings_snapshot(doc)
        table = snap.category_tables[0]
        self.assertEqual(table.rows[0].entity_uid, "p_lo")
        self.assertEqual(table.rows[1].entity_uid, "p_hi")

    def test_rank_assigns_sequential_places_starting_at_1(self) -> None:
        c = _cat()
        p1 = Person(uid="p1", name="A", yob=1990, gender=Gender.M)
        p2 = Person(uid="p2", name="B", yob=1991, gender=Gender.M)
        events = (
            RaceEvent(
                race_event_uid="r1",
                category=c,
                race_date="2026-01-01",
                entries=(
                    RaceEntry(participant_uid="p1", result=EntryResult(1.0, 5.0)),
                    RaceEntry(participant_uid="p2", result=EntryResult(2.0, 3.0)),
                ),
            ),
        )
        doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p1, p2), events=events)
        snap = compute_standings_snapshot(doc)
        places = [r.platz for r in snap.category_tables[0].rows]
        self.assertEqual(places, [1, 2])

    def test_rank_is_deterministic_for_equal_sort_keys(self) -> None:
        c = _cat()
        p1 = Person(uid="p_a", name="A", yob=1990, gender=Gender.M)
        p2 = Person(uid="p_b", name="B", yob=1991, gender=Gender.M)
        events = (
            RaceEvent(
                race_event_uid="r1",
                category=c,
                race_date="2026-01-01",
                entries=(
                    RaceEntry(participant_uid="p_a", result=EntryResult(10.0, 5.0)),
                    RaceEntry(participant_uid="p_b", result=EntryResult(10.0, 5.0)),
                ),
            ),
        )
        doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p1, p2), events=events)
        s1 = compute_standings_snapshot(doc)
        s2 = compute_standings_snapshot(doc)
        uids1 = [r.entity_uid for r in s1.category_tables[0].rows]
        uids2 = [r.entity_uid for r in s2.category_tables[0].rows]
        self.assertEqual(uids1, uids2)

    def test_category_isolation_for_standings(self) -> None:
        c_men = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.MEN)
        c_women = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.WOMEN)
        pm = Person(uid="pm", name="M", yob=1990, gender=Gender.M)
        pw = Person(uid="pw", name="W", yob=1990, gender=Gender.F)
        events = (
            RaceEvent(
                race_event_uid="rm",
                category=c_men,
                race_date="2026-01-01",
                entries=(RaceEntry(participant_uid="pm", result=EntryResult(1.0, 10.0)),),
            ),
            RaceEvent(
                race_event_uid="rw",
                category=c_women,
                race_date="2026-01-01",
                entries=(RaceEntry(participant_uid="pw", result=EntryResult(2.0, 20.0)),),
            ),
        )
        doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(pm, pw), events=events)
        snap = compute_standings_snapshot(doc)
        keys = {t.category_key for t in snap.category_tables}
        self.assertEqual(keys, {c_men.key, c_women.key})

    def test_pairs_use_team_uid(self) -> None:
        cat = RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.COUPLES_MIXED)
        a = Person(uid="pa", name="A", yob=1988, gender=Gender.M)
        b = Person(uid="pb", name="B", yob=1990, gender=Gender.F)
        team = Couple(uid="team_x", member_a=a, member_b=b)
        events = (
            RaceEvent(
                race_event_uid="rc",
                category=cat,
                race_date="2026-01-01",
                entries=(RaceEntry(team_uid="team_x", result=EntryResult(5.5, 7.0)),),
            ),
        )
        doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(a, b), couples=(team,), events=events)
        snap = compute_standings_snapshot(doc)
        self.assertEqual(snap.category_tables[0].rows[0].entity_kind, "team")
        self.assertEqual(snap.category_tables[0].rows[0].entity_uid, "team_x")


class TestF04Integration(unittest.TestCase):
    def test_standings_schema_roundtrip(self) -> None:
        c = _cat()
        p = Person(uid="p1", name="A", yob=1990, gender=Gender.M)
        events = (
            RaceEvent(
                race_event_uid="r1",
                category=c,
                race_date="2026-01-01",
                entries=(RaceEntry(participant_uid="p1", result=EntryResult(1.0, 2.0)),),
            ),
        )
        doc = recompute_project_standings(ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p,), events=events))
        self.assertIsNotNone(doc.standings)
        roundtrip = from_dict(to_dict(doc))
        self.assertEqual(roundtrip.standings, doc.standings)

    def test_recalculation_after_race_rollback_removes_contribution(self) -> None:
        c = _cat()
        p = Person(uid="p1", name="A", yob=1990, gender=Gender.M)
        e1 = RaceEvent(
            race_event_uid="race_keep",
            category=c,
            race_date="2026-01-01",
            entries=(RaceEntry(participant_uid="p1", result=EntryResult(10.0, 5.0)),),
        )
        e2 = RaceEvent(
            race_event_uid="race_drop",
            category=c,
            race_date="2026-02-01",
            entries=(RaceEntry(participant_uid="p1", result=EntryResult(20.0, 7.0)),),
        )
        doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p,), events=(e1, e2))
        doc = recompute_project_standings(doc)
        before = doc.standings
        assert before is not None
        # EntryResult(distance_km, points): 5 + 7 = 12
        self.assertAlmostEqual(before.category_tables[0].rows[0].punkte_gesamt, 12.0)

        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "project.json"
            repo = JsonProjectRepository(path)
            repo.save(doc)
            loaded = repo.load()
            rolled = repo.mark_event_rolled_back(loaded, "race_drop", "test", "fix")
            snap = rolled.standings
            assert snap is not None
            self.assertAlmostEqual(snap.category_tables[0].rows[0].punkte_gesamt, 5.0)

    def test_recompute_project_standings_ruleset_constant(self) -> None:
        doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2)
        out = recompute_project_standings(doc, ruleset_version=RULESET_V1_LEGACY_TOP4)
        assert out.standings is not None
        self.assertEqual(out.standings.ruleset_version, RULESET_V1_LEGACY_TOP4)

    def test_migration_v1_payload_gets_standings_key(self) -> None:
        from backend.storage.migrations import migrate_to_supported

        payload = {"schema_version": 1, "people": [], "couples": [], "events": []}
        migrated = migrate_to_supported(payload)
        self.assertIn("standings", migrated)


if __name__ == "__main__":
    unittest.main()
