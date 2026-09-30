"""End-to-end smoke test of the POS API.

Walks the real service flow: waiter sends an order -> kitchen sees it and
advances it -> cashier finds it in the print queue and bills it.

It saves (and then deletes) real bills, which consumes bill numbers, so run
it against an API started on a test database - see "Testing" in README.md:

    SMOKE_BASE_URL=http://localhost:5055 SMOKE_ADMIN_PASSWORD=... \\
    SMOKE_STAFF_PASSWORD=... python tests/smoke_test.py
"""

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("SMOKE_BASE_URL", "http://localhost:5000")
TEST_TABLE = "99"  # kept away from the real table numbers

# Passwords live only in the database, so the test takes them from the
# environment:  SMOKE_ADMIN_PASSWORD=... SMOKE_STAFF_PASSWORD=... python tests/smoke_test.py
ADMIN_PASSWORD = os.environ.get("SMOKE_ADMIN_PASSWORD")
STAFF_PASSWORD = os.environ.get("SMOKE_STAFF_PASSWORD")
if not ADMIN_PASSWORD or not STAFF_PASSWORD:
    sys.exit("Set SMOKE_ADMIN_PASSWORD and SMOKE_STAFF_PASSWORD (waiter/cook) to run the smoke test.")

passed = failed = 0


def call(method, path, token=None, body=None, form=None):
    url = BASE + path
    headers = {}
    data = None
    if token:
        headers["Authorization"] = "Bearer " + token
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    elif form is not None:
        data = form
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw or b"{}")
        except ValueError:
            return exc.code, {"raw": raw[:200].decode(errors="replace")}


