---
name: PyInstaller splash packaging
overview: "Windows PyInstaller build with bootloader splash (pyi_splash), frozen asset paths, optional onefile target, Inno Setup installer, and GitHub Actions CI producing artifacts."
todos:
  - id: choose-packaging-shape
    content: "Confirm primary target: PyInstaller onedir (A) vs onefile (B); note if Nuitka/cx_Freeze is a later track"
    status: pending
  - id: frozen-project-root
    content: "Update backend/app_paths.py for sys._MEIPASS when frozen; add unit test with mocks"
    status: pending
  - id: pyi-splash-close
    content: "Wire pyi_splash.close() on webview window.events.loaded in backend/ui_app.py (try/except ImportError)"
    status: pending
  - id: pyinstaller-artifacts
    content: "Add frozen GUI entry module + .spec (splash, datas=frontend, excludes), optional uv dev dependency group + README build steps"
    status: pending
  - id: installer-inno
    content: "Add Inno Setup script (.iss) bundling onedir output; document local iscc build; optional WebView2 prerequisite note in installer text"
    status: pending
  - id: ci-windows-build
    content: "GitHub Actions windows-latest job — uv sync, PyInstaller, optional ISCC; upload dist zip and/or Setup.exe as artifacts"
    status: pending
  - id: docs-accomplishments
    content: "Add docs/features/F22 plan, ACCOMPLISHMENTS entry, optional PROJECT_PLAN M5 note"
    status: pending
isProject: false
---

# PyInstaller splash + standalone packaging (+ installer + CI)

## Requirement / milestone mapping

- Supports **[M5](PROJECT_PLAN.md)** (hardening, first production use) and **[F05](PROJECT_PLAN.md)** (desktop GUI): distributable Windows build, installer UX, reproducible CI artifacts, and clearer startup feedback during cold start (especially onefile extraction).

## Packaging options (choose one primary)

