"""Menu management: categories and menu items (single- and group-priced)."""

import json
import logging
import re
import uuid
from pathlib import Path

from flask import Blueprint, request

from server import db
from server.api import fail, handle_errors, ok, roles_required
from server.config import config
from server.timeutil import utc_now

logger = logging.getLogger(__name__)

bp = Blueprint("menu", __name__, url_prefix="/api")

ALL_STAFF = ("admin", "cashier", "waiter", "cook")


def _exact_ci(value: str) -> dict:
    """Case-insensitive exact match, with the input escaped so it stays a literal."""
    return {"$regex": f"^{re.escape(value)}$", "$options": "i"}


def _category_match(name: str) -> dict:
    """Match a category name ignoring case and stray spaces around it (the
    older till did not always trim or lowercase what it stored)."""
    return {"$regex": rf"^\s*{re.escape(name.strip())}\s*$", "$options": "i"}


def _ensure_category(name: str, user: dict) -> None:
    """Keep the category list complete: an item's category must always be one
    the admin can see - and delete - in the category dialog."""
    db.categories.update_one(
        {"name": name},
        {"$setOnInsert": {"name": name, "createdAt": utc_now(), "createdBy": user.get("email", "unknown")}},
        upsert=True,
    )


def _allowed_image(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in config.ALLOWED_EXTENSIONS


def _image_url(item: dict) -> str | None:
    """Resolve an item's image to something the browser can load.

    Uploaded files come back root-relative ("/uploads/x.webp"); the client
    prefixes them with its API origin. An absolute URL baked in here would
    hard-code whichever host happened to serve the request, which broke images
    for every terminal except the one the server runs on.
    """
    stored = item.get("image")
    if isinstance(stored, str) and stored:
        if stored.startswith(("http://", "https://", "data:")):
            return stored
        return f"/uploads/{stored}"
    if item.get("image_base64"):
        mime = item.get("image_mime") or "image/jpeg"
        return "data:" + mime + ";base64," + item["image_base64"]
    return None


def _serialize(item: dict) -> dict:
    """The menu-item shape every portal reads."""
    prices = item.get("group_prices") if item.get("is_group") else None
    image_url = _image_url(item)
    return {
        "id": str(item["_id"]),
        "name": item.get("name", ""),
        "category": (item.get("category") or "other").strip().lower(),
        "isGroup": bool(item.get("is_group")),
        "price": item.get("price"),
        "prices": prices,
        "imageUrl": image_url,
    }


def _normalise_image(value) -> str | None:
    """Store an uploaded image as a bare filename, an external image as its URL.

    The client sends back whatever ``_image_url`` produced, so a stored file
    arrives as "/uploads/<file>" and must be unwrapped before it is saved -
    otherwise the prefix accumulates on every edit.
    """
    text = str(value or "").strip()
    if not text:
        return None
    if text.startswith("/uploads/"):
        return text[len("/uploads/"):] or None
    return text


def _save_upload(file_storage) -> str | None:
    """Persist an uploaded image and return its generated filename."""
    if not file_storage or not file_storage.filename:
        return None
    if not _allowed_image(file_storage.filename):
        return None
    suffix = Path(file_storage.filename).suffix.lower() or ".jpg"
    filename = str(uuid.uuid4()) + suffix
    config.UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    file_storage.save(config.UPLOAD_FOLDER / filename)
    logger.info("Saved menu image %s", filename)
    return filename


def _parse_group_prices(data) -> dict | None:
    """Read ``group_prices`` (a JSON object, or a JSON string from a form) as
    ``{size label: price}``; None when missing or invalid."""
    raw = data.get("group_prices")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (TypeError, ValueError):
            raw = None
    if isinstance(raw, dict) and raw:
        cleaned = {}
        for label, value in raw.items():
            label = str(label).strip()
            try:
                price = float(value)
            except (TypeError, ValueError):
                return None
            if not label or price <= 0:
                return None
            cleaned[label] = price
        return cleaned
    return None


# --------------------------------------------------------------------------- items


@bp.get("/custom-items")
@roles_required(*ALL_STAFF)
@handle_errors
def list_items(user):
    items = db.custom_items.find({}).sort("name", 1)
    return ok({"items": [_serialize(i) for i in items]})


@bp.post("/custom-items")
@roles_required("admin", "cashier")
@handle_errors
def create_item(user):
    """Add a menu item. Accepts multipart form data with an optional image."""
    form = request.form
    name = form.get("name", "").strip()
    if not name:
        return fail("Item name is required", 400)

    if db.custom_items.find_one({"name": _exact_ci(name)}):
        return fail("An item with this name already exists", 400)

    category = (form.get("category") or "custom").strip().lower()
    image_url = (form.get("image_url") or "").strip()
    image_filename = None if image_url else _save_upload(request.files.get("image"))

    item = {
        "name": name,
        "category": category,
        "image": image_url or image_filename,
        "createdAt": utc_now(),
        "createdBy": str(user["_id"]),
    }

    if form.get("is_group") in ("1", "true", "True", "on"):
        prices = _parse_group_prices(form)
        if not prices:
            return fail("Valid group prices are required", 400)
        item.update({"is_group": True, "group_prices": prices})
    else:
        try:
            price = float(form.get("price", ""))
        except (TypeError, ValueError):
            return fail("A valid price is required", 400)
        if price <= 0:
            return fail("Price must be greater than zero", 400)
        item.update({"is_group": False, "price": price})

    item["_id"] = db.custom_items.insert_one(item).inserted_id
    _ensure_category(category, user)
    logger.info("Menu item added: %s (%s)", name, category)
    return ok({"message": "Menu item added", "item": _serialize(item)}, 201)


@bp.put("/custom-items/<path:name>")
@roles_required("admin")
@handle_errors
def update_item(user, name):
    """Rename, reprice, recategorise or re-image an existing menu item.

    The Edit Menu dialog has always called this; there was no route behind it,
    so every save failed.
    """
    existing = db.custom_items.find_one({"name": _exact_ci(name)})
    if not existing:
        return fail("Item not found", 404)

    data = request.get_json(silent=True) or {}
    updates: dict = {}

    new_name = str(data.get("name", "")).strip()
    if new_name and new_name != existing["name"]:
        # A case-only change ("chicken 65" -> "Chicken 65") is a rename of the
        # same item, not a clash with another one.
        clash = db.custom_items.find_one({"name": _exact_ci(new_name), "_id": {"$ne": existing["_id"]}})
        if clash:
            return fail("An item with this name already exists", 400)
        updates["name"] = new_name

    if data.get("category"):
        updates["category"] = str(data["category"]).strip().lower()

    if data.get("price") not in (None, ""):
        try:
            price = float(data["price"])
        except (TypeError, ValueError):
            return fail("Price must be a number", 400)
        if price <= 0:
            return fail("Price must be greater than zero", 400)
        updates.update({"price": price, "is_group": False, "group_prices": None})

    if data.get("group_prices"):
        prices = _parse_group_prices(data)
        if not prices:
            return fail("Invalid group prices", 400)
        updates.update({"group_prices": prices, "is_group": True, "price": None})

    if "imageUrl" in data:
        updates["image"] = _normalise_image(data.get("imageUrl"))

    if not updates:
        return fail("Nothing to update", 400)

    updates["updatedAt"] = utc_now()
    db.custom_items.update_one({"_id": existing["_id"]}, {"$set": updates})
    if "category" in updates:
        _ensure_category(updates["category"], user)
    logger.info("Menu item updated: %s", existing["name"])

    return ok(
        {
            "message": "Menu item updated",
            "item": _serialize(db.custom_items.find_one({"_id": existing["_id"]})),
        }
    )


@bp.delete("/custom-items/<path:name>")
@roles_required("admin")
@handle_errors
def delete_item(user, name):
    if db.custom_items.delete_one({"name": _exact_ci(name)}).deleted_count == 0:
        return fail("Item not found", 404)
    logger.info("Menu item deleted: %s", name)
    return ok({"message": "Menu item deleted"})


# ---------------------------------------------------------------------- categories


@bp.get("/categories")
@roles_required(*ALL_STAFF)
@handle_errors
def list_categories(user):
    names = [c["name"] for c in db.categories.find({}, {"_id": 0, "name": 1}).sort("name", 1)]
    return ok({"categories": names})


@bp.post("/categories")
@roles_required("admin")
@handle_errors
def create_category(user):
    name = str((request.get_json(silent=True) or {}).get("name", "")).strip().lower()
    if not name:
        return fail("Category name is required", 400)
    if db.categories.find_one({"name": name}):
        return fail("Category already exists", 400)

    db.categories.insert_one({"name": name, "createdAt": utc_now(), "createdBy": user.get("email", "unknown")})
    logger.info("Category added: %s", name)
    return ok({"message": "Category added"}, 201)


@bp.delete("/categories/<path:name>")
@roles_required("admin")
@handle_errors
def delete_category(user, name):
    """Delete a category along with every menu item filed under it.

    A category can exist only on items (the menu lists every category an
    item uses), so it is deleted when either the category entry or any of
    its items exist.
    """
    match = _category_match(name)
    removed_category = db.categories.delete_many({"name": match}).deleted_count
    removed_items = db.custom_items.delete_many({"category": match}).deleted_count
    if not removed_category and not removed_items:
        return fail("Category not found", 404)

    logger.warning("Category deleted: %s (with %d menu items)", name, removed_items)
    return ok({"message": "Category deleted", "itemsDeleted": removed_items})
