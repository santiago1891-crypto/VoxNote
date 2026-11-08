"""Exportación de transcripciones a archivos locales (TXT y SRT)."""

from __future__ import annotations

from pathlib import Path

from .transcribe import Segment


def format_timestamp(seconds: float) -> str:
    """HH:MM:SS para usar como marca de tiempo en el TXT."""
    total = max(0, int(round(seconds)))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def _srt_timestamp(seconds: float) -> str:
    """HH:MM:SS,mmm (formato de subtítulos SubRip)."""
    total_ms = max(0, int(round(seconds * 1000)))
    hours, remainder = divmod(total_ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def to_timestamped_text(segments: list[Segment]) -> str:
    lines = [f"[{format_timestamp(segment.start)}] {segment.text}" for segment in segments]
    return "\n".join(lines) + "\n"


def to_srt(segments: list[Segment]) -> str:
    blocks: list[str] = []
    for index, segment in enumerate(segments, start=1):
        start = segment.start
        end = max(segment.end, segment.start + 0.001)
        blocks.append(
            f"{index}\n{_srt_timestamp(start)} --> {_srt_timestamp(end)}\n"
            f"{segment.text}"
        )
    return "\n\n".join(blocks) + "\n"


def write_txt(path: str | Path, segments: list[Segment]) -> Path:
    """Escribe el TXT con una línea por segmento y su marca de tiempo."""
    destination = Path(path).expanduser()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(to_timestamped_text(segments), encoding="utf-8")
    return destination


def write_srt(path: str | Path, segments: list[Segment]) -> Path:
    """Escribe los subtítulos en formato SRT."""
    destination = Path(path).expanduser()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(to_srt(segments), encoding="utf-8")
    return destination
