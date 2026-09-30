"""Six-month bill retention.

Bills older than ``BILL_RETENTION_DAYS`` (180 by default) can be purged so the
database stays small. Deleting sales records cannot be undone, so the purge
only runs when ``BILL_RETENTION_ENABLED=true`` is set in ``.env``; otherwise
every pass is a dry run that logs what *would* go.

On a normal server it runs at startup and then every ``INTERVAL_HOURS`` in a
background thread (the first version ran only at startup, so a till left
running for weeks never purged). On Vercel, where nothing runs between
requests, Vercel's daily cron calls ``run_once`` through /api/cron/retention.
"""

import logging
import threading
from dataclasses import dataclass
from datetime import datetime

from pymongo.errors import PyMongoError

from server import db
from server.config import config
from server.timeutil import LOCAL_TZ, local_day_start

logger = logging.getLogger(__name__)

INTERVAL_HOURS = 6

_scheduler: threading.Thread | None = None
_stop = threading.Event()


@dataclass(frozen=True)
class PurgeResult:
    cutoff: datetime        # bills created before this instant are expired
    matched: int            # how many bills were past the cutoff
    deleted: int            # how many were actually removed (0 on a dry run)
    dry_run: bool


def cutoff_for(days: int | None = None) -> datetime:
    """Local midnight ``days`` ago, in UTC - the retention boundary."""
    return local_day_start(days_ago=config.BILL_RETENTION_DAYS if days is None else days)


def purge(*, dry_run: bool = True, days: int | None = None, collection=None) -> PurgeResult:
    """Find (and unless ``dry_run``, delete) bills older than the window.

    ``collection`` defaults to the bills collection; the test suite passes a
    throwaway one so the real bills are never at risk while the logic is being
    checked.
    """
    target = db.bills if collection is None else collection
    cutoff = cutoff_for(days)
    query = {"createdAt": {"$lt": cutoff}}

    matched = target.count_documents(query)
    deleted = 0 if dry_run or not matched else target.delete_many(query).deleted_count
    return PurgeResult(cutoff=cutoff, matched=matched, deleted=deleted, dry_run=dry_run)


def run_once() -> PurgeResult | None:
    """One pass using the configured setting, with a log line either way."""
    try:
        result = purge(dry_run=not config.BILL_RETENTION_ENABLED)
    except PyMongoError as exc:
        logger.error("Retention pass failed: %s", exc)
        return None

    boundary = result.cutoff.astimezone(LOCAL_TZ).strftime("%d %b %Y")
    if result.dry_run:
        logger.info(
            "Retention (report only): %d bill(s) older than %d days (before %s). "
            "Set BILL_RETENTION_ENABLED=true to delete them.",
            result.matched, config.BILL_RETENTION_DAYS, boundary,
        )
    elif result.deleted:
        logger.warning("Retention: deleted %d bill(s) created before %s", result.deleted, boundary)
    else:
        logger.info("Retention: nothing older than %s to delete", boundary)
    return result


def _loop() -> None:
    while not _stop.wait(INTERVAL_HOURS * 3600):
        run_once()


def start() -> None:
    """Run a pass now and, if deletion is enabled, keep running on a timer."""
    global _scheduler

    run_once()

    if not config.BILL_RETENTION_ENABLED or _scheduler is not None:
        return
    _scheduler = threading.Thread(target=_loop, name="bill-retention", daemon=True)
    _scheduler.start()
    logger.info("Retention: scheduled every %d hours", INTERVAL_HOURS)
