"""Permite ejecutar el backend con `python -m voxnote`."""

from .cli import main

if __name__ == "__main__":
    raise SystemExit(main())
