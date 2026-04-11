"""PyInstaller entry: launch desktop GUI only (no CLI argparse)."""

from __future__ import annotations

from main import stundenlauf_gui


def main() -> None:
    stundenlauf_gui()


if __name__ == "__main__":
    main()
