import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import get_settings

ENCRYPTION_PREFIX = "enc:v1:"


def _key() -> bytes:
    return hashlib.sha256(get_settings().data_encryption_secret.encode("utf-8")).digest()


def encrypt_text(value: str | None) -> str:
    if not value:
        return ""
    if value.startswith(ENCRYPTION_PREFIX):
        return value
    nonce = os.urandom(12)
    ciphertext = AESGCM(_key()).encrypt(nonce, value.encode("utf-8"), None)
    return ENCRYPTION_PREFIX + base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")


def decrypt_text(value: str | None) -> str:
    if not value:
        return ""
    if not value.startswith(ENCRYPTION_PREFIX):
        return value
    payload = base64.urlsafe_b64decode(value[len(ENCRYPTION_PREFIX) :].encode("ascii"))
    nonce, ciphertext = payload[:12], payload[12:]
    return AESGCM(_key()).decrypt(nonce, ciphertext, None).decode("utf-8")


def reset_token_digest(token: str) -> str:
    return "sha256:" + hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_reset_token(token: str, stored_token: str | None) -> bool:
    if not stored_token:
        return False
    if stored_token.startswith("sha256:"):
        return stored_token == reset_token_digest(token)
    return stored_token == token
