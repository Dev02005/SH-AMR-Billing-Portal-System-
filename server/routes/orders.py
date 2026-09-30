"""Active tables - the live order board shared by the server, kitchen and billing portals.

A waiter opens a table here; the kitchen reads the same collection, so the
cook sees the order the moment it is sent. ``kitchenStatus`` lives on the
document rather than in the browser, so a refresh (or a second kitchen screen)
shows the same state.

Each "Send order" creates its own ticket, even for a table that already has
one open: a table that ordered biryani and then mandi shows two separate
kitchen tickets that cook and clear independently. The billing counter still
sees one floor cell per table, listing every ticket on it.
"""

import logging

from bson.errors import InvalidId
from bson.objectid import ObjectId
from flask import Blueprint, request

from server import db, notifications
from server.api import fail, handle_errors, ok, roles_required
from server.timeutil import to_iso, utc_now
from server.validation import validate_bill

logger = logging.getLogger(__name__)

bp = Blueprint("orders", __name__, url_prefix="/api/active-tables")

KITCHEN_STATUSES = ("new", "preparing", "ready", "served")

# Statuses that still belong on the cook's board.
BOARD_STATUSES = ("new", "preparing", "ready")
STAFF = ("waiter", "cashier", "admin")


def _by_id(ticket_id: str) -> dict:
    # pymongo does not cast _id strings on its own.
    try:
        return {"_id": ObjectId(ticket_id)}
    except (InvalidId, TypeError):
        return {"_id": ticket_id}


def _by_number(table_number: str) -> dict:
    """Match every ticket of a table whether stored as string or int (legacy rows)."""
    candidates: list = [str(table_number)]
    try:
        candidates.append(int(table_number))
    except (TypeError, ValueError):
        pass
    return {"tableNumber": {"$in": candidates}}


def _serialize(table: dict) -> dict:
    table["id"] = str(table.pop("_id"))
    table["tableNumber"] = str(table.get("tableNumber", ""))
    table["createdAt"] = to_iso(table.get("createdAt"))
    table["updatedAt"] = to_iso(table.get("updatedAt"))
    table.setdefault("kitchenStatus", "new")
    return table


@bp.post("")
@roles_required(*STAFF)
@handle_errors
def open_table(user):
    """Create a new ticket for every "Send order", even if the table is open.

    Items are never folded into an existing ticket: a table that orders
    biryani and then mandi shows two separate tickets on the kitchen board,
    each cooking and clearing on its own.
    """
    payload = request.get_json(silent=True) or {}
    table_number = str(payload.get("tableNumber", payload.get("tableNo", ""))).strip()
    if not table_number:
        return fail("Table number is required", 400)

    fields, error = validate_bill(payload)
    if fields is None:
        return fail(error, 400)

    now = utc_now()
    result = db.active_tables.insert_one(
        {
            **fields,
            "tableNumber": table_number,
            "status": "active",
            "kitchenStatus": "new",
            "waiter": user.get("username", "Unknown"),
            "waiterId": str(user["_id"]),
            "createdAt": now,
            "updatedAt": now,
        }
    )
    logger.info(
        "Ticket for table %s opened by %s (%d items)",
        table_number, user.get("username"), len(fields["items"]),
    )
    return ok({"message": "Order sent to the kitchen", "ticketId": str(result.inserted_id)}, 201)


@bp.get("")
@roles_required("waiter", "cook", "cashier", "admin")
@handle_errors
def list_tables(user):
    """Every open ticket. The kitchen board and the waiters' floor plan share this."""
    query: dict = {}
    status = request.args.get("kitchenStatus")
    if status in KITCHEN_STATUSES:
        query["kitchenStatus"] = status
    elif request.args.get("board") == "true":
        # The kitchen board hides served tickets; the floor plan and the
        # counter still need them, so this is opt-in.
        query["kitchenStatus"] = {"$in": list(BOARD_STATUSES)}

    tables = db.active_tables.find(query).sort("createdAt", 1)
    return ok({"tables": [_serialize(t) for t in tables]})


