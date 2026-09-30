"""Request payload validation for bills and orders."""

from server.config import config

MAX_ITEMS_PER_BILL = 200


def clean_items(raw) -> tuple[list | None, str]:
    """Normalize a cart into ``[{name, price, qty}]`` or return an error message."""
    if not isinstance(raw, list):
        return None, "Items must be an array"
    if not raw:
        return None, "At least one item is required"
    if len(raw) > MAX_ITEMS_PER_BILL:
        return None, f"A bill cannot hold more than {MAX_ITEMS_PER_BILL} items"

    items = []
    for entry in raw:
        if not isinstance(entry, dict):
            return None, "Each item must be an object"
        name = str(entry.get("name", "")).strip()
        if not name:
            return None, "Every item needs a name"
        try:
            price = float(entry.get("price", 0))
            qty = int(entry.get("qty", 0))
        except (TypeError, ValueError):
            return None, f"Invalid price or quantity for {name!r}"
        if price < 0:
            return None, f"Price cannot be negative for {name!r}"
        if qty <= 0:
            return None, f"Quantity must be at least 1 for {name!r}"
        items.append({"name": name, "price": price, "qty": qty})
    return items, ""


def validate_bill(data: dict) -> tuple[dict | None, str]:
    """Validate and normalize an incoming bill.

    Returns ``(bill_fields, "")`` on success or ``(None, message)`` on failure.
    Totals are recomputed from the items so a tampered client cannot dictate
    the amount recorded in the books.
    """
    if not isinstance(data, dict):
        return None, "Invalid request format"

    items, error = clean_items(data.get("items"))
    if items is None:
        return None, error

    payment = str(data.get("payment", "")).strip() or "Cash"
    if payment not in config.PAYMENT_METHODS:
        return None, f"Invalid payment method: {payment}"

    order_type = str(data.get("orderType", "")).strip() or "Dine-in"
    if order_type not in config.ORDER_TYPES:
        return None, f"Invalid order type: {order_type}"

    try:
        discount = float(data.get("discount", 0) or 0)
    except (TypeError, ValueError):
        return None, "Invalid discount"
    if not 0 <= discount <= 100:
        return None, "Discount must be between 0 and 100"

    subtotal = round(sum(i["price"] * i["qty"] for i in items), 2)
    discount_amount = round(subtotal * discount / 100, 2)
    total = round(subtotal - discount_amount, 2)

    return {
        "items": items,
        "subtotal": subtotal,
        "discount": discount,
        "discountAmount": discount_amount,
        "total": total,
        "payment": payment,
        "orderType": order_type,
        "tableNo": str(data.get("tableNo", "")).strip(),
    }, ""
