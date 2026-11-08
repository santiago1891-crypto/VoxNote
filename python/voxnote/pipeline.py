"""Orquestación del flujo: inspeccionar → decodificar → transcribir → exportar.

Esta capa la consume la interfaz de escritorio y la CLI: no imprime nada por sí
misma, informa a través de un `Reporter` (consola o eventos JSON).
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from pathlib import Path

from .errors import MediaError, OutputError
from .export import write_srt, write_txt
from .media import MediaInfo, decode_clip, probe
from .report import Reporter
from .transcribe import Segment, Transcriber, TranscriptionResult

DEFAULT_MODEL = "small"
DEFAULT_LANGUAGE = "es"
MODEL_CHOICES = ("tiny", "base", "small", "medium", "large-v3", "large-v3-turbo")
FORMAT_CHOICES = ("txt", "srt", "both")


@dataclass(frozen=True)
class TranscribeOptions:
    model: str = DEFAULT_MODEL
    language: str | None = DEFAULT_LANGUAGE
    start_seconds: float = 0.0
    duration: float | None = None
    initial_prompt: str | None = None
    vad_filter: bool = True
    cpu_threads: int = 0


@dataclass(frozen=True)
class TranscriptionOutcome:
    info: MediaInfo
    result: TranscriptionResult
    outputs: list[Path]


def run_transcription(
    input_path: str | Path,
    output_dir: str | Path,
    *,
    options: TranscribeOptions,
    formats: str = "txt",
    force: bool = False,
    reporter: Reporter,
    should_cancel=None,
) -> TranscriptionOutcome:
    if options.start_seconds < 0:
        raise MediaError(
            "El minuto de inicio no puede ser negativo.", "INVALID_ARGUMENT"
        )

    extensions = _extensions_for(formats)
    output_dir = Path(output_dir).expanduser()

    reporter.stage("prepare", "1/4 Preparando archivo")
    info = probe(input_path)
    reporter.info(f"Archivo:  {info.path.name}")
    reporter.info(f"Formato:  {info.container}")
    reporter.info(f"Duración: {info.duration_label}")

    if not info.has_audio:
        raise MediaError("El archivo no tiene pista de audio.", "NO_AUDIO_TRACK")

    audio_hint = ""
    if info.sample_rate and info.channels:
        audio_hint = f", {info.sample_rate} Hz, {info.channels} canal(es)"
    reporter.info(f"Audio:    presente{audio_hint}")

    if info.duration and options.start_seconds >= info.duration:
        raise MediaError(
            f"El inicio está fuera del archivo ({info.duration_label}).",
            "INVALID_ARGUMENT",
        )

    base = output_dir / info.path.stem
    planned = [base.with_suffix(extension) for extension in extensions]
    existing = [path for path in planned if path.exists()]
    if existing and not force:
        raise OutputError(
            f"El archivo ya existe: {existing[0]}. Usa --force para sobrescribirlo.",
            "OUTPUT_EXISTS",
        )

    reporter.stage(
        "audio",
        "2/4 Preparando audio",
        file=str(info.path),
        duration=round(info.duration, 3),
    )

    start_seconds = options.start_seconds
    clip_duration = options.duration
    if clip_duration is not None and info.duration:
        clip_duration = min(clip_duration, max(0.0, info.duration - start_seconds))

    if start_seconds:
        reporter.info(f"Inicio: minuto {start_seconds / 60:g}.")
    if clip_duration is not None:
        reporter.info(f"Modo prueba: {clip_duration / 60:.1f} minutos.")
    else:
        reporter.info("Archivo completo.")

    reporter.info("Decodificando audio a 16 kHz mono...")
    audio = decode_clip(info.path, start=start_seconds, duration=clip_duration)
    decoded_minutes = audio.size / 16_000 / 60
    reporter.info(
        f"Audio listo: {decoded_minutes:.1f} minutos ({audio.size:,} muestras)."
    )

    reporter.stage("transcription", "3/4 Cargando modelo y transcribiendo")
    transcriber = Transcriber(options.model, cpu_threads=options.cpu_threads)
    reporter.info(f"Modelo: {options.model} (CPU, int8)")
    if options.initial_prompt:
        reporter.info("Se usará un texto de contexto para el vocabulario.")
    reporter.info("La primera ejecución descarga el modelo; puede tardar.")
    reporter.info("Transcribiendo... (Ctrl+C para cancelar)")

    result = transcriber.transcribe(
        audio,
        language=options.language,
        initial_prompt=options.initial_prompt,
        vad_filter=options.vad_filter,
        on_progress=lambda current, total: reporter.progress(
            "transcription", current, total
        ),
        should_cancel=should_cancel,
    )
    reporter.finish_progress()

    if start_seconds:
        # Las marcas de tiempo deben referirse al archivo original.
        result = replace(
            result,
            segments=[
                Segment(
                    start=segment.start + start_seconds,
                    end=segment.end + start_seconds,
                    text=segment.text,
                )
                for segment in result.segments
            ],
        )

    reporter.stage("export", "4/4 Guardando resultado")
    outputs: list[Path] = []
    try:
        if ".txt" in extensions:
            outputs.append(write_txt(base.with_suffix(".txt"), result.segments))
        if ".srt" in extensions:
            outputs.append(write_srt(base.with_suffix(".srt"), result.segments))
    except OSError as exc:
        raise OutputError(
            f"No se pudo guardar el resultado: {exc}", "WRITE_FAILED"
        ) from exc

    payload = {
        "file": str(info.path),
        "outputs": [str(path) for path in outputs],
        "segments_count": len(result.segments),
        "words": result.words,
        "language": result.language,
        "language_probability": round(result.language_probability, 4),
        "duration": round(result.duration, 3),
        "elapsed": round(result.elapsed, 3),
        "segments": [
            {
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "text": segment.text,
            }
            for segment in result.segments
        ],
    }
    reporter.completed(payload)

    return TranscriptionOutcome(info=info, result=result, outputs=outputs)


def _extensions_for(formats: str) -> tuple[str, ...]:
    if formats == "both":
        return (".txt", ".srt")
    if formats == "txt":
        return (".txt",)
    if formats == "srt":
        return (".srt",)
    raise ValueError(
        f"Formato de salida desconocido: {formats!r}. "
        f"Opciones: {', '.join(FORMAT_CHOICES)}"
    )
