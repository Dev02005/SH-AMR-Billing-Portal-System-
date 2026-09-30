# Project Log — S&H Arabian Mandi POS

A record of the work done on the billing, server and kitchen portals: what was
broken, what changed, what went wrong along the way, and what is still open.

The project is not under version control, so this file is the only history of
these changes. See [Open items](#open-items) — setting up Git is the first
recommendation.

**Contents**

- [Summary](#summary)
- [7–8 Sep 2026 — Audit, bug fixes and restructure](#78-sep-2026--audit-bug-fixes-and-restructure)
- [9 Sep 2026 — Notifications, custom UI, kitchen Done](#9-sep-2026--notifications-custom-ui-kitchen-done)
- [10 Sep 2026 — Excel report and bill retention](#10-sep-2026--excel-report-and-bill-retention)
- [25 Sep 2026 — Dead code, brand file, SEO, dark/light theme](#25-sep-2026--dead-code-brand-file-seo-darklight-theme)
- [25 Sep 2026 — Typography and full responsiveness](#25-sep-2026--typography-and-full-responsiveness)
- [25 Sep 2026 — Dropdown fix and full theme audit](#25-sep-2026--dropdown-fix-and-full-theme-audit)
- [27 Sep 2026 — One ticket per order and clearer kitchen flow](#27-sep-2026--one-ticket-per-order-and-clearer-kitchen-flow)
- [Incidents — data lost during the work](#incidents--data-lost-during-the-work)
- [Findings about the live system](#findings-about-the-live-system)
- [Open items](#open-items)
- [How to verify](#how-to-verify)

---

## 30 Sep 2026 — Final tidy: folders, SEO, unused files and packages
- **Dead-code scan** (scripted: files unreachable from `main.jsx`, exports nobody imports, CSS classes used nowhere, unused Python imports/functions/settings/modules): nothing left except `runningAsApp` being exported for no one — now private. Stale text fixed: README "Sign-in locks" line (the lock was removed), `.oxlintrc.json` ignore list naming folders that no longer exist, a duplicate `index.css` import in `App.jsx`.
- **Folders.** `src/` root now holds only `main.jsx` and `App.jsx`: `config/` (brand, portals, constants), `styles/` (index.css, components.css, theme, typography), `components/{auth,layout,ui,notifications}` beside the existing `menu/ modals/ receipt/ settings/`, and the analytics page moved into `pages/billing/analytics/`. 24 files moved and 72 import paths rewritten by script; the built CSS was byte-for-byte identical afterwards. README layout updated.
- **SEO.** Kept out of search engines on purpose (staff tool: `noindex` stays). Added: a tab title per page (`src/hooks/usePageTitle.js`: "Kitchen Portal · S&H Arabian Mandi Restaurant", "Billing Portal login · …"); one `<h1>` per page (the login box heading is now `<h2>`, computed style identical) and a `<main>` on the login and analytics pages; `public/robots.txt` and `public/favicon.ico` (made by `scripts/make_app_icons.py`; before, Vercel would have answered both with the app page); X card tag; `og:url`/`og:image` with full https addresses added at build time from Vercel's production address or `SITE_URL` (`vite.config.js`); a one-year cache for the hashed files in `vercel.json`. Checked all 7 pages: own title, one `<h1>`, one `<main>`, no errors.
- **Removed:** empty `.claude/`, `.pytest_cache/` (now git-ignored), `dist/` (rebuilt on every deploy), the unused `@types/react` / `@types/react-dom` packages. `npm audit fix` cleared 5 advisories (build tools and react-router 7.18.4; none affected this app) — CSS output unchanged. Web dev server restarted on the updated packages. Lint and build clean.

## 30 Sep 2026 — Six-month deletion re-checked: working, hard delete
- Code: `server/retention.py` removes bills with `delete_many({"createdAt": {"$lt": cutoff}})` — the documents are erased, not flagged. No code anywhere sets `deleted: true` or copies bills to another collection; Manage bill also uses the permanent-delete route.
- End-to-end on a throwaway database with the real API: switched off → nothing deleted, log reports "5 would go"; switched on → the 5 bills older than 180 days (including the one a minute past the cutoff and one already marked `deleted`) no longer exist in any collection, the 3 recent ones (including one a minute inside the cutoff) are untouched, the bill register and `GET /api/bill/<id>` no longer find them (404); the repeating timer (shortened for the test) removed an old bill added later. 13/13 passed; `tests/retention_test.py` 8/8. Scratch database dropped.
- Live: switched on, API running with the timer ("scheduled every 6 hours"); 322 bills, none past the cutoff (3 Apr 2026), none soft-deleted, every `createdAt` a real date (so none can slip past the rule). Note: the rule is 180 days, a few days shorter than six calendar months.

## 30 Sep 2026 — Kitchen status line pinned above the footer
- The kitchen board's status line ("Board refreshes every 8 seconds · N open tickets · ₹… on the floor") used to sit right under the last order, so it jumped up and down as orders came and went, and on an empty board it floated near the top. The board now fills the space between the header and the footer and the line sits at its bottom (`src/pages/kitchen/kitchen.css`: `main.kitchen-board { flex: 1 0 auto }`, footnote `margin-top: auto`). With many orders the page scrolls and the line is still the last thing above the footer. Checked with a mocked board at 0, 2 and 12 orders on desktop and at phone width: same position every time, just above the footer. Lint and build clean.

## 30 Sep 2026 — Staff passwords reset; wrong-password lock removed
- At the owner's request the passwords were set **in the database only** (bcrypt, via `python -m server.passwords set … --stdin`; not written to any file): the admin account got the owner's chosen password, and the cashier, waiter1–3 and cook1–2 share one simple staff password. All seven accounts verified signing in through the live API; the admin account refuses the staff password.
- **Wrong-password lock removed** at the owner's request: `server/login_guard.py`, its settings and the `login_attempts` collection are gone; sign-in is a plain check against the database again and any number of wrong tries just returns "Invalid credentials" (verified: 8 wrong in a row, then the right one signs in at once). README and `.env.example` updated. **Risk:** with simple passwords and no limit, anyone who can reach the API can keep guessing — use stronger passwords (or bring the lock back) before the app is on the internet.
- Live API restarted ("Debug mode: off").

## 30 Sep 2026 — Three portals at the same time: one sign-in per portal; bills settle exactly their orders
- **One sign-in per portal** (`src/api/session.js`). The browser kept a single `token`/`user` for the whole app, so on one device (tabs, or the installed apps, which share storage) signing in to Kitchen replaced the Billing sign-in (the counter then acted as the cook and got "Access denied" printing a bill), and merely opening any login page signed every portal out. Keys are now per portal (`session:<portal>:token|user`, taken from the page address); the old shared keys are removed on the next sign-in/out (staff sign in once more). `/` opens whichever portal the device is signed in to.
- **Found under simultaneous use: orders lost at billing.** Printing closed *every* ticket on the table, including an order the waiter sent while the bill was being printed (the guest ordered more) — never cooked, never billed (3 of 70 in a one-minute simulation). And two counters could bill the same table at once, and printed bills never left the Print Queue. Now: the waiter's screen creates the kitchen ticket first and the print request carries its `ticketId`; the counter remembers which tickets / print requests a bill was loaded from; `POST /api/bill` takes `ticketIds` / `requestIds` and, in the same request, closes exactly those tickets and their print requests (deleting is the claim — the ticket alone decides when there is one, so the same order is billed once; the other counter gets 409 "This order has already been billed on another counter."). A bill typed by hand for a table still closes the whole table.
- **Tested:** 5 people signing in at the same instant; two waiters, a cook and two counters for 60 s (624 requests, 0 errors, median 0.13 s): 71 orders sent = 71 billed, 0 lost, bill numbers 1…51 unique and in order, Print Queue empty, every ready/served notice delivered to waiter and counter; an order added while its table is billed stays open; two counters billing the same order at the same instant, 20 rounds: billed once every time. Then the three portals signed in together in one browser: waiter order → kitchen board → ready notice on waiter and counter → handed over → counter badge 1 → Load bill → Bill #1 printed, table closed, print request gone; opening the kitchen login signed out only the kitchen. Smoke test 71/71. (The first run's 2 s responses were the test script: on Windows Python tries IPv6 for "localhost" first and waits ~2 s; the server itself answered 10 parallel requests in 0.65 s.)
- The live API was restarted to load the new bill code (the web app had already picked up the new screens).

## 30 Sep 2026 — Ready for the internet: debug off, wrong-password limit, Vercel notes
- **Debug mode off by default** (`DEBUG` now defaults to `False`; it used to default to `True`, and Flask's debug mode lets anyone who can reach the server run code on it). The server logs a warning if it is ever turned on. The live API was restarted: "Debug mode: off".
- **Wrong-password limit** (`server/login_guard.py`): 5 wrong passwords for one account from one device (IP) → that device waits 15 minutes; 20 for one account from anywhere → the account waits 15 minutes; a correct password clears the count. Counted in the database (`login_attempts`, TTL-indexed on `expireAt`, rows delete themselves) so it works when several copies of the API run (Vercel) — no passwords stored there. Sign-in returns 429 with "Too many wrong passwords. Try again in N minutes.", shown on the login page. Locks are logged as warnings. Limits are `.env` settings (`LOGIN_MAX_ATTEMPTS`, `LOGIN_ACCOUNT_MAX_ATTEMPTS`, `LOGIN_WINDOW_MINUTES`, `LOGIN_LOCK_MINUTES`). Tested on a throwaway database: 5th wrong try locks that device (even the right password is refused), another device still signs in, 20 wrong tries from 20 addresses lock the account.
- **Passwords**: confirmed they are only in the database (bcrypt); sign-in fetches the account and checks the typed password against the stored hash.
- **CORS**: behaviour unchanged (`CORS_ORIGINS`, default `*`); explained in `.env.example` and the README, and the server logs a reminder while it is `*`. To set once the Vercel address and the API's address are known.
- **Vercel**: added `vercel.json` (Vite build → `dist`, every page address rewritten to the app so reloading `/billing/login` works, `sw.js` not cached). The API still needs a host; README → "Deploying (Vercel)" explains both options and what to set.
- **README rewritten** to match the app as it is now (features, sign-in and security, six-month deletion on, running and deploying, backups and logs, layout); corrected two stale statements (phones cannot reach the development server; login accounts live in `src/portals.js`). `.env.example` updated to match.

## 30 Sep 2026 — Six-month bill deletion switched on
- At the owner's request `BILL_RETENTION_ENABLED=true` was added to `.env` and the API restarted. The startup pass deleted the **20 bills older than 180 days** (15–29 Mar 2026, ₹20,719 in all) and the deletion now runs every 6 hours while the API is up. 324 bills remain; the oldest is from 3 Apr 2026.
- Before switching on, those 20 bills were saved to `backups/2026-09-30-bills-removed-by-6-month-deletion.xlsx` (the usual sales report) and `.json` (the raw records).
- From now on bills disappear from the database, the analytics page and the Excel report once they are 180 days old: download each month's Excel report and keep it (sales records are usually required for several years — confirm with the accountant).

## 30 Sep 2026 — Delete an order from the table plan
- On the counter's table plan each order in a table's card has a small red bin to the right of its status ("ORDER TAKEN"). It asks first ("Delete this order on table 5? 1× Soft Drink - 750Ml · ₹40 … This cannot be undone.") and then removes **that order** — a table with two orders keeps the other one; a table whose last order is deleted becomes vacant.
- Server: `DELETE /api/active-tables/<ticket>` is back (removed in the cleanup as unused; now it has a caller), limited to **cashier and admin** (waiters get 403). It also deletes the waiter's matching pending print request (same table and same cleaned item list — both are saved from one order), so a cancelled order cannot be billed from the Print Queue, and logs a warning with who deleted what ("Order deleted by admin: table 5, 1 x Soft Drink - 750Ml (total 40.00) and its print request").
- The waiter's table plan stays view-only (no bin). The kitchen board drops the order on its next refresh.
- Tested on a throwaway database with real waiter orders (two on table 5, one on table 3): deleting one table-5 order removed just it and its print request; deleting the second left table 5 vacant; table 3 untouched. Lint 0/0, build clean.
- Note: at 16:46 the API (port 5000) and web app (port 5173) were found stopped — the API log ended at 03:56 — and were restarted (`nohup`, logs in `logs/api.log` and `logs/web.log`).

## 30 Sep 2026 — Two-line tagline on login pages; "waiting for the bill" badge on the table plan
- **Login pages (all three):** the tagline is split into two halves (`components/Tagline.jsx`); below 760 px it always shows as exactly two lines — "Mandi | Chinese | Tandoori" / "Meals | Snacks | Biryani" — instead of wrapping into four ragged lines beside the Install button. One line on wide screens. Checked at 320, 375 and 1280 px; no overlap with the button.
  Follow-up: between ~480 and 760 px the two lines sat off-centre — the portal header's `.header h3 { padding: 0 85–140px }` (room for that header's icon buttons) also hit the login tagline, squeezing it narrower than its lines so they spilled right. The login tagline now drops that padding (the brand block already clears the Install button). Measured title, both tagline lines and portal name sharing one centre at 320–1280 px on all three login pages.
- **Table-plan badge (billing portal):** a red count on the table-plan icon shows how many tables have a served order whose bill has not been printed. `BillingApp` polls the floor every 10 s; printing a bill or pulling one from the plan refreshes it at once (`billing:tablesChanged`). Tooltip: "Table plan — 2 served tables waiting for the bill". Not on the waiter's plan, which hides served orders by design.
- **Fixed: a takeaway with a table number never closed.** Printing only closed the table for Dine-in bills, but a waiter can send a Take Out order with a table number — its ticket stayed open for good (table shown occupied, and the new badge could never clear). Printing a bill for a table now closes all its tickets whatever the order type.
- Tested with a mocked floor: badge 2 (table 3 served; table 5 one served + one cooking; table 7 new) → billing table 3 → 1 within 1.5 s → Take Out bill for table 7 closes it. Lint 0/0, build clean.

## 30 Sep 2026 — Excel sales report: plain black ledger look
At the house's request the workbook (`server/reports.py`) is now Times New Roman, black only (no green header bands, grey text or zebra shading), with a thin black border on every table cell, a medium rule under the headings and a double rule above each TOTAL row. Also fixed what the screenshots showed: the Summary title was clipped by a merged cell (titles are no longer merged); headings hid behind the filter arrows ("S.N/o", "Rani", "Share of reven…") — columns are now sized from their heading and widest value plus room for the arrow; long "Item details" in the Bill Register were cut off — rows now get the height their wrapped text needs. Amounts are right-aligned with a small trailing space (`_)` in the number format, which LibreOffice honours where it ignores right indents), counts and dates centred, text inset from the line; the Summary is a two-column Particulars / Value table. Narrow sheets print portrait, Daily Sales and the Bill Register landscape, all on A4 with "Page n of N" footers and the heading row repeated on every page (September: 12 printed pages → 10). Checked by rendering the September report through LibreOffice. The figures themselves are unchanged. **Restart the API** — a report downloaded from the running server still has the old look.

## 30 Sep 2026 — Logo as app icon, menu dialogs stay open, Install button placement
- **App icon = the restaurant logo** (`brand/logo-original.jpg`). `scripts/make_app_icons.py` cuts the round badge out of its black background and writes `public/icons/logo-192/512.png` (transparent corners), `logo-maskable-512.png` (badge inside the 80 % safe zone on black, so Android launchers can crop it to any shape) and `logo-64.png` (browser tab). All three manifests, the iOS/Android home-screen icon and the favicon use them; the per-portal monogram icons and the SVG favicon are gone. The source logo is only 334 × 379 px, so the 512 px icon is upscaled — a larger original would be sharper.
- **Menu and category dialogs stay open** after Add / Save / Delete so several changes can be made in a row: a green note inside the dialog says what happened ("Saved "Chicken 65". Choose another item to edit, or close."), the lists and the billing menu refresh underneath (`refreshAll` now resolves once the dialogs' data is fresh), and "Cancel" became "Close". Add item clears the fields but keeps the category and single/group mode and puts the cursor back in the name; Edit item tracks the selection by id, so after saving it stays on that item (following it into its new category after a move or rename) instead of jumping back to the first item; the delete dialogs drop what was deleted and keep only failures selected. Tested on a throwaway database: 2 adds, 2 price edits in a row, a rename + move, 2 separate deletes, 2 category adds and 2 category deletes without closing.
- **Install button on the right on all three login pages**, at every width (compact "Install" below 760 px; on phones the brand gives up room on the right only, so the first line never runs under it — checked at 375 / 440 px and desktop). **It hides once installed on the device**: inside the installed app, after the browser reports the install (`appinstalled` / accepted prompt), after a desktop shortcut is downloaded, and in later visits (remembered per portal, `installed:<portal>`); it comes back only if the browser offers installation again, i.e. the app was removed. On phones without a one-tap install it explains "Add to Home screen" (Android ⋮ menu / iOS Share) instead of downloading a Windows shortcut. Each step tested in the browser.

## 30 Sep 2026 — Category bar, installable portals, notifications, data and hard-coded values
- **Category bar fills its width.** An old rule capped tabs at 160px, so rows ended in empty space (8 tabs showed as 7 + 1 with "Non-Veg Star…" cut off). `MenuBrowser` now measures the bar (ResizeObserver) and sets `--tab-columns`: the fewest rows that fit at a 150px minimum (110px on phones), tabs shared evenly, every row stretched edge to edge. Checked: 8 tabs → 4 + 4 at the usual till width, 9 → 5 + 4 at 1366px, 3 × 3 on a phone, no names cut off.
- **"Install app", per portal (replaces the fake `.exe` downloads removed earlier).** Each login page has the button; in Chrome/Edge it installs only that portal as its own app (`public/manifests/<portal>.webmanifest`: name, icon, `start_url`/`scope` = `/billing`, `/server` or `/kitchen`; `index.html` links the portal's manifest before load). New icons (`public/icons/`, S&H monogram + coloured portal band) and an S&H favicon replacing Vite's default purple logo. `public/sw.js` is required for installation; it caches nothing and only answers an unreachable server with a clear page. Where installing is not allowed (another device over plain HTTP) the button downloads a `.url` shortcut to that portal only. Verified in a real Edge (off-screen, temporary profile): each portal loads its own manifest, no manifest errors, the service worker controls the page, and Edge offers installation for all three under their own names; the fallback shortcuts point at `/<portal>/login` on each page. (The Claude browser pane blocks service workers, so it cannot show the install offer.)
- **Notifications.** Fixed: a dismissed notice came back when a poll landed before the server recorded the dismissal (reproduced with a slow acknowledgement); the provider now remembers dismissed ids and lets one return only if the acknowledgement fails (also tested). Fixed the text under the table heading ("— food ready…" → "Food ready, hand to waiter"; served now "Served, ready to bill"). Confirmed: correct colours per kind, auto-close (ready 15 s, served 12 s), notices expire from the database after 6 h (TTL index present), only the server and billing portals listen.
- **Database: removed test leftovers** (copy kept in `backups/2026-09-30-removed-test-data.json`, git-ignored): 8 print-queue requests from 27 Sep (table 1, sent by admin, never picked up) and 2 served-but-unbilled table-7 tickets (one from the older till with a text date, one from 01:44 today) that kept table 7 showing as occupied. Left alone: empty `image_base64` fields (the older till may expect them), notifications (self-expiring). Awaiting the owner: this app's 7 bills from midnight–2 am on 28–30 Sep (look like test prints), the 20 bills past 180 days, 3 empty categories.
- **Hard-coded values.** The API base defaulted to `http://localhost:5000`, so any other device (a waiter's phone) called its own localhost; it now uses the page's own address through the Vite proxy (verified `/api/health` through it). Removed the fake GSTIN/FSSAI `123456789`; receipts and headers read the name and tagline from `brand.js` instead of six literal copies; login account lists and portal names/paths live in `src/portals.js` (the kitchen login said "Kitchen Dashboard", its header "Kitchen Portal"). `index.html`: dropped the `keywords` meta and the search-engine JSON-LD (the page is `noindex`, and it duplicated the address by hand).
- Smoke test on a throwaway database 71/71; lint 0/0; build clean. **Restart the API** for the server-side changes.

## 30 Sep 2026 — Menu items and categories: add / edit / delete checked and fixed
Tested every dialog end to end in the browser against a throwaway copy of the menu (test API on its own database, dropped afterwards; the live menu was never touched).

**Fixed:**
- **Deleting a category now always erases its items**, including a category that exists only on items (the menu lists every category an item uses, but the delete dialog only listed the saved ones and the server answered "Category not found", leaving the items). The server deletes when either the category or any of its items exist, matching names without regard to case or stray spaces (the older till stored "  Specials "); items created or moved into a new category now also add it to the category list.
- **Delete category says what it will erase**: every card shows its item count, the button reads "Delete 1 category and 18 items", and the result message gives the real number erased.
- **Case-only rename** ("chicken 65" → "Chicken 65") was reported as saved but silently kept the old name (the server compared names case-insensitively). Now renames; a clash with another item is still refused.
- **Delete messages showed grey "info" styling** — both delete dialogs passed an `'ok'` tone that doesn't exist; now `'success'`.
- **Names containing "/"** could not be edited or deleted (the slash broke the route); item and category routes now use `<path:…>`.
- **A picture link without http(s)://** blocked Save with the browser's own "Please enter a URL" bubble; forms are `noValidate` and show a clear message instead.
- **Size order in Edit item** followed the API's alphabetical keys (duo, solo, squad, trio); `utils/sizes.js` now orders both the till's size picker and the editor solo → duo → trio → squad, other sizes by price.

**Verified working:** add single item (+ bad/good image link), add group item, both appear on the billing menu at once; edit price, category and name; edit group sizes; name clash refused; delete item; add category (duplicate with different case/spaces refused); delete category with 2 items → both gone; delete the older till's untidy item-only category → item gone; unknown category → 404; waiter refused add/edit/delete (403). Lint 0/0, build clean.

**Restart the API** to load the server-side fixes.

## 30 Sep 2026 — Cleanup: old-program traces, dead code, unwanted files
Backup taken first (whole project minus `node_modules`, outside the project folder).

**Removed — only ever served the old desktop builds (which never existed; the `.exe` files were 277-byte text notes):**
- The login page's "Download local application" popup, the header **App** button, `public/downloads/*.exe` (and their copies in `dist/`).
- The second login key `authToken` (now cleared on sign-in/out), snake_case copies of menu fields in API responses (`is_group`, `group_prices`, `image_url`), form-data input on menu edit, the `price_solo/duo/trio/squad` size fields, the print queue's duplicate `queue` field.
- Accepting "Cash / UPI" and "Dine-in / Take Out" on *new* bills (only the older till writes those; reports still read them).

**Removed — dead code:**
- API routes nothing calls: `GET /api/sales`, `GET /api/analytics/summary` (`routes/analytics.py`), `POST /api/bills` (alias of `/api/bill`), bill hide/restore (`PUT /bill/<id>/delete|restore`; no bill in the database was hidden), `PUT /api/print-queue/<id>`, `DELETE /api/active-tables/<ticket>`, the `merged` flag and `includeDeleted` switch.
- Front end: `closeTable`, `hasRole`, `MoreIcon`, `toggleTheme`, the never-called `initTypography`; `API_BASE`, `systemTheme`, `storedTheme` no longer exported. Python: `is_valid_email`, `retention.stop`.
- **1,442 lines of CSS (221 rules)** that could never match anything — 111 class names from removed features (download popup, hide-bill mode, an old settings dropdown, `mandi-size` picker, `payment-options`, …) — plus orphaned section comments (one still credited the deleted "SVFC reference"). Found with a postcss script that checks every selector's classes/ids against the JS/JSX/HTML. **Verified with a computed-style fingerprint of every element on 18 screens** (login, billing, analytics + its dialogs, waiter, kitchen, dark and light, print mode): 0 differences before vs after, after a control run also showed 0 (the only deltas were the live minute counters).
- `__pycache__` folders, an empty stray `package-lock.json` in the parent folder, `.venv2/` in `.gitignore` → `.venv*/`.

**Kept on purpose** (they read data already in the database, which the older till still writes): `image_base64` menu pictures (all items use it), `createdAtISO`, table numbers stored as text or number, "Cash / UPI" counted as cash in the Excel report.

**Fixed while there:** `require_db()` was never called, so with the database down every request returned a bare 500 despite the startup log promising 503. `handle_errors` and `roles_required` now answer "Database unavailable" (503) — checked against an API started with an unreachable database.

**Smoke test brought up to date** (it still used the pre-27-Sep single-ticket API: status by table number, `/add-items`, hide/restore, analytics summary). It now reads its URL and passwords from the environment and must run against a test database (it consumes bill numbers). Run on a throwaway `sharabian_mandi_pos_smoketest` database (menu copied in, dropped afterwards): **71/71 passed**; every removed route answers 404/405. Lint 0/0, build clean. README layout/testing sections updated.

**Restart the API** (`python app.py`) to load the backend changes; the running process still has the old routes (the front end no longer needs any of them).

## 30 Sep 2026 — Manual refresh on the kitchen board
- A refresh button (circular arrow, `RefreshIcon`) sits beside the settings gear in the Kitchen Portal header. It reloads the board at once instead of waiting for the 8-second poll; the arrow spins and the button is disabled until the reload finishes (`kitchen:refresh` / `kitchen:refreshed` events between `KitchenApp` and `KitchenDashboard`). `SharedHeader` takes `onRefresh` / `refreshing`; the header's single 42px icon slot widens (`.has-refresh`) so the two buttons sit side by side. Verified with a mocked API: one click → one extra board request; side by side on desktop and phone. Lint 0/0, build clean.

## 30 Sep 2026 — Staff passwords moved out of the code
- Every password (admin included) was in plain text in `server/bootstrap.py`, the README and `tests/smoke_test.py`. All removed. Passwords now live only in MongoDB as bcrypt hashes; `seed_users` creates missing accounts without a password and never touches one, and logs any account that has none.
- New `python -m server.passwords set <email…> [--role R] [--stdin]` / `list` to set or reset passwords straight into the database (prompted, not echoed).
- At the house's request the cashier, waiter1–3 and cook1–2 passwords are now one simple shared staff password (set in the database only). The admin password is unchanged. **cook1 and cook2 did not exist in the database** (the kitchen portal had no accounts) — created with the cook role. All six verified signing in through the API; a wrong password is rejected.
- The smoke test reads `SMOKE_ADMIN_PASSWORD` / `SMOKE_STAFF_PASSWORD` from the environment.

## 30 Sep 2026 — Reprint from the register; retention and numbering audit
- **Print bill** added to the register's Manage bill menu: pick one bill (grouped by day, searchable by number, amount, payment or table) and it prints on the receipt printer in the same layout as a new bill (`components/receipt/ReprintBill.jsx`, mounted beside the app root only while printing; `body.reprinting` hides the dashboard from the printer; the page is fitted to the slip). Works for old-format bills too (subtotal is rebuilt from the items).
- **Fixed: register grouped bills by UTC day.** `dayKey` sliced the ISO string, so anything rung up before 5:30 am IST was listed under the previous day — in the new print picker and in the bulk-delete dialog, where ticking a day could select the wrong bills. Now uses the local date.
- **Retention audit (read only).** `tests/retention_test.py` 8/8 — the purge logic is correct. But `BILL_RETENTION_ENABLED` is not set in `.env`, so this app only reports; and the live data shows the shop's older copy is not deleting either: 20 bills are past 180 days (oldest 15 Mar 2026, 198 days).
- **Bill-number audit (read only).** 335 of 339 bills are old-format (`token`, no `createdBy`, payment always "Cash / UPI", order type always "Dine-in / Take Out") — written by the older copy, most recently 29 Sep 20:35 IST. That copy starts every day at **#2** (no #1 on any of 100+ days). This app's own counter is correct (1, 2, … reset at IST midnight, atomic). On 28 and 29 Sep both ran, producing two bill #2s each day. The `public/downloads/*.exe` files are 277-byte text placeholders, not programs.

## 30 Sep 2026 — Printed bill: new look, pages cut where the slip ends
- **Pages fit the slip.** `@page { size: 70mm }` is a 70 × 70 mm *square* (one value sets both sides; the 26 Sep note that the height is "unbounded" was wrong). A real test print showed a bill spilling its footer onto a second page followed by blank paper. `src/utils/printPages.js` now runs on `beforeprint`: it applies the print rules for one synchronous layout (nothing is painted), measures the bill and the token slip, and installs `@page { size: 70mm <bill>mm }` plus a named `token-slip` page with the token slip's own height, so each slip is cut right after its footer.
- **Print leaks fixed.** The page header printed above the bill (`header.header { display:flex !important }` outranked the print hide); `.page-shell`'s dark background printed black; a narrow-screen `min-height: 170px` on the item list left a gap; the container padding pushed the bill 4px off the edge; in a flex row the token slip stretched to the bill's height.
- **Receipt look** (house-approved reference): monospace, bold bill number top right, date and time on one line, dashed rules between sections, bold item rows, compact table/payment/order lines, big bold total. Footer on both slips is "Thank you! / 🙏 Visit again 🙏"; the ANITS credit no longer prints. The token slip now says "S&H" like the bill, shows "Token No" alone top right (the date prints once, beside the time), and line spacing on both slips is tightened to 1.2.
- Verified by rendering both slips with the print rules at 70 mm width and at 1366 px (page heights agree: 86/50 mm for one item, 104/62 mm for four). Lint 0/0, build clean. **Still to confirm on the real printer** — per-page sizes for named pages depend on the Chromium version.

## 27 Sep 2026 — One ticket per order and clearer kitchen flow
- **Separate tickets per order.** Sending a second order to an open table used to *merge* into the existing ticket (`_merge_items`, unique index on `tableNumber`) — a table's biryani and its mandi reorder could never be seen or cooked separately. Now every "Send order" inserts its own ticket; kitchen cards show "2nd order" when a table has several. The legacy unique index is dropped in `ensure_indexes` (new non-unique `(tableNumber, createdAt)` one), status/close routes address a ticket by id, and a `PATCH /table/<n>/close-table` helper closes a whole table's tickets at once. The billing print button uses it, so settling a table clears *all* its orders.
- **Kitchen flow wording** now matches the house language: columns **Order taken → Preparing → Ready to serve**, and the final button is **"Handed to waiter"** (ticket leaves the board, floor notified).
- **"Food ready" notices say what to do**: dine-in reads "Table N — food ready, hand to waiter"; takeaway/delivery reads "food ready for <type> pickup".
- **Table plan shows all orders**: one cell per table sums every open ticket ("3 orders · 5 items · ₹768") with the busiest ticket's status; tapping loads all items for billing. The server portal's table tap instead arms the table number only (new orders must not duplicate tickets already cooking).
- **Bug found while testing:** ticket-id routes 404'd because pymongo does not cast `_id` strings to `ObjectId`; `_by_id` now wraps the id explicitly.
- **Server portal's table plan is peek-only.** Tapping a table used to arm the order panel; now it flips a small card on the cell listing the table's orders (per-ticket status, items, total) and nothing else — the panel is filled only from the menu + table dropdown. Billing keeps tap-to-load for settling tables. Verified live in both portals; lint 0/0, build clean.
- **Served orders leave the waiter's floor view.** The server's table plan used to keep showing a table's handed-over orders, so a fresh order on the same table appeared alongside the finished one ("it shows the previous entry too"). In peek mode, tickets whose kitchen status is `served` are now hidden — a table with only old served orders renders vacant; the billing counter still sees them, since the end-of-meal bill covers the whole table. Verified live: biryani handed over + new mandi on one table showed only the mandi on the server plan and "2 orders · ₹528" on billing.
- **Counter ordering from the floor plan.** In the billing portal, tapping an occupied table opens a card with its items plus two actions: **Load bill** (everything onto the bill for printing) and **Add items** (arms the table so new menu clicks go to the kitchen as a fresh order — the cart starts empty, or resends would duplicate tickets already cooking). Tapping a vacant table arms it directly, so admin/cashier can run a table end to end without the server portal. The print button is now **"Print"** (renamed back from "Push bill" at the house's request) and flips to **"Send to kitchen — Table N"** while armed; printing still closes the whole table via `PATCH /table/<n>/close-table`. One TDZ crash (send callback referencing `reset` before declaration) caught in the browser console and fixed; full flow verified live on Table 5 with two separate kitchen tickets and no duplicates.
- **Popover restyle ("more like a hover").** The in-cell card felt cramped, so the peek is now a floating popover: anchored just below the cell with an arrow, centered, ~250px wide, roomy padding, slim scroll thumb, no horizontal scrollbar; cells near the bottom of the plan flip it above (`is-flipped`) so nothing is clipped; the noisy native tooltip on occupied cells is gone (the popover replaces it). Multi-order groups get dashed separators. Geometry verified on top- and bottom-row cells in both portals.
- **Popover clipping bugs ("they are breaking up").** Two stacking/overflow faults at wider layouts: neighbouring grid cells painted **over** the card (their text showed through it), and cards on the right-hand column poked past the modal edge, spawning a horizontal scrollbar. Fixes: the peeked cell gets `z-index: 40` so the card always paints above its neighbours, and the card auto-anchors left/right (`is-align-left/right`, arrow included) whenever a centred card would not fit — measured live at 2-column and 3-column widths, in both portals.
- **Load bill vs Pull bill wording.** On the counter's table popover, the primary action is context-aware: **"Load bill"** when every ticket on the table is served (the meal is over), **"Pull bill"** when anything is still in the kitchen (order taken / preparing / ready) — same action either way (loads the whole table onto the bill for printing), just honest wording. Verified live: served table → "Load bill", Order-taken table → "Pull bill".
- **Print output matched to the bill reference PDF** (a 26 Sep printout of this very app). Differences found vs the current build: the reference prints only **"Bill No"** in the header — the Table No appears as its own line **below the items** alongside Payment Method and Order Type, all bold small text left-aligned with generous spacing; the current build was hiding that meta block on print (`no-print`). Now: meta block prints (kept hidden on screen — the pickers already show it), header's Table No hidden on the main bill only (the customer token slip keeps its Date line), `justify-content: flex-start` wins the cascade over the old space-between rule. Verified in the compiled CSS; lint 0/0, build clean. Note: the thermal `@page size:70mm` was already correct for the POS printer — the reference PDF's A4 shape is just Chrome's print-preview paper, not the target.
- **Pulling the bill clears the kitchen board instantly.** Loading a table's bill on the counter ("Load bill"/"Pull bill") now marks every not-yet-served ticket on that table as served (fire-and-forget `setKitchenStatus` per ticket) — the cook no longer taps "Handed to waiter" for food that has already walked out; the board drops the table on its next 8-second poll, and the counter keeps the table until the bill is printed and closed. Verified live: Water 1L sent to Table 6 → ticket appeared on the kitchen board → "Pull bill" on the counter → ticket flipped to `served` in the database and the board emptied on the kitchen screen within one poll.
- **Ready tickets carry a final handover banner.** A ready ticket now shows a green banner under its items — "Food ready — hand to waiter" for dine-in, "Food ready — <order type> pickup" otherwise — so the cook's last step is spelled out at a glance next to the "Handed to waiter" button (`.ticket-handover` in kitchen.css). Verified live: ticket cooked to ready on Table 8, banner rendered on the card. Both features were planned and lint-checked in an earlier session but were not on disk when work resumed; both are now applied and verified live (scratch tickets on Tables 6/8 removed afterwards; pre-existing Table 1/2/7 tickets and queue entries untouched), lint 0/0, build clean.
- **Mobile header: icons move under the title.** At ≤600px the header was a squeezed single row (gear left, brand, tables+analytics right). It is now a two-row grid: the brand line centred on top, and beneath it an icon lane — settings hugs the left edge while tables and analytics hug the right (house tweak: centred cluster "looked odd"). Desktop keeps the one-row layout. Verified live at 400px (settings left 10px, actions right 373px on the same baseline) and 1280px (unchanged); lint 0/0, build clean.
- **Confirm dialogs fixed (unreadable + full-bleed).** The delete-order / emergency pull-bill dialogs rendered badly in the ≤768px window: the legacy sheet's mobile block pins every `.modal-content` to `width:100% !important` (dialog stretched edge-to-edge, 488px over its 420px cap) and body copy inherited the pale `--line-strong` #555 token, so the red caution strip's text was invisible. Fixes in the scoped `.pull-bill-confirm` block (Modals.css): `.modal-overlay .pull-bill-confirm` out-specifies the legacy width/margin/padding rules (dialog back to 420px, centred), and `p` / `.confirm-warning` get explicit readable colours (light body text, `--danger-soft-text` on the caution strip) in both themes. Verified live: 420px wide, vertically centred, warning legible; scratch T3 tickets used for the check deleted afterwards; lint 0/0, build clean.
- **Confirm dialog theme audit (both modes).** Re-verified the delete-order / emergency pull-bill dialog against each theme's tokens after the readability fixes: dark shows the coral alarm title (`--danger-strong` #ff6b6b), white body, salmon caution text (`--danger-soft-text`) on the translucent red strip, lime Pull bill and an outlined Go back in `--modal-ink`; light shows the deeper red title (#C62828), dark olive body, #8C1D18 caution text on the #FCE8E6 strip, dark-green Pull bill and dark ink on the dusky card — every pairing meets contrast in both modes. The title colour needed a `.modal-overlay .pull-bill-confirm h3` selector with `!important` to hold against the legacy `.confirm-modal h3` rule that was repainting it white in dark mode. Verified live in both themes (400px-wide window); scratch T3 ticket deleted afterwards; lint 0/0, build clean.
- **Six-month retention verified live (30 Sep).** The owner asked to confirm old bills are being deleted. Timeline: the 23:00 29 Sep boot logged "20 bill(s) older than 180 days (before 02 Apr 2026)" in report-only mode; the owner then set `BILL_RETENTION_ENABLED=true` in `.env`; the 17:04 30 Sep restart loaded it and the startup purge deleted those 20 bills. Verified by dry-run `purge()` against the live DB (matched: 0, deleted: 0), the bill register (322 bills, oldest now 03 Apr 2026 = day one inside the window), and `tests/retention_test.py` (8/8 passed, report block: deletion on, 0 older than 180 days, next expiry in ~0 days). Scheduler deletes at every boot and every 6 hours after.
- **Header location/owner hidden on phones.** The billing header's Location + Owner line (counter-screen info) no longer renders at ≤600px — it filled a quarter of a phone's header. The late small-screen block in index.css now hides `.header-info` instead of restyling it; desktop keeps it. Verified live at 400px (display:none, menu starts right under the brand row) and 1280px (still visible); lint 0/0, build clean.
- **Actions menu trimmed to Analytics.** The billing header's ⋮ Actions dropdown offered "Print queue" and "Analytics"; the print-queue entry is gone at the house's request (the queue modal itself still exists for code that opens it programmatically). Verified live: menu lists only Analytics. `showPrintQueueBtn` removed from SharedHeader and BillingApp; lint 0/0, build clean.
- **Analytics is now a header icon, not a menu.** With Print queue gone the ⋮ dropdown had a single entry, so it became a direct button: a new `AnalyticsIcon` (three rising bars) sits next to the Tables icon and navigates straight to `/billing/analytics` on click — no popup, no intermediate step. Verified live: icon renders and one click lands on the analytics dashboard; the MenuPopup/MenuItem import left SharedHeader. Lint 0/0, build clean.
- **Emergency pull-bill confirm ("you are disturbing the work flow").** Since pulling a bill now clears the kitchen board instantly, the counter gets one guard rail: when the primary popover action fires on a table with any ticket not yet served, a stacked confirm dialog appears — title **"You are disturbing the work flow"**, body naming the table and its open tickets, red caution strip "use only in an emergency (guest leaving early, wrong table)", and two options: **Pull bill** (proceeds with the load + serve) and **Go back** (returns to the plan, nothing changes). Fully-served tables keep the old one-tap "Load bill" — no dialog for the normal end-of-meal case. Verified live on a scratch Table 5 ticket: Go back left the ticket `new` and the plan open; confirm pulled the bill and emptied the board. Ticket removed afterwards; lint 0/0, build clean.
- **Bill register toolbar tidied.** In the analytics register header the green **Manage bill** button now sits left of the ◀ ▶ page arrows (they swapped places at the house's request), and the button label dropped its little ▾ arrow — it reads plain "Manage bill". Verified live on /billing/analytics: order is Manage bill, ◀, ▶; lint 0/0, build clean.
- Verified live end-to-end (biryani + mandi on one table → two tickets, cooked and handed over independently; admin cell showed "3 orders · 5 items · ₹768" with a real order in the mix), lint 0/0, build clean; test tickets and queue entries removed afterwards.

## 26 Sep 2026 — Print-queue modal contrast (both themes)
- The modal title ("Print queue (1)") was nearly invisible: `.modal-header h2` used `--accent-contrast`, the token for text sitting **on the lime accent** — near-black in dark mode on a dark modal, white in light mode on a light modal. Wrong token both ways; now uses `--modal-ink`, which flips with the theme. Verified on screen in dark (bright title, white "Table 5", readable meta/time, red Discard) and light (dark title on the dusky card).

## 26 Sep 2026 — Cleanup, structure and SEO
- Deleted `SVFC reference/` (a full 39 MB copy of a different restaurant's POS, own venv included; already ruled out — separate cluster and bill counter, contained its own auto-deletion code), `reference/` (7 superseded pre-React HTML mockups), stray `api.log`/`vite.log`, and all `__pycache__` output.
- Removed dead exports: `SunIcon`/`MoonIcon`/`ChartIcon`/`ReceiptIcon` from icons.jsx (theme switcher is text-based by design).
- index.html rebuilt for SEO: descriptive title, meta description/keywords, author, `robots: noindex` (internal tool — don't let search engines index a billing backend), Open Graph tags, `Restaurant` JSON-LD structured data with the real address/phones from brand.js, theme-color, and a noscript fallback.
- Restored the missing inline theme-bootstrap script the theme.js docstring promised — saved theme now applies before React loads, so light-mode users no longer get a dark flash on reload.
- Verified: all SEO tags present in the DOM, theme applies pre-React in both modes, smoke suite 74/74, lint 0/0, build clean.

## 26 Sep 2026 — Full-codebase audit (fixed a bulk-delete crash)
- Fixed `onSelectDay` in the bulk-delete dialog: the day checkbox passed only the day object while the handler expected a second `all` argument and iterated it — ticking any date threw "all is not iterable". It now uses the day's own bill list.
- Removed dead code: `OpenTablesModal.jsx` (superseded by `TablesModal.jsx`, no imports remained).
- Cleaned test leftovers (Table 99 print-queue entries) from the smoke-test runs.
- Audit results: frontend↔backend API surface matches 1:1, all relative imports resolve, all API symbols defined, Python compiles, smoke suite 74/74, retention suite 8/8, lint 0/0, build clean; billing / analytics / server / kitchen / login pages verified in the browser with no console or network errors.

## Summary

| | Before | After |
|---|---|---|
| Backend | One 1,559-line `app.py` | `server/` package: 21 modules, ~2,300 lines |
| Frontend | URLs hard-coded in every component | One API layer, shared hooks, route guards |
| Billing portal | Could not save a bill | Saves, prints, records |
| Server portal | Could not send an order | Sends to kitchen and cashier |
| Kitchen portal | Never saw waiter orders; status lost on refresh; Done disabled | Live board, persisted status, Done works |
| Print queue | Always empty | Shows pending requests |
| Group-priced items | Added to bills at ₹0 | Size picker with real prices |
| Cross-portal alerts | None | Kitchen → waiter + counter notifications |
| Analytics export | CSV built from the page's loaded bills | Six-sheet Excel workbook built server-side |
| `index.css` | 6,388 lines, 125 KB | 4,208 lines, 88 KB (render-identical) |
| Till bundle | 548 KB, one chunk | ~330 KB; charts load only on analytics |
| Automated tests | None | 74 API checks + 8 retention checks |

---

## 7–8 Sep 2026 — Audit, bug fixes and restructure

### Bugs fixed

The first pass read every file, ran the linter and build, started the backend
against the live database and exercised each portal. These were broken:

| Area | Problem | Fix |
|---|---|---|
| Billing | Print posted to `/api/bills`, a GET-only route — **no bill could be saved** | Save route answers on both `/api/bill` and `/api/bills` |
| Server portal | Called `/api/token`, which returned **410 Gone** — **no order could be sent** | Removed; orders go to the print queue and the kitchen |
| Kitchen | Waiter orders never reached it — the server portal only wrote to the print queue | Server portal also opens the table on the kitchen board |
| Kitchen | Ticket status lived in browser memory; a refresh or second screen lost it | Status stored on the table in the database |
| Print queue | No auth header, read `queue`/`data` when the API sends `requests`/`billData`, filtered on a field never set — **always empty** | Rewritten against the real response |
| Menu | Edit Menu called `PUT /api/custom-items/:name`, which had no route — **every edit failed** | Route implemented |
| Menu | Backend sent `group_prices`, frontend read `prices` — 17 of 54 items **added at ₹0** | One canonical item shape from the API |
| Auth | No route guards; `/billing`, `/server`, `/kitchen` opened for anyone | `RequireAuth` with per-portal roles |
| Auth | `.env` loaded *after* the JWT secret was read — tokens signed with a hard-coded default | Config loads `.env` first; stable secret added to `.env` |
| Auth | Every startup deleted non-default users and reset all passwords | Accounts created once; passwords only set on creation |
| Bills | Bill number read-then-written — two tills could get the same number | Atomic `$inc` |
| Bills | Delete/hide/restore addressed bills by number, which **restarts daily** (94 bills share number 2) — could hit the wrong day's bill | Addressed by unique document id |
| Bills | Receipt always printed `Bill No: 0` | Shows the real next number |
| Bills | UI offered payment/order types the API rejected (Zomato, Swiggy, Pending, Delivery) | Lists aligned |
| Reports | "Today" compared local time with UTC-stored dates — off by 5½ hours | UTC storage, IST day boundaries |
| API | `/api/auth/logout` missing; dangling `/api/token/current` decorator; duplicated debug output | Cleaned up |
| UI | Active category tab looked identical to the others | Distinct amber tab |
| UI | Server portal action buttons clipped off-screen | Sticky action bar |
| UI | Print rule `qty-print` missing its dot, never applied | Fixed |

### Restructure

**Backend** — `app.py` is now a thin entrypoint (`python app.py` still works):

```
server/
  config.py        settings from .env        routes/auth.py        login, verify, logout
  db.py            connection, indexes       routes/bills.py       numbering, save, register
  api.py           @roles_required           routes/analytics.py   MongoDB aggregations
  security.py      password hashing          routes/menu.py        items, categories
  validation.py    totals recomputed         routes/orders.py      kitchen board
  timeutil.py      UTC / IST                 routes/print_queue.py waiter → cashier
  bootstrap.py     seed data                 routes/system.py      health, images
```

- One `@roles_required` decorator replaced eight copy-pasted admin checks.
- Totals are recomputed on the server; the client's numbers are display only.
- Analytics run as MongoDB pipelines instead of loading every bill into Python.
- Indexes added for the actual query patterns.

**Frontend**

- `src/api/` — one axios client with the auth header and 401 handling; every
  endpoint in `index.js`. Components no longer build URLs, which is how the two
  sides had drifted apart.
- Shared hooks `useCart`, `useMenu`, `usePolling`; one `MenuBrowser` for the
  billing and server portals.
- Settings dialogs split out of a 593-line file into `components/settings/`.
- Analytics logic separated from display (`useSalesStats`).

**Dead code removed** — `MenuManagementModal.jsx` (245 lines, never imported),
`AnalyticsCategory.jsx`, `ActiveTablesModal.jsx`, `test_auth.py`, unused
imports and variables. Lint went from 17 warnings in app code to zero.

**CSS** — 324 duplicate rules removed from `index.css`. Verified
programmatically: for all 615 selectors the winning declarations are
byte-identical before and after, so nothing renders differently.

**Performance** — Chart.js is loaded only on the analytics page; vendor code is
split into cacheable chunks.

**Tests** — `tests/smoke_test.py` walks the real service flow against a running
server and cleans up after itself.

---

## 9 Sep 2026 — Notifications, custom UI, kitchen Done

Requested after the portals were in use.

### Kitchen Done button

The Ready column's button was permanently disabled — the ticket flow had no
step after `ready`. The flow is now **New → Start cooking → Mark ready → Done**.
A Done ticket leaves the kitchen board; the table stays open for billing.

### Notifications between portals

New `notifications` collection and `/api/notifications` endpoints. Each portal
polls for notices aimed at its role.

| Cook presses | Waiter | Cashier & admin |
|---|---|---|
| Mark ready | "Table N is ready to serve" | same |
| Done | "Table N has been served — ready to bill" | same |

- Each person dismisses their own copy.
- Notices older than 30 minutes are not delivered; rows expire after 6 hours.
- Fixed while building it: the card-adding state update had a side effect that
  React's development double-run discarded, so cards never appeared.

### Everything custom

No native `alert()`, `confirm()` or `<select>` remains.

- `Notifications.jsx` — one stack of cards for local messages and server notices.
- `Select.jsx` — themed dropdown with keyboard support and large touch targets.
- `MenuPopup.jsx` — header menus, portalled and clamped to the window.
- `icons.jsx` — one icon set on a 24 px grid with one stroke weight; uniform
  40 px header buttons.

### Layout fixes

- **Header dropdown drifting off-screen.** Root cause: the legacy CSS sets
  `body { zoom: 1.08 }` on desktop, so script-positioned popups land 8 % off.
  `utils/zoom.js` converts between viewport and CSS pixels.
- **Server portal action bar** — the grey gradient strip became a solid bar,
  with Send order highlighted; the bill panel sizes to its contents.
- **Modal contents** — text in the white modal cards was white-on-white.
- **Kitchen ticket age** — stale tickets read "266979 min"; now "185 days".
- **Size picker** ordered solo / duo / trio / squad instead of alphabetically.
- **Tables** limited to 10, defined once in `src/constants.js`.

---

## 10 Sep 2026 — Excel report and bill retention

### Excel instead of CSV

`GET /api/reports/sales.xlsx?from=…&to=…` (admin only) returns a workbook with
six sheets: **Summary**, **Daily Sales**, **Payment Methods**, **Order Types**,
**Item Sales**, **Bill Register**. Rupee formatting, IST dates, frozen headers
and filter arrows. The download dialog opens pre-filled with the current month.

Built on the server from every bill in the range. The old CSV was built from
the bills the page had loaded, which caps at 1,000, so a busy month would have
been silently short. Checked: the Daily Sales total matched a direct database
sum exactly (₹33,918 for 1–10 Sep). The CSV code was removed.

### Six-month bill deletion

- Moved into `server/retention.py`.
- **Off by default** — it only deletes when `BILL_RETENTION_ENABLED=true` is
  set in `.env`. Otherwise each pass logs how many bills would go.
- When enabled it runs at startup **and every 6 hours**. It previously ran only
  at startup, so a till left running for weeks never purged.
- `tests/retention_test.py` checks the rule on a throwaway collection, including
  the exact cutoff (one minute either side). Real bills are only read.

## 25 Sep 2026 — Dead code, brand file, SEO, dark/light theme

### Dead code removed

- `src/Settings.css` and `src/Analytics.css` — never imported anywhere (their
  selectors either live in `index.css` already or were superseded by the
  per-portal stylesheets).
- `verifySession` API wrapper, `useCart().setQty`, `format.amount()` and the
  `CloseIcon` / `ImageIcon` exports — no callers.

### Restaurant identity in one file

`src/brand.js` now holds the name, taglines, address, owner line, contact
numbers, GSTN/FSSAI ids, the footer credit and the per-portal login account
lists. The header, both receipt headers, all three footers and the three login
screens read from it. Previously the phone numbers and tagline were duplicated
across six files, and the receipt said "GSTN" while the header said "GSTIN".

### SEO and branding

`index.html` gained a descriptive title, meta description, `robots: noindex`
(it is a private shop tool), `theme-color`, Open Graph/Twitter tags and a new
branded favicon (the old one was a leftover purple placeholder icon).

### Dark / light theme

- `src/theme.js` — storage, the `<html data-theme>` attribute and the
  `theme-color` meta; an inline script in `index.html` applies the saved theme
  before first paint, so there is no flash of the wrong palette.
- A **Light mode / Dark mode** toggle in the gear menu, on every portal, for
  every role. The choice persists in `localStorage`; with nothing chosen the
  app follows `prefers-color-scheme`.
- `index.css` now defines the dark palette on `:root` and the light palette on
  `html[data-theme='light']`. The three duplicate legacy `:root` blocks were
  removed and ~170 hardcoded colours (header gradients, greys, status colours,
  translucent blacks) were mapped to variables across all stylesheets.
- Three colours are deliberately theme-stable: the print/receipt ink (`--ink`,
  `--print-*`), the paper surfaces and the photo scrims on menu tiles.
- The SharedLogin green (`#8ae21c`) and the settings-dialog green
  (`#8cc63f`) — two odd one-off greens — now use the standard `--accent`.

### Incident during this work (recovered, no loss)

While rewriting `index.css` for the theme variables the file body was
accidentally truncated. It was fully recovered from the minified stylesheet in
the 10 Sep production bundle (`dist/assets/index-*.css`): the other stylesheets
were still intact, so the index body could be isolated, pretty-printed and
spliced back (see the "RECOVERED LAYOUT RULES" note in that file). The final
lint and build were clean and both themes were verified portal by portal in a
browser. This is one more reason open item 1 — put the project under Git —
matters.

## 25 Sep 2026 — Typography and full responsiveness

### Font

Inter Variable, self-hosted from npm (`@fontsource-variable/inter`) — no CDN,
so the shop's offline LAN is unaffected. Segoe UI remains the fallback. A type
scale (`--fs-xs` … `--fs-brand`) replaced the ad-hoc px sizes; headings and the
brand row get fluid `clamp()` sizes; money and counts use `tabular-nums` so
bill totals and analytics columns stop jittering as values change. Print
output deliberately stays on the plain thermal font.

### Responsiveness

The layout is now fluid from 360px to 1920px+: side-by-side menu/bill above
900px, stacked below; the kitchen board steps 3 → 2 → 1 columns; the menu grid
reflows with `auto-fill`; tap targets stay ≥ 44px on touch screens; the
analytics stats wrap instead of clipping. One commented "RESPONSIVE FIXES"
block at the end of `index.css` holds the overrides so they win the cascade
without `!important` wars.

Bug found during the pass: the floating "+" (add custom item) button sat
bottom-right at every width and covered the bill's Total from 1366px down. It
now parks bottom-left on desktop (over empty menu space) and keeps
bottom-right with reserved clearance on stacked layouts.

Verified at 1920 / 1366 / 1024 / 768 / 390 px across billing, login, kitchen
and analytics, in both themes. Lint and build clean.

## 25 Sep 2026 — Dropdown fix and full theme audit

### Giant icons in the dropdowns — root cause

The `@import url('./components.css')` line at the top of `index.css` had been
lost when the file was rebuilt during the theme refactor. `components.css`
holds the 16px icon sizing for menu rows, the print-queue badges and many
refinements, so without it every SVG in a dropdown rendered at its natural
size. The import is restored; dropdown rows are now text-only like the rest.

### Every page, both themes, every option

Walked billing (incl. Actions menu, Print queue, Add/Edit/Delete category and
item dialogs, size picker), server, kitchen, login and analytics in **both**
themes and fixed what the audit surfaced:

- **Modals are paper cards in both themes again.** The earlier mechanical
  colour mapping had mapped their white surface to a *text* variable (white
  modal in dark mode) and produced invalid `var(--text-strong)fff` tokens.
  New `--modal-bg/ink/muted/line/soft` variables replace all of it, and the
  obsolete "LIGHT MODE OVERRIDES" block (which forced white ink on the paper
  surfaces in light mode, hiding titles and input text) was re-pointed at the
  modal palette.
- **Analytics in light mode:** the date-range buttons were white-on-white
  (`--print-bg` used as text colour), the stat tables were still hardcoded
  navy, and ₹1,00,586 overflowed its stat card (fixed with a fluid
  `clamp()` size). Dark mode re-verified unchanged.
- Login, kitchen, server: verified clean in both themes.

Lint and build clean.

### Theme picker as a collapsible group

The single "Light mode / Dark mode" row became a **Theme** group in the gear
menu, matching the Categories/Menu items pattern, with **Light** and **Dark**
rows and the active choice highlighted. `MenuItem` gained a `className` prop;
the active style lives in MenuPopup.css. The choice applies immediately and
persists as before.

### Dusky light palette and dialog sync

The light theme's near-white surfaces were too bright for long shifts. The
palette is now a dusky sage family (`--bg #E4E8DA`, panels `#EDEFE3`, inputs
`#F6F7EF`), with `--paper`, `--modal-*` and the analytics surfaces following,
so nothing on screen is stark white any more.

All five admin dialogs — add/delete category, add/edit/delete menu item — were
verified in **both** themes. Fixes found during the pass: the category pickers
inside the paper modals read a page-level variable and went black-on-black
(they now use the modal palette), and the native `<select>` ink needed the
stable `--ink` colour. `Select.css`'s `.modal-content .ui-select` rules now
consume `--modal-*` exclusively.

### Small-screen header — buttons and location/owner breaking out

On phones the gear/⋮ buttons wrapped onto their own rows and the location and
owner line disappeared entirely. Two legacy <=600px rules were responsible:
`header.header .header-info { display:none !important }` and
`header.header .header-top-row { flex-wrap:wrap !important }` (higher
specificity than the newer override). Both were removed/re-pointed, and one
late block now guarantees a single non-wrapping header row — gear left, brand
centred and clamped, actions right — with location and owner shown compactly
underneath, in both themes. The login screen's absolute "App" button, which
collided with the brand text at 360px, now sits in the header flow below it.

### 25 Sep 2026 — Black bars in the bill card, missing footers, brand.js restored

A session drop lost `src/brand.js` while three portal files imported it (the
build was broken). It was recreated from the literals still in the code, and
the remaining duplicated strings — header location/owner, login credit, receipt
fine print — were re-pointed at it.

The "black bar" family of bugs all had one root: dark-theme panels drawn
**inside the paper-white receipt card**. Fixed in `components.css`:

- Server action bar (Open tables / Clear / Send order): `--panel-2` →
  `--paper-2`, and the legacy `.clear` red glow shadow suppressed on the bar.
- Table/Order-type controls band: translucent black strip → `--paper-2` with
  `--ink` labels and paper inputs.

The missing footers had a different root: `body { zoom: 1.08 }` inflated every
`min-height: 100vh` shell to 108 % of the screen, pushing each portal's
`<footer>` just below the fold. Both zoom hacks removed — the fluid type scale
already covers comfortable sizing. Footers now visible on billing, server and
kitchen in both themes (verified on screen).

Follow-up: the billing receipt card also stretched to the container height
and carried a 100 px bottom clearance for the floating "+" button at every
width, leaving a dead band under the thank-you block. The card now hugs its
content (like the server one), and the FAB clearance applies only on stacked
(≤ 900 px) layouts where the FAB actually overlaps the bill — desktop FAB
parks over the menu side.

### 25 Sep 2026 — Dialogs follow the theme; soft status palettes fixed

The admin dialogs (Add/Delete category, Add/Edit/Delete menu item), the print
queue and the print-confirmation box were pinned to paper-white in **both**
themes — an early decision ("receipt-like cards") that read as broken once the
toggle shipped. The `--modal-*` variables now follow the theme: dark olive
card on dark, dusky card on light. A legacy duplicate `.modal-content {
background:#fff }` in index.css (which outranked the themed rule) was
re-pointed as well.

Root cause of the remaining white-on-light chips: every `*-soft` status token
(danger/warn/info/accent) was a light pastel in **both** palettes, so notes and
badges built on them showed light chips with light text in dark mode. They are
now translucent tints + bright text in dark, pastels + deep text in light.
Six invalid `var(--text-strong)fff` / `)0d6` tokens left by the earlier
mechanical mapping were also repaired (they silently dropped declarations),
and the login/download buttons moved to the `--accent` pair so their ink
contrast survives the new soft-text values.

Follow-up: on the login screens, Edge's native password-reveal eye painted on
top of the custom Show/Hide button, overlapping them. The native control is
hidden (`::-ms-reveal`/`::-ms-clear`) so the styled button is the only toggle.
One fix in SharedLogin covers all three portals.

Follow-up: on short windows the receipt card's max-height capped the card but
its `overflow: visible` let the thank-you footer paint below the card's rounded
bottom, onto the dark page background. The card now scrolls internally
(screen); print keeps `overflow: visible` so thermal output is unaffected.

Follow-up: the Delete-category checkboxes were stretched into wide green
rectangles — the legacy `.form-group input` rules (width 100 %, glow border,
44 px min-height) target text inputs but also matched checkboxes. Modal
checkboxes/radios now have a fixed 18 px control style with themed
`accent-color`, so only the native tick box appears.

Follow-up: the login "App" button sat under the brand text on narrow screens
(an earlier collision fix had pushed it into the flow). It is pinned to the
right edge at every width again — SharedLogin covers all three portals; the
brand block reserves side padding so wrapped lines never run under the button.

Follow-up: the thank-you / visit-again block is hidden in the on-screen bill
panel and restored only in print, so it appears on the paper receipt alone.

### 26 Sep 2026 — Print layout rebuilt for the 70 mm thermal printer

The saved bill PDF showed the old 65 mm layout printing as a shaded A4-ish
card: background gradients rasterised to grey dither, emoji rasterised to
blurred images, 12 pt table text wasting the narrow roll, and `@page` nested
inside `@media print` (which Chromium ignores). The print sheet now:

- declares a top-level `@page { size: 70mm; margin: 0 }` (the `70mm auto`
  two-value form is rejected by the current Chromium, so the roll height is
  simply unbounded),
- strips every background image, shadow and text shadow, keeping pure
  black-on-white for the monochrome head,
- hides the 😊 emoji (kept on screen via `.footer-emoji` spans),
- sizes the receipt to 70 mm with 3 mm padding and thermal-friendly type
  (10.5 pt body, 9.5 pt table, 13 pt total, centred thank-you block).

### 26 Sep 2026 — Group items in Add menu item

The backend and the size-picker already supported group-priced items
(`is_group` + `group_prices`); only the Add dialog exposed nothing. The Add
menu item modal now opens with a **Single item / Group item (sizes)** tab
pair. Group mode replaces the single price with a sizes-and-prices editor
(label + price rows, add/remove, validation for names, positive prices and
duplicate labels) and posts `is_group=true` with a JSON `group_prices` map.
End-to-end verified: created a solo/duo item, saw it on the menu as
"₹299 – ₹549", and the size picker opened with both tiles. (Test item deleted.)

Follow-up: capping the bill card with internal scrolling clipped the Total and
Print/Clear buttons on short windows. The card now keeps a fixed header + a
flexing item list (the only scrolling part) + a pinned Total/button block; the
server portal gets the same treatment and its duplicate 46 vh item cap and
sticky-bar offset were removed.

### 26 Sep 2026 — Bill register: Hide removed, Manage bill added

The Bill register's per-row Actions column (Hide/Restore/Delete) fought the
theme with translucent-white buttons and its hidden rows loaded into stats.
The Hide feature is gone completely: analytics now loads only active bills,
the `hideBill`/`restoreBill` API wrappers are deleted, and the Actions column
is removed. In its place, a **Manage bill ▾** dropdown beside the pager
arrows lists the page's bills (#no · date · amount) and opens the themed
permanently-delete confirmation. The search box was also re-pointed from the
print-paper token to the themed input palette (it rendered white-on-dark).

Follow-up: deleting a bill swapped the whole analytics page to "Loading
analytics…" because the refresh reused the initial-load path that sets the
loading flag. Row actions now refresh the data quietly behind the visible UI.
Toasts (the shared notice stack) were wired to the actions that had none:
bill deleted (success/error), report downloaded, and bill printed on the
billing screen.

Follow-up: the Table No / Bill No row sat on the paper-white receipt in the
dark theme's white text — invisible in dark mode (it was fine in light). It
now uses the stable receipt ink.

### 26 Sep 2026 — Floor plan (Tables overview)

The server portal gained a **Tables** header icon (round-table glyph) next to
the other header actions, opening a floor-plan modal of all ten tables. Each
tile shows its live state — Vacant (dashed), Order taken, Preparing, Ready,
Served — with item count, running total and open time for occupied tables,
plus a colour-coded legend. It polls every 10 s so kitchen progress appears
without reloading, and clicking an occupied table loads its ticket back into
the cart (same behaviour as the old list, which it replaces). Verified on
dark: T4/T7 showed Served, clicking T4 loaded Table 4 / ₹149 into the bill.

### 26 Sep 2026 — Dialog overflow: action rows were falling off-screen

`menu-modal-content` and `edit-menu-modal-content` carried
`overflow-y: visible !important`, disabling the modal card's own scrolling —
so tall dialogs (Edit item, with its sidebar and image preview) extended past
the 92 vh card and pushed the Cancel/Save row below the viewport. The card is
now a fixed-height flex column: the form scrolls, and the action row is
pinned (bordered) at the bottom — sticky for dialogs whose form isn't wrapped
in `.modal-body`. The `overflow-y: visible` overrides are gone; the Select
component already portals its dropdown with `position: fixed`, so nothing
needed the visible overflow.

### 26 Sep 2026 — Editing group items (two bugs)

Group items could not be edited at all: the Edit dialog forced the single
price field on them, so saving demanded "a price above zero" for an item that
has none. The dialog now follows the item's stored type — group items get the
sizes-and-prices editor pre-filled from `prices` (labelled "(group)" in the
picker), and single items keep the price field; each path validates and
submits its own payload (`group_prices` vs `price`).

Behind it, a server bug broke *every* save: the update route wrote `name`
into `$set` even when unchanged, so renaming nothing still tripped the unique
`name` index (DuplicateKeyError → 500). Itnow writes the name only when it actually changed. Verified end-to-end: trio 719 → 725 through the UI,
persisted, then reverted.

### 26 Sep 2026 — Bulk bill delete from Manage bill

The Manage bill dropdown now offers **Permanently delete bills**, opening a
dialog of every bill in the current period grouped by day. Per-bill ticks,
per-day ticks (toggle a whole date), and Select all; a live "n selected ·
₹total" summary; and one Delete button that removes them all in parallel,
refreshes the register quietly (no loading flash) and reports via toast.
Verified live: ticked 3 bills (day head auto-ticked), then Select all (20),
deleted all 20 at once — register dropped to 0, no reload.

---

## Incidents — data lost during the work

Both were caused by running pre-existing app behaviour against the live
database during testing. Both have been fixed so they cannot recur.

**7 Sep — 91 bills deleted.** Starting the backend ran the app's existing
180-day cleanup and permanently deleted **91 bills dated before 12 Mar 2026**
(377 → 286). *Fix:* retention is report-only unless explicitly enabled.

**8 Sep — 2 bills deleted.** Removing test bills by bill number deleted two
real bills from 12–14 Mar instead, because numbers restart daily and are shared
across days. This exposed the addressing bug above — any admin pressing Delete
in the bill register could have removed the wrong day's bill. *Fix:* bills are
addressed by unique id.

**Recovery:** if MongoDB Atlas backups are enabled on the cluster, a
point-in-time restore to before 7 Sep 2026 recovers all 93 bills.

---

## Findings about the live system

**The shop is running an older copy of the app.** 16 bills (₹14,679) were
rung up on 9 Sep while the development servers were stopped. They use the old
bill format and the legacy `token` counter, so they were written by a different,
older backend — most likely the packaged `billing-portal-app.exe`. Consequences:

- None of the changes in this log are live in the shop yet.
- That older copy still contains the original automatic 180-day deletion.
- The two copies keep separate bill counters. Used on the same day, they will
  hand out duplicate bill numbers.

The `SVFC reference` folder was ruled out: it uses a separate cluster and
database (`svfc_pos`).

---

## Open items

In rough order of importance.

1. **Put the project under Git.** There is no history or rollback; this file is
   the only record.
2. **Deploy this version to the shop** and retire the older backend, so the
   fixes are live and the two bill counters stop colliding.
3. **Recover the 93 lost bills** from an Atlas backup, if one exists.
4. **Decide on the six-month deletion.** It is off. The oldest bill (15 Mar)
   has been past the 180-day line since mid-September, so switching it on
   starts deleting straight away.
5. **Change the default staff passwords** (the simple shared password used by waiters and cooks).
6. **Run a production server** — the Flask development server and `DEBUG=True`
   are the defaults. On Windows, `waitress` is the usual choice.
7. **Tables 4 and 7 from 7 Mar** remain in the waiter's Open tables list; they
   can be closed from there.
8. **Analytics page fetches at most 1,000 bills.** The Excel report is not
   affected, but the on-screen figures would undercount a large range.

---

## How to verify

With the API running (`python app.py`):

```bash
python tests/smoke_test.py
```

74 checks: login and permissions, menu, waiter order, kitchen status,
notifications, print queue, billing, the Excel report and menu editing.

```bash
python tests/retention_test.py
```

8 checks on the six-month rule using a scratch collection, then a read-only
report of what the live setting would do.

```bash
npm run lint && npm run build
```

Both clean as of 10 Sep 2026.
