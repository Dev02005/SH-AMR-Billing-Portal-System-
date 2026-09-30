"""Downloadable reports."""

import logging
from datetime import date, datetime, time, timedelta

from flask import Blueprint, Response, request

from server import db
from server.api import fail, handle_errors, roles_required
from server.reports import build_sales_workbook
from server.timeutil import LOCAL_TZ

logger = logging.getLogger(__name__)

bp = Blueprint("reports", __name__, url_prefix="/api/reports")

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# A year is plenty for one download and keeps a mistyped range from pulling
# the whole collection into memory.
MAX_RANGE_DAYS = 366


def _parse_day(value: str | None, name: str) -> date:
    if not value:
        raise ValueError(f"'{name}' is required (YYYY-MM-DD)")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"'{name}' must be a date in YYYY-MM-DD form") from exc


@bp.get("/sales.xlsx")
@roles_required("admin")
@handle_errors
def sales_workbook(user):
    """Sales for a date range as an Excel workbook.

    The range is in the restaurant's local days: ``?from=2026-09-01&to=2026-09-30``
    covers 1 Sept 00:00 IST to 30 Sept 23:59 IST.
    """
    try:
        date_from = _parse_day(request.args.get("from"), "from")
        date_to = _parse_day(request.args.get("to"), "to")
    except ValueError as exc:
        return fail(str(exc), 400)

    if date_from > date_to:
        return fail("'from' must be on or before 'to'", 400)
    if (date_to - date_from).days > MAX_RANGE_DAYS:
        return fail(f"The range can cover at most {MAX_RANGE_DAYS} days", 400)

    start = datetime.combine(date_from, time.min, tzinfo=LOCAL_TZ)
    end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=LOCAL_TZ)

    bills = list(
        db.bills.find(
            {"createdAt": {"$gte": start, "$lt": end}, "deleted": {"$ne": True}},
            {"_id": 0},
        ).sort("createdAt", 1)
    )
    if not bills:
        return fail("No bills in that date range", 404)

    payload = build_sales_workbook(bills, date_from, date_to)
    filename = f"SH-Arabian-Mandi-Sales_{date_from:%Y-%m-%d}_to_{date_to:%Y-%m-%d}.xlsx"

    logger.info("Sales report %s -> %s (%d bills) for %s", date_from, date_to, len(bills), user.get("username"))
    return Response(
        payload,
        mimetype=XLSX,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # Let the browser read the filename across origins in development.
            "Access-Control-Expose-Headers": "Content-Disposition",
            "Cache-Control": "no-store",
        },
    )
