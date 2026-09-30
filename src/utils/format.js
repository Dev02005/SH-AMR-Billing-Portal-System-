/** Shared display formatting. */

const RUPEES = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** `1234.5` -> `"₹1,234.5"` */
export function rupees(value) {
  return `₹${RUPEES.format(Number(value) || 0)}`;
}

export function dateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-IN');
}

export function clockTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/** Whole minutes since `value`, or null if it is not a usable date. */
export function minutesSince(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

/**
 * Compact age for a kitchen ticket: "8 min", "2h 10m", "3d".
 *
 * Plain minutes are unreadable once a ticket is stale - a row left over from
 * a previous service rendered as "266979 min".
 */
export function shortAge(minutes) {
  if (minutes === null || minutes === undefined) return '';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

/** `yyyy-mm-dd` in local time - `toISOString` would shift the day for IST. */
export function toDateInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

