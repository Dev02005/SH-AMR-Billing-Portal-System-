import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { bodyZoom, toCssPx, viewportSize } from '../../utils/zoom';
import './MenuPopup.css';

/**
 * A menu that hangs off an icon button.
 *
 * The panel renders in a portal at fixed coordinates rather than absolutely
 * inside the header. Anchoring it to the header meant it inherited the
 * header's stacking and clipping, so it drifted sideways over the restaurant
 * name and ran off the edge of the screen. Positioning it here also lets it
 * flip to whichever side has room.
 *
 * @param align - which edge of the trigger the panel lines up with.
 */
export default function MenuPopup({
  trigger,
  align = 'right',
  label,
  className = '',
  children,
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState(null);
  const anchorRef = useRef(null);
  const panelRef = useRef(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    // Everything below is in viewport pixels; the final values are divided by
    // the body zoom on the way into the style, which is the space `left`/`top`
    // are interpreted in.
    const zoom = bodyZoom();
    const rect = anchor.getBoundingClientRect();
    const width = viewportSize(panelRef.current).width || 220 * zoom;
    const margin = 8;

    let left = align === 'right' ? rect.right - width : rect.left;
    // Never let the panel leave the window on either side.
    left = Math.min(left, window.innerWidth - width - margin);
    left = Math.max(margin, left);

    setStyle({
      top: toCssPx(rect.bottom + 6, zoom),
      left: toCssPx(left, zoom),
      maxHeight: toCssPx(window.innerHeight - rect.bottom - 20, zoom),
    });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // Re-measure once the panel has rendered and its real width is known.
    const id = requestAnimationFrame(place);
    return () => cancelAnimationFrame(id);
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (anchorRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    const onReflow = () => place();

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, place]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        ref={anchorRef}
        className={`icon-btn ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        {trigger}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          role="menu"
          className={`menu-popup ${className}`}
          style={style ?? { visibility: 'hidden', top: 0, left: 0 }}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>,
        document.body,
      )}
    </>
  );
}

/** A row inside a MenuPopup. */
export function MenuItem({ onClick, children, danger = false, className = '' }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`menu-row ${danger ? 'is-danger' : ''} ${className}`.trim()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** A collapsible group of rows, for the admin's nested menu edits. */
export function MenuGroup({ label, open, onToggle, children }) {
  return (
    <div className={`menu-group ${open ? 'is-open' : ''}`}>
      <button type="button" className="menu-row menu-row-toggle" onClick={onToggle} aria-expanded={open}>
        <span>{label}</span>
        <svg className="menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="menu-submenu">{children}</div>}
    </div>
  );
}
