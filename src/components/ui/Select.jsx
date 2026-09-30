import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { bodyZoom, toCssPx } from '../../utils/zoom';
import './Select.css';

/**
 * Dropdown styled to match the rest of the POS.
 *
 * Native `<select>` popups are drawn by the operating system, so on the till
 * they appeared as small white Windows menus in the middle of a dark
 * full-screen app. This keeps the list inside the app's own look and gives
 * touch targets big enough to hit while carrying plates.
 *
 * The list renders in a portal so it is never clipped by a panel's overflow.
 *
 * @param options - `[{ value, label }]` or plain strings.
 */
export default function Select({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  disabled = false,
  id,
  className = '',
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const generatedId = useId();
  const listId = `${id || generatedId}-list`;

  const items = options.map((option) => (
    typeof option === 'object' && option !== null
      ? { value: String(option.value), label: option.label ?? String(option.value) }
      : { value: String(option), label: String(option) }
  ));

  const selected = items.find((item) => item.value === String(value ?? ''));

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    // Measured in viewport pixels, written back in CSS pixels - the page is
    // zoomed, so the two are not the same unit.
    const zoom = bodyZoom();
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    // Flip above the field when there is more room there.
    const dropUp = spaceBelow < 220 && rect.top > spaceBelow;

    setPosition({
      left: toCssPx(rect.left, zoom),
      width: toCssPx(rect.width, zoom),
      top: dropUp ? undefined : toCssPx(rect.bottom + 4, zoom),
      bottom: dropUp ? toCssPx(window.innerHeight - rect.top + 4, zoom) : undefined,
      maxHeight: toCssPx(Math.max(160, (dropUp ? rect.top : spaceBelow) - 16), zoom),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (triggerRef.current?.contains(event.target)) return;
      if (listRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onReflow = () => place();

    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, place]);

  const choose = (item) => {
    onChange(item.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (event) => {
    if (disabled) return;

    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        setActiveIndex(items.findIndex((i) => i.value === String(value ?? '')));
        setOpen(true);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => {
        const next = current + step;
        if (next < 0) return items.length - 1;
        if (next >= items.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) choose(item);
    }
  };

  return (
    <>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={`ui-select ${open ? 'is-open' : ''} ${className}`}
        onClick={() => !disabled && setOpen((current) => !current)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
      >
        <span className={`ui-select-value ${selected ? '' : 'is-placeholder'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className="ui-select-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && position && createPortal(
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          className="ui-select-list"
          style={{
            left: position.left,
            width: position.width,
            top: position.top,
            bottom: position.bottom,
            maxHeight: position.maxHeight,
          }}
        >
          {items.length === 0 && <div className="ui-select-empty">Nothing to choose</div>}
          {items.map((item, index) => (
            <div
              key={item.value}
              role="option"
              aria-selected={item.value === String(value ?? '')}
              className={[
                'ui-select-option',
                item.value === String(value ?? '') ? 'is-selected' : '',
                index === activeIndex ? 'is-active' : '',
              ].join(' ').trim()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(item)}
            >
              {item.label}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
