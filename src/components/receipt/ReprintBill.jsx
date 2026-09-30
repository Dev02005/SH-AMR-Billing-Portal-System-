import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RESTAURANT } from '../../config/brand.js';
import { rupees } from '../../utils/format';
import { clearPrintPages, fitPrintPages } from '../../utils/printPages';

/**
 * Print a saved bill again, laid out exactly like the slip the Print button
 * produces in BillingDashboard: the same classes, so the same print rules
 * (monospace look, 70 mm width, page fitted to the slip) apply. Keep the
 * markup in step with the `.bill` block there.
 *
 * Mounted only while printing. It renders into <body>, beside the app root,
 * and `body.reprinting` hides the rest of the page from the printer.
 */
export default function ReprintBill({ bill, onDone }) {
  useEffect(() => {
    document.body.classList.add('reprinting');
    // Let the slip paint before the print dialog snapshots the page.
    const timer = setTimeout(() => {
      fitPrintPages();
      window.print();
      clearPrintPages();
      document.body.classList.remove('reprinting');
      onDone();
    }, 60);
    return () => {
      clearTimeout(timer);
      clearPrintPages();
      document.body.classList.remove('reprinting');
    };
  }, [bill, onDone]);

  const items = bill.items || [];
  const subtotal = Number(bill.subtotal)
    || items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);
  const discountPercent = Number(bill.discount) || 0;
  const discountAmount = Number(bill.discountAmount) || Math.round((subtotal * discountPercent) / 100);
  const stamp = new Date(bill.createdAt);
  const number = bill.billNumber ?? bill.token ?? '—';

  return createPortal(
    <main className="container billing-layout reprint-root" aria-hidden="true">
      <div className="bill">
        <div className="bill-header">
          <div className="bill-header-row">
            <div className="bill-number">Table No: {bill.tableNo || 'X'}</div>
            <div className="bill-number">
              Bill No: <span className="bill-no-display">{number}</span>
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
                {/* The print sheet hides the last header cell (the live
                    bill's remove column), so keep an empty one here. */}
                <th aria-hidden="true" className="no-print" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={`${item.name}-${index}`}>
                  <td style={{ textAlign: 'left', fontWeight: 'bold' }}>{item.name}</td>
                  <td><span className="qty-print">{item.qty}</span></td>
                  <td style={{ fontWeight: 'bold' }}>{rupees((Number(item.price) || 0) * (Number(item.qty) || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bill-print-meta">
          <div className="print-meta-line"><span>Table No.</span><span>{bill.tableNo || 'X'}</span></div>
          <div className="print-meta-line"><span>Payment Method:</span><span>{bill.payment}</span></div>
          <div className="print-meta-line"><span>Order Type:</span><span>{bill.orderType}</span></div>
        </div>

        <div className="total-section">
          <div className="total-line">
            <span>Subtotal:</span><span>{rupees(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="total-line total-line-discount">
              <span>Discount{discountPercent ? ` (${discountPercent}%)` : ''}:</span><span>− {rupees(discountAmount)}</span>
            </div>
          )}
          <div className="total"><span>Total:</span>{' '}<span>{rupees(bill.total)}</span></div>
        </div>

        <div className="footer">
          <div className="footer-thanks">Thank you!</div>
          <div className="footer-visit">🙏 Visit again 🙏</div>
        </div>
      </div>
    </main>,
    document.body,
  );
}
