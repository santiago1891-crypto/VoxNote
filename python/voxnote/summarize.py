"""Genera un resumen PDF a partir de una transcripción TXT existente.

Uso:
    python -m voxnote.summarize "salida\\clase.txt"
    python -m voxnote.summarize "clase.txt" --out "salida" --model gemini-3.5-flash
"""

from __future__ import annotations

import argparse
from pathlib import Path

from .ai.service import parse_transcript_file, summarize_transcript
from .cli import EXIT_CODES
from .errors import VoxNoteError
from .report import ConsoleReporter, JsonReporter


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="voxnote-summary",
        description=(
            "Resume una transcripción con Gemini y genera un PDF con títulos y "
            "subtítulos destacados. Solo se envía el texto a Gemini."
        ),
    )
    parser.add_argument("input", type=Path, help="Archivo TXT de transcripción.")
    parser.add_argument(
        "-o",
        "--out",
        type=Path,
        default=Path("salida"),
        help="Carpeta de salida (por defecto: .\\salida).",
    )
    parser.add_argument(
        "-m",
        "--model",
        default=None,
        help="Modelo de Gemini (por defecto: gemini-3.5-flash o GEMINI_MODEL).",
    )
    parser.add_argument(
        "--gemini-key",
        default=None,
        help="API key de Gemini (mejor usa GEMINI_API_KEY o Ajustes).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emitir eventos JSON por línea en stdout.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    reporter = JsonReporter() if args.json else ConsoleReporter()

    try:
        transcript = parse_transcript_file(args.input)
        artifacts = summarize_transcript(
            transcript,
            args.out,
            source_name=str(args.input),
            api_key=args.gemini_key,
            model=args.model,
            reporter=reporter,
        )
        reporter.summary(
            {
                "pdf": str(artifacts.pdf_path),
                "json": str(artifacts.json_path),
                "model": artifacts.model,
            }
        )
        return 0
    except KeyboardInterrupt:
        reporter.error("CANCELLED", "Cancelado por el usuario.")
        return EXIT_CODES["CANCELLED"]
    except VoxNoteError as exc:
        reporter.error(exc.code, str(exc))
        return EXIT_CODES.get(exc.code, 1)


if __name__ == "__main__":
    raise SystemExit(main())
