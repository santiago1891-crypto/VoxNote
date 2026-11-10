"""Tests del resumen: parseo de JSON, normalización y PDF (sin red)."""

from __future__ import annotations

from pathlib import Path

import pytest

from voxnote.ai.gemini import _split_chunks, extract_json, normalize_summary
from voxnote.ai.pdf import render_summary_pdf
from voxnote.ai.service import parse_transcript_file
from voxnote.cli import EXIT_CODES
from voxnote.errors import AIError
from voxnote.summarize import main as summarize_main

SAMPLE = {
    "title": "Formas normales en lógica proposicional",
    "subtitle": "Clase de repaso sobre FNC y FND",
    "overview": "La clase introduce las formas normales conjuntiva y disyuntiva.",
    "sections": [
        {
            "heading": "Generalización de conectivas",
            "summary": "Se extiende la conjunción y la disyunción a n fórmulas.",
            "bullets": ["Se define un operador para n términos", "Se usa notación con subíndices"],
        },
        {
            "heading": "FNC y FND",
            "summary": "Una fórmula está en FNC si es conjunción de disyunciones de literales.",
            "bullets": ["Los literales son átomos o negaciones"],
        },
    ],
    "key_ideas": ["La FNC es conjunción de cláusulas", "La FND es disyunción de términos"],
    "concepts": [
        {"term": "Literal", "definition": "Átomo o su negación."},
        {"term": "FNC", "definition": "Conjunción de disyunciones de literales."},
    ],
    "conclusions": ["Las formas normales permiten comparar fórmulas."],
    "keywords": ["lógica", "FNC", "FND", "literal"],
}


def test_extract_json_plain():
    assert extract_json('{"a": 1}') == {"a": 1}


def test_extract_json_with_code_fence():
    text = '```json\n{"a": 1}\n```'
    assert extract_json(text) == {"a": 1}


def test_extract_json_invalid():
    with pytest.raises(AIError) as excinfo:
        extract_json("esto no es json")
    assert excinfo.value.code == "AI_RESPONSE_INVALID"


def test_normalize_fills_defaults():
    normalized = normalize_summary({"overview": "Resumen mínimo."})
    assert normalized["title"] == "Resumen de la transcripción"
    assert normalized["sections"] == []
    assert normalized["key_ideas"] == []


def test_normalize_filters_bad_items():
    raw = {
        "overview": "x",
        "sections": [
            {"heading": "A", "summary": "b", "bullets": ["ok", 3, ""]},
            "texto suelto",
        ],
        "concepts": [{"term": "T", "definition": "D"}, "suelto", {"term": ""}],
        "key_ideas": ["idea", None, "  "],
    }
    normalized = normalize_summary(raw)
    assert len(normalized["sections"]) == 1
    assert normalized["sections"][0]["bullets"] == ["ok"]
    assert normalized["concepts"] == [
        {"term": "T", "definition": "D"},
        {"term": "suelto", "definition": ""},
    ]
    assert normalized["key_ideas"] == ["idea"]


def test_normalize_rejects_empty_content():
    with pytest.raises(AIError) as excinfo:
        normalize_summary({"sections": [{"heading": ""}]})
    assert excinfo.value.code == "AI_RESPONSE_INVALID"


def test_normalize_accepts_key_ideas_only():
    normalized = normalize_summary({"key_ideas": ["Idea principal", "Otra idea"]})
    assert normalized["overview"] == ""
    assert normalized["key_ideas"] == ["Idea principal", "Otra idea"]


def test_normalize_accepts_conclusions_only():
    normalized = normalize_summary({"conclusions": ["Conclusión final"]})
    assert normalized["conclusions"] == ["Conclusión final"]


def test_normalize_keeps_sections_with_only_bullets():
    normalized = normalize_summary(
        {"sections": [{"bullets": ["Dato uno", "Dato dos"]}]}
    )
    assert normalized["sections"] == [
        {
            "heading": "Sección",
            "summary": "",
            "bullets": ["Dato uno", "Dato dos"],
        }
    ]


def test_split_chunks_respects_limit():
    text = "\n".join(f"linea {i} " + "x" * 40 for i in range(100))
    chunks = _split_chunks(text, 500)
    assert len(chunks) > 1
    assert all(len(chunk) <= 520 for chunk in chunks)
    assert "\n".join(chunks) == text


def test_split_chunks_splits_single_long_line():
    text = "palabra " * 5_000  # ~40 000 caracteres en una sola línea
    chunks = _split_chunks(text, 1_000)
    assert len(chunks) > 1
    assert all(len(chunk) <= 1_000 for chunk in chunks)
    assert "".join(chunks) == text


def test_parse_transcript_file_strips_timestamp_marks(tmp_path: Path):
    path = tmp_path / "clase.txt"
    path.write_text(
        "[00:00:03] Hola.\n[00:00:05] ¿Qué tal?\n", encoding="utf-8"
    )
    assert parse_transcript_file(path) == "Hola.\n¿Qué tal?"


def test_summarize_reports_unreadable_file(tmp_path: Path, capsys):
    path = tmp_path / "malo.txt"
    path.write_bytes(b"\xff\xfe\x00texto")
    assert summarize_main([str(path), "--json"]) == EXIT_CODES["READ_FAILED"]
    assert '"code": "READ_FAILED"' in capsys.readouterr().out


def test_pdf_renders(tmp_path: Path):
    destination = render_summary_pdf(
        SAMPLE,
        tmp_path / "resumen.pdf",
        source_name="clase.mp4",
        model="gemini-3.5-flash",
    )
    data = destination.read_bytes()
    assert data.startswith(b"%PDF")
    assert len(data) > 2_000


def test_pdf_escapes_markup(tmp_path: Path):
    unsafe = dict(SAMPLE)
    unsafe["sections"] = [
        {
            "heading": "<b>no</b> es marcado",
            "summary": "Texto con < y & y > para escapar.",
            "bullets": ["<script>alert(1)</script>"],
        }
    ]
    destination = render_summary_pdf(unsafe, tmp_path / "unsafe.pdf", source_name="x")
    assert destination.read_bytes().startswith(b"%PDF")
