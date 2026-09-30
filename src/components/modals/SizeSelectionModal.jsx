import { orderedSizes } from '../../utils/sizes';
import './Modals.css';

/**
 * Size picker for a group-priced item (solo / duo / trio / squad).
 *
 * Reads `item.prices`, which the API now returns for every group item. It
 * used to look for a field the backend never sent, so group items fell
 * through to the single-price path and were added to the bill at ₹0.
 */
export default function SizeSelectionModal({ item, onClose, onSelect }) {
  const options = orderedSizes(item?.prices)
    .filter(([, price]) => Number.isFinite(price) && price > 0);

  if (options.length === 0) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>Select size — {item.name}</h2>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body size-selection-body">
          {options.map(([size, price]) => (
            <button
              type="button"
              key={size}
              className="size-btn"
              onClick={() => onSelect(`${item.name} (${size})`, price)}
            >
              <div className="size-label">{size}</div>
              <div className="size-price">₹{price}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
