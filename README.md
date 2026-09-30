# S&H Arabian Mandi — Restaurant POS

Point-of-sale system for S&H Arabian Mandi Restaurant. Three portals share one
Flask API and one MongoDB database (MongoDB Atlas):

| Portal      | Route      | Who signs in     | What it does                                              |
|-------------|------------|------------------|-----------------------------------------------------------|
| **Billing** | `/billing` | admin, cashier   | Takes payment, prints the receipt, records the bill        |
| **Server**  | `/server`  | waiter           | Takes an order at the table and sends it on                |
| **Kitchen** | `/kitchen` | cook             | Live order board: new → preparing → ready → done           |

Admins also get **Analytics** at `/billing/analytics` (sales, charts, bill
register, Excel report) and the menu and category dialogs.

What changed and why, including incidents and open items, is recorded in
[PROJECT_LOG.md](PROJECT_LOG.md).

## What the portals do

### Billing (the counter)

- **Printed bill and token slip** for a 70 mm thermal printer: monospace
  till-roll look, bill number top right, date and time, items, table / payment /
  order type, subtotal, discount and a bold total, then "Thank you! 🙏 Visit
  again 🙏". A second page is the customer's token slip (items only, no
  prices). Each page is sized to its slip before printing
  (`src/utils/printPages.js`), so the printer cuts where the slip ends.
- **Table plan** (the round-table icon): every table with its orders.
  - A **red number on the icon** counts tables whose food has been served but
    whose bill has not been printed.
  - Tap an occupied table: **Load bill** / **Pull bill** puts its orders on the
    bill, **Add items** sends a new order for it, and the small **bin** next to
    an order's status deletes that order (after a confirmation; it also leaves
    the kitchen board and the print queue).
  - Printing a bill closes **exactly the orders it was loaded from** (and
    their print-queue requests). An order the waiter sends for the same table
    while the bill is being printed stays open. A bill typed in by hand for a
    table closes the whole table.
  - If two counters bill the same order at the same moment, it is billed once;
    the other counter is told "This order has already been billed on another
    counter."
- **Print Queue**: orders the waiters sent, ready to load onto a bill.
- **Menu and categories** (gear menu, admin only): add, edit and delete items
  and categories. The dialogs stay open after each change so several can be
  made in a row. Deleting a category also deletes every item in it.

### Analytics (admin)

Sales cards and charts, and the **bill register** with **Manage bill →
Print bill** (reprint any saved bill) and **Permanently delete bills**.

**Excel sales report** — the download button asks for a date range and saves
an `.xlsx` workbook with six sheets: **Summary**, **Daily Sales**, **Payment
Methods**, **Order Types**, **Item Sales** and the full **Bill Register**. It
is a plain ledger: Times New Roman, black only, a border on every cell and a
double rule above each total; A4, "Page n of N" footers, headings repeated on
every printed page. The server builds it (`GET /api/reports/sales.xlsx?from=…&to=…`,
admin only) from every bill in the range.

### Server (waiters) and Kitchen (cooks)

Waiters pick items and a table and send the order. The kitchen board shows
each order as a ticket (new → preparing → ready → handed over); the refresh
button beside the gear reloads it at once.

### Every portal

