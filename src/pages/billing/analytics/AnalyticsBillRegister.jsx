import { useCallback, useMemo, useState } from 'react';
import { deleteBillPermanently } from '../../../api';
import { errorMessage } from '../../../api/client';
import ReprintBill from '../../../components/receipt/ReprintBill';
import MenuPopup, { MenuItem } from '../../../components/ui/MenuPopup';
import { dateTime, rupees } from '../../../utils/format';

const PAGE_SIZE = 50;

// The local calendar day of a bill. Slicing the ISO string gave the UTC date,
// which files every bill rung up before 5:30 am IST under the previous day.
const dayKey = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso || '').slice(0, 10);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const dayLabel = (key) => {
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? key
    : date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const COLUMNS = [
  { key: 'token', label: 'Bill No' },
  { key: 'createdAt', label: 'Date & time' },
  { key: 'orderType', label: 'Order type' },
  { key: 'itemCount', label: 'Items', align: 'center' },
  { key: 'total', label: 'Amount', align: 'right' },
  { key: 'payment', label: 'Payment' },
];

export default function AnalyticsBillRegister({ bills = [], onRefresh, notify }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ field: 'token', order: 'desc' });
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(() => new Set());
  const [printOpen, setPrintOpen] = useState(false);
  const [reprinting, setReprinting] = useState(null);
  const finishReprint = useCallback(() => setReprinting(null), []);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const decorated = bills.map((bill) => ({
      ...bill,
      itemCount: (bill.items || []).length,
    }));

    const filtered = term
      ? decorated.filter((bill) => [bill.token, bill.orderType, bill.payment]
        .some((field) => String(field ?? '').toLowerCase().includes(term)))
      : decorated;

    return [...filtered].sort((a, b) => {
      const left = sort.field === 'createdAt' ? new Date(a.createdAt).getTime() : a[sort.field];
      const right = sort.field === 'createdAt' ? new Date(b.createdAt).getTime() : b[sort.field];
      const result = typeof left === 'string' ? left.localeCompare(right) : (left || 0) - (right || 0);
      return sort.order === 'asc' ? result : -result;
    });
  }, [bills, search, sort]);

  const isDayChecked = (day) => day.bills.every((bill) => bulkSelected.has(bill.id));

  const toggleBulk = (id) => setBulkSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const deleteBulk = async () => {
    const targets = rows.filter((bill) => bulkSelected.has(bill.id));
    if (targets.length === 0) return;

    setBusyId('__bulk__');
    setError('');
    try {
      const results = await Promise.allSettled(targets.map((bill) => deleteBillPermanently(bill.id)));
      const failed = targets.filter((_, i) => results[i].status === 'rejected');
      const deleted = targets.length - failed.length;
      await onRefresh();
      setBulkOpen(false);
      setBulkSelected(new Set());
      if (failed.length) {
        const message = `Deleted ${deleted}. Failed: ${failed.map((b) => `#${b.token}`).join(', ')}`;
        setError(message);
        notify?.(message, 'error');
      } else {
        notify?.(`Deleted ${deleted} bill${deleted === 1 ? '' : 's'} permanently`, 'success');
      }
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const registerTotal = rows.reduce((sum, bill) => sum + (bill.total || 0), 0);

  const toggleSort = (field) => setSort((prev) => ({
    field,
    order: prev.field === field && prev.order === 'desc' ? 'asc' : 'desc',
  }));

  const run = async (bill, action) => {
    setBusyId(bill.id);
    setError('');
    try {
      await action(bill.id);
      await onRefresh();
      notify?.(`Bill #${bill.token} deleted permanently`, 'success');
    } catch (err) {
      const message = errorMessage(err, 'The change could not be saved');
      setError(message);
      notify?.(message, 'error');
    } finally {
      setBusyId(null);
      setConfirming(null);
    }
  };

  return (
    <div className="report-section">
      <div className="register-header">
        <h3>
          Bill register
          <span className="register-count">
            {rows.length} bill{rows.length === 1 ? '' : 's'} · page {safePage}/{totalPages}
          </span>
        </h3>
        <div className="register-pager">
          {/* The shared popup sits above the page and keeps itself on screen;
              drawn inside the section it ran off the left edge of a phone
              and was clipped by the section's sideways scrolling. */}
          <MenuPopup
            trigger="Manage bill"
            label="Manage bill"
            buttonClassName="toggle-hidden-btn manage-bill-trigger"
          >
            {(close) => (
              <>
                <MenuItem onClick={() => { close(); setPrintOpen(true); }}>Print bill</MenuItem>
                <MenuItem onClick={() => { close(); setBulkOpen(true); }} danger>
                  Permanently delete bills
                </MenuItem>
              </>
            )}
          </MenuPopup>
          <button type="button" className="toggle-hidden-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>◀</button>
          <button type="button" className="toggle-hidden-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>▶</button>
        </div>
      </div>

      <div className="search-panel">
        <input
          type="search"
          className="search-input"
          placeholder="Search by bill number, payment method or order type…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {error && <p className="modal-note modal-note-error">{error}</p>}

      <div className="table-responsive">
        <table className="report-table register-table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.key} className={column.align ? `align-${column.align}` : ''} onClick={() => toggleSort(column.key)}>
                  {column.label}
                  <span className="sort-indicator">
                    {sort.field === column.key ? (sort.order === 'asc' ? ' ▲' : ' ▼') : ''}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={COLUMNS.length} className="no-data">No bills for this period</td></tr>
            )}
            {visible.map((bill) => (
              <tr key={bill.id}>
                <td className="bill-no-cell">{bill.token}</td>
                <td className="register-date">{dateTime(bill.createdAt)}</td>
                <td className="event-cell">{bill.orderType}</td>
                <td className="qty-cell" data-suffix={bill.itemCount === 1 ? ' item' : ' items'}>{bill.itemCount}</td>
                <td className="amount-cell">{rupees(bill.total)}</td>
                <td className="register-payment">{bill.payment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <div className="register-total">Total: {rupees(registerTotal)}</div>
      )}

      {confirming && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirming(null)}>
          <div className="modal-content confirm-modal">
            <h3>Permanently delete bill #{confirming.token}?</h3>
            <p>
              {rupees(confirming.total)} · {dateTime(confirming.createdAt)}
            </p>
            <p className="confirm-detail">
              Bill numbers restart daily, so check the date above — this deletes
              exactly the row you selected.
            </p>
            <p className="confirm-warning">
              This removes the bill from the books for good and cannot be undone.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={() => setConfirming(null)}>Cancel</button>
              <button
                type="button"
                className="btn-delete"
                disabled={busyId === confirming.id}
                onClick={() => run(confirming, deleteBillPermanently)}
              >
                {busyId === confirming.id ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {printOpen && (
        <PrintBillDialog
          bills={rows}
          onClose={() => setPrintOpen(false)}
          onPrint={(bill) => {
            setPrintOpen(false);
            setReprinting(bill);
            notify?.(`Printing bill #${bill.billNumber ?? bill.token}`, 'info');
          }}
        />
      )}

      {reprinting && <ReprintBill bill={reprinting} onDone={finishReprint} />}

      {bulkOpen && (
        <BulkDeleteDialog
          bills={rows}
          selected={bulkSelected}
          onToggle={toggleBulk}
          onSelectAll={() => setBulkSelected(new Set(rows.map((b) => b.id)))}
          onSelectDay={(day) => {
            const all = day.bills;
            const next = new Set(bulkSelected);
            for (const bill of all) {
              if (next.has(bill.id) && isDayChecked(day)) next.delete(bill.id);
              else next.add(bill.id);
            }
            setBulkSelected(next);
          }}
          isDayChecked={isDayChecked}
          busy={busyId !== null}
          onClose={() => { setBulkOpen(false); setBulkSelected(new Set()); }}
          onDelete={deleteBulk}
        />
      )}
    </div>
  );
}

/** Bulk delete: every bill of the current selection grouped by day, with
 *  per-day and select-all ticks for clearing out unwanted bills in one go. */
function BulkDeleteDialog({ bills, selected, onToggle, onSelectAll, onSelectDay, isDayChecked, busy, onClose, onDelete }) {
  const days = useMemo(() => {
    const map = new Map();
    for (const bill of bills) {
      const key = dayKey(bill.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(bill);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, dayBills]) => ({
        key,
        label: dayLabel(key),
        bills: dayBills.sort((a, b) => (b.token || 0) - (a.token || 0)),
      }));
  }, [bills]);

  const allChecked = bills.length > 0 && bills.every((b) => selected.has(b.id));
  const total = bills.filter((b) => selected.has(b.id)).reduce((sum, b) => sum + (b.total || 0), 0);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal-content bulk-delete-modal">
        <div className="modal-header">
          <h2>Permanently delete bills</h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy}>×</button>
        </div>

        <div className="modal-body">
          <p className="confirm-warning">
            Tick every unwanted bill and delete them in one go. Bill numbers
            restart daily — check each date before deleting.
          </p>

          <div className="bulk-toolbar">
            <label className="bulk-select-all">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() => onSelectAll()}
                disabled={busy}
              />
              Select all ({bills.length})
            </label>
            <span className="bulk-summary">
              {selected.size} selected · {rupees(total)}
            </span>
          </div>

          {days.length === 0 && <p className="modal-note">No bills for this period.</p>}

          {days.map((day) => (
            <div key={day.key} className="bulk-day">
              <label className="bulk-day-head">
                <input
                  type="checkbox"
                  checked={isDayChecked(day)}
                  onChange={() => onSelectDay(day)}
                  disabled={busy}
                />
                <strong>{day.label}</strong>
                <span className="bulk-day-count">{day.bills.length} bill{day.bills.length === 1 ? '' : 's'}</span>
              </label>
              <div className="bulk-day-list">
                {day.bills.map((bill) => (
                  <label key={bill.id} className={`bulk-row ${selected.has(bill.id) ? 'checked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selected.has(bill.id)}
                      onChange={() => onToggle(bill.id)}
                      disabled={busy}
                    />
                    <span className="bulk-row-token">#{bill.token}</span>
                    <span className="bulk-row-time">{dateTime(bill.createdAt)}</span>
                    <span className="bulk-row-amount">{rupees(bill.total)}</span>
                    <span className="bulk-row-pay">{bill.payment}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="button"
            className="btn-delete"
            disabled={busy || selected.size === 0}
            onClick={onDelete}
          >
            {busy ? 'Deleting…' : `Delete ${selected.size || ''} permanently`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Pick one bill from the current selection, grouped by day, and print it
 *  again on the receipt printer. */
function PrintBillDialog({ bills, onClose, onPrint }) {
  const [search, setSearch] = useState('');
  const [chosenId, setChosenId] = useState(null);

  const days = useMemo(() => {
    const term = search.trim().toLowerCase();
    const map = new Map();
    for (const bill of bills) {
      if (term && ![bill.billNumber ?? bill.token, bill.total, bill.payment, bill.tableNo]
        .some((field) => String(field ?? '').toLowerCase().includes(term))) continue;
      const key = dayKey(bill.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(bill);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, dayBills]) => ({
        key,
        label: dayLabel(key),
        bills: dayBills.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      }));
  }, [bills, search]);

  const chosen = bills.find((bill) => bill.id === chosenId) || null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content bulk-delete-modal">
        <div className="modal-header">
          <h2>Print bill</h2>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="modal-note">
            Select the bill to print. Bill numbers restart every day, so check
            the date and amount before printing.
          </p>

          <div className="search-panel">
            <input
              type="search"
              className="search-input"
              placeholder="Search by bill number, amount, payment or table…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {days.length === 0 && <p className="modal-note">No bills match.</p>}

          {days.map((day) => (
            <div key={day.key} className="bulk-day">
              <div className="bulk-day-head">
                <strong>{day.label}</strong>
                <span className="bulk-day-count">{day.bills.length} bill{day.bills.length === 1 ? '' : 's'}</span>
              </div>
              <div className="bulk-day-list">
                {day.bills.map((bill) => (
                  <label key={bill.id} className={`bulk-row ${chosenId === bill.id ? 'checked' : ''}`}>
                    <input
                      type="radio"
                      name="print-bill"
                      checked={chosenId === bill.id}
                      onChange={() => setChosenId(bill.id)}
                    />
                    <span className="bulk-row-token">#{bill.billNumber ?? bill.token}</span>
                    <span className="bulk-row-time">{dateTime(bill.createdAt)}</span>
                    <span className="bulk-row-amount">{rupees(bill.total)}</span>
                    <span className="bulk-row-pay">{bill.payment}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-print-bill"
            disabled={!chosen}
            onClick={() => chosen && onPrint(chosen)}
          >
            {chosen
              ? `Print bill #${chosen.billNumber ?? chosen.token} · ${rupees(chosen.total)}`
              : 'Select a bill'}
          </button>
        </div>
      </div>
    </div>
  );
}
