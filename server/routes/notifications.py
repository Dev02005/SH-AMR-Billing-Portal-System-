"""Notification delivery for the server and billing portals."""

import logging

from flask import Blueprint, request

from server import notifications
from server.api import handle_errors, ok, roles_required

logger = logging.getLogger(__name__)

bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")

EVERYONE = ("waiter", "cook", "cashier", "admin")


@bp.get("")
@roles_required(*EVERYONE)
@handle_errors
def pending(user):
    """Notices this user has not acknowledged yet."""
    return ok({"notifications": notifications.pending_for(user)})


@bp.post("/seen")
@roles_required(*EVERYONE)
@handle_errors
def acknowledge(user):
    """Mark notices as read for this user only, so each portal sees them once."""
    ids = (request.get_json(silent=True) or {}).get("ids", [])
    if not isinstance(ids, list):
        ids = []
    return ok({"acknowledged": notifications.mark_seen(user, ids)})
