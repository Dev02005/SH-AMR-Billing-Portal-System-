"""Cross-portal notifications.

The kitchen, the waiters and the counter each run in a different browser, so
"table 7 is ready" has to travel through the database. A cook marking a ticket
ready writes one row here; the server and billing portals poll for rows aimed
at their role and show them once.

Rows are small and short-lived - `ensure_indexes` gives the collection a TTL so
old notices clean themselves up.
"""

import logging
from datetime import timedelta

from bson.objectid import ObjectId

from server import db
from server.timeutil import to_iso, utc_now

logger = logging.getLogger(__name__)

# How long a notice stays available to a portal that has not polled yet.
TTL_SECONDS = 60 * 60 * 6

# Only recent notices are worth showing. Without this, opening the till after
# a quiet spell buried the screen in a backlog of tables long since cleared.
RELEVANT_FOR = timedelta(minutes=30)

WAITERS = ("waiter",)
COUNTER = ("cashier", "admin")
FLOOR_AND_COUNTER = WAITERS + COUNTER


def emit(kind: str, message: str, audience, *, table_number: str = "", detail: dict | None = None) -> None:
    """Record a notice for every role in ``audience``.

    Never raises: a notification failing must not roll back the kitchen action
    that triggered it.
    """
    try:
        db.notifications.insert_one(
            {
                "kind": kind,
                "message": message,
                "audience": list(audience),
                "tableNumber": str(table_number),
                "detail": detail or {},
                "createdAt": utc_now(),
                "seenBy": [],
            }
        )
        logger.info("Notification (%s) for %s: %s", kind, ",".join(audience), message)
    except Exception as exc:  # noqa: BLE001 - notifications are best-effort
        logger.warning("Could not record notification: %s", exc)


def pending_for(user: dict, limit: int = 20) -> list[dict]:
    """Unseen notices for this user's role, oldest first."""
    role = user.get("role", "")
    user_id = str(user["_id"])

    rows = (
        db.notifications.find(
            {
                "audience": role,
                "seenBy": {"$ne": user_id},
                "createdAt": {"$gte": utc_now() - RELEVANT_FOR},
            }
        )
        .sort("createdAt", 1)
        .limit(limit)
    )
    return [
        {
            "id": str(row["_id"]),
            "kind": row.get("kind", "info"),
            "message": row.get("message", ""),
            "tableNumber": row.get("tableNumber", ""),
            "detail": row.get("detail", {}),
            "createdAt": to_iso(row.get("createdAt")),
        }
        for row in rows
    ]


def mark_seen(user: dict, ids: list[str]) -> int:
    """Record that this user has seen these notices. Returns how many matched."""
    object_ids = []
    for value in ids:
        try:
            object_ids.append(ObjectId(value))
        except Exception:  # noqa: BLE001 - skip anything malformed
            continue
    if not object_ids:
        return 0

    result = db.notifications.update_many(
        {"_id": {"$in": object_ids}},
        {"$addToSet": {"seenBy": str(user["_id"])}},
    )
    return result.modified_count
