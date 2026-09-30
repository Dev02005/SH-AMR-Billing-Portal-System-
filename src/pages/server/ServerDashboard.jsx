import { useCallback, useEffect, useState } from 'react';
import { fetchActiveTables, openTable, sendToPrintQueue } from '../../api';
import { errorMessage } from '../../api/client';
import usePolling from '../../hooks/usePolling';
import { useNotify } from '../../components/notifications/notification-context';
import Select from '../../components/ui/Select';
import MenuBrowser from '../../components/menu/MenuBrowser';
import SizeSelectionModal from '../../components/modals/SizeSelectionModal';
import TablesModal from '../../components/modals/TablesModal';
import useCart from '../../hooks/useCart';
import useMenu from '../../hooks/useMenu';
import { rupees } from '../../utils/format';
import { RESTAURANT } from '../../config/brand.js';
import { ORDER_TYPES, tableOptions } from '../../config/constants';

const TABLE_OPTIONS = tableOptions('Not assigned');

export default function ServerDashboard() {
  const menu = useMenu();
  const cart = useCart();
  const notify = useNotify();

  const [tableNo, setTableNo] = useState('');
  const [orderType, setOrderType] = useState('Dine-in');
  const [sizeItem, setSizeItem] = useState(null);
  const [showTables, setShowTables] = useState(false);

  // The header's floor-plan icon opens the same overview as the bill's
  // "Open tables" button.
  useEffect(() => {
    const open = () => setShowTables(true);
    window.addEventListener('server:openTables', open);
    return () => window.removeEventListener('server:openTables', open);
  }, []);
  const [sending, setSending] = useState(false);

  const selectItem = useCallback((item) => {
    // A group-priced item has to pick a size before it can go on the bill.
    if (item.isGroup) setSizeItem(item);
    else cart.addItem(item.name, item.price || 0);
  }, [cart]);

  const reset = useCallback(() => {
    cart.clear();
    setTableNo('');
    setOrderType('Dine-in');
  }, [cart]);

  const sendOrder = useCallback(async () => {
    if (cart.isEmpty || sending) return;
    if (orderType === 'Dine-in' && !tableNo) {
      notify('Pick a table number for a dine-in order.', 'error');
      return;
    }

    setSending(true);

    const order = {
      items: cart.lines,
      tableNo,
      tableNumber: tableNo,
      orderType,
      payment: 'Cash',
    };

    try {
      // Two destinations, deliberately: the kitchen board reads active tables,
      // the cashier reads the print queue. The kitchen order is made first so
      // the print request can name it - billing either one then settles both.
      const ticket = tableNo ? await openTable(order) : null;
      await sendToPrintQueue({ ...order, ticketId: ticket?.ticketId });

      notify(`Order sent to the kitchen${tableNo ? ` for table ${tableNo}` : ''}.`, 'success');
      reset();
    } catch (err) {
      notify(errorMessage(err, 'Could not send the order'), 'error');
    } finally {
      setSending(false);
    }
  }, [cart, notify, orderType, reset, sending, tableNo]);

  return (
    <main className="container server-layout">
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
        <div className="bill-header">
          <b>{RESTAURANT.name}</b>
          <div className="bill-subtitle">{RESTAURANT.tagline}</div>
        </div>

        <div className="bill-controls">
          <div className="bill-field">
            <label htmlFor="server-table">Table</label>
            <Select id="server-table" value={tableNo} onChange={setTableNo} options={TABLE_OPTIONS} />
          </div>

          <div className="bill-field">
            <label htmlFor="server-order-type">Order type</label>
            <Select id="server-order-type" value={orderType} onChange={setOrderType} options={ORDER_TYPES} />
          </div>
        </div>

        <div className="bill-items">
          <table id="billTable">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Item</th>
                <th>Qty</th>
                <th>Price</th>
                <th aria-label="Remove" />
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
                      <div className="qty-controls">
                        <button type="button" className="qty-btn" onClick={() => cart.decrease(name)}>&minus;</button>
                        <span className="qty-display">{item.qty}</span>
                        <button type="button" className="qty-btn" onClick={() => cart.increase(name)}>+</button>
                      </div>
                    </td>
                    <td style={{ fontWeight: 'bold' }}>{rupees(item.price * item.qty)}</td>
                    <td className="remove-cell">
                      <button type="button" className="remove-btn" onClick={() => cart.remove(name)}>&#10006;</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="total-section">
          <div className="total">Total: {rupees(cart.subtotal)}</div>
        </div>

        <div className="actions">
          <button type="button" className="clear" onClick={() => setShowTables(true)}>
            Open tables
          </button>
          <button type="button" className="clear" onClick={reset} disabled={cart.isEmpty}>
            Clear
          </button>
          <button type="button" className="print" onClick={sendOrder} disabled={cart.isEmpty || sending}>
            {sending ? 'Sending…' : 'Send order'}
          </button>
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

      {showTables && (
        <TablesPoller onClose={() => setShowTables(false)} />
      )}
    </main>
  );
}

/** Wraps the floor plan with a live poll of the active tables.
 *
 * Peek-only for the waiter: tapping a table just shows what is on it. The
 * order panel is filled by picking items from the menu and the table number
 * from the dropdown — never by tapping the floor plan. */
function TablesPoller({ onClose }) {
  const { data, loading, error } = usePolling(fetchActiveTables, 10000);
  return (
    <TablesModal
      tables={data || []}
      loading={loading}
      error={error}
      onClose={onClose}
      peekOnly
    />
  );
}
