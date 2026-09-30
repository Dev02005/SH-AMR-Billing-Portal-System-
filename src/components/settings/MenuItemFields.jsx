import { assetUrl } from '../../api/client';
import Select from '../ui/Select';
import { rupees } from '../../utils/format';

/**
 * Name / price / category inputs plus the live card preview.
 *
 * Add and Edit shared this markup by copy-paste, so a fix to one silently
 * left the other behind.
 *
 * Group-priced items pass `priceField={false}` and put their size editor in
 * `sizesSlot` (it takes the price input's place); `previewPriceLabel` then
 * replaces the ₹-figure on the preview card — a group has no single price.
 */
export default function MenuItemFields({
  value,
  onChange,
  categories,
  disabled,
  priceField = true,
  sizesSlot = null,
  previewPriceLabel,
}) {
  const set = (field) => (event) => onChange({ ...value, [field]: event.target.value });
  const previewPrice = Number(value.price) > 0 ? Number(value.price) : 0;
  const preview = assetUrl(value.imageUrl);

  return (
    <div className="add-menu-split">
      <div className="add-menu-left">
        <div className="form-group">
          <label htmlFor="menu-item-name">Item name *</label>
          <input
            id="menu-item-name"
            type="text"
            value={value.name}
            onChange={set('name')}
            placeholder="e.g. Special Manchurian"
            disabled={disabled}
          />
        </div>

        {priceField ? (
          <div className="form-group">
            <label htmlFor="menu-item-price">Price (₹) *</label>
            <input
              id="menu-item-price"
              type="number"
              min="1"
              step="0.01"
              value={value.price}
              onChange={set('price')}
              placeholder="e.g. 150"
              disabled={disabled}
            />
          </div>
        ) : (
          sizesSlot
        )}

        <div className="form-group">
          <label htmlFor="menu-item-category">Category *</label>
          <Select
            id="menu-item-category"
            value={value.category}
            onChange={(next) => onChange({ ...value, category: next })}
            options={categories}
            placeholder="Choose a category"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="add-menu-right">
        <div className="form-group">
          <label htmlFor="menu-item-image">Image URL (optional)</label>
          <input
            id="menu-item-image"
            type="url"
            value={value.imageUrl}
            onChange={set('imageUrl')}
            placeholder="https://example.com/dish.jpg"
            disabled={disabled}
          />
          <div className="field-note">Paste a full image URL</div>
        </div>

        <label className="preview-label">Live preview</label>
        <div
          className="menu-item menu-item-preview"
          style={preview ? { backgroundImage: `url('${preview}')` } : undefined}
        >
          <div className="menu-item-info">
            <div className="item-name">{value.name || 'Item name'}</div>
            <div className="item-price">
              {previewPriceLabel ?? rupees(previewPrice)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
