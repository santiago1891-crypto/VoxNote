"""Transcripción local con faster-whisper (CTranslate2, CPU por defecto)."""

from __future__ import annotations

import os
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .errors import TranscriptionCancelled, TranscriptionError
from .media import TARGET_SAMPLE_RATE

__all__ = [
    "Segment",
    "Transcriber",
    "TranscriptionCancelled",
    "TranscriptionError",
    "TranscriptionResult",
    "models_directory",
]


@dataclass(frozen=True)
class Segment:
    start: float
    end: float
    text: str


@dataclass(frozen=True)
class TranscriptionResult:
    segments: list[Segment]
    language: str
    language_probability: float
    duration: float
    elapsed: float

    @property
    def text(self) -> str:
        return " ".join(segment.text for segment in self.segments)

    @property
    def words(self) -> int:
        return sum(len(segment.text.split()) for segment in self.segments)


def models_directory() -> Path:
    """Carpeta de modelos fuera del repositorio (nunca se versiona)."""
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
    root = Path(base) if base else Path.home() / ".cache"
    return root / "VoxNote" / "models"


class Transcriber:
    """Carga perezosa del modelo para no pagar el costo si no se transcribe."""

    def __init__(
        self,
        model_size: str = "small",
        *,
        device: str = "cpu",
        compute_type: str = "int8",
        cpu_threads: int = 0,
        download_root: Path | None = None,
    ) -> None:
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.cpu_threads = cpu_threads
        self.download_root = download_root or models_directory()
        self._model = None

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def load(self):
        """Descarga (si hace falta) y carga el modelo. Puede tardar la primera vez."""
        if self._model is not None:
            return self._model

        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise TranscriptionError(
                "faster-whisper no está instalado. Ejecuta: "
                "pip install -r requirements.txt",
                "DEPENDENCY_MISSING",
            ) from exc

        self.download_root.mkdir(parents=True, exist_ok=True)

        try:
            self._model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type,
                cpu_threads=self.cpu_threads,
                download_root=str(self.download_root),
            )
        except Exception as exc:
            raise TranscriptionError(
                f"No se pudo cargar el modelo '{self.model_size}'. "
                f"Comprueba la conexión (la primera vez se descarga) y la "
                f"memoria disponible. Detalle: {exc}",
                "MODEL_LOAD_FAILED",
            ) from exc

        return self._model

    def transcribe(
        self,
        audio: str | Path | np.ndarray,
        *,
        language: str | None = "es",
        beam_size: int = 5,
        initial_prompt: str | None = None,
        vad_filter: bool = True,
        on_progress: Callable[[float, float], None] | None = None,
        should_cancel: Callable[[], bool] | None = None,
    ) -> TranscriptionResult:
        """Transcribe un archivo o un array float32 mono 16 kHz.

        `initial_prompt` sirve para orientar vocabulario y estilo (por ejemplo,
        un glosario de términos técnicos) sin reentrenar el modelo.
        """
        if should_cancel is not None and should_cancel():
            raise TranscriptionCancelled("Cancelado por el usuario.")

        model = self.load()

        if should_cancel is not None and should_cancel():
            raise TranscriptionCancelled("Cancelado por el usuario.")

        source: str | np.ndarray
        if isinstance(audio, np.ndarray):
            if audio.ndim != 1:
                raise TranscriptionError(
                    "El audio debe ser mono (un solo canal).", "INVALID_AUDIO"
                )
            source = audio.astype(np.float32, copy=False)
        else:
            # faster-whisper usa av.open(metadata_errors=...) internamente, que
            # PyAV 19 ya no acepta. Decodificamos nosotros para evitarlo.
            from .media import decode_clip

            source = decode_clip(audio)

        started = time.perf_counter()

        try:
            segment_iter, info = model.transcribe(
                source,
                language=language or None,
                beam_size=beam_size,
                initial_prompt=initial_prompt,
                vad_filter=vad_filter,
                vad_parameters={"min_silence_duration_ms": 500},
                # En grabaciones largas, condicionar al texto previo provoca
                # repeticiones en bucle cuando hay silencios o ruido.
                condition_on_previous_text=False,
            )

            total = float(getattr(info, "duration", 0.0) or 0.0)
            if total <= 0 and isinstance(audio, np.ndarray):
                total = audio.size / TARGET_SAMPLE_RATE

            segments: list[Segment] = []
            for raw in segment_iter:
                if should_cancel is not None and should_cancel():
                    raise TranscriptionCancelled("Cancelado por el usuario.")

                text = (raw.text or "").strip()
                if text:
                    segments.append(
                        Segment(start=float(raw.start), end=float(raw.end), text=text)
                    )

                if on_progress is not None:
                    on_progress(float(raw.end), total)

        except TranscriptionCancelled:
            raise
        except TranscriptionError:
            raise
        except MemoryError as exc:
            raise TranscriptionError(
                "Memoria insuficiente. Prueba un modelo más pequeño "
                "(por ejemplo --model base).",
                "OUT_OF_MEMORY",
            ) from exc
        except Exception as exc:
            raise TranscriptionError(
                f"Falló la transcripción: {exc}", "TRANSCRIPTION_FAILED"
            ) from exc

        elapsed = time.perf_counter() - started

        if not segments:
            raise TranscriptionError(
                "El motor no detectó voz en el audio. Puede que el archivo no "
                "tenga sonido, esté en silencio o el volumen sea muy bajo.",
                "NO_SPEECH",
            )

        return TranscriptionResult(
            segments=segments,
            language=getattr(info, "language", language or "") or "",
            language_probability=float(
                getattr(info, "language_probability", 0.0) or 0.0
            ),
            duration=total,
            elapsed=elapsed,
        )
