/**
 * The desktop layout scales the whole page with `body { zoom: 1.08 }`.
 *
 * That breaks coordinate maths for anything positioned by script: an anchor's
 * `getBoundingClientRect()` comes back in real viewport pixels, but a `left`
 * written onto a portalled element inside the zoomed body is multiplied by the
 * zoom before it lands. Popups therefore drifted right and off the screen.
 *
 * These helpers convert between the two spaces.
 */

/** Current zoom factor applied to <body>, or 1 when there is none. */
export function bodyZoom() {
  const body = document.body;
  if (!body || !body.offsetWidth) return 1;
  const ratio = body.getBoundingClientRect().width / body.offsetWidth;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

/** Viewport pixels -> the CSS pixels to write into a style inside <body>. */
export function toCssPx(viewportPx, zoom = bodyZoom()) {
  return viewportPx / zoom;
}

/** An element's on-screen size, even when it sits inside the zoomed body. */
export function viewportSize(element) {
  if (!element) return { width: 0, height: 0 };
  const rect = element.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}
