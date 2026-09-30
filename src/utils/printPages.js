/**
 * Size each printed slip's page to the slip itself.
 *
 * A thermal roll has no fixed page height, but CSS cannot say "70 mm wide,
 * as tall as the content": `size: 70mm` means a 70 x 70 mm square, and
 * `70mm auto` is invalid. With the square page a long bill spilled its footer
 * onto a second page and every slip ended in a run of blank paper before the
 * cut. So just before printing we lay the page out with the print rules,
 * measure the bill and the token slip, and give each its own page of exactly
 * that height — the printer then cuts where each slip ends.
 */

const PX_PER_MM = 96 / 25.4;
// A hair of slack so rounding never pushes the last line onto a new page.
const SLACK_MM = 1.5;
const STYLE_ID = 'print-page-fit';

/** Flip every print-only media rule on (and screen-only rules off) so the
 *  current layout matches the printed one; returns an undo function. */
function emulatePrintMedia() {
  const changed = [];
  const visit = (rules) => {
    for (const rule of rules) {
      if (rule.media) {
        const text = rule.media.mediaText;
        if (/\bprint\b/.test(text) && !/\bnot\b/.test(text)) {
          changed.push([rule, text]);
          rule.media.mediaText = 'all';
        } else if (/^\s*(only\s+)?screen\b/.test(text)) {
          changed.push([rule, text]);
          rule.media.mediaText = 'not all';
        }
      } else if (rule.cssRules) {
        visit(rule.cssRules);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      visit(sheet.cssRules);
    } catch {
      // Cross-origin sheets (fonts) cannot be read and hold no print rules.
    }
  }
  return () => changed.forEach(([rule, text]) => { rule.media.mediaText = text; });
}

function heightMm(selector) {
  const el = document.querySelector(selector);
  if (!el) return 0;
  const px = el.getBoundingClientRect().height;
  return px > 0 ? Math.ceil(px / PX_PER_MM + SLACK_MM) : 0;
}

/**
 * Measure the slips and install page sizes for them. Runs synchronously, so
 * the emulated print layout is never painted to the screen.
 */
export function fitPrintPages() {
  const restore = emulatePrintMedia();
  let billMm = 0;
  let tokenMm = 0;
  try {
    billMm = heightMm('.bill');
    tokenMm = heightMm('.customer-receipt');
  } finally {
    restore();
  }
  if (!billMm) return;

  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  // The bill takes the default page; the token slip gets a named page so it
  // can have its own height.
  style.textContent = `
@page { size: 70mm ${billMm}mm; margin: 0; }
@page token-slip { size: 70mm ${tokenMm || billMm}mm; margin: 0; }
@media print {
  .customer-receipt { page: token-slip; }
}`;
}

/** Remove the per-print page sizes once the dialog closes. */
export function clearPrintPages() {
  document.getElementById(STYLE_ID)?.remove();
}
