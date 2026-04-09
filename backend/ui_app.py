from __future__ import annotations

from pathlib import Path

from backend.app_paths import project_root_dir
from backend.ui_api.pywebview_bridge import PywebviewApiBridge


def launch_ui(workspace_dir: Path, project_file: Path | None = None) -> None:
    try:
        import webview
    except ImportError as exc:  # pragma: no cover - runtime dependency check
        raise RuntimeError(
            "pywebview ist nicht installiert. Bitte `uv add pywebview` ausführen."
        ) from exc

    workspace_dir = workspace_dir.resolve()
    frontend_index = (project_root_dir() / "frontend" / "index.html").resolve()
    window = webview.create_window(
        "Stundenlauf-Auswertung",
        url=frontend_index.as_uri(),
        width=1920,
        height=1080,
        min_size=(1280, 720),
    )

    def pick_file() -> str | None:
        selected = window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=False,
            file_types=("Excel (*.xlsx;*.xls)",),
        )
        if not selected:
            return None
        return str(selected[0])

    bridge = PywebviewApiBridge(
        project_file=str(project_file) if project_file is not None else None,
        workspace_dir=str(workspace_dir),
        file_picker=pick_file,
    )
    window.expose(bridge.invoke)
    webview.start(debug=False, http_server=True, gui="edgechromium")
