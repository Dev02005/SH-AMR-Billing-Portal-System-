import { useMemo, useState } from 'react';
import { TABLE_COUNT } from '../../config/constants';
import { clockTime, rupees } from '../../utils/format';
import { TrashIcon } from '../ui/icons';
import './Modals.css';

/**
 * The whole floor at a glance: every table, occupied or not.
 *
 * A table can carry several open orders - each "Send order" is its own
 * ticket - so one cell sums them up ("2 orders · 3 items · ₹530") and lists
 * each ticket's status.
 *
 * Two ways to use it:
 * - Billing counter: tapping an occupied table opens a small card with the
 *   table's items and two actions - "Add items" arms the table so new menu
 *   clicks go out as a fresh kitchen order, and "Load bill" puts everything
 *   on the bill for printing. Tapping a vacant table arms it for a new
 *   order straight away. `onArm(tableNumber, orderType?)` handles both.
 * - Server portal (`peekOnly`): tapping just flips the read-only item card -
 *   nothing loads anywhere, and served orders are hidden from the floor.
 */

const STATUS_TONES = {
  new: 'occupied',        // sent to the kitchen, not started
  preparing: 'preparing', // cooking
  ready: 'ready',         // waiting to be served
  served: 'served',       // food delivered, bill not settled yet
};

function statusLabel(status) {
  switch (status) {
    case 'new': return 'Order taken';
    case 'preparing': return 'Preparing';
    case 'ready': return 'Ready to serve';
    case 'served': return 'Served';
    default: return '';
  }
}

function mergeItems(tickets) {
  const merged = new Map();
  for (const ticket of tickets) {
    for (const item of ticket.items || []) {
      const name = String(item.name);
      const current = merged.get(name);
      if (current) {
        current.qty += item.qty || 0;
      } else {
        merged.set(name, { name, price: item.price || 0, qty: item.qty || 0 });
      }
    }
  }
  return [...merged.values()];
}

