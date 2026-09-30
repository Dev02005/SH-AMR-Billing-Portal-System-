"""Check the six-month bill deletion without touching real bills.

    python tests/retention_test.py

Everything runs against a throwaway collection (``_retention_test``) that is
created for the test and dropped afterwards. The real ``bills`` collection is
only ever read, to report what the live setting would do.
"""

import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import db, retention  # noqa: E402
from server.config import config  # noqa: E402
from server.timeutil import LOCAL_TZ, utc_now  # noqa: E402

SCRATCH = "_retention_test"

passed = failed = 0


def check(label, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed += 1
        print(f"  FAIL  {label}  {detail}")


if not db.connect():
    sys.exit("Cannot reach MongoDB")

scratch = db.db[SCRATCH]
scratch.drop()

cutoff = retention.cutoff_for()
now = utc_now()
DAY = timedelta(days=1)

# Bills either side of the boundary, labelled by whether they should survive.
fixtures = {
    "today": (now, True),
    "90 days old": (now - 90 * DAY, True),
    "179 days old": (now - 179 * DAY, True),
    "1 minute after the cutoff": (cutoff + timedelta(minutes=1), True),
    "1 minute before the cutoff": (cutoff - timedelta(minutes=1), False),
    "181 days old": (now - 181 * DAY, False),
    "200 days old": (now - 200 * DAY, False),
    "a year old": (now - 365 * DAY, False),
}

try:
    scratch.insert_many(
        [{"label": label, "createdAt": created, "total": 100} for label, (created, _) in fixtures.items()]
    )
    expected_gone = sorted(label for label, (_, keep) in fixtures.items() if not keep)
    expected_kept = sorted(label for label, (_, keep) in fixtures.items() if keep)

    print(f"\n== boundary ==\n  window {config.BILL_RETENTION_DAYS} days, cutoff "
          f"{cutoff.astimezone(LOCAL_TZ):%d %b %Y %H:%M} IST")

    print("\n== dry run (what the app does while deletion is switched off) ==")
    dry = retention.purge(dry_run=True, collection=scratch)
    check("dry run finds every expired bill", dry.matched == len(expected_gone),
          f"found {dry.matched}, expected {len(expected_gone)}")
    check("dry run deletes nothing", dry.deleted == 0 and scratch.count_documents({}) == len(fixtures))

    print("\n== real purge (what the app does with BILL_RETENTION_ENABLED=true) ==")
    real = retention.purge(dry_run=False, collection=scratch)
    remaining = sorted(doc["label"] for doc in scratch.find({}, {"label": 1}))
    check("purge deletes exactly the expired bills", real.deleted == len(expected_gone),
          f"deleted {real.deleted}, expected {len(expected_gone)}")
    check("every recent bill survives", remaining == expected_kept, f"left: {remaining}")
    check("the bill just inside the window survives", "1 minute after the cutoff" in remaining)
    check("the bill just outside the window is gone", "1 minute before the cutoff" not in remaining)

    again = retention.purge(dry_run=False, collection=scratch)
    check("a second pass finds nothing more", again.matched == 0 and again.deleted == 0)

    print("\n== a shorter window is honoured ==")
    scratch.delete_many({})
    scratch.insert_many([
        {"label": "10 days old", "createdAt": now - 10 * DAY},
        {"label": "40 days old", "createdAt": now - 40 * DAY},
    ])
    short = retention.purge(dry_run=False, days=30, collection=scratch)
    check("30-day window removes only the 40-day-old bill", short.deleted == 1
          and [d["label"] for d in scratch.find()] == ["10 days old"])
finally:
    scratch.drop()
    print(f"\n  scratch collection '{SCRATCH}' dropped")

print("\n== your live bills (read only, nothing deleted) ==")
live = retention.purge(dry_run=True)
print(f"  deletion switched on : {config.BILL_RETENTION_ENABLED}")
print(f"  bills in database    : {db.bills.count_documents({})}")
print(f"  older than {config.BILL_RETENTION_DAYS} days    : {live.matched}")
oldest = db.bills.find_one(sort=[("createdAt", 1)])
if oldest:
    from server.timeutil import as_utc

    age = (now - as_utc(oldest["createdAt"])).days
    print(f"  oldest bill          : {as_utc(oldest['createdAt']).astimezone(LOCAL_TZ):%d %b %Y} ({age} days old)")
    print(f"  next bill to expire  : in {max(0, config.BILL_RETENTION_DAYS - age)} day(s)")

print(f"\n{'=' * 46}\n{passed} passed, {failed} failed\n{'=' * 46}")
sys.exit(1 if failed else 0)
