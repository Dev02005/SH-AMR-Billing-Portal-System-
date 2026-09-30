import { useCallback, useEffect, useMemo, useState } from 'react';
import { createMenuItem, deleteMenuItem, updateMenuItem } from '../../api';
import { assetUrl, errorMessage } from '../../api/client';
import { rupees } from '../../utils/format';
import { orderedSizes } from '../../utils/sizes';
import Select from '../ui/Select';
import MenuItemFields from './MenuItemFields';
import ModalShell from './ModalShell';

const EMPTY = { name: '', price: '', category: '', imageUrl: '' };
const EMPTY_SIZE = { label: '', price: '' };

const byName = (a, b) => a.name.localeCompare(b.name);

/** Put the cursor back in the name field for the next entry. */
const focusName = () => setTimeout(() => document.getElementById('menu-item-name')?.focus(), 0);

/** A group item's prices map -> rows for the size editor, in serving order. */
function sizesFromItem(item) {
  const entries = orderedSizes(item?.prices);
  if (entries.length === 0) return [{ ...EMPTY_SIZE }];
  return entries.map(([label, price]) => ({ label, price: String(price) }));
}

// A picture link must be one the browser can load: a web address, a stored
// upload or an embedded image. Checked here so the admin gets a clear message
// instead of the browser's own "Please enter a URL" bubble.
function imageError(imageUrl) {
  const value = imageUrl.trim();
  if (!value || /^(https?:\/\/|data:image\/)/i.test(value)) return '';
  return 'The image link must start with http:// or https:// (or leave it empty).';
}

function validate({ name, price, category, imageUrl }) {
  if (!name.trim()) return 'Enter an item name.';
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0) return 'Enter a price above zero.';
  if (!category) return 'Choose a category.';
  return imageError(imageUrl);
}

function validateGroup({ name, category, sizes, imageUrl }) {
  if (!name.trim()) return 'Enter an item name.';
  if (!category) return 'Choose a category.';
  const imageMessage = imageError(imageUrl);
  if (imageMessage) return imageMessage;
  const filled = sizes.filter((s) => s.label.trim() || String(s.price).trim());
  if (filled.length === 0) return 'Add at least one size with a price.';
  for (const s of filled) {
    if (!s.label.trim()) return 'Every size needs a name (e.g. Solo).';
    const value = Number(s.price);
    if (!Number.isFinite(value) || value <= 0) return `Size "${s.label.trim()}" needs a price above zero.`;
  }
  const labels = filled.map((s) => s.label.trim().toLowerCase());
  if (new Set(labels).size !== labels.length) return 'Size names must be unique.';
  return '';
}