export default function TablesModal({
  tables = [], loading, error, onClose, onPick, onArm, onDeleteOrder, peekOnly = false,
}) {
  // Which table's card is flipped open, plus how it must be placed:
  // upwards when the cell sits near the bottom of the scrolling plan, and
  // left/right-anchored when a centered card would poke outside the modal
  // (edge columns in wide layouts, where the card is wider than the cell).
  const [peek, setPeek] = useState(null);

  // Pulling a bill mid-service marks the table's open tickets as served and
  // wipes them off the kitchen board, so it is only for emergencies. Confirm
  // before the pull goes through; "Go back" returns to the plan untouched.
  const [confirmPull, setConfirmPull] = useState(null);

  // Deleting an order (the bin beside its status) cannot be undone, so it
  // asks first. { number, ticket } while the question is open.
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const deleteGo = async () => {
    const { ticket } = confirmDelete;
    setDeleting(true);
    setDeleteError('');
    try {
      await onDeleteOrder(ticket);
      setConfirmDelete(null);
    } catch (err) {
      setDeleteError(err?.response?.data?.error || 'Could not delete the order. Try again.');
    } finally {
      setDeleting(false);
    }
  };

  // One cell per table number; its value is every open ticket on that table.
  const byNumber = useMemo(() => {
    const map = new Map();
    for (const table of tables) {
      // The waiter's floor view only shows live orders: once the kitchen has
      // handed an order over (served) it disappears here, so a fresh order on
      // the same table is not haunted by the previous one. The billing counter
      // keeps seeing served tickets - the end-of-meal bill covers them all.
      if (peekOnly && (table.kitchenStatus || 'new') === 'served') continue;
      const key = String(table.tableNumber);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(table);
    }
    return map;
  }, [tables, peekOnly]);

  const occupied = byNumber.size;
  const vacant = TABLE_COUNT - occupied;

  const anyUnserved = (tickets) => tickets.some((t) => (t.kitchenStatus || 'new') !== 'served');

  const pick = (number, items, total, tickets) => {
    if (anyUnserved(tickets)) {
      setConfirmPull({ number, items, total, tickets });
      return;
    }
    setPeek(null);
    onPick({ tableNumber: number, items, total, tickets, orderType: tickets[tickets.length - 1].orderType });
  };

  const confirmPullGo = () => {
    const p = confirmPull;
    setConfirmPull(null);
    setPeek(null);
    onPick({ tableNumber: p.number, items: p.items, total: p.total, tickets: p.tickets, orderType: p.tickets[p.tickets.length - 1].orderType });
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content modal-wide tables-modal">
        <div className="modal-header">
          <h2>Table plan</h2>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <div className="tables-legend">
            <span className="legend-chip legend-vacant">Vacant {vacant}</span>
            <span className="legend-chip legend-occupied">Order taken</span>
            <span className="legend-chip legend-preparing">Preparing</span>
            <span className="legend-chip legend-ready">Ready</span>
            <span className="legend-chip legend-served">Served</span>
          </div>

          {loading && <p className="modal-note">Loading tables…</p>}
          {!loading && error && <p className="modal-note modal-note-error">{error}</p>}

          <div className="tables-grid">
            {Array.from({ length: TABLE_COUNT }, (_, i) => {
              const number = String(i + 1);
              const tickets = byNumber.get(number) || [];
              const open = tickets.length > 0;
              // The busiest state wins the colour: ready beats preparing beats new.
              const rank = { ready: 3, preparing: 2, served: 1, new: 0 };
              const status = open
                ? tickets.reduce((top, t) => ((rank[t.kitchenStatus || 'new'] || 0) > (rank[top] || 0) ? (t.kitchenStatus || 'new') : top), 'new')
                : null;
              const tone = open ? (STATUS_TONES[status] || 'occupied') : 'vacant';
              const items = mergeItems(tickets);
              const total = tickets.reduce((sum, t) => sum + (t.total || 0), 0);
              const peeked = peek?.number === number;
              const flipUp = peek?.flipUp === true;
              const align = peek?.align || 'center';
              // A vacant cell is only tappable where that means something
              // (the counter starting a new order on it).
              const vacantTappable = !peekOnly && Boolean(onArm);

              const activate = (event) => {
                if (open) {
                  // Peek mode (server portal): flip the item card, nothing else.
                  // Billing: open the same card but with actions on it.
                  const el = event?.currentTarget;
                  const scroller = el?.closest('.modal-body');
                  let flipUpNext = false;
                  let alignNext = 'center';
                  if (el && scroller) {
                    const cell = el.getBoundingClientRect();
                    const box = scroller.getBoundingClientRect();
                    // Flip up when a downward card would fall past the plan's
                    // bottom and there is room above instead.
                    flipUpNext = (box.bottom - cell.bottom) < 230 && (cell.top - box.top) > 230;
                    // The card is ~250px wide - wider than a cell in 3-4 column
                    // layouts - so anchor it to the cell edge that has room.
                    if (cell.right - box.left < 260) alignNext = 'left';
                    else if (box.right - cell.left < 260) alignNext = 'right';
                  }
                  setPeek((current) => (current?.number === number ? null : { number, flipUp: flipUpNext, align: alignNext }));
                  return;
                }
                if (vacantTappable) onArm(number);
              };

              const cell = (
                <>
                  <span className="floor-table-number">T{number}</span>
                  {open ? (
                    <>
                      <span className={`floor-table-status floor-status-${tone}`}>
                        {statusLabel(status)}
                      </span>
                      <span className="floor-table-meta">
                        {tickets.length > 1 ? `${tickets.length} orders · ` : ''}
                        {items.length} item{items.length === 1 ? '' : 's'} · {rupees(total)}
                      </span>
                      <span className="floor-table-time">{clockTime(tickets[0].createdAt)}</span>
                      {peeked && (
                        <span className="floor-peek" onClick={(e) => e.stopPropagation()}>
                          {tickets.map((ticket) => (
                            <span className="floor-peek-order" key={ticket.id}>
                              <span className="floor-peek-order-head">
                                <span className={`floor-peek-status floor-status-${STATUS_TONES[ticket.kitchenStatus || 'new'] || 'occupied'}`}>
                                  {statusLabel(ticket.kitchenStatus || 'new')}
                                </span>
                                {!peekOnly && onDeleteOrder && (
                                  <button
                                    type="button"
                                    className="floor-peek-delete"
                                    onClick={() => { setDeleteError(''); setConfirmDelete({ number, ticket }); }}
                                    title="Delete this order"
                                    aria-label={`Delete this order on table ${number}`}
                                  >
                                    <TrashIcon />
                                  </button>
                                )}
                              </span>
                              {(ticket.items || []).map((item) => (
                                <span className="floor-peek-item" key={item.name}>
                                  {item.qty}× {item.name}
                                </span>
                              ))}
                            </span>
                          ))}
                          <span className="floor-peek-total">{rupees(total)}</span>
                          {!peekOnly && onPick && (
                            <span className="floor-peek-actions">
                              <button
                                type="button"
                                className="floor-peek-btn primary"
                                onClick={() => pick(number, items, total, tickets)}
                              >
                                {/* Served table: the meal is over, load the bill.
                                    Anything still cooking: the counter is pulling
                                    a bill mid-flight (guest leaving early, etc). */}
                                {tickets.every((t) => (t.kitchenStatus || 'new') === 'served') ? 'Load bill' : 'Pull bill'}
                              </button>
                              <button
                                type="button"
                                className="floor-peek-btn ghost"
                                onClick={() => onArm(number, tickets[tickets.length - 1].orderType)}
                              >
                                Add items
                              </button>
                            </span>
                          )}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="floor-table-status">Vacant</span>
                  )}
                </>
              );

              const interactive = open || vacantTappable;
              // Occupied cells need no tooltip - the popover itself shows the
              // orders - and a native tooltip just overlaps the popover.
              const title = open ? undefined : (vacantTappable ? 'Start a new order on this table' : undefined);

              // Buttons cannot nest (the action buttons live inside the cell),
              // so interactive cells render as a div with button semantics.
              return interactive ? (
                <div
                  key={number}
                  role="button"
                  tabIndex={0}
                  className={`floor-table floor-table-${tone} ${peeked ? `is-peeked is-align-${align}` : ''} ${peeked && flipUp ? 'is-flipped' : ''} is-tappable`}
                  onClick={activate}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      activate();
                    }
                  }}
                  title={title}
                >
                  {cell}
                </div>
              ) : (
                <button key={number} type="button" className={`floor-table floor-table-${tone}`} disabled title={title}>
                  {cell}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {confirmDelete && (
        <div className="modal-overlay pull-bill-confirm-overlay" onClick={(e) => e.target === e.currentTarget && !deleting && setConfirmDelete(null)}>
          <div className="modal-content confirm-modal pull-bill-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-order-title">
            <h3 id="delete-order-title">Delete this order on table {confirmDelete.number}?</h3>
            <p>
              {(confirmDelete.ticket.items || []).map((item) => `${item.qty}× ${item.name}`).join(', ')}
              {' · '}{rupees(confirmDelete.ticket.total || 0)}
            </p>
            <p className="confirm-warning">
              It is removed from the table plan, the kitchen board and the print queue.
              This cannot be undone.
            </p>
            {deleteError && <p className="modal-note modal-note-error">{deleteError}</p>}
            <div className="modal-actions pull-bill-confirm-actions">
              <button type="button" className="floor-peek-btn danger" onClick={deleteGo} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete order'}
              </button>
              <button type="button" className="floor-peek-btn ghost" onClick={() => setConfirmDelete(null)} disabled={deleting}>
                Go back
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmPull && (
        <div className="modal-overlay pull-bill-confirm-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmPull(null)}>
          <div className="modal-content confirm-modal pull-bill-confirm" role="alertdialog" aria-modal="true" aria-labelledby="pull-bill-confirm-title">
            <h3 id="pull-bill-confirm-title">You are disturbing the work flow</h3>
            <p>
              Table {confirmPull.number} still has {confirmPull.tickets.filter((t) => anyUnserved([t])).length} open ticket
              {confirmPull.tickets.filter((t) => anyUnserved([t])).length === 1 ? '' : 's'} in the kitchen — pulling the
              bill now clears it from the kitchen board mid-cooking.
            </p>
            <p className="confirm-warning">
              Caution — use only in an emergency (guest leaving early, wrong table).
            </p>
            <div className="modal-actions pull-bill-confirm-actions">
              <button
                type="button"
                className="floor-peek-btn primary"
                onClick={confirmPullGo}
              >
                Pull bill
              </button>
              <button
                type="button"
                className="floor-peek-btn ghost"
                onClick={() => setConfirmPull(null)}
              >
                Go back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
