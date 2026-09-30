"""One-time startup work: indexes, staff accounts and default categories."""

import logging

from pymongo.errors import PyMongoError

from server import db
from server.config import config
from server.timeutil import utc_now

logger = logging.getLogger(__name__)

# Staff accounts the POS ships with. Passwords are NOT kept here: they live
# only in the database, as bcrypt hashes, and are set with
#     python -m server.passwords set <email>
DEFAULT_USERS = (
    ("admin", "admin@shamr.com", "admin"),
    ("casher", "casher1@shamr.com", "cashier"),
    ("waiter1", "waiter1@shamr.com", "waiter"),
    ("waiter2", "waiter2@shamr.com", "waiter"),
    ("waiter3", "waiter3@shamr.com", "waiter"),
    ("cook1", "cook1@shamr.com", "cook"),
    ("cook2", "cook2@shamr.com", "cook"),
)


def seed_users() -> None:
    """Ensure the default staff accounts exist.

    Never touches a password and never deletes an account - the previous
    implementation wiped every user outside this list on each boot and reset
    all passwords. A newly created account has no password (it cannot sign
    in) until one is set with ``python -m server.passwords``.
    """
    created = []
    for username, email, role in DEFAULT_USERS:
        result = db.users.update_one(
            {"email": email.lower()},
            {
                "$set": {"username": username, "role": role, "email": email.lower()},
                "$setOnInsert": {"createdAt": utc_now()},
            },
            upsert=True,
        )
        if result.upserted_id:
            created.append(email)
    logger.info("Staff accounts ensured (%d newly created)", len(created))

    missing = [u["email"] for u in db.users.find({"password": {"$not": {"$type": "string"}}}, {"email": 1})]
    if missing:
        logger.warning(
            "No password set for: %s - run: python -m server.passwords set <email>",
            ", ".join(missing),
        )


def seed_categories() -> None:
    if db.categories.count_documents({}, limit=1):
        return
    db.categories.insert_many(
        [{"name": name, "createdAt": utc_now(), "createdBy": "system"} for name in config.DEFAULT_CATEGORIES]
    )
    logger.info("Seeded %d default categories", len(config.DEFAULT_CATEGORIES))


def run() -> None:
    """Run every startup task, logging (not raising) on failure.

    Bill retention runs separately (``server.retention.start``) so it can keep
    running on a timer after startup.
    """
    try:
        db.ensure_indexes()
        seed_users()
        seed_categories()
    except PyMongoError as exc:
        logger.error("Startup initialisation failed: %s", exc)
