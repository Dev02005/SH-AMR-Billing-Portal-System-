"""Health check and the daily six-month deletion call (Vercel cron)."""

import hmac
import logging

from flask import Blueprint, request

from server import db, retention
from server.api import fail, handle_errors, ok
from server.config import config
from server.timeutil import to_iso

logger = logging.getLogger(__name__)

bp = Blueprint("system", __name__)


@bp.get("/api/health")
def health():
    connected = db.healthy()
    payload = {
        "success": connected,
        "status": "healthy" if connected else "unhealthy",
        "database": "connected" if connected else "disconnected",
    }
    return payload, 200 if connected else 503


@bp.get("/api/cron/retention")
@handle_errors
def retention_cron():
    """One six-month deletion pass, called once a day by Vercel's cron.

    Vercel sends ``Authorization: Bearer <CRON_SECRET>``; any other caller is
    refused, and so is every call while CRON_SECRET is not set. With
    BILL_RETENTION_ENABLED off the pass only reports what would go.
    """
    expected = f"Bearer {config.CRON_SECRET}" if config.CRON_SECRET else ""
    if not expected or not hmac.compare_digest(request.headers.get("Authorization", ""), expected):
        return fail("Forbidden", 403)

    result = retention.run_once()
    if result is None:
        return fail("Retention pass failed - see the log", 500)
    return ok({
        "dryRun": result.dry_run,
        "matched": result.matched,
        "deleted": result.deleted,
        "cutoff": to_iso(result.cutoff),
    })
