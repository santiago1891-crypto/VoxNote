"""Tests de inspección y decodificación con archivos generados en el momento."""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

import numpy as np
import pytest

from voxnote.media import MediaError, SUPPORTED_EXTENSIONS, decode_clip, probe


def make_tone(path: Path, seconds: float = 1.0, rate: int = 8_000) -> None:
    frames = b"".join(
        struct.pack("<h", int(3_000 * math.sin(2 * math.pi * 440 * i / rate)))
        for i in range(int(rate * seconds))
    )
    with wave.open(str(path), "wb") as handler:
        handler.setnchannels(1)
        handler.setsampwidth(2)
        handler.setframerate(rate)
        handler.writeframes(frames)


def test_supported_extensions_includes_common_formats():
    for extension in (".mp4", ".mkv", ".mp3", ".m4a", ".wav", ".flac"):
        assert extension in SUPPORTED_EXTENSIONS


def test_probe_missing_file(tmp_path: Path):
    with pytest.raises(MediaError) as excinfo:
        probe(tmp_path / "no-existe.mp4")
    assert excinfo.value.code == "FILE_NOT_FOUND"


def test_probe_unsupported_format(tmp_path: Path):
    file = tmp_path / "archivo.xyz"
    file.write_text("no soy multimedia", encoding="utf-8")
    with pytest.raises(MediaError) as excinfo:
        probe(file)
    assert excinfo.value.code == "UNSUPPORTED_FORMAT"


def test_probe_and_decode_wav(tmp_path: Path):
    file = tmp_path / "tono.wav"
    make_tone(file, seconds=1.0)

    info = probe(file)
    assert info.has_audio is True
    assert info.sample_rate == 8_000
    assert info.channels == 1
    assert info.duration == pytest.approx(1.0, abs=0.1)

    samples = decode_clip(file)
    assert samples.dtype == np.float32
    assert samples.ndim == 1
    assert samples.size == pytest.approx(16_000, abs=200)


def test_decode_clip_duration_limit(tmp_path: Path):
    file = tmp_path / "tono.wav"
    make_tone(file, seconds=2.0)

    samples = decode_clip(file, start=0.5, duration=0.5)
    assert samples.size == pytest.approx(8_000, abs=200)


def test_decode_clip_rejects_invalid_arguments(tmp_path: Path):
    file = tmp_path / "tono.wav"
    make_tone(file)

    with pytest.raises(MediaError) as excinfo:
        decode_clip(file, start=-1)
    assert excinfo.value.code == "INVALID_ARGUMENT"

    with pytest.raises(MediaError) as excinfo:
        decode_clip(file, duration=0)
    assert excinfo.value.code == "INVALID_ARGUMENT"
