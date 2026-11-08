"""Aplicación de escritorio de VoxNote (pywebview + WebView2).

Expone la API que consume la interfaz React. Las operaciones largas corren en
un hilo aparte y el progreso se envía a la ventana mediante eventos
`window.voxnoteEmit({...})`.

Uso:
    python -m voxnote.desktop            # carga frontend/dist
    python -m voxnote.desktop --dev      # carga http://localhost:5173 (Vite)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
import traceback
from pathlib import Path
from typing import Any, Callable

from . import __version__
from .ai.gemini import DEFAULT_MODEL as DEFAULT_GEMINI_MODEL
from .ai.gemini import GeminiClient
from .ai.service import summarize_transcript
from .credentials import api_key_hint, load_api_key, save_api_key
from .errors import CredentialError, VoxNoteError
from .export import write_srt, write_txt
from .media import SUPPORTED_EXTENSIONS
from .pipeline import (
    DEFAULT_LANGUAGE,
    DEFAULT_MODEL,
    MODEL_CHOICES,
    TranscribeOptions,
    run_transcription,
)
from .report import Reporter
from .transcribe import Segment, TranscriptionResult, models_directory

APP_NAME = "VoxNote"
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist" / "index.html"

# ------------------------------------------------------------------ settings


def app_data_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
    root = Path(base) if base else Path.home() / ".voxnote"
    return root / APP_NAME


def settings_path() -> Path:
    return app_data_dir() / "settings.json"


def default_output_dir() -> Path:
    videos = Path.home() / "Videos"
    if videos.is_dir():
        return videos / APP_NAME
    return Path.home() / APP_NAME


def default_settings() -> dict[str, Any]:
    return {
        "model": DEFAULT_MODEL,
        "language": DEFAULT_LANGUAGE or "es",
        "vad": True,
        "formats": "both",
        "outputDir": str(default_output_dir()),
        "geminiModel": DEFAULT_GEMINI_MODEL,
        "initialPrompt": "",
    }


def normalize_settings(
    payload: Any, base: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Devuelve una configuración válida a partir de datos de la interfaz."""
    result = dict(base or default_settings())
    if not isinstance(payload, dict):
        return result

    model = str(payload.get("model", result["model"])).strip()
    result["model"] = model if model in MODEL_CHOICES else DEFAULT_MODEL

    language = str(payload.get("language", result["language"])).strip().lower()
    result["language"] = language if language in {"es", "en", "pt", "fr"} else ""

    result["vad"] = bool(payload.get("vad", result["vad"]))

    formats = str(payload.get("formats", result["formats"])).strip().lower()
    result["formats"] = formats if formats in {"txt", "srt", "both"} else "both"

    output_dir = str(payload.get("outputDir", result["outputDir"])).strip()
    output_dir = os.path.expandvars(os.path.expanduser(output_dir))
    result["outputDir"] = output_dir or str(default_output_dir())

    gemini_model = str(payload.get("geminiModel", result["geminiModel"])).strip()
    result["geminiModel"] = gemini_model or DEFAULT_GEMINI_MODEL

    result["initialPrompt"] = str(payload.get("initialPrompt", "")).strip()
    return result


def _write_settings(settings: dict[str, Any]) -> None:
    path = settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    temporary.replace(path)


def load_settings() -> dict[str, Any]:
    path = settings_path()
    defaults = default_settings()
    try:
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            return normalize_settings(data, defaults)
    except (OSError, ValueError):
        pass

    try:
        _write_settings(defaults)
    except OSError:
        pass
    return defaults


# -------------------------------------------------------------------- eventos


