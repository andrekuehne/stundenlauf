from __future__ import annotations

import unittest

from backend.domain.models import ProjectDocument
from backend.storage.schema_v2 import SCHEMA_VERSION_V2
from backend.ui_api.ranking_display import (
    apply_ranking_exclusions_to_rows,
    merge_ranking_exclusions_after_identity_merge,
    ranking_exclusion_set,
    update_ranking_exclusions,
)


def _row(uid: str, snap_platz: int) -> dict:
    return {
        "platz": snap_platz,
        "entity_uid": uid,
        "entity_kind": "participant",
        "display_name": uid,
        "yob": 1990,
        "club": "",
        "punkte_gesamt": 1.0,
        "distanz_gesamt": 1.0,
        "contribution_by_race": {},
    }


class TestRankingDisplay(unittest.TestCase):
    def test_apply_no_exclusions(self) -> None:
        rows = [_row("a", 1), _row("b", 2)]
        eligible, full = apply_ranking_exclusions_to_rows(rows, frozenset())
        self.assertEqual([r["platz"] for r in eligible], [1, 2])
        self.assertEqual([r["platz"] for r in full], [1, 2])
        self.assertFalse(any(r["ausser_wertung"] for r in full))

    def test_apply_middle_excluded(self) -> None:
        rows = [_row("a", 1), _row("b", 2), _row("c", 3)]
        eligible, full = apply_ranking_exclusions_to_rows(rows, frozenset({"b"}))
        self.assertEqual([r["entity_uid"] for r in eligible], ["a", "c"])
        self.assertEqual([r["platz"] for r in eligible], [1, 2])
        self.assertEqual([r["platz"] for r in full], [1, None, 2])
        self.assertEqual([r["ausser_wertung"] for r in full], [False, True, False])

    def test_apply_all_excluded(self) -> None:
        rows = [_row("a", 1), _row("b", 2)]
        eligible, full = apply_ranking_exclusions_to_rows(rows, frozenset({"a", "b"}))
        self.assertEqual(eligible, [])
        self.assertEqual([r["platz"] for r in full], [None, None])

    def test_ranking_exclusion_set(self) -> None:
        doc = ProjectDocument(
            schema_version=SCHEMA_VERSION_V2,
            ranking_exclusions=(("2026:hour:m", frozenset({"x"})),),
        )
        self.assertEqual(ranking_exclusion_set(doc, "2026:hour:m"), frozenset({"x"}))
        self.assertEqual(ranking_exclusion_set(doc, "other"), frozenset())

    def test_update_ranking_exclusions_toggle(self) -> None:
        cur: tuple[tuple[str, frozenset[str]], ...] = ()
        cur = update_ranking_exclusions(cur, "cat", "u1", True)
        self.assertEqual(cur, (("cat", frozenset({"u1"})),))
        cur = update_ranking_exclusions(cur, "cat", "u1", False)
        self.assertEqual(cur, ())

    def test_merge_ranking_exclusions_conservative(self) -> None:
        cur = (("cat", frozenset({"surv"})),)
        out = merge_ranking_exclusions_after_identity_merge(cur, "cat", "surv", "abs")
        self.assertEqual(out, (("cat", frozenset({"surv"})),))
        cur2 = (("cat", frozenset({"abs"})),)
        out2 = merge_ranking_exclusions_after_identity_merge(cur2, "cat", "surv", "abs")
        self.assertEqual(out2, (("cat", frozenset({"surv"})),))
        cur3 = (("cat", frozenset()),)
        cur3 = update_ranking_exclusions(cur3, "cat", "surv", False)
        out3 = merge_ranking_exclusions_after_identity_merge(cur3, "cat", "surv", "abs")
        self.assertEqual(out3, ())


if __name__ == "__main__":
    unittest.main()
