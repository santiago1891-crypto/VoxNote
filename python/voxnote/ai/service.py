"""Servicio de resumen: Gemini + JSON + PDF."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..credentials import api_key_hint, load_api_key
from ..errors import OutputError
from ..report import Reporter
from .gemini import DEFAULT_MODEL, GeminiClient, normalize_summary
from .pdf import render_summary_pdf


@dataclass(frozen=True)
class SummaryArtifacts:
    summary: dict[str, Any]
    pdf_path: Path
    json_path: Path
    model: str


def resolve_model(explicit: str | None = None) -> str:
    return (explicit or os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL).strip()


def summarize_transcript(
    transcript: str,
    output_dir: str | Path,
    *,
    source_name: str = "",
    api_key: str | None = None,
    model: str | None = None,
    reporter: Reporter | None = None,
) -> SummaryArtifacts:
    """Genera el resumen con Gemini y lo guarda como JSON y PDF."""
    key = (api_key or load_api_key()).strip()
    if not key:
        from ..errors import AIError

        raise AIError(
            "Falta la API key de Gemini. Configúrala en Ajustes.",
            "AI_KEY_MISSING",
        )

    resolved_model = resolve_model(model)

    if reporter is not None:
        reporter.stage("summary", "Generando resumen con Gemini")
        reporter.info(f"Clave: {api_key_hint(key)}")
        reporter.info(f"Modelo: {resolved_model}")
        reporter.info(
            "Solo se envía el texto de la transcripción; el video y el audio "
            "permanecen en el equipo."
        )

    client = GeminiClient(key, model=resolved_model)
    summary = client.generate_summary(transcript)

    output_dir = Path(output_dir).expanduser()
    base = output_dir / f"{Path(source_name).stem or 'resumen'}_resumen"

    json_path = base.with_suffix(".json")
    pdf_path = base.with_suffix(".pdf")
    try:
        base.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(
            json.dumps(
                {
                    "summary": summary,
                    "meta": {
                        "source": Path(source_name).name if source_name else "",
                        "model": client.last_model or resolved_model,
                        "usage": client.last_usage,
                    },
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        render_summary_pdf(
            summary,
            pdf_path,
            source_name=source_name,
            model=client.last_model or resolved_model,
        )
    except OSError as exc:
        raise OutputError(
            f"No se pudo guardar el resumen en {output_dir}: {exc}",
            "WRITE_FAILED",
        ) from exc

    if reporter is not None:
        reporter.info(f"PDF: {pdf_path}")
        reporter.info(f"JSON: {json_path}")

    return SummaryArtifacts(
        summary=summary,
        pdf_path=pdf_path,
        json_path=json_path,
        model=client.last_model or resolved_model,
    )


_TIMESTAMP_PREFIX = re.compile(r"(?m)^\[\d{2}:\d{2}:\d{2}\]\s?")


def parse_transcript_file(path: str | Path) -> str:
    """Lee un TXT de transcripción aceptando UTF-8 con o sin BOM.

    VoxNote escribe cada segmento con una marca `[HH:MM:SS]`; se eliminan
    para no enviar ruido a Gemini al resumir un TXT ya generado.
    """
    file = Path(path).expanduser()
    text = file.read_text(encoding="utf-8-sig")
    return _TIMESTAMP_PREFIX.sub("", text).strip()
