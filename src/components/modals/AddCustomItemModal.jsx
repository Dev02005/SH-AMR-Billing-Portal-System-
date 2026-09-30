import { useState } from 'react';
import { createMenuItem } from '../../api';
import { errorMessage } from '../../api/client';
import './Modals.css';

/**
 * Quick entry for a one-off item that isn't on the menu, filed under
 * "custom" so it stays out of the regular category tabs.
 */
export default function AddCustomItemModal({ onClose, onAdded }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    const value = Number(price);

    if (!trimmed) { setError('Enter an item name.'); return; }
    if (!Number.isFinite(value) || value <= 0) { setError('Enter a price above zero.'); return; }

    setSaving(true);
    setError('');
    try {
      const form = new FormData();
      form.append('name', trimmed);
      form.append('price', String(value));
      form.append('category', 'custom');

      await createMenuItem(form);
      onAdded(trimmed, value);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not add the item'));
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>Add custom item</h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving}>×</button>
        </div>

        <form onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="custom-item-name">Item name *</label>
            <input
              id="custom-item-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Special Thali"
              autoFocus
              disabled={saving}
            />
          </div>

          <div className="form-group">
            <label htmlFor="custom-item-price">Price (₹) *</label>
            <input
              id="custom-item-price"
              type="number"
              min="1"
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. 150"
              disabled={saving}
            />
          </div>

          {error && <p className="modal-note modal-note-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn-add" disabled={saving}>
              {saving ? 'Adding…' : 'Add to bill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
