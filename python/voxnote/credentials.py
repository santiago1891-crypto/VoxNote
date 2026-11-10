"""Almacenamiento seguro de la API key en el almacén de credenciales del SO."""

from __future__ import annotations

import os

from .errors import CredentialError

SERVICE = "VoxNote"
ACCOUNT = "gemini-api-key"


def _keyring():
    try:
        import keyring
    except ImportError as exc:  # pragma: no cover - depende del entorno
        raise CredentialError(
            "Falta el módulo 'keyring'. Instala las dependencias actualizadas.",
            "KEYRING_MISSING",
        ) from exc
    return keyring


def load_api_key() -> str:
    """Devuelve la clave guardada o la de las variables de entorno."""
    env_value = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if env_value:
        return env_value.strip()

    try:
        stored = _keyring().get_password(SERVICE, ACCOUNT)
    except CredentialError:
        raise
    except Exception as exc:  # pragma: no cover - depende del entorno
        raise CredentialError(
            f"No se pudo leer la API key del almacén de Windows: {exc}",
            "CREDENTIAL_READ_FAILED",
        ) from exc

    return (stored or "").strip()


def has_api_key() -> bool:
    return bool(load_api_key())


def save_api_key(api_key: str) -> None:
    value = (api_key or "").strip()
    if not value:
        raise CredentialError("La API key está vacía.", "INVALID_ARGUMENT")

    try:
        _keyring().set_password(SERVICE, ACCOUNT, value)
    except CredentialError:
        raise
    except Exception as exc:  # pragma: no cover - depende del entorno
        raise CredentialError(
            f"No se pudo guardar la API key en el almacén de Windows: {exc}",
            "CREDENTIAL_WRITE_FAILED",
        ) from exc


def delete_api_key() -> None:
    keyring = _keyring()
    try:
        if keyring.get_password(SERVICE, ACCOUNT) is not None:
            keyring.delete_password(SERVICE, ACCOUNT)
    except Exception as exc:  # pragma: no cover - depende del entorno
        raise CredentialError(
            f"No se pudo borrar la API key: {exc}",
            "CREDENTIAL_DELETE_FAILED",
        ) from exc


def api_key_hint(api_key: str) -> str:
    """Muestra solo el final de la clave (nunca la clave completa)."""
    value = (api_key or "").strip()
    if len(value) <= 6:
        return "••••"
    return "••••" + value[-4:]
