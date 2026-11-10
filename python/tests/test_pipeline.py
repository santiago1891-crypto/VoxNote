"""Tests de orquestación y del protocolo de eventos (sin cargar el modelo)."""

from __future__ import annotations

import io
import json
from pathlib import Path

import pytest

from voxnote.errors import MediaError, OutputError, TranscriptionCancelled
from voxnote.media import decode_clip, probe
from voxnote.pipeline import TranscribeOptions, run_transcription
from voxnote.report import JsonReporter, Reporter
from tests.test_media import make_tone


class FakeReporter(Reporter):
    def __init__(self) -> None:
        self.stages: list[str] = []
        self.infos: list[str] = []
        self.errors: list[tuple[str, str]] = []
        self.completed_payload: dict | None = None

    def stage(self, stage: str, message: str, **data) -> None:
        self.stages.append(stage)

    def info(self, message: str) -> None:
        self.infos.append(message)

    def progress(self, stage: str, current: float, total: float) -> None:
        return

    def finish_progress(self) -> None:
        return

    def completed(self, payload: dict) -> None:
        self.completed_payload = payload

    def error(self, code: str, message: str) -> None:
        self.errors.append((code, message))


def test_missing_input_raises_file_not_found(tmp_path: Path):
    reporter = FakeReporter()
    with pytest.raises(MediaError) as excinfo:
        run_transcription(
            tmp_path / "no-existe.mp4",
            tmp_path / "salida",
            options=TranscribeOptions(),
            reporter=reporter,
        )
    assert excinfo.value.code == "FILE_NOT_FOUND"
    assert reporter.stages == ["prepare"]


def test_existing_output_blocks_without_force(tmp_path: Path):
    media = tmp_path / "tono.wav"
    make_tone(media, seconds=1.0)
    out = tmp_path / "salida"
    out.mkdir()
    (out / "tono.txt").write_text("anterior", encoding="utf-8")

    reporter = FakeReporter()
    with pytest.raises(OutputError) as excinfo:
        run_transcription(
            media,
            out,
            options=TranscribeOptions(),
            formats="txt",
            force=False,
            reporter=reporter,
        )
    assert excinfo.value.code == "OUTPUT_EXISTS"


def test_unsupported_format_code(tmp_path: Path):
    file = tmp_path / "x.xyz"
    file.write_text("x", encoding="utf-8")
    with pytest.raises(MediaError) as excinfo:
        probe(file)
    assert excinfo.value.code == "UNSUPPORTED_FORMAT"


def test_json_reporter_emits_ndjson():
    stream = io.StringIO()
    reporter = JsonReporter(stream=stream, log_stream=io.StringIO())

    reporter.stage("prepare", "preparando", file="a.mp4")
    reporter.progress("transcription", 2.0, 10.0)
    reporter.completed({"segments_count": 3, "outputs": ["a.txt"]})

    events = [json.loads(line) for line in stream.getvalue().splitlines()]
    assert events[0] == {
        "event": "stage",
        "stage": "prepare",
        "message": "preparando",
        "file": "a.mp4",
    }
    assert events[1]["event"] == "progress"
    assert events[1]["percent"] == 20.0
    assert events[2]["event"] == "completed"
    assert events[2]["segments_count"] == 3


def test_json_reporter_error_event():
    stream = io.StringIO()
    reporter = JsonReporter(stream=stream, log_stream=io.StringIO())
    reporter.error("NO_AUDIO_TRACK", "sin audio")
    event = json.loads(stream.getvalue().strip())
    assert event == {
        "event": "error",
        "code": "NO_AUDIO_TRACK",
        "message": "sin audio",
    }


def test_decode_clip_is_used_by_probe(tmp_path: Path):
    media = tmp_path / "tono.wav"
    make_tone(media, seconds=1.0)
    info = probe(media)
    samples = decode_clip(media)
    assert info.duration > 0
    assert samples.size > 0


@pytest.mark.parametrize(
    "start, duration",
    [
        (float("nan"), None),
        (float("inf"), None),
        (-1.0, None),
        (0.0, float("nan")),
        (0.0, float("inf")),
        (0.0, -2.0),
    ],
)
def test_invalid_ranges_fail_before_probe(tmp_path: Path, start: float, duration):
    reporter = FakeReporter()
    with pytest.raises(MediaError) as excinfo:
        run_transcription(
            tmp_path / "no-existe.mp4",
            tmp_path / "salida",
            options=TranscribeOptions(start_seconds=start, duration=duration),
            reporter=reporter,
        )
    assert excinfo.value.code == "INVALID_ARGUMENT"
    # La validación ocurre antes de tocar el archivo.
    assert reporter.stages == []


def test_start_after_end_is_rejected(tmp_path: Path):
    media = tmp_path / "tono.wav"
    make_tone(media, seconds=1.0)
    reporter = FakeReporter()
    with pytest.raises(MediaError) as excinfo:
        run_transcription(
            media,
            tmp_path / "salida",
            options=TranscribeOptions(start_seconds=5.0),
            reporter=reporter,
        )
    assert excinfo.value.code == "INVALID_ARGUMENT"


def test_cancel_before_probe(tmp_path: Path):
    reporter = FakeReporter()
    with pytest.raises(TranscriptionCancelled):
        run_transcription(
            tmp_path / "no-existe.mp4",
            tmp_path / "salida",
            options=TranscribeOptions(),
            reporter=reporter,
            should_cancel=lambda: True,
        )
    assert reporter.stages == []
