from __future__ import annotations

from enum import StrEnum


class Gender(StrEnum):
    M = "M"
    F = "F"
    X = "X"


class RaceDuration(StrEnum):
    HALF_HOUR = "half_hour"
    HOUR = "hour"


class Division(StrEnum):
    MEN = "men"
    WOMEN = "women"
    COUPLES_MEN = "couples_men"
    COUPLES_WOMEN = "couples_women"
    COUPLES_MIXED = "couples_mixed"


class RaceEventState(StrEnum):
    ACTIVE = "active"
    ROLLED_BACK = "rolled_back"
