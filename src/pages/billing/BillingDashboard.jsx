import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  closeWholeTable,
  deleteOrder,
  fetchNextBillNumber,
  fetchActiveTables,
  openTable,
  saveBill,
  setKitchenStatus,
} from '../../api';
import { errorMessage } from '../../api/client';
import { getUser } from '../../api/session';
import { useNotify } from '../../components/notifications/notification-context';
import Select from '../../components/ui/Select';
import MenuBrowser from '../../components/menu/MenuBrowser';
import AddCustomItemModal from '../../components/modals/AddCustomItemModal';
import PrintQueueModal from '../../components/modals/PrintQueueModal';
import SizeSelectionModal from '../../components/modals/SizeSelectionModal';
import TablesModal from '../../components/modals/TablesModal';
import usePolling from '../../hooks/usePolling';
import useCart from '../../hooks/useCart';
import useMenu from '../../hooks/useMenu';
import { rupees } from '../../utils/format';
import { RESTAURANT } from '../../config/brand.js';
import { ORDER_TYPES, PAYMENT_METHODS, tableOptions } from '../../config/constants';

const TABLE_OPTIONS = tableOptions('No table');

export default function BillingDashboard() {
  const menu = useMenu();
  const cart = useCart();
  const notify = useNotify();
  const user = useMemo(() => getUser() || {}, []);

  const [tableNo, setTableNo] = useState('');
  const [orderType, setOrderType] = useState('Dine-in');
  const [payment, setPayment] = useState('Cash');
  const [discount, setDiscount] = useState(0);

  const [billNumber, setBillNumber] = useState(null);
  const [printedAt, setPrintedAt] = useState(null);
  const [sizeItem, setSizeItem] = useState(null);
  const [showQueue, setShowQueue] = useState(false);
  const [showTables, setShowTables] = useState(false);
  const [showCustomItem, setShowCustomItem] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // A table picked from the floor plan via "Add items" (or a vacant tap):
  // the next menu items go OUT to the kitchen as a new order instead of onto
  // a bill. Cleared by printing the bill or resetting the panel.
  const [armedTable, setArmedTable] = useState(null);
  // The orders the bill on screen was loaded from (table plan or print
  // queue). Saving it closes exactly these - nothing sent afterwards.
  const [settles, setSettles] = useState({ ticketIds: [], requestIds: [] });

  // Show the number this bill will be given, so the printed slip and the
  // register agree. Previously the receipt always printed "Bill No: 0".
  const refreshBillNumber = useCallback(() => {
    fetchNextBillNumber().then(setBillNumber).catch(() => setBillNumber(null));
  }, []);

  useEffect(() => { refreshBillNumber(); }, [refreshBillNumber]);

  useEffect(() => {
    const openQueue = () => setShowQueue(true);
    const openTables = () => setShowTables(true);
    window.addEventListener('billing:openPrintQueue', openQueue);
    window.addEventListener('billing:openTables', openTables);
    return () => {
      window.removeEventListener('billing:openPrintQueue', openQueue);
      window.removeEventListener('billing:openTables', openTables);
    };
  }, []);

  const discountPercent = Math.min(100, Math.max(0, Number(discount) || 0));
  const discountAmount = Math.round((cart.subtotal * discountPercent) / 100);
  const total = cart.subtotal - discountAmount;
  const canPrint = !cart.isEmpty && total >= 0;

  const selectItem = useCallback((item) => {
    if (item.isGroup) setSizeItem(item);
    else cart.addItem(item.name, item.price || 0);
  }, [cart]);

  const reset = useCallback(() => {
    cart.clear();
    setTableNo('');
    setOrderType('Dine-in');
    setPayment('Cash');
    setDiscount(0);
    setError('');
    setArmedTable(null);
    setSettles({ ticketIds: [], requestIds: [] });
  }, [cart]);

  // Arm a table from the floor plan: menu clicks become a kitchen order for
  // that table. The cart starts empty - anything already on the table is on
  // its own kitchen ticket, and resending it would duplicate the order. An
  // empty order type inherits the table's last one.
  const armTable = useCallback((number, orderType) => {
    const dropped = cart.lines.length;
    setShowTables(false);
    cart.clear();
    setTableNo(String(number));
    if (orderType) setOrderType(ORDER_TYPES.includes(orderType) ? orderType : 'Dine-in');
    setArmedTable(String(number));
    setSettles({ ticketIds: [], requestIds: [] });
    notify(
      dropped > 0
        ? `Table ${number} armed with an empty order — add the NEW items and send`
        : `Table ${number} armed — new menu items go to the kitchen as a fresh order`,
      'info',
    );
  }, [cart, notify]);

  // While a table is armed, the action button sends a kitchen order instead
  // of building a bill - the counter can run a table end to end.
  const sendToKitchen = useCallback(async () => {
    if (cart.isEmpty || !armedTable || saving) return;
    setSaving(true);
    setError('');
    try {
      await openTable({ items: cart.lines, tableNo: armedTable, orderType, payment });
      notify(`Order for table ${armedTable} sent to the kitchen — ${rupees(cart.subtotal)}`, 'success');
      reset();
      refreshBillNumber();
    } catch (err) {
      const message = errorMessage(err, 'Could not send the order');
      setError(message);
      notify(message, 'error');
    } finally {
      setSaving(false);
    }
  }, [armedTable, cart, notify, orderType, payment, refreshBillNumber, reset, saving]);

  const printBill = useCallback(async () => {
    if (!canPrint || saving) return;
    setSaving(true);
    setError('');

    try {
      // Save first: a bill that printed but was never recorded is the one
      // failure mode the cashier cannot recover from at the counter.
      const result = await saveBill({
        items: cart.lines,
        payment,
        orderType,
        tableNo,
        discount: discountPercent,
        ticketIds: settles.ticketIds,
        requestIds: settles.requestIds,
      });

      setBillNumber(result.billNumber);
      setPrintedAt(new Date());
      notify(`Bill #${result.billNumber} saved — ${rupees(result.bill?.total ?? total)}`, 'success');

      // Let React paint the final number before the print dialog snapshots it.
      await new Promise((resolve) => setTimeout(resolve, 60));
      window.print();

      notify(`Bill #${result.billNumber} printed — ${rupees(result.bill?.total ?? total)}`, 'success');

      // A bill for a table settles it, whatever number of orders it ran up and
      // whatever the order type (a waiter can send a takeaway with a table
      // number): every ticket on it closes together. Best-effort: the printed
      // record is what matters, and a failed close must not mask the bill.
      // A bill loaded from the table plan or the print queue was settled by
      // the server when it was saved (just those orders). A bill typed in by
      // hand for a table settles the whole table.
      const loaded = settles.ticketIds.length > 0 || settles.requestIds.length > 0;
      if (tableNo && !loaded) {
        closeWholeTable(tableNo)
          .catch(() => {})
          .finally(() => window.dispatchEvent(new Event('billing:tablesChanged')));
      } else {
        window.dispatchEvent(new Event('billing:tablesChanged'));
      }

      reset();
      refreshBillNumber();
    } catch (err) {
      const message = errorMessage(err, 'Could not save the bill');
      setError(message);
      notify(message, 'error');
    } finally {
      setSaving(false);
    }
  }, [canPrint, cart, discountPercent, notify, orderType, payment, refreshBillNumber, reset, saving, settles, tableNo, total]);

  // Tap an occupied table on the floor plan and its ticket becomes the bill —
  // the same pickup flow as the print queue, but per table.
  const pickTable = useCallback((table) => {
    cart.replace(table.items || []);
    setSettles({ ticketIds: (table.tickets || []).map((t) => t.id), requestIds: [] });
    setTableNo(String(table.tableNumber || ''));
    setOrderType(ORDER_TYPES.includes(table.orderType) ? table.orderType : 'Dine-in');
    setDiscount(0);
    setArmedTable(null);
    setShowTables(false);
    // Pulling the bill means the food has gone out: every open ticket on the
    // table is handed over at once, so the kitchen board drops it on its next
    // poll instead of waiting for a cook to tap "Handed to waiter".
    const handedOver = (table.tickets || [])
      .filter((ticket) => (ticket.kitchenStatus || 'new') !== 'served')
      .map((ticket) => setKitchenStatus(ticket.id, 'served'));
    Promise.allSettled(handedOver)
      .then(() => window.dispatchEvent(new Event('billing:tablesChanged')));
    notify(`Table ${table.tableNumber} loaded — ${rupees(table.total || 0)} running`, 'info');
  }, [cart, notify]);

  const stamp = printedAt || new Date();

  return (
    <main className="container billing-layout">
      <MenuBrowser
        items={menu.items}
        categories={menu.categories}
        activeCategory={menu.activeCategory}
        onCategoryChange={menu.setActiveCategory}
        onSelect={selectItem}
        loading={menu.loading}
        error={menu.error}
      />

      <div className="bill">
        <div className="cut-line" />

        <div className="bill-header">
          <div className="bill-header-row">
            <div className="bill-number">
              Table No: <span className="bill-no-display">{tableNo || 'X'}</span>
            </div>
            <div className="bill-number">
              Bill No: <span className="bill-no-display">{billNumber ?? '—'}</span>
            </div>
          </div>
          <b>{RESTAURANT.name}</b><br />
          <span className="bill-subtitle">{RESTAURANT.tagline}</span><br />
          <span className="bill-fineprint">Contact No: {RESTAURANT.phones.join(', ')}</span><br />
          <div className="datetime">
            <span>Date: {stamp.toLocaleDateString('en-IN')}</span>
            <span>Time: {stamp.toLocaleTimeString('en-IN')}</span>
          </div>
        </div>

        <div className="bill-items">
          <table id="billTable">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Item</th>
                <th>Qty</th>
                <th>Price</th>
                <th aria-label="Remove" className="no-print" />
              </tr>
            </thead>
            <tbody>
              {cart.isEmpty ? (
                <tr><td colSpan="4" className="empty-bill">No items added yet</td></tr>
              ) : (
                cart.entries.map(([name, item]) => (
                  <tr key={name}>
                    <td style={{ textAlign: 'left', fontWeight: 'bold' }}>{name}</td>
                    <td>
                      <div className="qty-controls no-print">
                        <button type="button" className="qty-btn" onClick={() => cart.decrease(name)}>&minus;</button>
                        <span className="qty-display">{item.qty}</span>
                        <button type="button" className="qty-btn" onClick={() => cart.increase(name)}>+</button>
                      </div>
                      <span className="qty-print">{item.qty}</span>
                    </td>
                    <td style={{ fontWeight: 'bold' }}>{rupees(item.price * item.qty)}</td>
                    <td className="remove-cell no-print">
                      <button type="button" className="remove-btn" onClick={() => cart.remove(name)}>&#10006;</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bill-controls no-print">
          <div className="bill-field">
            <label htmlFor="billing-table">Table</label>
            <Select id="billing-table" value={tableNo} onChange={setTableNo} options={TABLE_OPTIONS} />
          </div>

          <div className="bill-field">
            <label htmlFor="billing-payment">Payment</label>
            <Select id="billing-payment" value={payment} onChange={setPayment} options={PAYMENT_METHODS} />
          </div>

          <div className="bill-field">
            <label htmlFor="billing-order-type">Order type</label>
            <Select id="billing-order-type" value={orderType} onChange={setOrderType} options={ORDER_TYPES} />
          </div>

          <div className="bill-field">
            <label htmlFor="billing-discount">Discount %</label>
            <input
              id="billing-discount"
              type="number"
              min="0"
              max="100"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="discount-input"
            />
          </div>
        </div>

        {/* Table, payment and order type print under the item list, exactly
            where the reference slip puts them; on screen the pickers above
            already show them. */}
        <div className="bill-print-meta">
          <div className="print-meta-line"><span>Table No.</span><span>{tableNo || 'X'}</span></div>
          <div className="print-meta-line"><span>Payment Method:</span><span>{payment}</span></div>
          <div className="print-meta-line"><span>Order Type:</span><span>{orderType}</span></div>
        </div>

        <div className="total-section">
          <div className="total-line">
            <span>Subtotal:</span><span>{rupees(cart.subtotal)}</span>
          </div>
          {discountPercent > 0 && (
            <div className="total-line total-line-discount">
              <span>Discount ({discountPercent}%):</span><span>− {rupees(discountAmount)}</span>
            </div>
          )}
          <div className="total"><span>Total:</span>{' '}<span>{rupees(total)}</span></div>
        </div>

        {error && <p className="bill-error no-print">{error}</p>}

        <div className="actions no-print">
          {armedTable ? (
            <button type="button" className="print" onClick={sendToKitchen} disabled={!canPrint || saving}>
              {saving ? 'Sending…' : `Send to kitchen — Table ${armedTable}`}
            </button>
          ) : (
            <button type="button" className="print" onClick={printBill} disabled={!canPrint || saving}>
              {saving ? 'Saving…' : 'Print'}
            </button>
          )}
          <button type="button" className="clear" onClick={reset} disabled={cart.isEmpty}>
            Clear
          </button>
        </div>

        <div className="footer">
          <div className="footer-thanks">Thank you!</div>
          <div className="footer-visit">🙏 Visit again 🙏</div>
        </div>

        <div className="cut-line thermal-cut" />
      </div>

      {/* The customer's copy: a plain token slip that prints on its own page
          — token number instead of bill number, one line per item, no totals. */}
      <div className="customer-receipt" aria-hidden="true">
        <div className="bill-header">
          <div className="bill-header-row">
            <div className="bill-number">
              Token No: <span className="bill-no-display">{billNumber ?? '—'}</span>
            </div>
          </div>
          <b>{RESTAURANT.name}</b><br />
          <span className="bill-subtitle">{RESTAURANT.tagline}</span><br />
          <span className="bill-fineprint">Contact No: {RESTAURANT.phones.join(', ')}</span><br />
          <div className="datetime">
            <span>Date: {stamp.toLocaleDateString('en-IN')}</span>
            <span>Time: {stamp.toLocaleTimeString('en-IN')}</span>
          </div>
        </div>
        <div className="customer-items">
          {cart.entries.map(([name, item]) => (
            <div key={name} className="item">{item.qty} x {name}</div>
          ))}
        </div>
        <div className="footer">
          <div className="footer-thanks">Thank you!</div>
          <div className="footer-visit">🙏 Visit again 🙏</div>
        </div>
      </div>

      {sizeItem && (
        <SizeSelectionModal
          item={sizeItem}
          onClose={() => setSizeItem(null)}
          onSelect={(name, price) => {
            cart.addItem(name, price);
            setSizeItem(null);
          }}
        />
      )}

      {showQueue && (
        <PrintQueueModal
          isAdmin={user.role === 'admin'}
          onClose={() => setShowQueue(false)}
          onLoad={(request) => {
            const bill = request.billData || {};
            cart.replace(bill.items || []);
            setSettles({ ticketIds: request.ticketId ? [request.ticketId] : [], requestIds: [request._id] });
            setTableNo(bill.tableNo || '');
            setOrderType(ORDER_TYPES.includes(bill.orderType) ? bill.orderType : 'Dine-in');
            setShowQueue(false);
            notify(`Loaded ${request.createdBy}'s order for table ${bill.tableNo || '—'}`, 'info');
          }}
        />
      )}

      {showTables && (
        <BillingTablesPoller
          onClose={() => setShowTables(false)}
          onPick={pickTable}
          onArm={armTable}
        />
      )}

      {showCustomItem && (
        <AddCustomItemModal
          onClose={() => setShowCustomItem(false)}
          onAdded={(name, price) => {
            cart.addItem(name, price);
            menu.reload();
          }}
        />
      )}

      <button
        type="button"
        className="add-custom-btn no-print"
        onClick={() => setShowCustomItem(true)}
        title="Add a one-off item"
        aria-label="Add a one-off item"
      >
        +
      </button>
    </main>
  );
}

/** Wraps the floor plan with a live poll of the active tables. */
function BillingTablesPoller({ onClose, onPick, onArm }) {
  const { data, loading, error, refresh } = usePolling(fetchActiveTables, 10000);
  const notify = useNotify();

  const removeOrder = useCallback(async (ticket) => {
    await deleteOrder(ticket.id);
    notify(`Order on table ${ticket.tableNumber} deleted`, 'success');
    refresh({ silent: true });
    window.dispatchEvent(new Event('billing:tablesChanged'));
  }, [notify, refresh]);

  return (
    <TablesModal
      tables={data || []}
      loading={loading}
      error={error}
      onClose={onClose}
      onPick={onPick}
      onArm={onArm}
      onDeleteOrder={removeOrder}
    />
  );
}
