"""Tests de la CLI: valores por defecto y opciones expuestas."""

from __future__ import annotations

from voxnote.cli import EXIT_CODES, build_parser


def test_defaults():
    args = build_parser().parse_args(["video.mp4"])
    assert args.model == "small"
    assert args.lang == "es"
    assert args.format == "both"
    assert args.start_minutes == 0.0
    assert args.max_minutes is None
    assert args.initial_prompt is None
    assert args.json is False
    assert args.force is False


def test_json_and_format_options():
    args = build_parser().parse_args(
        ["video.mp4", "--json", "--format", "srt", "--lang", "auto"]
    )
    assert args.json is True
    assert args.format == "srt"
    assert args.lang == "auto"


def test_exit_codes_are_stable():
    assert EXIT_CODES["CANCELLED"] == 130
    assert EXIT_CODES["OUTPUT_EXISTS"] == 3
    assert EXIT_CODES["NO_AUDIO_TRACK"] == 2
