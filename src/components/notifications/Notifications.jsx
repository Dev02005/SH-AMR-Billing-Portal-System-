import { useCallback, useEffect, useRef, useState } from 'react';
import { acknowledgeNotifications, fetchNotifications } from '../../api';
import { isSignedIn } from '../../api/session';
import { NotificationContext } from './notification-context';
import './Notifications.css';

/**
 * One place for every message the app shows.
 *
 * Two sources feed the same stack of cards:
 *   - `notify()` for things that happened in this browser ("Bill saved")
 *   - the server, polled every few seconds, for things that happened in
 *     another portal ("Table 7 is ready to serve")
 *
 * This replaces the browser's `alert()`, which froze the till until someone
 * dismissed it - awkward on a touch screen mid-service.
 */

/** How often a portal asks the API for notices aimed at its role - the same
 *  pace as the table lists. Only while the page is on screen (see poll). */
const POLL_MS = 10000;

const AUTO_DISMISS_MS = { info: 4000, success: 4000, error: 8000, ready: 15000, served: 12000 };

/** Cards visible at once. Beyond this the oldest drop off rather than covering
 *  the bill panel behind them. */
const MAX_VISIBLE = 4;

const ICONS = {
  ready: (
    <>
      <path d="M12 3v2" />
      <path d="M4 13a8 8 0 0 1 16 0" />
      <line x1="2" y1="13" x2="22" y2="13" />
      <path d="M5 17h14" />
    </>
  ),
  served: (
    <>
      <path d="M20 6 9 17l-5-5" />
    </>
  ),
  success: <path d="M20 6 9 17l-5-5" />,
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <line x1="12" y1="16.5" x2="12" y2="16.6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <line x1="12" y1="7.5" x2="12" y2="7.6" />
    </>
  ),
};

function NoticeIcon({ tone }) {
  return (
    <svg
      className="notice-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[tone] || ICONS.info}
    </svg>
  );
}

function Notice({ notice, onDismiss }) {
  const { id, tone, title, message } = notice;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), AUTO_DISMISS_MS[tone] ?? AUTO_DISMISS_MS.info);
    return () => clearTimeout(timer);
  }, [id, tone, onDismiss]);

  return (
    <div className={`notice notice-${tone}`} role="status" aria-live="polite">
      <NoticeIcon tone={tone} />
      <div className="notice-body">
        {title && <div className="notice-title">{title}</div>}
        <div className="notice-message">{message}</div>
      </div>
      <button
        type="button"
        className="notice-close"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

/** "Table 5 — food ready, hand to waiter" under the heading "Table 5" ->
 *  "Food ready, hand to waiter". */
function withoutTitle(message, title) {
  if (!title || !message.startsWith(title)) return message;
  const rest = message.slice(title.length).replace(/^[\s—–:-]+/, '');
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : message;
}

export function NotificationProvider({ children, listen = false }) {
  const [notices, setNotices] = useState([]);
  const nextId = useRef(1);
  // Server notices are acknowledged on dismissal so they do not come back on
  // the next poll; this maps our local card id to the server's row id.
  const serverIds = useRef(new Map());
  // Server ids dismissed on this screen. A poll can land before the server
  // has recorded the dismissal and would bring the card straight back; these
  // are skipped until the acknowledgement fails (then the notice may return).
  const dismissed = useRef(new Set());

  const push = useCallback((message, tone = 'info', title = '') => {
    const id = `local-${nextId.current += 1}`;
    setNotices((current) => [...current, { id, tone, title, message }]);
    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));

    const serverId = serverIds.current.get(id);
    if (serverId) {
      serverIds.current.delete(id);
      dismissed.current.add(serverId);
      acknowledgeNotifications([serverId]).catch(() => {
        // Not recorded on the server: let the notice come back on a later poll.
        dismissed.current.delete(serverId);
      });
    }
  }, []);

  useEffect(() => {
    if (!listen) return undefined;

    let active = true;
    let inFlight = false;

    const poll = async () => {
      // Skip a tick rather than stacking requests when the server is slow, and
      // ask nothing while the page is hidden (minimised, another tab, phone
      // screen off) - it catches up as soon as it is visible again.
      if (inFlight || !isSignedIn() || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const incoming = await fetchNotifications();
        if (!active || incoming.length === 0) return;

        // The dedupe and the ref update happen here, not inside the state
        // updater: React may invoke an updater twice, and a second pass would
        // see the ids already recorded and drop the cards entirely.
        const known = new Set([...serverIds.current.values(), ...dismissed.current]);
        const fresh = incoming.filter((n) => !known.has(n.id));
        if (fresh.length === 0) return;

        const cards = fresh.map((n) => {
          const id = `server-${n.id}`;
          serverIds.current.set(id, n.id);
          const title = n.tableNumber ? `Table ${n.tableNumber}` : '';
          return {
            id,
            tone: n.kind === 'ready' || n.kind === 'served' ? n.kind : 'info',
            title,
            // The API keeps its messages self-contained for logs and other
            // clients ("Table 5 — food ready, …"); on screen the heading
            // already names the table, so drop it and the separator after it.
            message: withoutTitle(n.message, title),
          };
        });

        setNotices((current) => [...current, ...cards]);
      } catch {
        // A missed poll is not worth telling the user about; the next one
        // picks the notices up again.
      } finally {
        inFlight = false;
      }
    };

    poll();
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [listen]);

  return (
    <NotificationContext.Provider value={push}>
      {children}
      {notices.length > 0 && (
        <div className="notice-stack" aria-live="polite">
          {notices.slice(-MAX_VISIBLE).map((notice) => (
            <Notice key={notice.id} notice={notice} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </NotificationContext.Provider>
  );
}
