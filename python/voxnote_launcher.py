"""Punto de entrada del ejecutable de VoxNote (PyInstaller)."""

from __future__ import annotations

import sys
import traceback


def _show_error(message: str) -> None:
    """Muestra un diálogo nativo cuando la app no tiene consola."""
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(None, message, "VoxNote", 0x10)
    except Exception:
        pass


def main() -> int:
    from voxnote.desktop import main as desktop_main

    return desktop_main()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:
        _show_error("VoxNote no pudo iniciarse.\n\n" + traceback.format_exc())
        raise