@bp.patch("/<ticket_id>/status")
@roles_required("cook", "admin", "cashier")
@handle_errors
def set_kitchen_status(user, ticket_id):
    """Move ONE ticket along new -> preparing -> ready -> served.

    Matching is by ticket id, so a table's second order can be preparing while
    the first is ready. Reaching ``ready`` or ``served`` notifies the floor and
    the counter.
    """
    status = str((request.get_json(silent=True) or {}).get("kitchenStatus", "")).strip()
    if status not in KITCHEN_STATUSES:
        return fail(f"Status must be one of: {', '.join(KITCHEN_STATUSES)}", 400)

    table = db.active_tables.find_one(_by_id(ticket_id))
    if not table:
        return fail("Order not found", 404)

    db.active_tables.update_one(
        {"_id": table["_id"]},
        {"$set": {"kitchenStatus": status, "updatedAt": utc_now(), "kitchenBy": user.get("username")}},
    )

    label = f"Table {table.get('tableNumber', '?')}"
    order_type = table.get("orderType", "Dine-in")
    cook = user.get("username", "the kitchen")

    if status == "ready":
        if order_type == "Dine-in":
            message = f"{label} — food ready, hand to waiter"
        else:
            message = f"{label} — food ready for {order_type} pickup"
        notifications.emit(
            "ready",
            message,
            notifications.FLOOR_AND_COUNTER,
            table_number=str(table.get("tableNumber", "")),
            detail={"items": table.get("items", []), "orderType": order_type, "cook": cook},
        )
    elif status == "served":
        notifications.emit(
            "served",
            f"{label} — served, ready to bill",
            notifications.FLOOR_AND_COUNTER,
            table_number=str(table.get("tableNumber", "")),
            detail={"total": table.get("total", 0), "cook": cook},
        )

    logger.info("Ticket %s (%s) marked %s by %s", ticket_id, label, status, cook)
    return ok({"message": f"Order marked {status}", "kitchenStatus": status})


@bp.delete("/<ticket_id>")
@roles_required("cashier", "admin")
@handle_errors
def delete_order(user, ticket_id):
    """Cancel one order from the counter's table plan (wrong table, guest
    changed their mind, sent twice).

    The ticket leaves the kitchen board and the floor, and the waiter's
    matching print request goes with it, so a cancelled order cannot be
    billed by mistake. Both were saved from the same order, so they carry the
    same table and the same cleaned item list.
    """
    ticket = db.active_tables.find_one(_by_id(ticket_id))
    if not ticket:
        return fail("Order not found", 404)

    db.active_tables.delete_one({"_id": ticket["_id"]})
    request_removed = db.print_queue.delete_one(
        {"status": "pending", "tableNo": ticket.get("tableNo", ""), "items": ticket.get("items", [])}
    ).deleted_count

    items = ", ".join(f"{i.get('qty')} x {i.get('name')}" for i in ticket.get("items", []))
    logger.warning(
        "Order deleted by %s: table %s, %s (total %.2f)%s",
        user.get("username"), ticket.get("tableNumber"), items, ticket.get("total", 0),
        " and its print request" if request_removed else "",
    )
    return ok({"message": "Order deleted", "printRequestRemoved": bool(request_removed)})


# ---------------------------------------------------------------------------
# Table-wide helper: the counter and the floor think in whole tables.
# ---------------------------------------------------------------------------


@bp.patch("/table/<table_number>/close-table")
@roles_required(*STAFF)
@handle_errors
def close_whole_table(user, table_number):
    """Close every ticket on a table (used when the whole table is settled at once)."""
    result = db.active_tables.delete_many(_by_number(table_number))
    if result.deleted_count == 0:
        return fail("Table not found", 404)
    logger.info("Table %s closed (%d ticket(s)) by %s", table_number, result.deleted_count, user.get("username"))
    return ok({"message": "Table closed", "closed": result.deleted_count})
