import { useState } from 'react';
import { deletePrintRequest, fetchPrintQueue } from '../../api';
import { errorMessage } from '../../api/client';
import usePolling from '../../hooks/usePolling';
import { clockTime, rupees } from '../../utils/format';
import './Modals.css';

/**
 * Bills waiters have sent to the counter, waiting to be printed.
 *
 * The previous version called the endpoint without an auth header, read
 * `data.queue[].data` when the API returns `data.requests[].billData`, and
 * filtered on a `source` field that was never set — so the list was always
 * empty regardless of how many requests were pending.
 */
export default function PrintQueueModal({ onClose, onLoad, isAdmin }) {
  const { data, loading, error, refresh } = usePolling(fetchPrintQueue, 10000);
  const [removing, setRemoving] = useState(null);
  const [actionError, setActionError] = useState('');
  const requests = data || [];

  const discard = async (event, id) => {
    event.stopPropagation();
    setRemoving(id);
    setActionError('');
    try {
      await deletePrintRequest(id);
      await refresh({ silent: true });
    } catch (err) {
      setActionError(errorMessage(err, 'Could not remove the request'));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content modal-wide">
        <div className="modal-header">
          <h2>Print queue{requests.length ? ` (${requests.length})` : ''}</h2>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {loading && <p className="modal-note">Loading requests…</p>}
          {!loading && error && <p className="modal-note modal-note-error">{error}</p>}
          {actionError && <p className="modal-note modal-note-error">{actionError}</p>}
          {!loading && !error && requests.length === 0 && (
            <p className="modal-note">No pending print requests.</p>
          )}

          <div className="queue-list">
            {requests.map((request) => {
              const bill = request.billData || {};
              return (
                <div
                  key={request._id}
                  className="queue-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => onLoad(request)}
                  onKeyDown={(e) => e.key === 'Enter' && onLoad(request)}
                >
                  <div>
                    <div className="queue-card-title">
                      Table {bill.tableNo || '—'}
                    </div>
                    <div className="queue-card-meta">
                      {rupees(bill.total || 0)} · {(bill.items || []).length} item
                      {(bill.items || []).length === 1 ? '' : 's'} · {bill.orderType || 'Dine-in'}
                    </div>
                    <div className="queue-card-time">
                      From {request.createdBy} at {clockTime(request.createdAt)}
                    </div>
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      className="queue-discard"
                      onClick={(e) => discard(e, request._id)}
                      disabled={removing === request._id}
                    >
                      {removing === request._id ? '…' : 'Discard'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
