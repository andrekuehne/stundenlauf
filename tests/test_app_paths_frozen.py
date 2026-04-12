from __future__ import annotations

import unittest
from pathlib import Path
from unittest import mock

from backend import app_paths


class TestProjectRootDirFrozen(unittest.TestCase):
    def test_development_uses_source_tree(self) -> None:
        root = app_paths.project_root_dir()
        self.assertTrue((root / "frontend" / "index.html").is_file())
        self.assertTrue((root / "backend" / "app_paths.py").is_file())

    def test_frozen_uses_meipass(self) -> None:
        fake_meipass = Path("/fake/_MEIPASS")
        with (
            mock.patch.object(app_paths.sys, "frozen", True, create=True),
            mock.patch.object(app_paths.sys, "_MEIPASS", str(fake_meipass), create=True),
        ):
            self.assertEqual(app_paths.project_root_dir(), fake_meipass)

    def test_frozen_without_meipass_falls_back(self) -> None:
        with (
            mock.patch.object(app_paths.sys, "frozen", True, create=True),
            mock.patch.object(app_paths.sys, "_MEIPASS", None, create=True),
        ):
            root = app_paths.project_root_dir()
        self.assertTrue((root / "frontend" / "index.html").is_file())


if __name__ == "__main__":
    unittest.main()