- **Install app** (right of the login page header): installs *that portal
  only* as its own app with the restaurant logo — see
  [Installing a portal as an app](#installing-a-portal-as-an-app).
- Dark and light theme (gear menu → Theme).

## How an order flows

```
Waiter (Server portal)
      │  taps items, picks a table, hits "Send order"
      ├──────────────► POST /api/active-tables   → the Kitchen board
      └──────────────► POST /api/print-queue     → the Cashier's Print Queue

Cook (Kitchen portal)                    Cashier (Billing portal)
  refreshes /api/active-tables every 8s    loads the order from the Print
  new → preparing → ready → handed over    Queue or the table plan, then Print
                                           → POST /api/bill, table closed
```

Each "Send order" is its own ticket, so a table's second round cooks and
clears on its own; the print request carries the ticket's id, so billing
either one settles both. Ticket status lives in the database, so every screen
shows the same state and a refresh loses nothing.

**Many people at once.** Every portal can be used on its own device at the
same time — or several portals on one device (tabs or installed apps): each
portal keeps its own sign-in, so signing in or out of one never affects the
others. Tested with two waiters, a cook and two counters working together for
a minute (600+ requests, no errors, typical answer about 0.13 s): every order
billed exactly once, none lost, bill numbers unique and in order.

### Who gets told what

The portals run on different devices, so the kitchen tells the others through
the API; the server and billing portals check `/api/notifications` every few
seconds and show notices as cards.

| Cook presses  | Waiter sees                              | Counter sees | Board            |
|---------------|------------------------------------------|--------------|------------------|
| Start cooking | —                                        | —            | moves to Preparing |
| Mark ready    | **Table N · Food ready, hand to waiter** | same         | moves to Ready   |
| Handed over   | **Table N · Served, ready to bill**      | same         | ticket leaves the board |

Each person dismisses their own copy. Notices older than 30 minutes are not
shown, and the database deletes them after 6 hours.

## Sign-in and security

- **Passwords are kept only in the database**, scrambled with bcrypt — never in
  the code, this README or `.env`. At sign-in the account is fetched from the
  database and the typed password is checked against that stored copy. Set or
  reset a password with:

  ```bash
  python -m server.passwords set casher1@shamr.com
  ```

  It prompts for the password (nothing is shown). Several emails can be given
  at once, `--role cook` creates a missing account, and
  `python -m server.passwords list` shows every account and whether it has a
  password (never the password itself).

- **Debug mode is off by default.** Flask's debug mode would let anyone who can
  reach the server run code on it; turn it on (`DEBUG=true`) only on a
  developer's own computer.

- **Roles** are checked on every API call: waiters cannot bill or delete,
  cooks only move tickets, only admins manage the menu and bills.

- **One sign-in per portal.** The browser stores each portal's sign-in
  separately (`session:billing:…`, `session:server:…`, `session:kitchen:…`),
  so Billing, Server and Kitchen can all be signed in on one device at once.

### Staff accounts

| Role    | Email                |
|---------|----------------------|
| admin   | admin@shamr.com      |
| cashier | casher1@shamr.com    |
| waiter  | waiter1–3@shamr.com  |
| cook    | cook1–2@shamr.com    |

The accounts are created on startup if missing (with no password until one is
set with the command above). There is no limit on wrong password tries, so
**use stronger passwords before the app is on the internet.**

## Six-month bill deletion

Bills older than `BILL_RETENTION_DAYS` (180) are deleted automatically when
`BILL_RETENTION_ENABLED=true`. **It is switched on in this installation**
(since 30 Sep 2026): the API deletes expired bills when it starts and then
every 6 hours while it runs. The startup log says what happened:

```
Retention: deleted 20 bill(s) created before 03 Apr 2026
Retention: scheduled every 6 hours
```

Deleted bills cannot be recovered and disappear from the analytics page and
the Excel report, so **download each month's Excel report and keep it**
(sales records usually have to be kept for several years — check with the
accountant). The bills removed when it was switched on are saved in
`backups/`. Without the setting, every pass is a dry run that only reports how
many bills would go. `tests/retention_test.py` checks the rule on a throwaway
collection.

## Running it on one computer

Two processes: the API and the web app.

```bash
python app.py
```

```bash
npm install && npm run dev
```

The API listens on `http://localhost:5000`, the web app on
`http://localhost:5173`; open `http://localhost:5173/billing/login`. The web
app forwards `/api` and `/uploads` to the API, so the pages always talk to the
address they were loaded from.

To keep them running in the background with logs:

```bash
nohup python app.py > logs/api.log 2>&1 &
nohup npx vite > logs/web.log 2>&1 &
```

They do not start by themselves after the computer restarts. The development
web server only accepts connections from this computer; for phones and other
devices, deploy it (next section).

### Configuration

Backend settings come from `.env` in this directory (see `.env.example`):

| Variable                     | Default                | Notes                                                              |
|------------------------------|------------------------|--------------------------------------------------------------------|
| `MONGO_URI`                  | *(required)*           | MongoDB connection string                                          |
| `MONGO_DB_NAME`              | `sharabian_mandi_pos`  |                                                                    |
| `JWT_SECRET_KEY`             | *(random per restart)* | **Set this.** Without it every restart signs all staff out.        |
| `JWT_EXPIRY_DAYS`            | `30`                   | How long a sign-in lasts                                           |
| `PORT` / `HOST`              | `5000` / `0.0.0.0`     |                                                                    |
| `DEBUG`                      | `False`                | `true` only on a developer's computer, never on the internet       |
| `CORS_ORIGINS`               | `*`                    | Which web addresses may call the API — see [Deploying](#deploying-vercel) |
| `TZ_OFFSET_MINUTES`          | `330`                  | IST. Drives "today" and the nightly bill-number reset              |
| `BILL_RETENTION_DAYS`        | `180`                  | How old a bill must be to count as expired                         |
| `BILL_RETENTION_ENABLED`     | `False`                | `true` here — see [Six-month bill deletion](#six-month-bill-deletion) |
| `MAX_UPLOAD_MB`              | `8`                    | Menu image upload size limit                                       |

The front end reads two settings at build time: `VITE_API_URL`, the API's
address (leave it empty when the pages and the API share one address), and
`SITE_URL`, the pages' own address for link previews (not needed on Vercel,
which knows its address; set it for a custom domain).

## Deploying (Vercel)

To use the portals on devices that are not on the same network, both parts
must be on the internet with **https**.

**1. The pages on Vercel.** Import this folder as a Vercel project. `vercel.json`
already sets the build (`npm run build` → `dist`) and sends every page address
(`/billing/login`, `/kitchen`, …) to the app, so reloading a page works.

**2. The API.** It is a normal Python (Flask) server and needs somewhere to run:

- *On another host* (a service that runs Python servers, or a small cloud
  server): set `VITE_API_URL` in the Vercel project to the API's https address
  and redeploy, and set `CORS_ORIGINS` on the API to the Vercel address, e.g.
  `CORS_ORIGINS=https://sh-mandi.vercel.app`.
- *At the same address as the pages* (for example behind the same domain):
  leave `VITE_API_URL` empty; `CORS_ORIGINS` then does not matter.

`CORS_ORIGINS` in plain words: it is the list of websites allowed to use the
API from a browser. With `*` any website could try; with your Vercel address
only your own pages can.

**3. On the API host**, set the same variables as `.env` (at least `MONGO_URI`,
`JWT_SECRET_KEY`, `BILL_RETENTION_ENABLED`, `CORS_ORIGINS`) and keep `DEBUG`
off. In MongoDB Atlas → *Network Access*, allow the API host's address.

**Before going live:** change the staff passwords from the simple test ones,
and stop using the older billing program (it writes to the same database with
its own bill numbers). Over https the **Install app** button installs each
portal as a real app on phones too. Menu pictures are web links, so nothing
has to be stored on the API host.

### Installing a portal as an app

Each portal's login page has an **Install app** button at the right of the
header. In Chrome or Edge it installs *that portal only* as an app — its own
window, name (S&H Billing / S&H Server / S&H Kitchen) and the restaurant logo,
opening on that portal and staying inside it. Browsers allow this over https
(or on the computer running the app). Elsewhere the button downloads a desktop
shortcut to that portal (computers) or explains the browser's "Add to Home
screen" step (phones and tablets, which then show the logo on the home screen).
Once a portal is installed on a device its button hides; it reappears only if
the browser offers installation again (the app was removed).

The pieces: `public/manifests/<portal>.webmanifest`, `public/icons/`,
`public/sw.js` (shows a clear page when the server is unreachable; caches
nothing) and `src/utils/install.js`. The icons are made from
`brand/logo-original.jpg` by `python scripts/make_app_icons.py` — re-run it
after replacing the logo with a sharper file.

### Search engines and link previews

The portals are staff tools, so they are **kept out of Google and other search
engines** on purpose: every page says `noindex, nofollow`, and
`public/robots.txt` keeps crawlers off the API. A customer searching for the
restaurant should not land on a staff login page. (A public page for customers
— menu, address, phone numbers — would be a separate site that *is* indexed.)

What is in place:

- **Titles per page** — the browser tab, bookmarks and history say which page
  it is ("Kitchen Portal · S&H Arabian Mandi Restaurant", "Billing Portal
  login · …"), set by `src/hooks/usePageTitle.js`.
- **Description and link previews** — `index.html` has the description and the
  Open Graph / X card tags, so a link sent on WhatsApp shows the name,
  description and logo. The logo and page address need full https addresses;
  `vite.config.js` adds them at build time (from Vercel, or `SITE_URL`).
- **Icons** — `public/favicon.ico` and the PNG icons, all from the logo.
- **Clean structure** — one `<h1>` per page (the restaurant name), a `<main>`
  area on every page, `lang="en"`, and the header and footer marked as such.
- **Speed** — built files carry a content hash, so `vercel.json` lets browsers
  keep them for a year; a new deploy changes the names.

## Backups and logs

- `backups/` — copies of database records removed during cleanups and by the
  six-month deletion (Excel and raw JSON). Not in version control.
- `logs/` — `api.log` and `web.log` when the servers run in the background.
  Deleted orders, deleted bills and six-month deletions are written here as
  warnings.

## Layout

```
app.py                  entrypoint: builds the app and runs it
vercel.json             Vercel build settings and page-address rewrites
server/
  __init__.py           create_app(): config, CORS, JWT, blueprints, startup warnings
  config.py             every setting, read from .env
  db.py                 Mongo connection, collection handles, indexes
  api.py                response envelope + @roles_required access control
  security.py           password hashing (bcrypt)
  passwords.py          CLI: set staff passwords in the database
  validation.py         bill/cart validation; totals are recomputed server-side
  timeutil.py           UTC storage, local (IST) "today"
  bootstrap.py          indexes, staff accounts, default categories
  retention.py          six-month bill deletion
  reports.py            builds the Excel workbook
  notifications.py      recording and reading kitchen notices
  routes/
    auth.py             login (checked against the database), verify, logout
    bills.py            bill numbering, saving, the register
    menu.py             menu items and categories
    orders.py           tickets: kitchen board, table plan, delete order, close table
    print_queue.py      waiter → cashier print requests
    reports.py          the Excel sales report download
    notifications.py    delivery of kitchen notices to the other portals
    system.py           health check, uploaded images

src/
  main.jsx, App.jsx     start-up and the routes (/billing, /server, /kitchen)
  api/                  client.js (axios + auth interceptor), session.js (one sign-in per portal), index.js
  config/
    brand.js            restaurant name, tagline, address, contact, footer credit
    portals.js          the three portals: names, paths, login accounts
    constants.js        table count, payment methods, order types
  styles/
    index.css           colours (dark/light), layout, bill and print styles
    components.css      shared component styles
    theme.js            dark/light theme: storage and the <html> class
    typography.js       bundled Inter Variable font + type conventions
  hooks/                useMenu, useCart, usePolling, usePageTitle
  components/
    auth/               SharedLogin (the three login pages), RequireAuth (route guard)
    layout/             SharedHeader (gear, refresh, table plan with badge, analytics),
                        SettingsDropdown, Tagline, InstallAppButton
    notifications/      the one place messages appear, local and from the API
    ui/                 Select (no native <select> anywhere), MenuPopup, CustomDatePicker,
                        icons (one set, one grid, one stroke weight)
    menu/               MenuBrowser: category tabs and item cards
    modals/             table plan, print queue, size picker, custom item
    receipt/            ReprintBill: prints a saved bill from the register
    settings/           the admin's category and menu dialogs
  pages/
    billing/            BillingApp, BillingDashboard, analytics/ (dashboard, charts, register)
    server/             ServerApp, ServerDashboard
    kitchen/            KitchenApp, KitchenDashboard
  utils/
    format.js           currency and date formatting
    download.js         saves a Blob as a file
    zoom.js             converts coordinates around the page's `body { zoom }`
    printPages.js       sizes each printed page to its slip (70 mm roll)
    install.js          "Install app": the portal as its own app, or a shortcut
    sizes.js            group-item sizes in serving order (solo, duo, …)

index.html              the page shell: title, description, link-preview tags, theme script
public/                 app icons, favicon, robots.txt, per-portal manifests, service worker
brand/logo-original.jpg the restaurant logo the app icons are made from
scripts/make_app_icons.py  builds public/icons/ from that logo
backups/, logs/         see "Backups and logs" (not in version control)

tests/smoke_test.py     end-to-end API test (run it against a test database)
tests/retention_test.py six-month deletion, on a throwaway collection
```

### Conventions

- **Components never build URLs.** Every call goes through `src/api/index.js`,
  so the front end and back end cannot drift apart.
- **The server owns the money.** Subtotals, discounts and totals are recomputed
  from the items on save; the client's numbers are display only.
- **Bills are addressed by `id`, never by bill number.** The number restarts at
  1 every morning, so many bills share one.
- **Times are stored in UTC** and converted for display; "today" means the local
  restaurant day.
- **No native `alert()`, `confirm()` or `<select>`.** Messages go through
  `useNotify()` and dropdowns through `Select` / `MenuPopup`, so nothing the
  staff sees is drawn by the operating system.
- **Names are written once.** Restaurant identity is in `src/config/brand.js`, the
  portals (names, paths, login accounts) in `src/config/portals.js`. (The Excel report
  carries its own copy of the name in `server/reports.py`.)
- **Nothing secret in the code.** Passwords live only in the database; keys
  and connection strings only in `.env` / the host's settings.
- **Colours come from CSS variables, not literals.** `src/styles/index.css` defines the
  dark palette on `:root` and a light palette on `html[data-theme='light']`.
- **Popups are portalled and positioned in script.** The desktop layout applies
  `body { zoom: 1.08 }`, so anything positioned by hand goes through
  `utils/zoom.js` — see the note there.

### Dark and light theme

The gear menu has a **Theme** group with **Light** and **Dark**, on every
portal. The choice is remembered in `localStorage` (`theme`) and applied by a
small script in `index.html` *before* React loads, so the correct palette is
there from the first paint. With nothing chosen, the app follows the operating
system's setting. Receipts and print output look the same in both themes.

### Typography and responsiveness

The UI face is **Inter Variable**, bundled from npm (`@fontsource-variable/inter`)
so nothing is fetched from a CDN. Money and counts use `tabular-nums` so totals
do not jitter. Printed receipts use a monospace till-roll style; the Excel
report uses Times New Roman.

The layout is fluid from 320px phones to 1920px+ counters. The billing and
server screens put menu and bill side by side above 900px and stack below it;
the category bar spreads its buttons over even, full-width rows; the kitchen
board drops from three columns to two to one.

## Testing

The smoke test walks the real service flow — login, permissions, menu, waiter
order, kitchen status, notifications, print queue, billing, the Excel report,
menu editing — and cleans up after itself. It saves real bills, which uses up
bill numbers, so **run it against a separate test database, never the shop's**:

1. Start a second API on a test database, e.g.
   `MONGO_DB_NAME=sharabian_mandi_pos_smoketest PORT=5055 python app.py`
   (copy `custom_items` and `categories` into it so the menu checks have data).
2. Set passwords there for admin, waiter1 and cook1 with
   `python -m server.passwords set …` (same `MONGO_DB_NAME`).
3. Run the test against it:

```bash
SMOKE_BASE_URL=http://localhost:5055 SMOKE_ADMIN_PASSWORD=… SMOKE_STAFF_PASSWORD=… python tests/smoke_test.py
```

Drop the test database afterwards.

```bash
python tests/retention_test.py
```

Checks the six-month deletion rule, including the exact cutoff, on a scratch
collection, then reports (read-only) what the live setting would do.

Front end:

```bash
npm run lint && npm run build
```
