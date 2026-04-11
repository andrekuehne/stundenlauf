# Stundenlauf

Local-first tooling for Stundenlauf race series: import Excel results, match participants, and compute standings. German desktop UI via pywebview.

## Desktop GUI (development)

```bash
uv sync
uv run gui
```

## Windows standalone build (PyInstaller)

**Build machine** (where you run PyInstaller): **Python 3.13+** and **uv**. From the **repository root**:

```bash
uv run --group dev build_windows
```

(`--group dev` is required so PyInstaller is available; add `--noconfirm` to overwrite `win_bundle/dist` without prompts. Extra arguments are passed through to PyInstaller.)

### Optional: build on commit when message contains `[build]`

Uses **pre-commit** on the **`commit-msg`** stage (so the hook can read the message). One-time setup:

```bash
uv sync --group dev
uv run pre-commit install --hook-type commit-msg
```

If the commit message contains **`[build]`**, the hook runs `uv run --group dev build_windows --noconfirm` before the commit is accepted. To skip the hook even when using `[build]`, set `STUNDENLAUF_SKIP_WIN_COMMIT_BUILD=1` (PowerShell: `$env:STUNDENLAUF_SKIP_WIN_COMMIT_BUILD=1`).

Equivalent explicit invocation:

```bash
uv run --group dev pyinstaller --workpath win_bundle/build --distpath win_bundle/dist win_bundle/stundenlauf_windows.spec
```

**Target PC** (where you copy the built app): **no Python and no uv**. Users need **64-bit Windows** and the **Microsoft Edge WebView2 Runtime** (Evergreen), which is usually already present on Windows 10/11. Distribute the whole `Stundenlauf` folder (`Stundenlauf.exe` and `_internal` together).

Output: `win_bundle/dist/Stundenlauf/Stundenlauf.exe` plus the `_internal` folder (onedir layout). An experimental bootloader splash image is shown until the main window finishes loading.

### Windows installer (Inno Setup)

After a successful `build_windows`, compile the setup executable (install [Inno Setup 6](https://jrsoftware.org/isinfo.php), then from repo root). Per-user installs (default for many setups) put the compiler under `%LOCALAPPDATA%\Programs\Inno Setup 6`:

```powershell
& "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe" /DMyAppVersion=1.0.0 installer\Stundenlauf.iss
```

If you used an all-users installer, try `"${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"` or `"$env:ProgramFiles\Inno Setup 6\ISCC.exe"` instead.

The installer is written to `installer/output/`. Bump `/DMyAppVersion` to match your release (or your `pyproject.toml` version).

### GitHub Actions artifacts

Workflow [`.github/workflows/windows-build.yml`](.github/workflows/windows-build.yml) runs **only when you push a version tag** whose name starts with `v` (e.g. `v1.0.0`):

```powershell
git add .
git commit -m "Some release message"
git push
git tag -a v1.0.2 -m "Release v1.0.2"
git push origin v1.0.2
```

To run tests:

```bash
uv run pytest
```
