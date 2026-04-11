"""Invoke PyInstaller for the Windows onedir build (see pyproject console script)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    spec = root / "win_bundle" / "stundenlauf_windows.spec"
    work = root / "win_bundle" / "build"
    dist = root / "win_bundle" / "dist"

    argv = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--workpath",
        str(work),
        "--distpath",
        str(dist),
        *sys.argv[1:],
        str(spec),
    ]
    raise SystemExit(subprocess.call(argv))


if __name__ == "__main__":
    main()
