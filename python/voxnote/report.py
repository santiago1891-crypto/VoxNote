"""Reporte de progreso y resultados: consola humana o eventos JSON.

El modo JSON sigue el contrato de la biblia (sección 11): una línea por evento,
con `stage`, `progress`, `completed` y `error`. Sirve para que cualquier cliente
consuma el proceso Python sin abrir un servidor HTTP.
"""

from __future__ import annotations

import json
import sys
import time
from typing import Any, TextIO

from .media import format_clock


class Reporter:
    """Interfaz mínima que implementan los reporters."""

    def stage(self, stage: str, message: str, **data: Any) -> None:  # pragma: no cover
        raise NotImplementedError

    def info(self, message: str) -> None:  # pragma: no cover
        raise NotImplementedError

    def progress(self, stage: str, current: float, total: float) -> None:  # pragma: no cover
        raise NotImplementedError

    def finish_progress(self) -> None:  # pragma: no cover
        raise NotImplementedError

    def completed(self, payload: dict[str, Any]) -> None:  # pragma: no cover
        raise NotImplementedError

    def summary(self, payload: dict[str, Any]) -> None:  # pragma: no cover
        raise NotImplementedError

    def error(self, code: str, message: str) -> None:  # pragma: no cover
        raise NotImplementedError


class ConsoleReporter(Reporter):
    """Salida legible para una terminal."""

    def __init__(
        self,
        stream: TextIO | None = None,
        error_stream: TextIO | None = None,
    ) -> None:
        self.out = stream or sys.stdout
        self.err = error_stream or sys.stderr
        self._interactive = _is_tty(self.out)
        self._last_time = 0.0
        self._last_percent = -10.0
        self._drawn = False

    def stage(self, stage: str, message: str, **data: Any) -> None:
        print(f"\n{message}", file=self.out)

    def info(self, message: str) -> None:
        print(f"  {message}", file=self.out)

    def progress(self, stage: str, current: float, total: float) -> None:
        now = time.perf_counter()
        if now - self._last_time < 1.0:
            return
        self._last_time = now

        if total > 0:
            percent = min(100.0, max(0.0, current / total * 100))
            text = f"{percent:5.1f}%  {format_clock(current)} / {format_clock(total)}"
        else:
            percent = 0.0
            text = f"{format_clock(current)} transcurridos"

        if self._interactive:
            print(f"\r  {text}", end="", file=self.out, flush=True)
            self._drawn = True
            return

        # Sin terminal interactiva no tiene sentido reescribir la línea:
        # se informa por hitos del 10% para no llenar el log.
        milestone = int(percent // 10) * 10 if total > 0 else 10
        if milestone > self._last_percent:
            self._last_percent = milestone
            print(f"  {text}", file=self.out, flush=True)

    def finish_progress(self) -> None:
        if self._drawn:
            print("\r" + " " * 70 + "\r", end="", file=self.out, flush=True)
            self._drawn = False

    def completed(self, payload: dict[str, Any]) -> None:
        outputs = payload.get("outputs") or []
        for index, path in enumerate(outputs):
            label = "Salida:   " if index == 0 else "          "
            print(f"  {label}{path}", file=self.out)

        print(f"  Segmentos: {payload.get('segments_count', 0)}", file=self.out)
        print(f"  Palabras:  {payload.get('words', 0)}", file=self.out)

        language = payload.get("language") or "desconocido"
        probability = payload.get("language_probability") or 0.0
        print(f"  Idioma:    {language} ({probability:.0%})", file=self.out)
        print(
            f"  Tiempo:    {format_clock(payload.get('elapsed', 0.0))}",
            file=self.out,
        )

    def summary(self, payload: dict[str, Any]) -> None:
        print(f"  Resumen PDF: {payload.get('pdf', '')}", file=self.out)
        print(f"  Modelo IA:   {payload.get('model', '')}", file=self.out)

    def error(self, code: str, message: str) -> None:
        print(f"\n  Error: {message}", file=self.err)
        print(f"  Código: {code}", file=self.err)


class JsonReporter(Reporter):
    """Eventos JSON delimitados por líneas (NDJSON) en stdout.

    Los mensajes de diagnóstico van a stderr para no contaminar el protocolo.
    """

    def __init__(
        self,
        stream: TextIO | None = None,
        log_stream: TextIO | None = None,
    ) -> None:
        self.out = stream or sys.stdout
        self.log = log_stream or sys.stderr
        self._last_time = 0.0

    def _emit(self, payload: dict[str, Any]) -> None:
        print(json.dumps(payload, ensure_ascii=False), file=self.out, flush=True)

    def stage(self, stage: str, message: str, **data: Any) -> None:
        self._emit({"event": "stage", "stage": stage, "message": message, **data})

    def info(self, message: str) -> None:
        print(message, file=self.log, flush=True)

    def progress(self, stage: str, current: float, total: float) -> None:
        now = time.perf_counter()
        if now - self._last_time < 1.0:
            return
        self._last_time = now
        payload: dict[str, Any] = {
            "event": "progress",
            "stage": stage,
            "current": round(current, 2),
            "total": round(total, 2),
        }
        if total > 0:
            payload["percent"] = round(min(100.0, current / total * 100), 1)
        self._emit(payload)

    def finish_progress(self) -> None:
        return

    def completed(self, payload: dict[str, Any]) -> None:
        self._emit({"event": "completed", **payload})

    def summary(self, payload: dict[str, Any]) -> None:
        self._emit({"event": "summary", **payload})

    def error(self, code: str, message: str) -> None:
        self._emit({"event": "error", "code": code, "message": message})


def _is_tty(stream: TextIO) -> bool:
    isatty = getattr(stream, "isatty", None)
    if isatty is None:
        return False
    try:
        return bool(isatty())
    except Exception:
        return False
