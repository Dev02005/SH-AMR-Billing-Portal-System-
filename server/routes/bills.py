"""Bill numbering, saving and the bill register."""

import logging

from flask import Blueprint, request

from server import db
from server.api import fail, handle_errors, ok, roles_required
from bson.errors import InvalidId
from bson.objectid import ObjectId
from pymongo import ReturnDocument

from server.timeutil import as_utc, local_day_start, to_iso, utc_now
from server.validation import validate_bill

logger = logging.getLogger(__name__)

bp = Blueprint("bills", __name__, url_prefix="/api")

_COUNTER_ID = "bill_number"
MAX_PAGE_SIZE = 2000


def _peek_bill_number() -> int:
    """The number the next bill will get, without consuming it."""
    counter = db.counters.find_one({"_id": _COUNTER_ID})
    if not counter:
        return 1
    last_reset = counter.get("lastReset")
    if last_reset is None or as_utc(last_reset) < local_day_start():
        return 1
    return int(counter.get("value", 0)) + 1


def _next_bill_number() -> int:
    """Reserve the next bill number, resetting to 1 on the first bill of the day.

    ``find_one_and_update`` makes this a single atomic operation, so two
    terminals printing at the same moment cannot be handed the same number -
    the previous read-then-write version could.
    """
    day_start = local_day_start()

    reset = db.counters.find_one_and_update(
        {"_id": _COUNTER_ID, "lastReset": {"$lt": day_start}},
        {"$set": {"value": 1, "lastReset": utc_now()}},
        return_document=ReturnDocument.AFTER,
    )
    if reset:
        logger.info("Daily bill number reset - Bill #1")
        return 1

    counter = db.counters.find_one_and_update(
        {"_id": _COUNTER_ID},
        {"$inc": {"value": 1}, "$setOnInsert": {"lastReset": utc_now()}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int(counter.get("value", 1))


def _serialize(bill: dict) -> dict:
    """Shape a bill for the client, exposing its unique id as ``id``."""
    if "_id" in bill:
        bill["id"] = str(bill.pop("_id"))
    bill["createdAt"] = to_iso(bill.get("createdAt"))
    # Bills from the older till also carry a string copy of the timestamp.
    bill.pop("createdAtISO", None)
    return bill


@bp.get("/bill-number")
@handle_errors
def next_bill_number():
    return ok({"billNumber": _peek_bill_number()})


def _object_ids(values) -> list:
    ids = []
    for value in values if isinstance(values, list) else []:
        try:
            ids.append(ObjectId(str(value)))
        except (InvalidId, TypeError):
            continue
    return ids


def _claim(ticket_ids: list, request_ids: list) -> tuple[list, list]:
    """Take the orders a bill settles off the floor and out of the print queue.

    Deleting is the claim: when two counters bill the same order at the same
    moment only one of them gets the documents back, so it is billed once.
    Returns what was taken, so it can be put back if saving the bill fails.
    """
    tickets = list(db.active_tables.find({"_id": {"$in": ticket_ids}})) if ticket_ids else []
    if tickets and db.active_tables.delete_many({"_id": {"$in": [t["_id"] for t in tickets]}}).deleted_count == 0:
        tickets = []  # another counter took them first
    # The waiter's print requests for these orders go with them.
    request_query = {"status": "pending", "$or": [
        {"_id": {"$in": request_ids}},
        {"ticketId": {"$in": [str(i) for i in ticket_ids]}},
    ]}
    requests_ = list(db.print_queue.find(request_query))
    if requests_ and db.print_queue.delete_many({"_id": {"$in": [r["_id"] for r in requests_]}}).deleted_count == 0:
        requests_ = []  # another counter took them first
    return tickets, requests_


@bp.post("/bill")
@roles_required("admin", "cashier")
@handle_errors
def save_bill(user):
    """Record a finalised bill.

    A bill loaded from the table plan or the print queue names the orders it
    covers (``ticketIds`` / ``requestIds``). Saving it closes exactly those
    orders and clears their print requests - an order the waiter sends for
    the same table while the bill is being printed stays open. If another
    counter has already billed them, nothing is saved (409).
    """
    payload = request.get_json(silent=True) or {}
    fields, error = validate_bill(payload)
    if fields is None:
        return fail(error, 400)

    ticket_ids = _object_ids(payload.get("ticketIds"))
    request_ids = _object_ids(payload.get("requestIds"))
    settles = bool(ticket_ids or request_ids)
    claimed_tickets, claimed_requests = _claim(ticket_ids, request_ids) if settles else ([], [])
    # One document decides who bills an order: its kitchen ticket when it has
    # one, otherwise its print request (a takeaway with no table).
    if settles and not (claimed_tickets if ticket_ids else claimed_requests):
        # (Any print request removed on the way belonged to the order the other
        # counter billed, so it stays removed.)
        return fail("This order has already been billed on another counter.", 409)

    number = _next_bill_number()
    now = utc_now()
    bill = {
        **fields,
        "billNumber": number,
        "token": number,
        "createdAt": now,
        "createdBy": user.get("username", "unknown"),
        "deleted": False,
    }
    try:
        result = db.bills.insert_one(bill)
    except Exception:
        # Not billed after all: put the orders and requests back.
        if claimed_tickets:
            db.active_tables.insert_many(claimed_tickets)
        if claimed_requests:
            db.print_queue.insert_many(claimed_requests)
        raise

    logger.info(
        "Bill #%s saved - total %.2f, %d items%s", number, bill["total"], len(bill["items"]),
        f", settled {len(claimed_tickets)} order(s) and {len(claimed_requests)} print request(s)" if settles else "",
    )
    return ok(
        {
            "message": "Bill saved successfully",
            "billId": str(result.inserted_id),
            "billNumber": number,
            "bill": _serialize(dict(bill)),
            "ordersClosed": len(claimed_tickets),
            "printRequestsCleared": len(claimed_requests),
        },
        201,
    )


@bp.get("/bills")
@roles_required("admin", "cashier")
@handle_errors
def list_bills(user):
    """The bill register, newest first."""
    limit = min(request.args.get("limit", type=int) or 1000, MAX_PAGE_SIZE)
    days = request.args.get("days", type=int)

    query: dict = {"deleted": {"$ne": True}}
    if days:
        query["createdAt"] = {"$gte": local_day_start(days_ago=days)}
    for field, arg in (("payment", "payment"), ("orderType", "orderType")):
        value = request.args.get(arg)
        if value:
            query[field] = value

    bills = db.bills.find(query).sort("createdAt", -1).limit(limit)
    return ok({"bills": [_serialize(b) for b in bills]})


@bp.get("/bill/<bill_id>")
@roles_required("admin", "cashier")
@handle_errors
def get_bill(user, bill_id):
    bill = _find(bill_id)
    if not bill:
        return fail("Bill not found", 404)
    return ok({"bill": _serialize(bill)})


def _find(bill_id: str):
    """Look up one bill by its document id.

    Bills are addressed by ``_id`` and never by ``billNumber``: the daily
    counter restarts at 1 every morning, so hundreds of bills share number 2.
    The previous ``delete_one({"token": n})`` therefore removed an arbitrary
    bill that happened to carry the same number - potentially one from months
    ago - rather than the one the cashier selected.
    """
    try:
        return db.bills.find_one({"_id": ObjectId(bill_id)})
    except (InvalidId, TypeError):
        return None


@bp.delete("/bill/<bill_id>/permanent-delete")
@roles_required("admin")
@handle_errors
def destroy_bill(user, bill_id):
    bill = _find(bill_id)
    if not bill:
        return fail("Bill not found", 404)

    result = db.bills.delete_one({"_id": bill["_id"]})
    if result.deleted_count == 0:
        return fail("Bill not found", 404)

    # Log enough to reconstruct the record from the log if this was a mistake.
    logger.warning(
        "Bill %s (number %s, %s, total %.2f) permanently deleted by %s",
        bill_id, bill.get("billNumber"), to_iso(bill.get("createdAt")),
        bill.get("total", 0), user.get("username"),
    )
    return ok({"message": "Bill permanently deleted"})
