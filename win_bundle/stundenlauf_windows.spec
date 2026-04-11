# -*- mode: python ; coding: utf-8 -*-
# Build (from repository root):
#   uv sync --group dev
#   uv run pyinstaller --workpath win_bundle/build --distpath win_bundle/dist win_bundle/stundenlauf_windows.spec
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

block_cipher = None

spec_dir = Path(SPECPATH)
root = spec_dir.parent

a = Analysis(
    [str(spec_dir / "gui_entry.py")],
    pathex=[str(root)],
    binaries=[],
    datas=[(str(root / "frontend"), "frontend")],
    hiddenimports=list(collect_submodules("backend")),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "ipykernel", "jupyter", "IPython", "notebook", "zmq"],
    noarchive=False,
    optimize=0,
)

# Splash must see Analysis binaries only (pre-merge TOC shape expected by PyInstaller 6 Splash/COLLECT).
splash = Splash(
    str(root / "assets" / "splash_tri_hgwaii.png"),
    binaries=a.binaries,
    datas=a.datas,
    text_pos=None,
    minify_script=True,
    always_on_top=True,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    splash,
    [],
    exclude_binaries=True,
    name="Stundenlauf",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    splash.binaries,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="Stundenlauf",
)
