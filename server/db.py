"""MongoDB connection and collection handles.

Collections are exposed as module-level names so route modules can simply
``from server.db import bills``. ``connect()`` is called once by the app
factory; ``healthy()`` reports whether the cluster is reachable.
"""

import logging

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import PyMongoError

from server.config import config

logger = logging.getLogger(__name__)

client: MongoClient | None = None
db = None

bills = None
counters = None
users = None
custom_items = None
categories = None
print_queue = None
active_tables = None
notifications = None

_COLLECTIONS = {
    "bills": "bills",
    "counters": "counters",
    "users": "users",
    "custom_items": "custom_items",
    "categories": "categories",
    "print_queue": "print_queue",
    "active_tables": "active_tables",
    "notifications": "notifications",
}


class DatabaseUnavailable(RuntimeError):
    """Raised when a request needs the database but the cluster is unreachable."""


def connect() -> bool:
    """Open the connection and bind the collection handles. Returns success."""
    global client, db

    if not config.MONGO_URI:
        raise RuntimeError("MONGO_URI is not set. Add it to the .env file.")

    try:
        client = MongoClient(
            config.MONGO_URI,
            serverSelectionTimeoutMS=config.MONGO_TIMEOUT_MS,
            connectTimeoutMS=config.MONGO_TIMEOUT_MS,
            socketTimeoutMS=config.MONGO_TIMEOUT_MS,
        )
        client.admin.command("ping")
    except PyMongoError as exc:
        logger.error("MongoDB connection failed: %s", exc)
        client = None
        return False

    db = client[config.MONGO_DB_NAME]
    for attr, name in _COLLECTIONS.items():
        globals()[attr] = db[name]

    logger.info("Connected to MongoDB database %r", config.MONGO_DB_NAME)
    return True


def require_db() -> None:
    if client is None:
        raise DatabaseUnavailable("Database connection is not available")


def healthy() -> bool:
    if client is None:
        return False
    try:
        client.admin.command("ping")
        return True
    except PyMongoError:
        return False


def ensure_indexes() -> None:
    """Create the indexes the query patterns rely on. Safe to re-run."""
    if client is None:
        return
    try:
        bills.create_index([("createdAt", DESCENDING)])
        bills.create_index([("token", DESCENDING)])
        bills.create_index([("deleted", ASCENDING), ("createdAt", DESCENDING)])
        users.create_index([("email", ASCENDING)], unique=True)
        custom_items.create_index([("name", ASCENDING)], unique=True)
        custom_items.create_index([("category", ASCENDING)])
        categories.create_index([("name", ASCENDING)], unique=True)
        print_queue.create_index([("status", ASCENDING), ("createdAt", ASCENDING)])
        # Tickets are per order, so several docs can share a tableNumber.
        active_tables.create_index([("tableNumber", ASCENDING), ("createdAt", ASCENDING)])
        # The old schema allowed one open ticket per table; drop that unique
        # index if an earlier install created it.
        try:
            active_tables.drop_index("tableNumber_1")
        except PyMongoError:
            pass
        notifications.create_index([("audience", ASCENDING), ("createdAt", ASCENDING)])
        # Notices expire on their own so the collection never needs sweeping.
        from server.notifications import TTL_SECONDS

        notifications.create_index("createdAt", expireAfterSeconds=TTL_SECONDS)
        logger.info("Database indexes ensured")
    except PyMongoError as exc:
        # Duplicate legacy data can block a unique index; log and keep running.
        logger.warning("Could not ensure all indexes: %s", exc)
