# -*- mode: python ; coding: utf-8 -*-
"""Empaqueta VoxNote en un único VoxNote.exe con PyInstaller."""

from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, collect_submodules

ROOT = Path(SPECPATH).resolve().parent

datas = [
    (str(ROOT / "frontend" / "dist"), "frontend/dist"),
]
datas += collect_data_files("faster_whisper")

binaries = collect_dynamic_libs("ctranslate2")

hiddenimports = [
    "clr",
    "ctranslate2",
    "faster_whisper",
    "huggingface_hub",
    "onnxruntime",
    "tqdm.auto",
    "webview",
    "webview.platforms.edgechromium",
    "webview.platforms.winforms",
]
hiddenimports += collect_submodules("keyring.backends")

a = Analysis(
    [str(ROOT / "python" / "voxnote_launcher.py")],
    pathex=[str(ROOT / "python")],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "tkinter"],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="VoxNote",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=[str(ROOT / "assets" / "voxnote.ico")],
    version=str(ROOT / "python" / "version_info.txt"),
)
