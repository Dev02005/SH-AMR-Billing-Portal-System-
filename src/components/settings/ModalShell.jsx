import { useEffect } from 'react';
import '../modals/Modals.css';

/**
 * Frame shared by every settings dialog: overlay, header, Escape-to-close and
 * a busy state that blocks accidental dismissal mid-save.
 */
export default function ModalShell({ title, onClose, busy, size = '', children }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className={`modal-content ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
