"""Errores con código estable para la interfaz y el protocolo JSON.

Los mensajes son para el usuario final; los códigos son para que la interfaz
(o cualquier cliente) decida qué hacer sin depender del texto.
"""

from __future__ import annotations


class VoxNoteError(Exception):
    """Error de dominio con un código estable."""

    default_code = "ERROR"

    def __init__(self, message: str, code: str | None = None) -> None:
        super().__init__(message)
        self.code = code or self.default_code


class MediaError(VoxNoteError):
    default_code = "MEDIA_ERROR"


class TranscriptionError(VoxNoteError):
    default_code = "TRANSCRIPTION_FAILED"


class TranscriptionCancelled(VoxNoteError):
    default_code = "CANCELLED"


class OutputError(VoxNoteError):
    default_code = "OUTPUT_ERROR"


class AIError(VoxNoteError):
    default_code = "AI_ERROR"


class CredentialError(VoxNoteError):
    default_code = "CREDENTIAL_ERROR"
