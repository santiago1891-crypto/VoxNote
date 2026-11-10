"""Tests de exportación TXT/SRT (sin modelo, rápidos)."""

from __future__ import annotations

from voxnote.export import format_timestamp, to_srt, to_timestamped_text
from voxnote.transcribe import Segment


def test_format_timestamp():
    assert format_timestamp(0) == "00:00:00"
    assert format_timestamp(59.6) == "00:01:00"  # redondeo
    assert format_timestamp(3725) == "01:02:05"


def test_timestamped_text():
    segments = [Segment(3.0, 5.0, "Hola."), Segment(5.2, 7.0, "¿Qué tal?")]
    assert to_timestamped_text(segments) == (
        "[00:00:03] Hola.\n[00:00:05] ¿Qué tal?\n"
    )


def test_srt_blocks():
    segments = [
        Segment(3.0, 5.0, "Hola."),
        Segment(5.2, 62.5, "¿Qué tal?"),
    ]
    text = to_srt(segments)
    assert text.startswith("1\n00:00:03,000 --> 00:00:05,000\nHola.\n\n2\n")
    assert "00:00:05,200 --> 00:01:02,500\n¿Qué tal?\n" in text
    assert text.endswith("\n")


def test_srt_zero_length_segment():
    text = to_srt([Segment(1.0, 1.0, "x")])
    assert "00:00:01,000 --> 00:00:01,001" in text


def test_timestamps_sanitize_non_finite_values():
    assert format_timestamp(float("nan")) == "00:00:00"
    assert format_timestamp(float("inf")) == "00:00:00"
    assert format_timestamp(float("-inf")) == "00:00:00"
    assert format_timestamp(-5) == "00:00:00"


def test_srt_sanitizes_non_finite_values():
    text = to_srt([Segment(float("nan"), float("inf"), "x")])
    assert "00:00:00,000 --> 00:00:00,001" in text

    text = to_srt([Segment(2.0, float("nan"), "y")])
    assert "00:00:02,000 --> 00:00:02,001" in text
