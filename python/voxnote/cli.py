"""Prueba de terminal: archivo multimedia -> transcripción en TXT/SRT.

Uso:
    python -m voxnote.cli "C:\\ruta\\video.mp4"
    python -m voxnote.cli "video.mp4" --model small --lang es --out .\\salida
    python -m voxnote.cli "video.mp4" --start-minutes 4 --max-minutes 2 --force
    python -m voxnote.cli "video.mp4" --json        # eventos NDJSON (integración)
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from .errors import VoxNoteError
from .pipeline import (
    DEFAULT_LANGUAGE,
    DEFAULT_MODEL,
    FORMAT_CHOICES,
    MODEL_CHOICES,
    TranscribeOptions,
    run_transcription,
)
from .report import ConsoleReporter, JsonReporter

DEFAULT_OUTPUT_DIR = "salida"

EXIT_CODES = {
    "CANCELLED": 130,
    "FILE_NOT_FOUND": 2,
    "INVALID_PATH": 2,
    "UNSUPPORTED_FORMAT": 2,
    "NO_AUDIO_TRACK": 2,
    "READ_FAILED": 2,
    "DECODE_FAILED": 2,
    "NO_AUDIO_DATA": 2,
    "INVALID_ARGUMENT": 2,
    "OUTPUT_EXISTS": 3,
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="voxnote",
        description=(
            "Transcribe localmente un archivo de audio o video y guarda el "
            "resultado en TXT y/o SRT. El audio nunca sale del equipo."
        ),
    )
    parser.add_argument(
        "input", type=Path, help="Archivo de audio o video a transcribir."
    )
    parser.add_argument(
        "-m",
        "--model",
        default=DEFAULT_MODEL,
        choices=MODEL_CHOICES,
        help=f"Modelo de Whisper (por defecto: {DEFAULT_MODEL}).",
    )
    parser.add_argument(
        "-l",
        "--lang",
        default=DEFAULT_LANGUAGE,
        help=(
            f"Idioma del audio; 'auto' para detectarlo "
            f"(por defecto: {DEFAULT_LANGUAGE})."
        ),
    )
    parser.add_argument(
        "-o",
        "--out",
        type=Path,
        default=Path(DEFAULT_OUTPUT_DIR),
        help=f"Carpeta de salida (por defecto: .\\{DEFAULT_OUTPUT_DIR}).",
    )
    parser.add_argument(
        "--format",
        default="both",
        choices=FORMAT_CHOICES,
        help="Archivos a generar: txt, srt o both (por defecto: both).",
    )
    parser.add_argument(
        "--max-minutes",
        type=float,
        default=None,
        metavar="MIN",
        help="Transcribir solo MIN minutos (útil para probar).",
    )
    parser.add_argument(
        "--start-minutes",
        type=float,
        default=0.0,
        metavar="MIN",
        help="Empezar a transcribir en el minuto MIN (por defecto: 0).",
    )
    parser.add_argument(
        "--initial-prompt",
        default=None,
        metavar="TEXTO",
        help=(
            "Texto de contexto para orientar el vocabulario (por ejemplo, un "
            "glosario de términos técnicos separados por comas)."
        ),
    )
    parser.add_argument(
        "--no-vad",
        action="store_true",
        help="Desactivar el filtro de silencios (audio con música o ruido).",
    )
    parser.add_argument(
        "--cpu-threads",
        type=int,
        default=0,
        help="Hilos de CPU para el modelo; 0 = automático.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help=(
            "Emitir eventos JSON por línea en stdout (integración). "
            "Los mensajes de diagnóstico van a stderr."
        ),
    )
    parser.add_argument(
        "--summary",
        action="store_true",
        help=(
            "Generar también un resumen en PDF con Gemini. Solo se envía el "
            "texto de la transcripción."
        ),
    )
    parser.add_argument(
        "--gemini-model",
        default=None,
        metavar="MODELO",
        help="Modelo de Gemini (por defecto: gemini-3.5-flash o GEMINI_MODEL).",
    )
    parser.add_argument(
        "--gemini-key",
        default=None,
        metavar="KEY",
        help=(
            "API key de Gemini. Mejor usa la variable GEMINI_API_KEY o "
            "guárdala en Ajustes; pasar claves por argumentos queda en el historial."
        ),
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Sobrescribir los archivos de salida si ya existen.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    reporter = JsonReporter() if args.json else ConsoleReporter()

    start_minutes = float(args.start_minutes)
    if not math.isfinite(start_minutes) or start_minutes < 0:
        reporter.error(
            "INVALID_ARGUMENT",
            "El minuto de inicio debe ser un número finito y no negativo.",
        )
        return EXIT_CODES["INVALID_ARGUMENT"]

    max_minutes = args.max_minutes
    if max_minutes is not None and (
        not math.isfinite(max_minutes) or max_minutes <= 0
    ):
        reporter.error(
            "INVALID_ARGUMENT",
            "La duración debe ser un número finito y mayor que cero.",
        )
        return EXIT_CODES["INVALID_ARGUMENT"]

    options = TranscribeOptions(
        model=args.model,
        language=None if args.lang.lower() == "auto" else args.lang,
        start_seconds=start_minutes * 60,
        duration=max_minutes * 60 if max_minutes is not None else None,
        initial_prompt=args.initial_prompt,
        vad_filter=not args.no_vad,
        cpu_threads=args.cpu_threads,
    )

    try:
        outcome = run_transcription(
            args.input,
            args.out,
            options=options,
            formats=args.format,
            force=args.force,
            reporter=reporter,
        )

        if args.summary:
            from .ai.service import summarize_transcript

            artifacts = summarize_transcript(
                outcome.result.text,
                args.out,
                source_name=str(outcome.info.path),
                api_key=args.gemini_key,
                model=args.gemini_model,
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
        reporter.finish_progress()
        reporter.error(
            "CANCELLED", "Cancelado por el usuario. No se escribió ningún archivo."
        )
        return EXIT_CODES["CANCELLED"]
    except VoxNoteError as exc:
        reporter.finish_progress()
        reporter.error(exc.code, str(exc))
        return EXIT_CODES.get(exc.code, 1)
    except OSError as exc:
        reporter.finish_progress()
        reporter.error("WRITE_FAILED", f"No se pudo leer o escribir en disco: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
