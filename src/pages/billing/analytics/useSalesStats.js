import { useMemo } from 'react';

/** Local midnight for a `yyyy-mm-dd` string or Date. */
function startOfDay(value) {
  const date = value ? new Date(value) : new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = startOfDay(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function inRange(bill, from, to) {
  const time = new Date(bill.createdAt).getTime();
  return time >= from.getTime() && time <= to.getTime();
}

/**
 * Derive every figure the analytics page shows from one bill list.
 *
 * Kept apart from the component so the arithmetic is readable on its own and
 * runs once per input change instead of on every render.
 */
export default function useSalesStats(bills, { mode, customDate, rangeFrom, rangeTo }) {
  return useMemo(() => {
    const active = bills.filter((bill) => !bill.deleted);

    const today = startOfDay();
    const weekStart = startOfDay();
    weekStart.setDate(today.getDate() - today.getDay());
    const monthStart = startOfDay();
    monthStart.setDate(1);

    let from = today;
    let to = endOfDay();

    if (mode === 'week') from = weekStart;
    else if (mode === 'month') from = monthStart;
    else if (mode === 'custom' && customDate) { from = startOfDay(customDate); to = endOfDay(customDate); }
    else if (mode === 'range' && rangeFrom && rangeTo) { from = startOfDay(rangeFrom); to = endOfDay(rangeTo); }

    const selected = active.filter((bill) => inRange(bill, from, to));

    const revenue = selected.reduce((sum, bill) => sum + (bill.total || 0), 0);
    const average = selected.length ? Math.round(revenue / selected.length) : 0;

    // Busiest hour of the selected period, by bill count.
    const hours = new Map();
    selected.forEach((bill) => {
      const hour = new Date(bill.createdAt).getHours();
      hours.set(hour, (hours.get(hour) || 0) + 1);
    });
    const busiest = [...hours.entries()].sort((a, b) => b[1] - a[1])[0];
    const peakHour = busiest ? `${String(busiest[0]).padStart(2, '0')}:00` : 'N/A';

    const itemTotals = new Map();
    const paymentTotals = new Map();
    const orderTypeTotals = new Map();

    selected.forEach((bill) => {
      const payment = bill.payment || 'Unknown';
      paymentTotals.set(payment, (paymentTotals.get(payment) || 0) + (bill.total || 0));

      const orderType = bill.orderType || 'Unknown';
      const typeEntry = orderTypeTotals.get(orderType) || { count: 0, total: 0 };
      typeEntry.count += 1;
      typeEntry.total += bill.total || 0;
      orderTypeTotals.set(orderType, typeEntry);

      (bill.items || []).forEach((item) => {
        const entry = itemTotals.get(item.name) || { qty: 0, total: 0 };
        entry.qty += item.qty || 1;
        entry.total += (item.price || 0) * (item.qty || 1);
        itemTotals.set(item.name, entry);
      });
    });

    const itemRows = [...itemTotals.entries()].map(([name, d]) => ({ name, qty: d.qty, total: d.total }));

    // Seven-day trend always ends today, regardless of the selected filter.
    const trend = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = startOfDay();
      day.setDate(day.getDate() - offset);
      const dayEnd = endOfDay(day);
      const dayBills = active.filter((bill) => inRange(bill, day, dayEnd));
      trend.push({
        label: day.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        total: dayBills.reduce((sum, bill) => sum + (bill.total || 0), 0),
      });
    }

    const sumOf = (list) => list.reduce((sum, bill) => sum + (bill.total || 0), 0);
    const weekBills = active.filter((bill) => inRange(bill, weekStart, endOfDay()));
    const monthBills = active.filter((bill) => inRange(bill, monthStart, endOfDay()));

    return {
      selected,
      revenue,
      billCount: selected.length,
      average,
      peakHour,
      weekRevenue: sumOf(weekBills),
      monthRevenue: sumOf(monthBills),
      topItems: [...itemRows].sort((a, b) => b.qty - a.qty).slice(0, 10),
      itemRows,
      orderTypeRows: [...orderTypeTotals.entries()].map(([type, d]) => ({ type, ...d })),
      paymentTotals: Object.fromEntries(paymentTotals),
      trend,
    };
  }, [bills, mode, customDate, rangeFrom, rangeTo]);
}
