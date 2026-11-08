"""Inspección y decodificación de archivos multimedia con PyAV.

PyAV incluye FFmpeg embebido, así que no hace falta instalar FFmpeg en el
sistema para esta etapa. El audio se decodifica a float32 mono 16 kHz, que es
el formato que espera faster-whisper.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import av
import numpy as np

from .errors import MediaError

TARGET_SAMPLE_RATE = 16_000
TARGET_CHANNELS = 1

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".webm"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}
SUPPORTED_EXTENSIONS = VIDEO_EXTENSIONS | AUDIO_EXTENSIONS


@dataclass(frozen=True)
class MediaInfo:
    path: Path
    duration: float
    has_audio: bool
    sample_rate: int | None
    channels: int | None
    container: str

    @property
    def duration_label(self) -> str:
        return format_clock(self.duration)


def format_clock(seconds: float) -> str:
    """Devuelve HH:MM:SS (o MM:SS si dura menos de una hora)."""
    seconds = max(0, int(round(seconds)))
    hours, remainder = divmod(seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def probe(path: str | Path) -> MediaInfo:
    """Valida el archivo y devuelve sus metadatos básicos."""
    path = Path(path).expanduser()

    if not path.exists():
        raise MediaError(f"El archivo no existe: {path}", "FILE_NOT_FOUND")
    if not path.is_file():
        raise MediaError(f"La ruta no es un archivo: {path}", "INVALID_PATH")
    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        allowed = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        raise MediaError(
            f"Formato no soportado ({path.suffix or 'sin extensión'}). "
            f"Formatos admitidos: {allowed}",
            "UNSUPPORTED_FORMAT",
        )

    try:
        with av.open(str(path)) as container:
            audio = next(
                (stream for stream in container.streams if stream.type == "audio"), None
            )
            duration = _container_duration(container, audio)
            container_name = container.format.name or path.suffix.lstrip(".")
    except MediaError:
        raise
    except Exception as exc:  # PyAV lanza tipos variados según el contenedor.
        raise MediaError(
            f"No se pudo leer el archivo. Puede estar dañado o usar un códec "
            f"no disponible: {exc}",
            "READ_FAILED",
        ) from exc

    return MediaInfo(
        path=path,
        duration=duration,
        has_audio=audio is not None,
        sample_rate=getattr(audio, "rate", None) if audio else None,
        channels=getattr(audio, "channels", None) if audio else None,
        container=container_name,
    )


def _container_duration(container: av.container.InputContainer, audio) -> float:
    if container.duration:
        return float(container.duration / av.time_base)
    if audio is not None and audio.duration:
        return float(audio.duration * audio.time_base)
    return 0.0


def decode_clip(
    path: str | Path,
    *,
    start: float = 0.0,
    duration: float | None = None,
) -> np.ndarray:
    """Decodifica [start, start+duration) como float32 mono 16 kHz.

    Se usa para pruebas rápidas sobre un fragmento. Para transcribir el archivo
    completo conviene pasarle la ruta a faster-whisper y dejar que decodifique
    en streaming.
    """
    path = Path(path).expanduser()
    if start < 0:
        raise MediaError(
            "El inicio del fragmento no puede ser negativo.", "INVALID_ARGUMENT"
        )
    if duration is not None and duration <= 0:
        raise MediaError(
            "La duración del fragmento debe ser mayor que cero.", "INVALID_ARGUMENT"
        )

    max_samples = int(duration * TARGET_SAMPLE_RATE) if duration else None

    samples, first_position = _decode_range(
        path, start=start, max_samples=max_samples, use_seek=start > 0
    )

    # En algunos MP4 el seek de FFmpeg cae lejos del punto pedido. Si eso
    # ocurre, se decodifica desde el principio descartando el audio anterior.
    if start > 0 and first_position is not None and first_position > start + 5.0:
        samples, _ = _decode_range(
            path, start=start, max_samples=max_samples, use_seek=False
        )

    if samples.size == 0:
        raise MediaError(
            "No se pudo extraer audio del fragmento solicitado. "
            "Verifica que el archivo tenga sonido.",
            "NO_AUDIO_DATA",
        )

    return samples


def _decode_range(
    path: Path,
    *,
    start: float,
    max_samples: int | None,
    use_seek: bool,
) -> tuple[np.ndarray, float | None]:
    """Decodifica hasta max_samples muestras a partir de start.

    Devuelve también la posición real (en segundos) del primer frame decodificado,
    para poder detectar un seek inexacto.
    """
    chunks: list[np.ndarray] = []
    collected = 0
    skip_samples: int | None = None
    first_position: float | None = None
    done = False

    try:
        with av.open(str(path)) as container:
            stream = next(
                (s for s in container.streams if s.type == "audio"), None
            )
            if stream is None:
                raise MediaError(
                    "El archivo no tiene pista de audio.", "NO_AUDIO_TRACK"
                )

            stream.thread_type = "AUTO"
            resampler = av.AudioResampler(
                format="flt",
                layout="mono" if TARGET_CHANNELS == 1 else "stereo",
                rate=TARGET_SAMPLE_RATE,
            )

            if use_seek and start > 0:
                # Ojo: al pasar `stream`, PyAV interpreta el offset en la base
                # de tiempo del stream, no en av.time_base.
                container.seek(
                    int(start / stream.time_base),
                    any_frame=False,
                    backward=True,
                    stream=stream,
                )

            for frame in container.decode(stream):
                frame_start = (
                    float(frame.pts * frame.time_base)
                    if frame.pts is not None
                    else None
                )
                if first_position is None and frame_start is not None:
                    first_position = frame_start

                if skip_samples is None:
                    origin = frame_start if frame_start is not None else start
                    skip_samples = max(
                        0, int(round((start - origin) * TARGET_SAMPLE_RATE))
                    )

                for resampled in resampler.resample(frame):
                    chunk = resampled.to_ndarray().reshape(-1).astype(np.float32)

                    if skip_samples:
                        drop = min(skip_samples, chunk.size)
                        chunk = chunk[drop:]
                        skip_samples -= drop

                    if chunk.size == 0:
                        continue

                    if max_samples is not None:
                        remaining = max_samples - collected
                        if remaining <= 0:
                            done = True
                            break
                        chunk = chunk[:remaining]

                    chunks.append(chunk)
                    collected += chunk.size

                    if max_samples is not None and collected >= max_samples:
                        done = True
                        break

                if done:
                    break

            if not done:
                for resampled in resampler.resample(None):
                    chunk = resampled.to_ndarray().reshape(-1).astype(np.float32)
                    if skip_samples:
                        drop = min(skip_samples, chunk.size)
                        chunk = chunk[drop:]
                        skip_samples -= drop
                    if chunk.size and max_samples is not None:
                        chunk = chunk[: max(0, max_samples - collected)]
                    if chunk.size:
                        chunks.append(chunk)
                        collected += chunk.size

    except MediaError:
        raise
    except Exception as exc:
        raise MediaError(f"No se pudo decodificar el audio: {exc}", "DECODE_FAILED") from exc

    if not chunks:
        return np.empty(0, dtype=np.float32), first_position

    return np.concatenate(chunks), first_position
