import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { assetUrl } from '../../api/client';
import { rupees } from '../../utils/format';

/**
 * Category tabs plus the menu grid, shared by the billing and server portals.
 *
 * Both dashboards previously carried their own copy of this, and only the
 * billing copy was ever kept in step with the API - which is how group-priced
 * items ended up rendering as ₹0 in the server portal.
 */

function priceLabel(item) {
  if (!item.isGroup) return rupees(item.price || 0);
  const values = Object.values(item.prices || {}).map(Number).filter((n) => !Number.isNaN(n));
  if (values.length === 0) return rupees(0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? rupees(min) : `${rupees(min)} – ${rupees(max)}`;
}

// Narrowest a category tab may get before its name stops fitting.
const MIN_TAB_PX = 150;
const MIN_TAB_PX_NARROW = 110;
const TAB_GAP_PX = 10;

/**
 * How many tabs per row so the bar fills its width: the fewest rows that fit
 * at the minimum tab width, with the tabs shared out evenly between them
 * (9 tabs that fit 7 to a row become rows of 5 and 4, not 7 and 2). The CSS
 * lets each row stretch, so no row ends in empty space.
 */
function useTabColumns(count) {
  const ref = useRef(null);
  const [columns, setColumns] = useState(count || 1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || count === 0) return undefined;
    const measure = () => {
      const style = getComputedStyle(el);
      const width = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const minTab = width < 520 ? MIN_TAB_PX_NARROW : MIN_TAB_PX;
      const fit = Math.max(1, Math.floor((width + TAB_GAP_PX) / (minTab + TAB_GAP_PX)));
      const rows = Math.ceil(count / fit);
      setColumns(Math.ceil(count / rows));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [count]);

  return [ref, columns];
}

function MenuCard({ item, onSelect }) {
  const image = assetUrl(item.imageUrl);
  return (
    <button
      type="button"
      className="menu-item"
      style={image ? { backgroundImage: `url('${image}')` } : undefined}
      onClick={() => onSelect(item)}
    >
      <div className="menu-item-info">
        <div className="item-name">{item.name}</div>
        <div className="item-price">{priceLabel(item)}</div>
      </div>
    </button>
  );
}

export default function MenuBrowser({
  items = [],
  categories = [],
  activeCategory,
  onCategoryChange,
  onSelect,
  loading,
  error,
}) {
  const visible = useMemo(
    () => items.filter((item) => item.category === activeCategory),
    [items, activeCategory],
  );
  const [tabsRef, tabColumns] = useTabColumns(categories.length);

  return (
    <div className="left">
      <div className="tabs" role="tablist" ref={tabsRef} style={{ '--tab-columns': tabColumns }}>
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            role="tab"
            aria-selected={activeCategory === category}
            className={activeCategory === category ? 'active' : ''}
            onClick={() => onCategoryChange(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="menu" id="menu">
        {loading && <div className="menu-message">Loading menu…</div>}
        {!loading && error && <div className="menu-message menu-message-error">{error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div className="menu-message">No items in this category yet.</div>
        )}
        {!loading && !error && visible.map((item) => (
          <MenuCard key={item.id} item={item} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
