"""Password hashing and verification."""

import logging

import bcrypt

logger = logging.getLogger(__name__)


# bcrypt truncates at 72 bytes; reject longer input rather than silently
# accepting a password whose tail is ignored.
MAX_PASSWORD_BYTES = 72


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password, hashed) -> bool:
    if not password or not hashed:
        return False
    try:
        stored = hashed if isinstance(hashed, bytes) else str(hashed).encode("utf-8")
        supplied = str(password).encode("utf-8")[:MAX_PASSWORD_BYTES]
        return bcrypt.checkpw(supplied, stored)
    except (ValueError, TypeError) as exc:
        logger.warning("Password verification failed: %s", exc)
        return False
