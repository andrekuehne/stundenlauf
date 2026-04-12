# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Stundenlauf is a local-first Python 3.13 desktop app (pywebview + GTK/WebKit on Linux, Edge WebView2 on Windows) for managing race series results. No external services, databases, or Docker required. All data stored as local JSON files.

### Running commands

All Python commands must go through `uv` — see `.cursor/rules/python-uv-execution.mdc`. Key commands:

- **Install deps:** `uv sync`
- **Run tests:** `uv run pytest` (201 tests, ~10s, fully headless)
- **Lint:** `uv run ruff check` and `uv run ruff format --check`
- **Auto-fix lint:** `uv run ruff check --fix` and `uv run ruff format`

### Lint

Ruff is configured in `pyproject.toml` under `[tool.ruff]`. Rule sets: `E`, `F`, `W`, `I`, `UP`, `B`, `SIM`, `RUF`. German unicode characters (RUF001-003) and line length (E501) are globally ignored. Scripts have per-file ignores for `E402` (sys.path manipulation) and `T201` (print). Always run both `ruff check` and `ruff format --check` before committing.

### GUI on headless Cloud VMs

The production code uses `gui="edgechromium"` in `webview.start()` (Windows-only). On Linux/Cloud VMs you must launch the app without that parameter. Use a virtual display and start pywebview with auto-detected GTK backend:

```bash
Xvfb :99 -screen 0 1920x1080x24 &
DISPLAY=:99 uv run python -c "
from backend.app_paths import default_workspace_dir, project_root_dir
from backend.ui_api.pywebview_bridge import PywebviewApiBridge
import webview

workspace_dir = default_workspace_dir()
workspace_dir.mkdir(parents=True, exist_ok=True)
frontend_index = (project_root_dir() / 'frontend' / 'index.html').resolve()
window = webview.create_window(
    'Stundenlauf-Auswertung',
    url=frontend_index.as_uri(),
    width=1920, height=1080, min_size=(1280, 720),
)
bridge = PywebviewApiBridge(
    project_file=None,
    workspace_dir=str(workspace_dir),
    file_picker=lambda kind: None,
    save_file_picker=lambda name, kind='season_zip': None,
)
window.expose(bridge.invoke)
webview.start(debug=True, http_server=True)
"
```

System packages needed for pywebview GTK backend (pre-installed in the VM snapshot): `gir1.2-webkit2-4.1`, `libgirepository-2.0-dev`, `libgirepository1.0-dev`, `libcairo2-dev`, `pkg-config`, plus `PyGObject` pip package.
