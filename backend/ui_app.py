from __future__ import annotations

from pathlib import Path

from backend.app_paths import project_root_dir
from backend.ui_api.pywebview_bridge import PywebviewApiBridge


def _close_pyi_splash() -> None:
    try:
        import pyi_splash
    except ImportError:
        return
    try:
        pyi_splash.close()
    except Exception:
        pass


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

    def pick_file(kind: str) -> str | None:
        file_types = ("Excel (*.xlsx;*.xls)",)
        if kind == "season_export":
            file_types = ("Stundenlauf Saison (*.zip)",)
        selected = window.create_file_dialog(webview.FileDialog.OPEN, allow_multiple=False, file_types=file_types)
        if not selected:
            return None
        return str(selected[0])

    def pick_save_file(suggested_name: str, dialog_kind: str = "season_zip") -> str | None:
        fallback_name = "stundenlauf-season.stundenlauf-season.zip"
        file_name = suggested_name.strip() or fallback_name
        kind = (dialog_kind or "season_zip").strip().lower()
        if kind == "pdf":
            # Default must not be the *.pdf filter: Windows then treats the target as name.pdf and
            # prompts to overwrite a legacy single-file export, while we write name_einzel.pdf / name_paare.pdf.
            file_types = ("Alle Dateien (*.*)", "PDF (*.pdf)")
        else:
            file_types = ("Stundenlauf Saison (*.zip)",)
        selected = window.create_file_dialog(
            webview.FileDialog.SAVE,
            save_filename=file_name,
            file_types=file_types,
        )
        if not selected:
            return None
        return str(selected[0])

    bridge = PywebviewApiBridge(
        project_file=str(project_file) if project_file is not None else None,
        workspace_dir=str(workspace_dir),
        file_picker=pick_file,
        save_file_picker=pick_save_file,
    )
    window.expose(bridge.invoke)
    window.events.loaded += _close_pyi_splash
    webview.start(debug=False, http_server=True, gui="edgechromium")