| Option | What you get | Tradeoffs | Splash (option 3) |
|--------|----------------|-----------|-------------------|
| **A – PyInstaller one-folder (`onedir`)** | `Stundenlauf.exe` + `_internal/` tree | Larger on disk; **fastest startup**; easy to inspect logs/patch | **Yes** – [`--splash`](https://pyinstaller.org/en/stable/usage.html#cmdoption-splash) + `pyi_splash.close()` |
| **B – PyInstaller one-file (`onefile`)** | Single `.exe` | **Slower cold start** (extract to temp); simpler handoff | **Yes** – splash is most valuable here (unpack progress text) |
| **C – Nuitka** | Compiled binary | Steeper config | **No `pyi_splash`** |
| **D – cx_Freeze** | Similar to PyInstaller | Less common for pywebview | **No built-in bootloader splash** |

**Recommendation:** **A (onedir)** as default; installer wraps the whole folder. Optional **B** spec or CI matrix job if you want a single-file artifact.

PyInstaller splash is **Windows/Linux only**; **not supported on macOS** (Tcl/Tk). Document Windows-first.

---

## Architecture (frozen app)

```mermaid
flowchart LR
  bootloader[PyInstaller bootloader]
  splash[TclTk splash image]
  python[Python main]
  webview[pywebview EdgeChromium]
  bootloader --> splash
  splash --> python
  python --> webview
  python -->|pyi_splash.close| splash
```

---

## Code changes (minimal)

1. **[`backend/app_paths.py`](backend/app_paths.py)** — When `getattr(sys, "frozen", False)`, resolve static bundle root via `Path(sys._MEIPASS)`; keep `default_workspace_dir()` unchanged.

2. **[`backend/ui_app.py`](backend/ui_app.py)** — On `window.events.loaded`, `try: import pyi_splash; pyi_splash.close()` except `ImportError`.

3. **Frozen entry** — Small module (e.g. [`packaging/gui_entry.py`](packaging/gui_entry.py)) that only calls `stundenlauf_gui()`; PyInstaller `Analysis` entry.

4. **PyInstaller spec** — `datas` for [`frontend/`](frontend/); `collect_submodules` for `backend` / `webview` as needed; `excludes` for `pytest`, `ipykernel`; `--splash` → [`assets/splash_tri_hgwaii.png`](assets/splash_tri_hgwaii.png); `console=False` for release, optional debug spec with console.

5. **`pyproject.toml`** — `pyinstaller` in dev / optional group; README build commands via `uv run`.

**Prerequisite:** Microsoft **WebView2 Runtime** (Evergreen) on target machines — note in README and installer text.

---

## Installer (primary: Inno Setup)

**Goal:** One downloadable `Stundenlauf-Setup-x.y.z.exe` that installs the **onedir** output (exe + `_internal`), Start Menu shortcut, uninstaller, and optional license/readme pages.

- Add **[`packaging/stundenlauf.iss`](packaging/stundenlauf.iss)** (or under `installer/`) parameterized with:
  - Source: PyInstaller `dist/Stundenlauf/*` (app name/version from `#define` or `!define` matching `pyproject.toml`).
  - `DefaultDirName` under `{autopf}` or `{localappdata}` (pick one; `{autopf}` is typical for desktop apps).
  - Shortcut to main exe; include `uninstall` registry keys for clean removal.
- **Local build:** Install [Inno Setup](https://jrsoftware.org/isinfo.php); run `ISCC.exe packaging\stundenlauf.iss` after PyInstaller (document exact order in README).
- **Alternatives (document only unless you switch):** **WiX** (MSI, more XML/heat), **MSIX** (store/sideload, signing-heavy). Inno is the lowest-friction default for this stack.

**Signing (optional phase 2):** Document that authenticode signing requires a cert + secret; CI can use `signtool` when `WINDOWS_CERT_*` secrets exist — not required for first CI green build.

---

## CI (GitHub Actions)

**Goal:** Every push/PR (or `workflow_dispatch` + tags only — configurable) builds on **`windows-latest`** and uploads artifacts.

Suggested workflow **[`.github/workflows/windows-build.yml`](.github/workflows/windows-build.yml)**:

1. Checkout.
2. Install **uv** (official action or `curl` bootstrap).
3. `uv sync --group dev` (or equivalent) to get PyInstaller + app deps.
4. Run PyInstaller against the spec (e.g. `uv run pyinstaller packaging/stundenlauf_windows.spec`).
5. **Optional same job:** Install Inno Setup via **chocolatey** `choco install innosetup -y` or **Scoop**, then run `& 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe' packaging\stundenlauf.iss`.
6. **`actions/upload-artifact`**:
   - `stundenlauf-ondir.zip` — zip `dist/Stundenlauf` (faster to download than loose tree).
   - If installer built: `Stundenlauf-Setup-*.exe` as second artifact.

**Triggers:** Recommend **`workflow_dispatch`** + **`push` to `main` with paths filter** (`packaging/**`, `backend/**`, `frontend/**`, `pyproject.toml`, workflow file) to save minutes; add **`release` tag** workflow later if you want published releases.

**Not in v1 unless requested:** macOS/Linux matrix, notarization, nightly builds.

---

## Documentation and project workflow

- [`docs/features/F22-windows-pyinstaller-packaging.md`](docs/features/F22-windows-pyinstaller-packaging.md) — assumptions, risks, local + CI build, WebView2, installer steps.
- [`README.md`](README.md) — short “Building the Windows app” section.
- [`docs/ACCOMPLISHMENTS.md`](docs/ACCOMPLISHMENTS.md) — outcome entry when shipped.
- Optional **M5** line in [`PROJECT_PLAN.md`](PROJECT_PLAN.md).

---

## Tests

- Unit test: mock `sys.frozen` / `sys._MEIPASS` for bundle root resolution.
- Manual / CI smoke: launch built exe (CI can run a minimal “`--help`” or a short timeout launch test only if stable; otherwise manual UAT).

---

## Resolved scope note

Installer (**Inno Setup**) and **CI** are **in scope** for this plan as specified above, not deferred follow-ups.
