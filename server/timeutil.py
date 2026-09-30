"""Time helpers.

Everything is stored in MongoDB as UTC. The restaurant reasons in local
(IST) wall-clock time, so "today", the nightly bill-number reset and receipt
timestamps all go through here rather than calling ``datetime.now()`` - which
silently mixes naive local time with UTC-stored values.
"""

from datetime import datetime, timedelta, timezone

from server.config import config

LOCAL_TZ = timezone(timedelta(minutes=config.TIMEZONE_OFFSET_MINUTES))


def utc_now() -> datetime:
    """Timezone-aware current UTC time."""
    return datetime.now(timezone.utc)


def local_now() -> datetime:
    """Timezone-aware current local (restaurant) time."""
    return datetime.now(LOCAL_TZ)


def as_utc(value: datetime) -> datetime:
    """Attach UTC to a naive datetime; PyMongo returns naive UTC by default."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def local_day_start(days_ago: int = 0) -> datetime:
    """Midnight local time, expressed in UTC, for comparing against stored dates."""
    start = local_now().replace(hour=0, minute=0, second=0, microsecond=0)
    if days_ago:
        start -= timedelta(days=days_ago)
    return start.astimezone(timezone.utc)


def to_iso(value) -> str | None:
    """Serialize a stored datetime to an ISO-8601 string with a UTC offset."""
    if isinstance(value, datetime):
        return as_utc(value).isoformat()
    if isinstance(value, str):
        return value
    return None
