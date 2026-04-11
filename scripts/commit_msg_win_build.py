"""commit-msg hook: run Windows PyInstaller build when message contains [build]."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

MARKER = "[build]"
SKIP_ENV = "STUNDENLAUF_SKIP_WIN_COMMIT_BUILD"


def main() -> int:
    if os.environ.get(SKIP_ENV, "").strip() in ("1", "true", "yes"):
        return 0
    if len(sys.argv) < 2:
        return 0
    msg_path = Path(sys.argv[1])
    if not msg_path.is_file():
        return 0
    text = msg_path.read_text(encoding="utf-8", errors="replace")
    if MARKER not in text:
        return 0

    root = Path(__file__).resolve().parents[1]
    return subprocess.run(
        ["uv", "run", "--group", "dev", "build_windows", "--noconfirm"],
        cwd=root,
        check=False,
    ).returncode


if __name__ == "__main__":
    raise SystemExit(main())
