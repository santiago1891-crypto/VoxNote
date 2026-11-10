"""Cliente mínimo de la API de Gemini (REST, sin SDK).

Se usa `urllib` de la biblioteca estándar para no añadir dependencias. La API
key nunca se escribe en logs ni en archivos.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from ..errors import AIError
from .prompts import SYSTEM_INSTRUCTION, build_chunk_prompt, build_summary_prompt

BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_MODEL = "gemini-3.5-flash"
FALLBACK_MODELS = ("gemini-3.1-flash-lite",)

# Límites conservadores para no acercarse al contexto del modelo.
MAX_TRANSCRIPT_CHARS = 400_000
CHUNK_CHARS = 100_000

TRANSIENT_CODES = {"AI_UNAVAILABLE", "AI_TIMEOUT", "AI_QUOTA"}


class GeminiClient:
    """Genera resúmenes estructurados a partir de una transcripción."""

    def __init__(
        self,
        api_key: str | None = None,
        *,
        model: str = DEFAULT_MODEL,
        fallback_models: tuple[str, ...] = FALLBACK_MODELS,
        timeout: float = 180.0,
    ) -> None:
        self.api_key = (
            api_key
            or os.environ.get("GEMINI_API_KEY")
            or os.environ.get("GOOGLE_API_KEY")
            or ""
        ).strip()
        if not self.api_key:
            raise AIError(
                "Falta la API key de Gemini. Configúrala en Ajustes.",
                "AI_KEY_MISSING",
            )

        self.model = model or DEFAULT_MODEL
        self.fallback_models = tuple(
            name for name in fallback_models if name and name != self.model
        )
        self.timeout = timeout
        self.last_model: str | None = None
        self.last_usage: dict[str, Any] | None = None

    # ------------------------------------------------------------------ API

    def validate(self) -> bool:
        """Comprueba que la clave responde. Lanza AIError si no."""
        self._generate_text(
            "Responde únicamente con la palabra OK.",
            system=None,
            max_output_tokens=16,
            temperature=0.0,
        )
        return True

    def generate_summary(
        self, transcript: str, *, language: str = "español"
    ) -> dict[str, Any]:
        text = (transcript or "").strip()
        if not text:
            raise AIError("La transcripción está vacía.", "EMPTY_TRANSCRIPT")

        source = text
        if len(text) > MAX_TRANSCRIPT_CHARS:
            source = self._summarize_in_chunks(text, language=language)

        prompt = build_summary_prompt(source, language=language)
        raw = self._generate_json(
            prompt,
            system=SYSTEM_INSTRUCTION,
            temperature=0.2,
            max_output_tokens=8192,
        )
        return normalize_summary(raw)

    # --------------------------------------------------------------- internos

    def _summarize_in_chunks(self, text: str, *, language: str) -> str:
        chunks = _split_chunks(text, CHUNK_CHARS)
        partials: list[str] = []
        for index, chunk in enumerate(chunks, start=1):
            partials.append(
                self._generate_text(
                    build_chunk_prompt(
                        chunk, index=index, total=len(chunks), language=language
                    ),
                    system=SYSTEM_INSTRUCTION,
                    temperature=0.2,
                    max_output_tokens=1024,
                )
            )
        return "\n\n".join(partials)

    def _generate_text(
        self,
        prompt: str,
        *,
        system: str | None,
        temperature: float = 0.2,
        max_output_tokens: int = 2048,
    ) -> str:
        data = self._generate(
            prompt,
            system=system,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
        )
        return _extract_text(data)

    def _generate_json(
        self,
        prompt: str,
        *,
        system: str | None,
        temperature: float = 0.2,
        max_output_tokens: int = 8192,
    ) -> dict[str, Any]:
        data = self._generate(
            prompt,
            system=system,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            json_mode=True,
        )
        return extract_json(_extract_text(data))

    def _generate(
        self,
        prompt: str,
        *,
        system: str | None,
        temperature: float,
        max_output_tokens: int,
        json_mode: bool = False,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_output_tokens,
            },
        }
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}
        if json_mode:
            payload["generationConfig"]["responseMimeType"] = "application/json"

        models = (self.model, *self.fallback_models)
        last_error: AIError | None = None

        for model in models:
            for attempt in range(2):
                try:
                    data = self._post(model, payload)
                except AIError as exc:
                    last_error = exc
                    # Una clave inválida no se arregla cambiando de modelo.
                    if exc.code in {"AI_KEY_INVALID", "AI_KEY_MISSING"}:
                        raise
                    if exc.code in TRANSIENT_CODES and attempt == 0:
                        time.sleep(2.0 * (attempt + 1))
                        continue
                    break

                self.last_model = model
                self.last_usage = data.get("usageMetadata")
                return data

        raise last_error or AIError("Gemini no respondió.", "AI_UNAVAILABLE")

    def _post(self, model: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = (
            f"{BASE_URL}/models/{urllib.parse.quote(model, safe='')}"
            f":generateContent?key={urllib.parse.quote(self.api_key, safe='')}"
        )
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            raise _http_error(exc.code, detail) from exc
        except TimeoutError as exc:
            raise AIError(
                "Gemini tardó demasiado en responder. Inténtalo de nuevo.",
                "AI_TIMEOUT",
            ) from exc
        except urllib.error.URLError as exc:
            if isinstance(exc.reason, TimeoutError):
                raise AIError(
                    "Gemini tardó demasiado en responder. Inténtalo de nuevo.",
                    "AI_TIMEOUT",
                ) from exc
            raise AIError(
                "No se pudo conectar con Gemini. Comprueba tu conexión a internet.",
                "AI_NETWORK",
            ) from exc


def _http_error(status: int, detail: str) -> AIError:
    text = detail.lower()
    snippet = detail.replace("\n", " ")[:160]

    if status == 400 and ("api key" in text or "api_key_invalid" in text):
        return AIError(
            "La API key de Gemini no es válida. Revísala en Ajustes.",
            "AI_KEY_INVALID",
        )
    if status in (401, 403):
        return AIError(
            "Gemini rechazó la API key o no tiene permisos.",
            "AI_KEY_INVALID",
        )
    if status == 404:
        return AIError(
            "El modelo de Gemini no está disponible para esta clave. "
            "Prueba otro modelo en Ajustes.",
            "AI_MODEL_UNAVAILABLE",
        )
    if status == 429:
        return AIError(
            "Se agotó la cuota o el límite de peticiones de Gemini. "
            "Espera un momento e inténtalo de nuevo.",
            "AI_QUOTA",
        )
    if status >= 500:
        return AIError(
            "Gemini está saturado en este momento. Inténtalo de nuevo en unos minutos.",
            "AI_UNAVAILABLE",
        )
    return AIError(f"Gemini devolvió un error ({status}): {snippet}", "AI_ERROR")


def _extract_text(data: dict[str, Any]) -> str:
    feedback = data.get("promptFeedback") or {}
    if feedback.get("blockReason"):
        reason = feedback.get("blockReason")
        raise AIError(
            f"Gemini bloqueó la solicitud ({reason}). Acorta el texto o cambia el modelo.",
            "AI_BLOCKED",
        )

    candidates = data.get("candidates") or []
    if not candidates:
        raise AIError("Gemini no devolvió ninguna respuesta.", "AI_RESPONSE_INVALID")

    candidate = candidates[0]
    parts = (candidate.get("content") or {}).get("parts") or []
    text = "".join(part.get("text", "") for part in parts).strip()

    if candidate.get("finishReason") == "MAX_TOKENS" and not text:
        raise AIError(
            "La respuesta de Gemini quedó incompleta. Inténtalo de nuevo.",
            "AI_RESPONSE_INCOMPLETE",
        )
    if not text:
        reason = candidate.get("finishReason")
        if reason and reason != "STOP":
            raise AIError(
                f"Gemini detuvo la respuesta ({reason}). Prueba con otra "
                "transcripción o cambia el modelo.",
                "AI_RESPONSE_INCOMPLETE",
            )
        raise AIError("La respuesta de Gemini vino vacía.", "AI_RESPONSE_INVALID")

    return text


def extract_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end <= start:
        raise AIError(
            "Gemini no devolvió un resumen en formato válido. Inténtalo de nuevo.",
            "AI_RESPONSE_INVALID",
        )

    try:
        parsed = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as exc:
        raise AIError(
            "No se pudo interpretar el resumen generado. Inténtalo de nuevo.",
            "AI_RESPONSE_INVALID",
        ) from exc

    if not isinstance(parsed, dict):
        raise AIError(
            "El resumen generado tiene un formato inesperado.",
            "AI_RESPONSE_INVALID",
        )
    return parsed


def normalize_summary(raw: dict[str, Any]) -> dict[str, Any]:
    """Garantiza la estructura que espera la interfaz y el PDF."""

    sections: list[dict[str, Any]] = []
    for item in raw.get("sections") or []:
        if not isinstance(item, dict):
            continue
        heading = _as_text(item.get("heading"))
        summary = _as_text(item.get("summary"))
        bullets = _as_string_list(item.get("bullets"))
        if heading or summary:
            sections.append(
                {
                    "heading": heading or "Sección",
                    "summary": summary,
                    "bullets": bullets,
                }
            )

    concepts: list[dict[str, str]] = []
    for item in raw.get("concepts") or []:
        if isinstance(item, dict):
            term = _as_text(item.get("term"))
            definition = _as_text(item.get("definition"))
            if term:
                concepts.append({"term": term, "definition": definition})
        elif isinstance(item, str) and item.strip():
            concepts.append({"term": item.strip(), "definition": ""})

    result = {
        "title": _as_text(raw.get("title")) or "Resumen de la transcripción",
        "subtitle": _as_text(raw.get("subtitle")),
        "overview": _as_text(raw.get("overview")),
        "sections": sections,
        "key_ideas": _as_string_list(raw.get("key_ideas")),
        "concepts": concepts,
        "conclusions": _as_string_list(raw.get("conclusions")),
        "keywords": _as_string_list(raw.get("keywords")),
    }

    if not any(
        [
            result["overview"],
            sections,
            result["key_ideas"],
            concepts,
            result["conclusions"],
        ]
    ):
        raise AIError(
            "El resumen generado no contiene suficiente información. "
            "Prueba con otra transcripción o modelo.",
            "AI_RESPONSE_INVALID",
        )

    return result


def _as_text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _as_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _split_chunks(text: str, size: int) -> list[str]:
    chunks: list[str] = []
    current: list[str] = []
    length = 0

    for line in text.splitlines():
        if current and length + len(line) + 1 > size:
            chunks.append("\n".join(current))
            current = []
            length = 0
        current.append(line)
        length += len(line) + 1

    if current:
        chunks.append("\n".join(current))

    return chunks or [text]
