import { useCallback, useEffect, useState } from 'react';
import { fetchActiveTables, setKitchenStatus } from '../../api';
import { errorMessage } from '../../api/client';
import { useNotify } from '../../components/notifications/notification-context';
import usePolling from '../../hooks/usePolling';
import { clockTime, minutesSince, rupees, shortAge } from '../../utils/format';
import './kitchen.css';

/** How often the board picks up new orders from the server portal. */
const POLL_MS = 8000;

/** A ticket older than this is highlighted so it is visible across the kitchen. */
const LATE_AFTER_MIN = 20;

/**
 * The life of a ticket. `served` is the end: the ticket leaves the board and
 * the floor is told the food has gone out. Every "Send order" makes its own
 * ticket, so a table's biryani and its mandi reorder cook separately.
 */
const FLOW = {
  new: { next: 'preparing', action: 'Start cooking', label: 'Order taken' },
  preparing: { next: 'ready', action: 'Mark ready', label: 'Preparing' },
  ready: { next: 'served', action: 'Handed to waiter', label: 'Ready to serve' },
};

const COLUMNS = ['new', 'preparing', 'ready'];

function Ticket({ table, onAdvance, busy }) {
  const status = FLOW[table.kitchenStatus] ? table.kitchenStatus : 'new';
  const step = FLOW[status];
  const age = minutesSince(table.createdAt);
  const ordinal = table.orderNo > 1 ? ` · ${table.orderNo}${table.orderNo === 2 ? 'nd' : table.orderNo === 3 ? 'rd' : 'th'} order` : '';

  return (
    <article className={`ticket ticket-${status}`}>
      <header className="ticket-head">
        <div>
          <h3 className="ticket-table">Table {table.tableNumber || '—'}</h3>
          <p className="ticket-meta">
            {table.orderType || 'Dine-in'}
            {table.waiter ? ` · ${table.waiter}` : ''}
            {ordinal}
          </p>
        </div>
        <div className="ticket-timing">
          <span className={`ticket-age ${age >= LATE_AFTER_MIN ? 'is-late' : ''}`}>
            {shortAge(age)}
          </span>
          <span className="ticket-clock">{clockTime(table.createdAt)}</span>
        </div>
      </header>

      <ul className="ticket-items">
        {(table.items || []).map((item) => (
          <li key={item.name}>
            <span className="ticket-qty">{item.qty}×</span>
            <span className="ticket-name">{item.name}</span>
          </li>
        ))}
      </ul>

      {status === 'ready' && (
        <p className="ticket-handover">
          {table.orderType === 'Dine-in'
            ? 'Food ready — hand to waiter'
            : `Food ready — ${table.orderType} pickup`}
        </p>
      )}

      <footer className="ticket-foot">
        <span className="ticket-status">{step.label}</span>
        <button
          type="button"
          className="ticket-action"
          onClick={() => onAdvance(table)}
          disabled={busy}
        >
          {busy ? '…' : step.action}
        </button>
      </footer>
    </article>
  );
}

export default function KitchenDashboard() {
  const notify = useNotify();
  const [pending, setPending] = useState(null);

  const { data, loading, error, refresh, setData } = usePolling(
    () => fetchActiveTables({ board: true }),
    POLL_MS,
  );
  const tables = data || [];

  // Manual refresh from the header button, on top of the regular poll.
  useEffect(() => {
    const handler = async () => {
      try {
        await refresh({ silent: true });
      } finally {
        window.dispatchEvent(new Event('kitchen:refreshed'));
      }
    };
    window.addEventListener('kitchen:refresh', handler);
    return () => window.removeEventListener('kitchen:refresh', handler);
  }, [refresh]);

  // Tickets arrive sorted by creation time, so counting repeats per table
  // numbers each order: a table's biryani is order 1, its mandi reorder order 2.
  const seen = new Map();
  const numbered = tables.map((t) => {
    const key = String(t.tableNumber);
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    return { ...t, orderNo: n };
  });

  const advance = useCallback(
    async (table) => {
      const status = FLOW[table.kitchenStatus] ? table.kitchenStatus : 'new';
      const next = FLOW[status].next;

      setPending(table.id);

      // Move the card straight away; the cook should not wait on a round trip
      // in the middle of service. A failure puts it back.
      setData((current) => (current || []).flatMap((t) => {
        if (t.id !== table.id) return [t];
        return next === 'served' ? [] : [{ ...t, kitchenStatus: next }];
      }));

      try {
        await setKitchenStatus(table.id, next);
        if (next === 'ready') {
          // The floor needs to know WHY to walk over: a waiter for dine-in,
          // the counter for a takeaway.
          notify(
            table.orderType === 'Dine-in'
              ? `Table ${table.tableNumber} food ready — hand it to the waiter`
              : `Table ${table.tableNumber} food ready for ${table.orderType} pickup`,
            'success',
          );
        } else if (next === 'served') {
          notify(`Table ${table.tableNumber} handed over — ready to bill`, 'served');
        }
      } catch (err) {
        notify(errorMessage(err, 'Could not update the order'), 'error');
        refresh({ silent: true });
      } finally {
        setPending(null);
      }
    },
    [notify, refresh, setData],
  );

  if (loading && !data) {
    return (
      <main className="container kitchen-board">
        <p className="kitchen-note">Loading orders…</p>
      </main>
    );
  }

  const onTheFloor = tables.reduce((sum, t) => sum + (t.total || 0), 0);

  return (
    <main className="container kitchen-board">
      {error && (
        <p className="kitchen-error">
          Cannot reach the server — showing the last known orders. <span>{error}</span>
        </p>
      )}

      {tables.length === 0 ? (
        <p className="kitchen-note">No active orders. New tables appear here automatically.</p>
      ) : (
        <div className="kitchen-columns">
          {COLUMNS.map((status) => {
            const column = numbered.filter((t) => (t.kitchenStatus || 'new') === status);
            return (
              <section key={status} className={`kitchen-column column-${status}`}>
                <h2 className="column-title">
                  {FLOW[status].label} <span className="column-count">{column.length}</span>
                </h2>
                {column.length === 0 ? (
                  <p className="column-empty">Nothing here</p>
                ) : (
                  column.map((table) => (
                    <Ticket
                      key={table.id}
                      table={table}
                      onAdvance={advance}
                      busy={pending === table.id}
                    />
                  ))
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="kitchen-footnote">
        Board refreshes every {POLL_MS / 1000} seconds · {tables.length} open ticket
        {tables.length === 1 ? '' : 's'} · {rupees(onTheFloor)} on the floor
      </p>
    </main>
  );
}
