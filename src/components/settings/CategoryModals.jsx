import { useMemo, useState } from 'react';
import { createCategory, deleteCategory } from '../../api';
import { errorMessage } from '../../api/client';
import ModalShell from './ModalShell';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Delete 2 categories and 25 items": the button says exactly what goes. */
function deleteLabel(selected, counts) {
  if (selected.size === 0) return 'Delete selected';
  const itemTotal = [...selected].reduce((sum, c) => sum + (counts.get(c) || 0), 0);
  return `Delete ${plural(selected.size, 'category', 'categories')} and ${plural(itemTotal, 'item')}`;
}

export function AddCategoryModal({ onClose, onRefresh }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    const value = name.trim();
    if (!value) { setError('Enter a category name.'); return; }

    setBusy(true);
    setError('');
    setSaved('');
    try {
      await createCategory(value);
      await onRefresh();
      // Stay open for the next category.
      setSaved(`Category "${value}" added. Add another, or close.`);
      setName('');
      setTimeout(() => document.getElementById('new-category')?.focus(), 0);
    } catch (err) {
      setError(errorMessage(err, 'Could not add the category'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Add category" onClose={onClose} busy={busy} size="category-modal-content">
      <form onSubmit={submit}>
        <div className="form-group">
          <label htmlFor="new-category">Category name *</label>
          <input
            id="new-category"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Desserts"
            autoFocus
            disabled={busy}
          />
        </div>

        {error && <p className="modal-note modal-note-error">{error}</p>}
        {saved && <p className="modal-note modal-note-success" role="status">{saved}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={busy}>Close</button>
          <button type="submit" className="btn-add" disabled={busy}>
            {busy ? 'Adding…' : 'Add category'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function DeleteCategoryModal({ onClose, categories = [], items = [], onRefresh }) {
  // Every category the menu shows: the saved list plus any category an item
  // uses, each with the number of items that deleting it will erase.
  const counts = useMemo(() => {
    const map = new Map(categories.map((c) => [c, 0]));
    for (const item of items) {
      if (item.category) map.set(item.category, (map.get(item.category) || 0) + 1);
    }
    return map;
  }, [categories, items]);
  const allCategories = useMemo(() => [...counts.keys()].sort(), [counts]);

  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const toggle = (category) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    return next;
  });

  const submit = async (event) => {
    event.preventDefault();
    const targets = [...selected];
    if (targets.length === 0) { setError('Select at least one category.'); return; }

    setBusy(true);
    setError('');
    setSaved('');

    const results = await Promise.allSettled(targets.map((category) => deleteCategory(category)));
    const failed = targets.filter((_, i) => results[i].status === 'rejected');
    const deleted = targets.length - failed.length;
    const itemsErased = results.reduce(
      (sum, r) => sum + (r.status === 'fulfilled' ? Number(r.value?.itemsDeleted) || 0 : 0),
      0,
    );

    if (deleted > 0) {
      await onRefresh();
      setSaved(`Deleted ${plural(deleted, 'category', 'categories')} and ${plural(itemsErased, 'menu item')}. Select more, or close.`);
    }
    // Stay open; only the failures stay selected.
    setSelected(new Set(failed));
    if (failed.length) setError(`Could not delete: ${failed.join(', ')}`);
    setBusy(false);
  };

  return (
    <ModalShell title="Delete category" onClose={onClose} busy={busy} size="category-modal-content">
      <form onSubmit={submit}>
        <div className="form-group">
          <label>Select categories to delete *</label>
          <p className="modal-note modal-note-warn">
            Deleting a category also deletes every menu item filed under it.
          </p>

          <div className="delete-category-toolbar">
            <button type="button" className="delete-category-toolbar-btn" onClick={() => setSelected(new Set(allCategories))} disabled={busy}>
              Select all
            </button>
            <button type="button" className="delete-category-toolbar-btn secondary" onClick={() => setSelected(new Set())} disabled={busy}>
              Clear
            </button>
            <div className="delete-category-count">{selected.size} selected</div>
          </div>

          <div className="delete-category-list">
            {allCategories.length === 0 ? (
              <div className="delete-category-empty">No categories available.</div>
            ) : allCategories.map((category) => (
              /* Same tap-to-select card as the delete-items modal — red frame,
                 shrink, and a checkmark overlay — instead of the old checkbox
                 tiles, so both delete dialogs feel identical. */
              <button
                key={category}
                type="button"
                className={`menu-item delete-card-item ${selected.has(category) ? 'selected' : ''}`}
                onClick={() => toggle(category)}
                disabled={busy}
              >
                <div className="menu-item-info">
                  <div className="item-name">{category}</div>
                  <div className="item-price">{plural(counts.get(category) || 0, 'item')}</div>
                </div>
                {selected.has(category) && (
                  <div className="delete-card-overlay"><div className="delete-card-checkmark">✓</div></div>
                )}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="modal-note modal-note-error">{error}</p>}
        {saved && <p className="modal-note modal-note-success" role="status">{saved}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={busy}>Close</button>
          <button type="submit" className="btn-delete" disabled={busy || selected.size === 0}>
            {busy ? 'Deleting…' : deleteLabel(selected, counts)}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
