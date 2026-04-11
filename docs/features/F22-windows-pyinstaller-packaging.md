# F22 – Windows PyInstaller packaging (onedir + splash)

## Overview

- Feature name: F22 Windows PyInstaller packaging
- Owner: Project
- Status: Done
- Related requirement(s): R7, R8
- Related milestone(s): M5

## Problem Statement

Organizers need a standalone Windows build of the desktop app without installing Python, and a visible splash during cold start (especially while dependencies load).

## Scope

### In Scope

- PyInstaller **onedir** build (default): `Stundenlauf.exe` plus bundled `_internal` tree under `win_bundle/dist/Stundenlauf/`.
- Experimental PyInstaller **bootloader splash** (`--splash` / `Splash` in spec) using `assets/splash_tri_hgwaii.png`; dismiss via `pyi_splash.close()` when the pywebview window fires `loaded`.
- Frozen resource root via `sys._MEIPASS` so `frontend/` resolves inside the bundle.
- Dev dependency group `dev` includes `pyinstaller` and `pre-commit`; documented build commands in README.
- Optional **pre-commit** `commit-msg` hook: if the commit message contains `[build]`, runs `build_windows` (see `.pre-commit-config.yaml`, `scripts/commit_msg_win_build.py`).
- **Inno Setup** installer script [`installer/Stundenlauf.iss`](../../installer/Stundenlauf.iss) (output under `installer/output/`).
- **GitHub Actions** [`.github/workflows/windows-build.yml`](../../.github/workflows/windows-build.yml): runs on **`push` of tags `v*`** only; PyInstaller + ISCC + `upload-artifact` (setup exe + portable folder).

### Out of Scope

- **One-file** (`onefile`) spec variant (can be added later).
- **macOS** splash: PyInstaller splash is not supported on macOS (Tcl/Tk limitation).
- **Code signing** / **MSIX** (optional follow-ups).

## Acceptance Criteria

- [x] `uv sync --group dev` then documented `pyinstaller` command produces a runnable `Stundenlauf.exe`.
- [x] Frozen app finds `frontend/index.html` via `project_root_dir()`.
- [x] Under PyInstaller, splash closes after main window load; normal `uv run gui` unchanged (no `pyi_splash`).
- [x] Unit tests cover frozen path resolution.

## Technical Plan

- **Architecture:** Entry script [`win_bundle/gui_entry.py`](../../win_bundle/gui_entry.py) calls `stundenlauf_gui()`. Spec [`win_bundle/stundenlauf_windows.spec`](../../win_bundle/stundenlauf_windows.spec) sets `pathex` to repo root, bundles `frontend/` as data, `collect_submodules('backend')`, excludes pytest/ipython stack where listed. PyInstaller’s bundled `hook-webview` collects pywebview assets; avoid merging `collect_all('webview')` into `Analysis.binaries` (PyInstaller 6 TOC tuples break `Splash` / `COLLECT`). The folder is named `win_bundle` (not `packaging`) to avoid clashing with the PyPI `packaging` library on `sys.path`.
- **Runtime:** [`backend/app_paths.py`](../../backend/app_paths.py) uses `_MEIPASS` when `sys.frozen`.
- **Splash:** [`backend/ui_app.py`](../../backend/ui_app.py) registers `window.events.loaded += _close_pyi_splash`.

## Risks and Assumptions

- **Assumption:** Target PCs have **Microsoft Edge WebView2 Runtime** (Evergreen); required for `gui="edgechromium"`.
- **Risk:** Large bundle (pandas, reportlab, etc.).
  - **Mitigation:** onedir avoids repeated onefile extraction; optional excludes in spec.

## Implementation Steps

1. `project_root_dir()` frozen branch + tests.
2. `pyi_splash.close()` on `loaded`.
3. `win_bundle/gui_entry.py` + `stundenlauf_windows.spec` + `dependency-groups dev`.
4. README + accomplishments + plan references.

## Test Plan

- **Unit:** `tests/test_app_paths_frozen.py`.
- **Manual:** Run `win_bundle/dist/Stundenlauf/Stundenlauf.exe`; confirm splash then GUI; open season / import smoke.
- **Rollback:** Remove spec and entry script; revert `app_paths` / `ui_app` if packaging abandoned.

## Packaging shape (confirmed)

- **Primary:** PyInstaller **onedir** (option A). **Onefile** (option B) remains a future optional spec.