/** Rows of size-name + price for group-priced items (solo / duo / …). */
function GroupSizesField({ sizes, onChange, disabled }) {
  const update = (idx, field, value) =>
    onChange(sizes.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  const remove = (idx) => onChange(sizes.filter((_, i) => i !== idx));
  const add = () => onChange([...sizes, { ...EMPTY_SIZE }]);

  return (
    <div className="group-sizes-editor">
      <div className="group-sizes-head">
        <label>Sizes and prices *</label>
        <button type="button" className="group-size-add-btn" onClick={add} disabled={disabled}>
          + Add size
        </button>
      </div>
      {sizes.length === 0 && (
        <div className="field-note">Add at least one size, e.g. Solo — 299.</div>
      )}
      {sizes.map((row, idx) => (
        <div key={idx} className="group-size-row">
          <input
            type="text"
            value={row.label}
            onChange={(e) => update(idx, 'label', e.target.value)}
            placeholder="Size name (e.g. solo)"
            disabled={disabled}
          />
          <input
            type="number"
            min="1"
            step="0.01"
            value={row.price}
            onChange={(e) => update(idx, 'price', e.target.value)}
            placeholder="Price ₹"
            disabled={disabled}
          />
          <button
            type="button"
            className="group-size-remove-btn"
            onClick={() => remove(idx)}
            disabled={disabled || sizes.length <= 1}
            aria-label={`Remove size ${row.label || idx + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export function AddMenuItemModal({ onClose, categories = [], onRefresh }) {
  const [mode, setMode] = useState('single');
  const [form, setForm] = useState(EMPTY);
  const [sizes, setSizes] = useState([{ ...EMPTY_SIZE }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  // Default to the first category once they have loaded.
  useEffect(() => {
    setForm((prev) => (prev.category || categories.length === 0 ? prev : { ...prev, category: categories[0] }));
  }, [categories]);

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setSaved('');
  };

  const submit = async (event) => {
    event.preventDefault();

    const data = new FormData();
    data.append('name', form.name.trim());
    data.append('category', form.category);
    if (form.imageUrl.trim()) data.append('image_url', form.imageUrl.trim());

    if (mode === 'group') {
      const message = validateGroup({ ...form, sizes });
      if (message) { setError(message); return; }
      const prices = {};
      for (const s of sizes) {
        if (s.label.trim() || String(s.price).trim()) prices[s.label.trim()] = Number(s.price);
      }
      data.append('is_group', 'true');
      data.append('group_prices', JSON.stringify(prices));
    } else {
      const message = validate(form);
      if (message) { setError(message); return; }
      data.append('price', String(Number(form.price)));
    }

    setBusy(true);
    setError('');
    setSaved('');
    try {
      await createMenuItem(data);
      await onRefresh();
      // Stay open for the next item: same category and mode, empty fields.
      setSaved(`"${form.name.trim()}" added to the menu. Add another, or close.`);
      setForm((prev) => ({ ...EMPTY, category: prev.category }));
      setSizes([{ ...EMPTY_SIZE }]);
      focusName();
    } catch (err) {
      setError(errorMessage(err, 'Could not add the item'));
    } finally {
      setBusy(false);
    }
  };

  const isGroup = mode === 'group';

  return (
    <ModalShell title="Add menu item" onClose={onClose} busy={busy} size="menu-modal-content">
      <form onSubmit={submit} noValidate>
        <div className="add-menu-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!isGroup}
            className={`add-menu-tab ${!isGroup ? 'active' : ''}`}
            onClick={() => switchMode('single')}
            disabled={busy}
          >
            Single item
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isGroup}
            className={`add-menu-tab ${isGroup ? 'active' : ''}`}
            onClick={() => switchMode('group')}
            disabled={busy}
          >
            Group item (sizes)
          </button>
        </div>

        <div className="add-menu-split">
          <div className="add-menu-left">
            <div className="form-group">
              <label htmlFor="menu-item-name">Item name *</label>
              <input
                id="menu-item-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Chicken 65 Mandi"
                disabled={busy}
              />
            </div>

            {!isGroup && (
              <div className="form-group">
                <label htmlFor="menu-item-price">Price (₹) *</label>
                <input
                  id="menu-item-price"
                  type="number"
                  min="1"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="e.g. 150"
                  disabled={busy}
                />
              </div>
            )}

            {isGroup && <GroupSizesField sizes={sizes} onChange={setSizes} disabled={busy} />}

            <div className="form-group">
              <label htmlFor="menu-item-category">Category *</label>
              <Select
                id="menu-item-category"
                value={form.category}
                onChange={(next) => setForm({ ...form, category: next })}
                options={categories}
                placeholder="Choose a category"
                disabled={busy}
              />
            </div>
          </div>

          <div className="add-menu-right">
            <div className="form-group">
              <label htmlFor="menu-item-image">Image URL (optional)</label>
              <input
                id="menu-item-image"
                type="url"
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                placeholder="https://example.com/dish.jpg"
                disabled={busy}
              />
              <div className="field-note">Paste a full image URL</div>
            </div>

            <label className="preview-label">Live preview</label>
            <div
              className="menu-item menu-item-preview"
              style={assetUrl(form.imageUrl) ? { backgroundImage: `url('${assetUrl(form.imageUrl)}')` } : undefined}
            >
              <div className="menu-item-info">
                <div className="item-name">{form.name || 'Item name'}</div>
                <div className="item-price">
                  {isGroup ? 'Group' : rupees(Number(form.price) > 0 ? Number(form.price) : 0)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && <p className="modal-note modal-note-error">{error}</p>}
        {saved && <p className="modal-note modal-note-success" role="status">{saved}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={busy}>Close</button>
          <button type="submit" className="btn-add" disabled={busy}>
            {busy ? 'Adding…' : 'Add to menu'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function EditMenuModal({ onClose, items = [], categories = [], onRefresh }) {
  const itemCategories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean))].sort(),
    [items],
  );
  const allCategories = useMemo(
    () => [...new Set([...categories, ...itemCategories])].filter(Boolean).sort(),
    [categories, itemCategories],
  );

  const [activeCategory, setActiveCategory] = useState(itemCategories[0] || '');
  // Items are tracked by id: a rename keeps the same item selected.
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [sizes, setSizes] = useState([{ ...EMPTY_SIZE }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const visible = useMemo(
    () => items.filter((i) => i.category === activeCategory).sort(byName),
    [items, activeCategory],
  );
  const selected = items.find((i) => i.id === selectedId) || null;
  const isGroup = Boolean(selected?.isGroup);

  const load = useCallback((item) => {
    setSelectedId(item ? item.id : '');
    setForm(item
      ? {
        name: item.name,
        price: item.price != null ? String(item.price) : '',
        category: item.category,
        imageUrl: item.imageUrl || '',
      }
      : EMPTY);
    setSizes(item ? sizesFromItem(item) : [{ ...EMPTY_SIZE }]);
    setError('');
  }, []);

  // A category tab that lost its last item falls back to the first tab.
  useEffect(() => {
    if (itemCategories.length > 0 && !itemCategories.includes(activeCategory)) {
      setActiveCategory(itemCategories[0]);
    }
  }, [itemCategories, activeCategory]);

  // Nothing selected yet (or the item went away): take the tab's first item.
  // A refresh after saving keeps the current selection and what was typed.
  useEffect(() => {
    if (!selected) load(visible[0]);
  }, [selected, visible, load]);

  const openCategory = (category) => {
    setActiveCategory(category);
    load(items.filter((i) => i.category === category).sort(byName)[0]);
    setSaved('');
  };

  const pick = (id) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    load(item);
    setSaved('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!selected) { setError('Select an item to edit.'); return; }

    let payload;
    if (isGroup) {
      const message = validateGroup({ ...form, sizes });
      if (message) { setError(message); return; }
      const prices = {};
      for (const s of sizes) {
        if (s.label.trim() || String(s.price).trim()) prices[s.label.trim()] = Number(s.price);
      }
      payload = {
        name: form.name.trim(),
        category: form.category,
        imageUrl: form.imageUrl.trim(),
        group_prices: prices,
      };
    } else {
      const message = validate(form);
      if (message) { setError(message); return; }
      payload = {
        name: form.name.trim(),
        price: Number(form.price),
        category: form.category,
        imageUrl: form.imageUrl.trim(),
      };
    }

    setBusy(true);
    setError('');
    setSaved('');
    try {
      await updateMenuItem(selected.name, payload);
      await onRefresh();
      // Stay on the saved item; follow it if it moved to another category.
      setActiveCategory(payload.category);
      setSaved(`Saved "${payload.name}". Choose another item to edit, or close.`);
    } catch (err) {
      setError(errorMessage(err, 'Could not update the item'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Edit menu item" onClose={onClose} busy={busy} size="edit-menu-modal-content">
      <form onSubmit={submit} noValidate>
        <div className="edit-menu-layout">
          <div className="edit-menu-sidebar">
            <div className="edit-menu-sidebar-title">Categories</div>
            <div className="edit-menu-category-list">
              {itemCategories.length === 0
                ? <div className="delete-menu-empty-note">No items yet.</div>
                : itemCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={`edit-menu-sidebar-btn ${category === activeCategory ? 'active' : ''}`}
                    onClick={() => openCategory(category)}
                    disabled={busy}
                  >
                    {category}
                  </button>
                ))}
            </div>
          </div>

          <div className="edit-menu-main">
            <div className="form-group">
              <label htmlFor="edit-item-picker">Item to edit *</label>
              <Select
                id="edit-item-picker"
                value={selectedId}
                onChange={pick}
                options={visible.map((item) => ({
                  value: item.id,
                  label: item.isGroup ? `${item.name} (group)` : item.name,
                }))}
                placeholder="Select an item"
                disabled={busy}
              />
            </div>

            {selected?.isGroup && (
              <p className="modal-note modal-note-warn">
                “{selected.name}” is a group-priced item — edit its sizes and
                prices below. Saving keeps the group.
              </p>
            )}

            {isGroup ? (
              /* Group items get the same name / category / image fields as
                 single items — the sizes editor just takes the price field's
                 place. They used to vanish, leaving only the size rows, so a
                 group's name or category could not be corrected. */
              <MenuItemFields
                value={form}
                onChange={setForm}
                categories={allCategories}
                disabled={busy}
                priceField={false}
                sizesSlot={<GroupSizesField sizes={sizes} onChange={setSizes} disabled={busy} />}
                previewPriceLabel="Group"
              />
            ) : (
              <MenuItemFields value={form} onChange={setForm} categories={allCategories} disabled={busy} />
            )}
          </div>
        </div>

        {error && <p className="modal-note modal-note-error">{error}</p>}
        {saved && <p className="modal-note modal-note-success" role="status">{saved}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={busy}>Close</button>
          <button type="submit" className="btn-add" disabled={busy || !selected}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function DeleteMenuModal({ onClose, items = [], onRefresh }) {
  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean))].sort(),
    [items],
  );

  const [activeCategory, setActiveCategory] = useState(categories[0] || '');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const visible = useMemo(
    () => items.filter((i) => i.category === activeCategory).sort(byName),
    [items, activeCategory],
  );

  useEffect(() => {
    if (categories.length > 0 && !categories.includes(activeCategory)) setActiveCategory(categories[0]);
  }, [categories, activeCategory]);

  const toggle = (name) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });

  const submit = async (event) => {
    event.preventDefault();
    const targets = [...selected];
    if (targets.length === 0) { setError('Select at least one item.'); return; }

    setBusy(true);
    setError('');
    setSaved('');

    const results = await Promise.allSettled(targets.map((name) => deleteMenuItem(name)));
    const failed = targets.filter((_, i) => results[i].status === 'rejected');
    const deleted = targets.length - failed.length;

    if (deleted > 0) await onRefresh();
    // Stay open for more deletions; only the failures stay selected.
    setSelected(new Set(failed));
    if (deleted > 0) setSaved(`Deleted ${deleted} item${deleted === 1 ? '' : 's'}. Select more, or close.`);
    if (failed.length) setError(`Could not delete: ${failed.join(', ')}`);
    setBusy(false);
  };

  return (
    <ModalShell title="Delete menu item" onClose={onClose} busy={busy} size="edit-menu-modal-content">
      <form onSubmit={submit}>
        <div className="edit-menu-layout">
          <div className="edit-menu-sidebar">
            <div className="edit-menu-sidebar-title">Categories</div>
            <div className="edit-menu-category-list">
              {categories.length === 0
                ? <div className="delete-menu-empty-note">No items yet.</div>
                : categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={`edit-menu-sidebar-btn ${category === activeCategory ? 'active' : ''}`}
                    onClick={() => { setActiveCategory(category); setSelected(new Set()); setSaved(''); }}
                    disabled={busy}
                  >
                    {category}
                  </button>
                ))}
            </div>
          </div>

          <div className="edit-menu-main">
            <div className="delete-menu-toolbar">
              <button type="button" className="delete-menu-toolbar-btn" onClick={() => setSelected(new Set(visible.map((i) => i.name)))} disabled={busy}>
                Select all
              </button>
              <button type="button" className="delete-menu-toolbar-btn secondary" onClick={() => setSelected(new Set())} disabled={busy}>
                Clear
              </button>
              <div className="delete-menu-count">{selected.size} selected</div>
            </div>

            <div className="delete-menu-grid">
              {visible.length === 0 ? (
                <div className="delete-menu-empty-note">No items in this category.</div>
              ) : visible.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`menu-item delete-card-item ${selected.has(item.name) ? 'selected' : ''}`}
                  style={assetUrl(item.imageUrl) ? { backgroundImage: `url('${assetUrl(item.imageUrl)}')` } : undefined}
                  onClick={() => toggle(item.name)}
                  disabled={busy}
                >
                  <div className="menu-item-info">
                    <div className="item-name">{item.name}</div>
                    <div className="item-price">
                      {item.isGroup ? 'Group' : rupees(item.price || 0)}
                    </div>
                  </div>
                  {selected.has(item.name) && (
                    <div className="delete-card-overlay"><div className="delete-card-checkmark">✓</div></div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="modal-note modal-note-error">{error}</p>}
        {saved && <p className="modal-note modal-note-success" role="status">{saved}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={busy}>Close</button>
          <button type="submit" className="btn-delete" disabled={busy || selected.size === 0}>
            {busy ? 'Deleting…' : 'Delete selected'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
