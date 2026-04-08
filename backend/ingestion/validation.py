from __future__ import annotations

from dataclasses import dataclass

from backend.ingestion.types import IssueLocation, ValidationIssue


@dataclass(frozen=True)
class ImportValidationError(ValueError):
    issues: tuple[ValidationIssue, ...]

    def __str__(self) -> str:
        if not self.issues:
            return "Import validation failed."
        first = self.issues[0]
        return (
            f"{first.message_de} "
            f"(sheet={first.location.sheet}, row={first.location.row}, col={first.location.column})"
        )


def make_issue(code: str, message_de: str, sheet: str, row: int, column: str) -> ValidationIssue:
    return ValidationIssue(code=code, message_de=message_de, location=IssueLocation(sheet=sheet, row=row, column=column))
