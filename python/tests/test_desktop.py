"""Tests de la normalización de ajustes y del puente de escritorio (sin GUI)."""

from __future__ import annotations

import os

import pytest

import voxnote.desktop as desktop
from voxnote.desktop import (
    default_settings,
    normalize_settings,
    parse_segments,
    transcript_from_segments,
)


@pytest.fixture
def api(tmp_path, monkeypatch):
    """API de escritorio aislada de los directorios reales del usuario."""
    monkeypatch.setattr(desktop, "app_data_dir", lambda: tmp_path / "data")
    monkeypatch.setattr(
        desktop, "settings_path", lambda: tmp_path / "data" / "settings.json"
    )
    monkeypatch.setattr(desktop, "models_directory", lambda: tmp_path / "models")
    monkeypatch.setattr(desktop, "default_output_dir", lambda: tmp_path / "output")
    return desktop.DesktopApi()


def test_normalize_uses_defaults():
    base = default_settings()
    assert normalize_settings(None, base) == base
    assert normalize_settings({}, base) == base


def test_normalize_rejects_unknown_model():
    result = normalize_settings({"model": "huge"}, default_settings())
    assert result["model"] == "small"


def test_normalize_formats_language_and_vad():
    result = normalize_settings(
        {"formats": "pdf", "language": "AUTO", "vad": 0}, default_settings()
    )
    assert result["formats"] == "both"
    assert result["language"] == ""
    assert result["vad"] is False


def test_normalize_keeps_valid_values():
    result = normalize_settings(
        {
            "model": "large-v3-turbo",
            "language": "ES",
            "formats": "srt",
            "initialPrompt": "  FNC y FND  ",
            "geminiModel": "",
        },
        default_settings(),
    )
    assert result["model"] == "large-v3-turbo"
    assert result["language"] == "es"
    assert result["formats"] == "srt"
    assert result["initialPrompt"] == "FNC y FND"
    assert result["geminiModel"] == "gemini-3.5-flash"


def test_normalize_expands_environment_variables(monkeypatch):
    monkeypatch.setenv("VOXNOTE_TEST_DIR", os.path.join("C:", "tmp", "vox"))
    expected = os.path.join("C:", "tmp", "vox", "salida")
    result = normalize_settings(
        {"outputDir": "%VOXNOTE_TEST_DIR%\\salida"}, default_settings()
    )
    assert result["outputDir"] == expected


def test_normalize_keeps_base_initial_prompt():
    base = {**default_settings(), "initialPrompt": "FNC y FND"}
    result = normalize_settings({"model": "base"}, base)
    assert result["model"] == "base"
    assert result["initialPrompt"] == "FNC y FND"


def test_parse_segments_sanitizes_values():
    parsed = parse_segments(
        [
            {"start": "1.5", "end": 2, "text": " Hola "},
            {"start": float("nan"), "end": None, "text": "Mundo"},
            {"start": -3, "end": -1, "text": "Negativo"},
            {"start": 0, "text": "   "},
            "suelto",
        ]
    )
    assert [(item.start, item.end, item.text) for item in parsed] == [
        (1.5, 2.0, "Hola"),
        (0.0, 0.0, "Mundo"),
        (0.0, 0.0, "Negativo"),
    ]


def test_transcript_from_segments_joins_text():
    assert transcript_from_segments([{"text": "uno"}, {"text": " dos "}]) == "uno dos"
    assert transcript_from_segments(None) == ""


def test_export_transcript_uses_explicit_output_dir(api, tmp_path):
    destination = tmp_path / "destino"
    result = api.export_transcript(
        "both",
        r"C:\videos\clase.mp4",
        [{"start": 0, "end": 1, "text": "Hola"}],
        str(destination),
    )
    assert result["ok"] is True
    assert (destination / "clase.txt").exists()
    assert (destination / "clase.srt").exists()
    assert result["paths"] == [
        str(destination / "clase.txt"),
        str(destination / "clase.srt"),
    ]


def test_export_transcript_requires_content(api):
    assert api.export_transcript("txt", "clase.mp4", []) == {
        "ok": False,
        "error": "No hay una transcripción para exportar.",
    }


def test_generate_summary_without_transcript(api):
    assert api.generate_summary() == {
        "ok": False,
        "error": "Primero transcribe un archivo.",
    }


def test_generate_summary_accepts_segments_from_recent(api, monkeypatch):
    # Un reciente restaurado tras reiniciar ya no vive en `_last_text`.
    monkeypatch.setattr(desktop, "load_api_key", lambda: "")
    result = api.generate_summary(
        "gemini-3.5-flash",
        r"C:\videos\clase.mp4",
        [{"start": 0, "end": 1, "text": "Hola"}],
        "",
    )
    assert result["ok"] is False
    assert "API key" in result["error"]


def test_save_settings_creates_output_dir(api, tmp_path):
    destination = tmp_path / "nueva" / "salida"
    result = api.save_settings({**api.get_settings(), "outputDir": str(destination)})
    assert result["ok"] is True
    assert destination.is_dir()