class UiReporter(Reporter):
    """Convierte el progreso del backend en eventos para la ventana."""

    def __init__(
        self,
        emit: Callable[[dict[str, Any]], None],
        *,
        on_completed: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        self._emit = emit
        self._on_completed = on_completed
        self._last_time = 0.0

    def stage(self, stage: str, message: str, **data: Any) -> None:
        self._emit({"event": "stage", "stage": stage, "message": message, **data})

    def info(self, message: str) -> None:
        self._emit({"event": "info", "message": message})

    def progress(self, stage: str, current: float, total: float) -> None:
        now = time.perf_counter()
        if now - self._last_time < 0.25:
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
        if self._on_completed is not None:
            self._on_completed(payload)
        self._emit({"event": "completed", **payload})

    def summary(self, payload: dict[str, Any]) -> None:
        self._emit({"event": "summary", **payload})

    def error(self, code: str, message: str) -> None:
        self._emit({"event": "error", "code": code, "message": message})


# ----------------------------------------------------------------------- API


class DesktopApi:
    """Métodos expuestos a JavaScript como `pywebview.api.*`."""

    def __init__(self, window: Any = None) -> None:
        self._window = window
        self._lock = threading.Lock()
        self._cancel = threading.Event()
        self._worker: threading.Thread | None = None
        self._last_text: str = ""
        self._last_source: Path | None = None
        self._last_outputs: list[Path] = []
        self._settings = load_settings()

        for directory in (
            Path(self._settings["outputDir"]),
            models_directory(),
            app_data_dir(),
        ):
            try:
                directory.mkdir(parents=True, exist_ok=True)
            except OSError:
                pass

    def attach(self, window: Any) -> None:
        self._window = window

    # ------------------------------------------------------------- utilidades

    def _emit(self, payload: dict[str, Any]) -> None:
        window = self._window
        if window is None:
            return
        try:
            data = json.dumps(payload, ensure_ascii=False)
        except (TypeError, ValueError):
            return
        try:
            window.evaluate_js(f"window.voxnoteEmit({data});")
        except Exception:  # la ventana puede estar cerrándose
            pass

    @property
    def _busy(self) -> bool:
        return self._worker is not None and self._worker.is_alive()

    def _start(self, target: Callable[[], None]) -> None:
        thread = threading.Thread(target=target, daemon=True)
        self._worker = thread
        thread.start()

    # ------------------------------------------------------------- archivos

    def pick_file(self) -> dict[str, Any] | None:
        if self._window is None:
            return None
        try:
            import webview

            extensions = ";".join(f"*{ext}" for ext in sorted(SUPPORTED_EXTENSIONS))
            result = self._window.create_file_dialog(
                webview.FileDialog.OPEN,
                allow_multiple=False,
                file_types=(f"Video y audio ({extensions})", "Todos los archivos (*.*)"),
            )
        except Exception as exc:
            return {"error": str(exc)}  # type: ignore[return-value]

        if not result:
            return None
        path = Path(result[0])
        try:
            size = path.stat().st_size
        except OSError:
            size = None
        return {"path": str(path), "name": path.name, "size": size}

    def pick_folder(self) -> str | None:
        if self._window is None:
            return None
        try:
            import webview

            result = self._window.create_file_dialog(webview.FileDialog.FOLDER)
        except Exception:
            return None
        if not result:
            return None
        return str(result[0] if isinstance(result, (list, tuple)) else result)

    def open_path(self, path: str) -> dict[str, Any]:
        value = os.path.expandvars(os.path.expanduser(str(path or "").strip()))
        if not value:
            return {"ok": False, "error": "Ruta vacía."}
        target = Path(value)
        if not target.exists():
            return {"ok": False, "error": f"No existe: {target}"}
        try:
            os.startfile(str(target))  # type: ignore[attr-defined]
            return {"ok": True}
        except OSError as exc:
            return {"ok": False, "error": f"No se pudo abrir: {exc}"}

    # ----------------------------------------------------------- transcripción

    def transcribe(self, path: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
        if self._busy:
            return {"ok": False, "error": "Ya hay un proceso en curso."}

        source = Path(os.path.expandvars(os.path.expanduser(str(path or ""))))
        if not source.is_file():
            return {"ok": False, "error": f"No existe el archivo: {source}"}

        settings = normalize_settings(options, self._settings)
        self._settings = settings
        try:
            _write_settings(settings)
        except OSError:
            pass

        self._cancel.clear()
        self._last_text = ""
        self._last_outputs = []
        self._last_source = source

        self._start(lambda: self._run_transcription(source, settings))
        return {"ok": True}

    def _run_transcription(self, source: Path, settings: dict[str, Any]) -> None:
        reporter = UiReporter(self._emit, on_completed=self._remember)
        try:
            output_dir = Path(settings["outputDir"])
            output_dir.mkdir(parents=True, exist_ok=True)
            run_transcription(
                source,
                output_dir,
                options=TranscribeOptions(
                    model=settings["model"],
                    language=settings["language"] or None,
                    initial_prompt=settings["initialPrompt"] or None,
                    vad_filter=bool(settings["vad"]),
                ),
                formats=settings["formats"],
                force=True,
                reporter=reporter,
                should_cancel=self._cancel.is_set,
            )
        except VoxNoteError as exc:
            reporter.error(exc.code, str(exc))
        except Exception as exc:  # pragma: no cover - salvaguarda
            traceback.print_exc()
            reporter.error("UNEXPECTED", f"Error inesperado: {exc}")
        finally:
            with self._lock:
                self._worker = None

    def _remember(self, payload: dict[str, Any]) -> None:
        segments = payload.get("segments") or []
        self._last_text = " ".join(
            str(segment.get("text", "")).strip()
            for segment in segments
            if isinstance(segment, dict)
        ).strip()
        outputs = payload.get("outputs") or []
        self._last_outputs = [Path(str(path)) for path in outputs]
        source = payload.get("file")
        if source:
            self._last_source = Path(str(source))

    def cancel(self) -> dict[str, Any]:
        if not self._busy:
            return {"ok": True}
        self._cancel.set()
        return {"ok": True}

    def export_transcript(
        self,
        formats: str = "txt",
        source: str = "",
        segments: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        chosen = str(formats or "txt").lower()
        if chosen not in {"txt", "srt", "both"}:
            chosen = "txt"

        parsed: list[Segment] = []
        if isinstance(segments, list):
            for item in segments:
                if not isinstance(item, dict):
                    continue
                text = str(item.get("text", "")).strip()
                if not text:
                    continue
                try:
                    start = float(item.get("start", 0.0))
                    end = float(item.get("end", start))
                except (TypeError, ValueError):
                    start, end = 0.0, 0.0
                parsed.append(Segment(start=start, end=end, text=text))

        if not parsed and self._last_text:
            parsed = [Segment(start=0.0, end=0.0, text=self._last_text)]

        if not parsed:
            return {"ok": False, "error": "No hay una transcripción para exportar."}

        name = Path(str(source or self._last_source or "transcripcion")).stem
        output_dir = Path(self._settings["outputDir"])
        base = output_dir / (name or "transcripcion")

        paths: list[str] = []
        try:
            output_dir.mkdir(parents=True, exist_ok=True)
            if chosen in {"txt", "both"}:
                paths.append(str(write_txt(base.with_suffix(".txt"), parsed)))
            if chosen in {"srt", "both"}:
                paths.append(str(write_srt(base.with_suffix(".srt"), parsed)))
        except OSError as exc:
            return {"ok": False, "error": f"No se pudo guardar: {exc}"}

        return {"ok": True, "paths": paths}

    # ------------------------------------------------------------------ IA

    def generate_summary(self, model: str | None = None) -> dict[str, Any]:
        if self._busy:
            return {"ok": False, "error": "Ya hay un proceso en curso."}
        if not self._last_text.strip():
            return {"ok": False, "error": "Primero transcribe un archivo."}

        try:
            api_key = load_api_key()
        except CredentialError as exc:
            return {"ok": False, "error": str(exc)}

        if not api_key:
            return {
                "ok": False,
                "error": "Falta la API key de Gemini. Configúrala en Ajustes.",
            }

        transcript = self._last_text
        source_name = str(self._last_source or "transcripcion")
        if self._last_outputs:
            output_dir = self._last_outputs[0].parent
        else:
            output_dir = Path(self._settings["outputDir"])
        chosen_model = (model or self._settings.get("geminiModel") or "").strip()
        chosen_model = chosen_model or DEFAULT_GEMINI_MODEL

        self._start(
            lambda: self._run_summary(
                transcript, output_dir, source_name, api_key, chosen_model
            )
        )
        return {"ok": True}

    def _run_summary(
        self,
        transcript: str,
        output_dir: Path,
        source_name: str,
        api_key: str,
        model: str,
    ) -> None:
        reporter = UiReporter(self._emit)
        try:
            artifacts = summarize_transcript(
                transcript,
                output_dir,
                source_name=source_name,
                api_key=api_key,
                model=model,
                reporter=reporter,
            )
            reporter.summary(
                {
                    "summary": artifacts.summary,
                    "pdf": str(artifacts.pdf_path),
                    "json": str(artifacts.json_path),
                    "model": artifacts.model,
                }
            )
        except VoxNoteError as exc:
            reporter.error(exc.code, str(exc))
        except Exception as exc:  # pragma: no cover - salvaguarda
            traceback.print_exc()
            reporter.error("UNEXPECTED", f"Error inesperado: {exc}")
        finally:
            with self._lock:
                self._worker = None

    # ----------------------------------------------------------- credenciales

    def api_status(self) -> dict[str, Any]:
        has_key = False
        hint = ""
        error = ""
        try:
            key = load_api_key()
            has_key = bool(key)
            hint = api_key_hint(key) if key else ""
        except CredentialError as exc:
            error = str(exc)

        return {
            "hasKey": has_key,
            "hint": hint,
            "geminiModel": self._settings.get("geminiModel", DEFAULT_GEMINI_MODEL),
            "transcriptionModel": self._settings.get("model", DEFAULT_MODEL),
            "version": __version__,
            "settingsPath": str(settings_path()),
            "modelsDir": str(models_directory()),
            "keyError": error,
        }

    def save_api_key(self, key: str) -> dict[str, Any]:
        value = str(key or "").strip()
        if not value:
            return {"ok": False, "error": "La API key está vacía."}
        try:
            save_api_key(value)
        except CredentialError as exc:
            return {"ok": False, "error": str(exc)}
        return {"ok": True, "hint": api_key_hint(value)}

    def test_api_key(self, key: str = "") -> dict[str, Any]:
        value = str(key or "").strip()
        if not value:
            try:
                value = load_api_key()
            except CredentialError as exc:
                return {"ok": False, "error": str(exc)}
        if not value:
            return {"ok": False, "error": "Falta la API key de Gemini."}

        model = str(self._settings.get("geminiModel") or DEFAULT_GEMINI_MODEL)
        try:
            client = GeminiClient(value, model=model, timeout=45.0)
            client.validate()
        except VoxNoteError as exc:
            return {"ok": False, "error": str(exc)}
        except Exception as exc:  # pragma: no cover - salvaguarda
            return {"ok": False, "error": f"No se pudo validar la clave: {exc}"}

        return {
            "ok": True,
            "message": f"Conexión correcta con {client.last_model or model}.",
        }

    # --------------------------------------------------------------- ajustes

    def get_settings(self) -> dict[str, Any]:
        return dict(self._settings)

    def save_settings(self, settings: dict[str, Any]) -> dict[str, Any]:
        merged = normalize_settings(settings, self._settings)
        try:
            _write_settings(merged)
            Path(merged["outputDir"]).mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            return {"ok": False, "error": f"No se pudieron guardar los ajustes: {exc}"}
        self._settings = merged
        return {"ok": True}


# ----------------------------------------------------------------------- main


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="voxnote-desktop",
        description="Interfaz de escritorio de VoxNote.",
    )
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Carga el servidor de Vite en http://localhost:5173.",
    )
    parser.add_argument(
        "--url",
        default=None,
        help="URL alternativa para cargar la interfaz.",
    )
    parser.add_argument("--debug", action="store_true", help="Activa las DevTools.")
    args = parser.parse_args(argv)

    try:
        import webview
    except ImportError:
        print(
            "Falta pywebview. Instala las dependencias con:\n"
            "    pip install -r requirements.txt",
            file=sys.stderr,
        )
        return 1

    url = args.url
    if not url:
        url = "http://localhost:5173" if args.dev else str(FRONTEND_DIST)

    if not args.dev and not args.url and not FRONTEND_DIST.exists():
        print(
            "No se encontró la interfaz compilada.\n"
            f"Esperada en: {FRONTEND_DIST}\n"
            "Compílala con:\n"
            "    cd frontend\n"
            "    npm install\n"
            "    npm run build",
            file=sys.stderr,
        )
        return 1

    api = DesktopApi()
    window = webview.create_window(
        "VoxNote · Transcripción local",
        url=url,
        js_api=api,
        width=1400,
        height=900,
        min_size=(1080, 720),
        background_color="#070A14",
        text_select=True,
    )
    if window is None:  # pragma: no cover
        print("No se pudo crear la ventana.", file=sys.stderr)
        return 1

    api.attach(window)

    try:
        webview.start(
            debug=args.debug,
            http_server=not args.dev and not args.url,
            private_mode=False,
            storage_path=str(app_data_dir() / "webview"),
        )
    except KeyboardInterrupt:
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
