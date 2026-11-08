"""Tests de la normalización de ajustes y del puente de escritorio (sin GUI)."""

from __future__ import annotations

import os

from voxnote.desktop import default_settings, normalize_settings


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
