from __future__ import annotations

import unittest

from backend.domain.enums import Division, Gender, RaceDuration
from backend.domain.identity_merge import (
    collect_referenced_person_uids,
    merge_identities,
    participation_race_uids_for_category,
    validate_entity_kind_matches_uid,
)
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
from backend.storage.schema_v2 import SCHEMA_VERSION_V2


def _cat(year: int = 2026) -> RaceSeriesCategory:
    return RaceSeriesCategory(year=year, duration=RaceDuration.HOUR, division=Division.MEN)


class TestF16IdentityMerge(unittest.TestCase):
    def test_participation_race_uids_category_scoped(self) -> None:
        ck = _cat().key
        p_a = Person(uid="p_a", name="A", yob=1980, gender=Gender.M)
        p_b = Person(uid="p_b", name="B", yob=1981, gender=Gender.M)
        ev1 = RaceEvent(
            race_event_uid="r1",
            category=_cat(),
            entries=(RaceEntry(participant_uid="p_a", result=EntryResult(1.0, 1.0)),),
        )
        ev2 = RaceEvent(
            race_event_uid="r2",
            category=_cat(),
            entries=(RaceEntry(participant_uid="p_b", result=EntryResult(2.0, 2.0)),),
        )
        doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p_a, p_b), events=(ev1, ev2))
        self.assertEqual(participation_race_uids_for_category(doc, ck, "p_a", "participant"), frozenset({"r1"}))
        self.assertEqual(participation_race_uids_for_category(doc, ck, "p_b", "participant"), frozenset({"r2"}))

    def test_merge_singles_rewires_and_removes_absorbed(self) -> None:
        p_s = Person(uid="p_s", name="Survivor", yob=1980, gender=Gender.M)
        p_a = Person(uid="p_a", name="Absorbed", yob=1980, gender=Gender.M)
        ev1 = RaceEvent(
            race_event_uid="r1",
            category=_cat(),
            entries=(RaceEntry(entry_uid="e1", participant_uid="p_s", result=EntryResult(1.0, 1.0)),),
        )
        ev2 = RaceEvent(
            race_event_uid="r2",
            category=_cat(),
            entries=(RaceEntry(entry_uid="e2", participant_uid="p_a", result=EntryResult(2.0, 2.0)),),
        )
        dec = MatchingDecision(
            kind="manual_link",
            target_participant_uid="p_a",
            row_fingerprint="fp",
            race_event_uid="r2",
            entry_uid="e2",
        )
        doc = ProjectDocument(
            schema_version=SCHEMA_VERSION_V2,
            people=(p_s, p_a),
            events=(ev1, ev2),
            matching_decisions=(dec,),
        )
        merged, n = merge_identities(doc, "p_s", "p_a", "participant")
        self.assertEqual(n, 1)
        uids = {e.entries[0].participant_uid for e in merged.events}
        self.assertEqual(uids, {"p_s"})
        self.assertFalse(any(p.uid == "p_a" for p in merged.people))
        self.assertEqual(merged.matching_decisions[0].target_participant_uid, "p_s")

    def test_merge_remaps_match_meta_candidates(self) -> None:
        p_s = Person(uid="p_s", name="S", yob=1980, gender=Gender.M)
        p_a = Person(uid="p_a", name="A", yob=1980, gender=Gender.M)
        meta = RaceEntryMatchMeta(
            top_candidate_uid="p_a",
            candidate_uids=("p_x", "p_a"),
        )
        ev = RaceEvent(
            race_event_uid="r1",
            category=_cat(),
            entries=(
                RaceEntry(
                    participant_uid="p_a",
                    result=EntryResult(1.0, 1.0),
                    match_meta=meta,
                ),
            ),
        )
        doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p_s, p_a), events=(ev,))
        merged, _ = merge_identities(doc, "p_s", "p_a", "participant")
        m = merged.events[0].entries[0].match_meta
        self.assertIsNotNone(m)
        assert m is not None
        self.assertEqual(m.top_candidate_uid, "p_s")
        self.assertEqual(m.candidate_uids, ("p_x", "p_s"))

    def test_merge_teams_and_prunes_orphan_members(self) -> None:
        m_s_a = Person(uid="m_sa", name="A1", yob=1980, gender=Gender.M)
        m_s_b = Person(uid="m_sb", name="B1", yob=1981, gender=Gender.M)
        m_a_a = Person(uid="m_aa", name="A2", yob=1980, gender=Gender.M)
        m_a_b = Person(uid="m_ab", name="B2", yob=1981, gender=Gender.M)
        team_s = Couple(uid="t_s", member_a=m_s_a, member_b=m_s_b)
        team_a = Couple(uid="t_a", member_a=m_a_a, member_b=m_a_b)
        ev = RaceEvent(
            race_event_uid="r1",
            category=RaceSeriesCategory(year=2026, duration=RaceDuration.HOUR, division=Division.COUPLES_MIXED),
            entries=(
                RaceEntry(team_uid="t_s", result=EntryResult(1.0, 1.0)),
                RaceEntry(team_uid="t_a", result=EntryResult(2.0, 2.0)),
            ),
        )
        doc = ProjectDocument(
            schema_version=SCHEMA_VERSION_V2,
            people=(m_s_a, m_s_b, m_a_a, m_a_b),
            couples=(team_s, team_a),
            events=(ev,),
        )
        merged, n = merge_identities(doc, "t_s", "t_a", "team")
        self.assertEqual(n, 1)
        teams = {c.uid for c in merged.couples}
        self.assertEqual(teams, {"t_s"})
        ent = merged.events[0].entries
        self.assertEqual({ent[0].team_uid, ent[1].team_uid}, {"t_s"})
        refs = collect_referenced_person_uids(merged)
        self.assertIn("m_sa", refs)
        self.assertIn("m_sb", refs)
        self.assertNotIn("m_aa", refs)
        self.assertNotIn("m_ab", refs)

    def test_validate_entity_kind_matches_uid(self) -> None:
        p = Person(uid="p1", name="X", yob=1980, gender=Gender.M)
        doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p,))
        validate_entity_kind_matches_uid(doc, "p1", "participant")
        with self.assertRaises(ValueError):
            validate_entity_kind_matches_uid(doc, "missing", "participant")

    def test_merge_unknown_absorbed_raises(self) -> None:
        p = Person(uid="p1", name="X", yob=1980, gender=Gender.M)
        doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2, people=(p,))
        with self.assertRaises(ValueError):
            merge_identities(doc, "p1", "p_missing", "participant")


if __name__ == "__main__":
    unittest.main()