def check(label, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed += 1
        print(f"  FAIL  {label}  {detail}")


def login(email, password):
    status, data = call("POST", "/api/auth/login", body={"email": email, "password": password})
    return data.get("token"), status, data


print("== authentication ==")
admin, status, data = login("admin@shamr.com", ADMIN_PASSWORD)
check("admin logs in", status == 200 and admin, f"{status} {data}")

waiter, status, _ = login("waiter1@shamr.com", STAFF_PASSWORD)
check("waiter logs in", status == 200 and waiter)

cook, status, _ = login("cook1@shamr.com", STAFF_PASSWORD)
check("cook logs in", status == 200 and cook)

status, data = login("admin@shamr.com", "wrong-password")[1:]
check("wrong password rejected", status == 401, str(status))

status, data = call("GET", "/api/bills")
check("unauthenticated request rejected", status == 401, str(status))

status, data = call("GET", "/api/auth/verify", token=admin)
check("token verifies", status == 200 and data.get("user", {}).get("role") == "admin")

print("\n== menu ==")
status, data = call("GET", "/api/custom-items", token=waiter)
items = data.get("items", [])
check("waiter can read the menu", status == 200 and len(items) > 0, f"{status}")

groups = [i for i in items if i.get("isGroup")]
check("group items expose a prices map", groups and isinstance(groups[0].get("prices"), dict),
      f"{len(groups)} group items")
if groups:
    sample = groups[0]
    check("group prices are non-zero",
          all(float(v) > 0 for v in sample["prices"].values()),
          str(sample["prices"]))

singles = [i for i in items if not i.get("isGroup") and i.get("price")]
check("single items carry a price", len(singles) > 0)

status, data = call("GET", "/api/categories", token=waiter)
check("categories load", status == 200 and len(data.get("categories", [])) > 0)

print("\n== waiter sends an order ==")
call("PATCH", f"/api/active-tables/table/{TEST_TABLE}/close-table", token=waiter)  # clean slate

order = {
    "items": [{"name": "Smoke Test Mandi", "price": 100, "qty": 2}],
    "tableNo": TEST_TABLE,
    "tableNumber": TEST_TABLE,
    "orderType": "Dine-in",
    "payment": "Cash",
}

status, data = call("POST", "/api/print-queue", token=waiter, body=order)
check("order reaches the print queue", status == 201, f"{status} {data}")

status, data = call("POST", "/api/active-tables", token=waiter, body=order)
check("table opens for the kitchen", status == 201, f"{status} {data}")
ticket = data.get("ticketId")
check("the new ticket has an id", bool(ticket), str(data))

print("\n== kitchen sees it ==")
status, data = call("GET", "/api/active-tables", token=cook)
tables = data.get("tables", [])
mine = next((t for t in tables if t["tableNumber"] == TEST_TABLE), None)
check("cook sees the waiter's table", mine is not None, f"{[t['tableNumber'] for t in tables]}")
if mine:
    check("ticket starts as 'new'", mine.get("kitchenStatus") == "new", str(mine.get("kitchenStatus")))
    check("ticket total is computed server-side", mine.get("total") == 200, str(mine.get("total")))

status, data = call("PATCH", f"/api/active-tables/{ticket}/status", token=cook,
                    body={"kitchenStatus": "preparing"})
check("cook marks it preparing", status == 200, f"{status} {data}")

status, data = call("GET", "/api/active-tables", token=cook)
again = next((t for t in data.get("tables", []) if t["tableNumber"] == TEST_TABLE), None)
check("status persists across requests", again and again.get("kitchenStatus") == "preparing",
      str(again and again.get("kitchenStatus")))

status, data = call("PATCH", f"/api/active-tables/{ticket}/status", token=cook,
                    body={"kitchenStatus": "bogus"})
check("invalid status rejected", status == 400, str(status))

print("\n== notifications reach the other portals ==")


def drain(token):
    _, payload = call("GET", "/api/notifications", token=token)
    ids = [n["id"] for n in payload.get("notifications", [])]
    if ids:
        call("POST", "/api/notifications/seen", token=token, body={"ids": ids})
    return ids


drain(waiter)
drain(admin)

call("PATCH", f"/api/active-tables/{ticket}/status", token=cook, body={"kitchenStatus": "ready"})

_, w = call("GET", "/api/notifications", token=waiter)
_, a = call("GET", "/api/notifications", token=admin)
ready_for_waiter = [n for n in w["notifications"] if n["kind"] == "ready" and n["tableNumber"] == TEST_TABLE]
ready_for_admin = [n for n in a["notifications"] if n["kind"] == "ready" and n["tableNumber"] == TEST_TABLE]
check("waiter is told the food is ready", len(ready_for_waiter) == 1, str(w["notifications"]))
check("counter is told the food is ready", len(ready_for_admin) == 1, str(a["notifications"]))

status, _ = call("GET", "/api/notifications", token=cook)
check("cook can read notifications too", status == 200, str(status))

# Each person clears their own copy.
drain(waiter)
_, w2 = call("GET", "/api/notifications", token=waiter)
_, a2 = call("GET", "/api/notifications", token=admin)
check("dismissing is per person", len(w2["notifications"]) == 0 and len(a2["notifications"]) >= 1,
      f"waiter {len(w2['notifications'])}, admin {len(a2['notifications'])}")

status, _ = call("PATCH", f"/api/active-tables/{ticket}/status", token=cook,
                 body={"kitchenStatus": "served"})
check("cook can finish a ticket (the Done button)", status == 200, str(status))

_, w3 = call("GET", "/api/notifications", token=waiter)
served = [n for n in w3["notifications"] if n["kind"] == "served" and n["tableNumber"] == TEST_TABLE]
check("both portals are told the table went out", len(served) == 1, str(w3["notifications"]))

_, board = call("GET", "/api/active-tables?board=true", token=cook)
on_board = [t for t in board["tables"] if t["tableNumber"] == TEST_TABLE]
check("served ticket leaves the kitchen board", len(on_board) == 0, str(len(on_board)))

_, floor = call("GET", "/api/active-tables", token=waiter)
still_open = [t for t in floor["tables"] if t["tableNumber"] == TEST_TABLE]
check("but the table stays open for billing", len(still_open) == 1, str(len(still_open)))

drain(waiter)
drain(admin)

# A second "Send order" for the same table is its own ticket, never merged.
status, data = call("POST", "/api/active-tables", token=waiter,
                    body={**order, "items": [{"name": "Smoke Test Biryani", "price": 150, "qty": 1}]})
second_ticket = data.get("ticketId")
check("a second order opens a second ticket", status == 201 and second_ticket and second_ticket != ticket,
      f"{status} {data}")

_, board = call("GET", "/api/active-tables?board=true", token=cook)
open_tickets = [t for t in board["tables"] if t["tableNumber"] == TEST_TABLE]
check("the kitchen board shows only the new order", len(open_tickets) == 1 and open_tickets[0]["id"] == second_ticket,
      str([t["id"] for t in open_tickets]))
check("each ticket keeps its own total", open_tickets and open_tickets[0].get("total") == 150,
      str(open_tickets and open_tickets[0].get("total")))

print("\n== cashier picks it up ==")
status, data = call("GET", "/api/print-queue", token=admin)
requests_ = data.get("requests", [])
mine_q = next((r for r in requests_ if r["billData"].get("tableNo") == TEST_TABLE), None)
check("print queue returns the request", mine_q is not None, f"{len(requests_)} pending")
if mine_q:
    check("request carries its items", len(mine_q["billData"].get("items", [])) == 1)
    check("request names the waiter", mine_q.get("createdBy") == "waiter1", str(mine_q.get("createdBy")))

status, data = call("GET", "/api/print-queue", token=cook)
check("cook cannot read the print queue", status == 403, str(status))

print("\n== billing ==")
status, data = call("GET", "/api/bill-number")
next_number = data.get("billNumber")
check("next bill number is readable", status == 200 and isinstance(next_number, int), str(data))

bill = {
    "items": [{"name": "Smoke Test Mandi", "price": 100, "qty": 3}],
    "payment": "Cash",
    "orderType": "Dine-in",
    "tableNo": TEST_TABLE,
    "discount": 10,
}
status, data = call("POST", "/api/bill", token=admin, body=bill)
check("bill saves", status == 201, f"{status} {data}")
saved = data.get("bill", {})
first_id = data.get("billId")
check("bill number was assigned", data.get("billNumber") == next_number,
      f"expected {next_number}, got {data.get('billNumber')}")
check("subtotal computed server-side", saved.get("subtotal") == 300, str(saved.get("subtotal")))
check("discount applied", saved.get("total") == 270, str(saved.get("total")))

status, data = call("POST", "/api/bill", token=admin, body=bill)
check("a second bill saves", status == 201, str(status))
second_number = data.get("billNumber")
second_id = data.get("billId")
check("bill numbers increment", second_number == next_number + 1,
      f"{next_number} -> {second_number}")

status, data = call("POST", "/api/bill", token=admin, body={**bill, "payment": "Bitcoin"})
check("unknown payment method rejected", status == 400, str(status))

status, data = call("POST", "/api/bill", token=admin, body={**bill, "items": []})
check("empty bill rejected", status == 400, str(status))

status, data = call("POST", "/api/bill", token=admin,
                    body={**bill, "items": [{"name": "x", "price": 10, "qty": -3}]})
check("negative quantity rejected", status == 400, str(status))

status, data = call("GET", "/api/bills", token=admin)
bills = data.get("bills", [])
check("bill register loads", status == 200 and len(bills) > 0, str(status))
check("every bill carries a unique id", all(b.get("id") for b in bills))
check("ids are unique", len({b["id"] for b in bills}) == len(bills))
check("saved bill appears in the register", any(b.get("id") == first_id for b in bills))

# Bill numbers restart daily, so the same number is shared by many bills.
# Deleting by number used to remove an arbitrary one of them.
by_number = [b for b in bills if b.get("token") == next_number]
check("bill numbers really are shared across days", len(by_number) >= 1,
      f"{len(by_number)} bills carry number {next_number}")

status, data = call("GET", f"/api/bill/{first_id}", token=admin)
check("one bill can be read by its id", status == 200 and data["bill"]["id"] == first_id, str(status))

status, _ = call("DELETE", "/api/bill/not-an-object-id/permanent-delete", token=admin)
check("a malformed bill id is rejected, not guessed", status == 404, str(status))

print("\n== permissions ==")
status, _ = call("DELETE", f"/api/bill/{first_id}/permanent-delete", token=waiter)
check("waiter cannot delete a bill", status == 403, str(status))

status, _ = call("DELETE", "/api/categories/mandi", token=waiter)
check("waiter cannot delete a category", status == 403, str(status))

status, _ = call("GET", "/api/bills", token=waiter)
check("waiter cannot read the bill register", status == 403, str(status))

print("\n== excel sales report ==")


def fetch_raw(path, token=None):
    req = urllib.request.Request(BASE + path, headers={"Authorization": "Bearer " + token} if token else {})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers, exc.read()


from datetime import date as _date  # noqa: E402

today = _date.today().isoformat()
status, headers, body = fetch_raw(f"/api/reports/sales.xlsx?from={today}&to={today}", admin)
check("admin gets an Excel workbook", status == 200 and body[:2] == b"PK", f"{status} {body[:60]!r}")
check("served as .xlsx, not CSV",
      headers.get("Content-Type", "").startswith("application/vnd.openxmlformats-officedocument.spreadsheetml"),
      headers.get("Content-Type"))
check("file is named .xlsx", ".xlsx" in headers.get("Content-Disposition", ""), headers.get("Content-Disposition"))

try:
    from io import BytesIO

    from openpyxl import load_workbook

    sheets = load_workbook(BytesIO(body)).sheetnames if status == 200 else []
    check("workbook has all six sheets",
          sheets == ["Summary", "Daily Sales", "Payment Methods", "Order Types", "Item Sales", "Bill Register"],
          str(sheets))
except ImportError:
    print("  SKIP  openpyxl not installed here; sheet names not checked")

status, _, _ = fetch_raw(f"/api/reports/sales.xlsx?from={today}&to={today}", waiter)
check("waiter cannot download reports", status == 403, str(status))
status, _, _ = fetch_raw("/api/reports/sales.xlsx?from=2000-01-01&to=2000-01-02", admin)
check("empty range says so", status == 404, str(status))
status, _, _ = fetch_raw("/api/reports/sales.xlsx?from=2026-09-30&to=2026-09-01", admin)
check("backwards range rejected", status == 400, str(status))

print("\n== menu editing ==")
form_name = "SmokeTestItem"
call("DELETE", f"/api/custom-items/{form_name}", token=admin)
call("DELETE", f"/api/custom-items/{form_name}Renamed", token=admin)

boundary = "----smoke"
def multipart(fields):
    parts = []
    for key, value in fields.items():
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n")
    parts.append(f"--{boundary}--\r\n")
    return "".join(parts).encode()

req = urllib.request.Request(
    BASE + "/api/custom-items",
    data=multipart({"name": form_name, "price": "150", "category": "custom"}),
    headers={"Authorization": "Bearer " + admin,
             "Content-Type": f"multipart/form-data; boundary={boundary}"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=20) as response:
        status, data = response.status, json.loads(response.read())
except urllib.error.HTTPError as exc:
    status, data = exc.code, json.loads(exc.read() or b"{}")
check("menu item created", status == 201, f"{status} {data}")

status, data = call("PUT", f"/api/custom-items/{form_name}", token=admin,
                    body={"name": form_name + "Renamed", "price": 175, "category": "custom"})
check("menu item updates (route that used to 404)", status == 200, f"{status} {data}")
check("update returns the new values",
      data.get("item", {}).get("price") == 175 and data.get("item", {}).get("name") == form_name + "Renamed",
      str(data.get("item")))

status, _ = call("PUT", f"/api/custom-items/{form_name}Renamed", token=waiter,
                 body={"price": 200})
check("waiter cannot edit the menu", status == 403, str(status))

status, _ = call("DELETE", f"/api/custom-items/{form_name}Renamed", token=admin)
check("menu item deletes", status == 200, str(status))

print("\n== cleanup ==")
status, data = call("PATCH", f"/api/active-tables/table/{TEST_TABLE}/close-table", token=admin)
check("closing the table closes both tickets", status == 200 and data.get("closed") == 2, f"{status} {data}")

if mine_q:
    status, _ = call("DELETE", f"/api/print-queue/{mine_q['_id']}", token=admin)
    check("print request discarded", status == 200, str(status))

for token in (waiter, admin, cook):
    drain(token)

removed = 0
for bill_id in (first_id, second_id):
    status, _ = call("DELETE", f"/api/bill/{bill_id}/permanent-delete", token=admin)
    removed += 1 if status == 200 else 0
check("both test bills removed by id", removed == 2, f"{removed}/2")

status, _ = call("GET", f"/api/bill/{first_id}", token=admin)
check("deleted bill is gone", status == 404, str(status))

print(f"\n{'=' * 46}\n{passed} passed, {failed} failed\n{'=' * 46}")
sys.exit(1 if failed else 0)
