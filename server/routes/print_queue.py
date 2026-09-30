"""Print queue: waiters send a bill, the cashier picks it up and prints it."""

import logging

from bson.errors import InvalidId
from bson.objectid import ObjectId
from flask import Blueprint, request

from server import db
from server.api import fail, handle_errors, ok, roles_required
from server.timeutil import to_iso, utc_now
from server.validation import validate_bill

logger = logging.getLogger(__name__)

bp = Blueprint("print_queue", __name__, url_prefix="/api/print-queue")

CASHIER_ROLES = ("admin", "cashier")


def _serialize(request_doc: dict) -> dict:
    """Shape a queued request for the cashier's Print Queue modal."""
    return {
        "_id": str(request_doc["_id"]),
        "ticketId": request_doc.get("ticketId"),
        "createdBy": request_doc.get("waiter", "Unknown"),
        "createdAt": to_iso(request_doc.get("createdAt")),
        "status": request_doc.get("status", "pending"),
        "source": request_doc.get("source", "server"),
        "billData": {
            "items": request_doc.get("items", []),
            "subtotal": request_doc.get("subtotal", 0),
            "discount": request_doc.get("discount", 0),
            "discountAmount": request_doc.get("discountAmount", 0),
            "total": request_doc.get("total", 0),
            "payment": request_doc.get("payment", "Cash"),
            "orderType": request_doc.get("orderType", "Dine-in"),
            "tableNo": request_doc.get("tableNo", ""),
        },
    }


def _object_id(value: str):
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        return None


@bp.post("")
@roles_required("waiter", "admin", "cashier")
@handle_errors
def enqueue(user):
    """A waiter sends the table's bill to the cashier for printing."""
    fields, error = validate_bill(request.get_json(silent=True) or {})
    if fields is None:
        return fail(error, 400)

    payload = request.get_json(silent=True) or {}
    doc = {
        **fields,
        # The kitchen order this request belongs to, so billing one settles both.
        "ticketId": str(payload.get("ticketId") or "") or None,
        "waiter": user.get("username", user.get("role", "Unknown")),
        "waiterId": str(user["_id"]),
        "status": "pending",
        "source": "server",
        "createdAt": utc_now(),
    }
    result = db.print_queue.insert_one(doc)

    logger.info("Print request from %s for table %r", doc["waiter"], doc["tableNo"] or "-")
    return ok({"message": "Print request sent", "requestId": str(result.inserted_id)}, 201)


@bp.get("")
@roles_required(*CASHIER_ROLES)
@handle_errors
def list_pending(user):
    requests = db.print_queue.find({"status": "pending"}).sort("createdAt", 1)
    return ok({"requests": [_serialize(r) for r in requests]})


@bp.delete("/<request_id>")
@roles_required(*CASHIER_ROLES)
@handle_errors
def discard(user, request_id):
    oid = _object_id(request_id)
    if oid is None:
        return fail("Invalid request id", 400)

    if db.print_queue.delete_one({"_id": oid}).deleted_count == 0:
        return fail("Request not found", 404)
    logger.info("Print request %s deleted by %s", request_id, user.get("username"))
    return ok({"message": "Print request deleted"})
