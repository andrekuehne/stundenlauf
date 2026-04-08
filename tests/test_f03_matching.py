from __future__ import annotations

import unittest

from backend.domain.enums import Gender
from backend.domain.models import Couple, MatchingDecision, Person, ProjectDocument
from backend.matching.config import MatchingConfig
from backend.matching.decisions import identity_fingerprint, latest_decisions_by_fingerprint, team_fingerprint
from backend.matching.normalize import parse_person_name
from backend.matching.score import person_parsed, route_from_score, score_person_match
from backend.matching.teams import score_couple_match
from backend.storage.schema_v2 import SCHEMA_VERSION_V2


class TestF03Normalization(unittest.TestCase):
    def test_title_stripped_for_matching_tokens(self) -> None:
        a = parse_person_name("Dr. Anna Meyer")
        b = parse_person_name("Anna Meyer")
        self.assertEqual(a.tokens, b.tokens)

    def test_comma_vs_space_order(self) -> None:
        a = parse_person_name("Meyer, Anna")
        b = parse_person_name("Anna Meyer")
        self.assertEqual(a.tokens, b.tokens)


class TestF03Fingerprints(unittest.TestCase):
    def test_swapped_name_same_fingerprint(self) -> None:
        pa = parse_person_name("Anna Meyer")
        pb = parse_person_name("Meyer Anna")
        fa = identity_fingerprint(pa, 1990, Gender.F)
        fb = identity_fingerprint(pb, 1990, Gender.F)
        self.assertEqual(fa, fb)

    def test_team_fingerprint_order_invariant(self) -> None:
        a1 = parse_person_name("Max Mustermann")
        b1 = parse_person_name("Eva Beispiel")
        a2 = parse_person_name("Eva Beispiel")
        b2 = parse_person_name("Max Mustermann")
        t1 = team_fingerprint(a1, 1988, Gender.M, b1, 1990, Gender.F)
        t2 = team_fingerprint(a2, 1990, Gender.F, b2, 1988, Gender.M)
        self.assertEqual(t1, t2)


class TestF03Scoring(unittest.TestCase):
    def test_typo_still_scores_high(self) -> None:
        cfg = MatchingConfig()
        inc = parse_person_name("Jonas Schmidt")
        cand = Person(name="Jonaas Schmidt", yob=1991, gender=Gender.M, club="TSV")
        score, feats = score_person_match(inc, 1991, "tsv", cand, cfg)
        self.assertGreater(score, cfg.review_min)

    def test_yob_mismatch_hurts(self) -> None:
        cfg = MatchingConfig()
        inc = parse_person_name("Anna Meyer")
        cand = Person(name="Anna Meyer", yob=1999, gender=Gender.F)
        score, _feats = score_person_match(inc, 1990, "", cand, cfg)
        self.assertLess(score, cfg.auto_min)

    def test_route_thresholds(self) -> None:
        cfg = MatchingConfig()
        self.assertEqual(route_from_score(0.95, cfg), "auto")
        self.assertEqual(route_from_score(0.80, cfg), "review")
        self.assertEqual(route_from_score(0.50, cfg), "new_identity")


class TestF03PairMatching(unittest.TestCase):
    def test_reversed_member_order_same_score(self) -> None:
        cfg = MatchingConfig()
        inc_a = parse_person_name("Max M")
        inc_b = parse_person_name("Eva E")
        t1 = Couple(
            uid="t1",
            member_a=Person(name="Max M", yob=1988, gender=Gender.M),
            member_b=Person(name="Eva E", yob=1990, gender=Gender.F),
        )
        t2 = Couple(
            uid="t2",
            member_a=Person(name="Eva E", yob=1990, gender=Gender.F),
            member_b=Person(name="Max M", yob=1988, gender=Gender.M),
        )
        s1, _ = score_couple_match(inc_a, 1988, "", inc_b, 1990, "", t1, cfg)
        s2, _ = score_couple_match(inc_a, 1988, "", inc_b, 1990, "", t2, cfg)
        self.assertAlmostEqual(s1, s2, places=3)


class TestF03DecisionReplay(unittest.TestCase):
    def test_latest_decision_wins(self) -> None:
        d1 = MatchingDecision(
            decided_at="2026-01-01T00:00:00+00:00",
            row_fingerprint="fp1",
            kind="manual_link",
            target_participant_uid="p1",
        )
        d2 = MatchingDecision(
            decided_at="2026-02-01T00:00:00+00:00",
            row_fingerprint="fp1",
            kind="manual_link",
            target_participant_uid="p2",
        )
        idx = latest_decisions_by_fingerprint((d1, d2))
        self.assertEqual(idx["fp1"].target_participant_uid, "p2")


class TestF03PersonParsed(unittest.TestCase):
    def test_canonical_fields_override_raw_name(self) -> None:
        p = Person(
            uid="x",
            name="Display",
            yob=1990,
            gender=Gender.M,
            canonical_given="max",
            canonical_family="mustermann",
        )
        parsed = person_parsed(p)
        self.assertEqual(parsed.family, "mustermann")


class TestF03ProjectDocumentSchema(unittest.TestCase):
    def test_empty_project_is_v2(self) -> None:
        doc = ProjectDocument(schema_version=SCHEMA_VERSION_V2)
        self.assertEqual(doc.schema_version, SCHEMA_VERSION_V2)
        self.assertEqual(doc.matching_decisions, ())


if __name__ == "__main__":
    unittest.main()
