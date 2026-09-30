import { useCallback, useMemo, useState } from 'react';

/**
 * The bill-building cart shared by the billing and server portals.
 *
 * Both dashboards previously carried their own near-identical copies of
 * add/increase/decrease/remove, each mutating the item objects inside the
 * state update (`newCart[name].qty += 1` on the existing object), which
 * mutates the previous state as well. This version replaces entries instead.
 */
export default function useCart() {
  const [items, setItems] = useState({});

  const addItem = useCallback((name, price) => {
    setItems((prev) => {
      const existing = prev[name];
      return {
        ...prev,
        [name]: existing ? { ...existing, qty: existing.qty + 1 } : { price: Number(price) || 0, qty: 1 },
      };
    });
  }, []);

  const increase = useCallback((name) => setItems((prev) => (
    prev[name] ? { ...prev, [name]: { ...prev[name], qty: prev[name].qty + 1 } } : prev
  )), []);

  const decrease = useCallback((name) => setItems((prev) => {
    const existing = prev[name];
    if (!existing) return prev;
    if (existing.qty <= 1) {
      const { [name]: _removed, ...rest } = prev;
      return rest;
    }
    return { ...prev, [name]: { ...existing, qty: existing.qty - 1 } };
  }), []);

  const remove = useCallback((name) => setItems((prev) => {
    const { [name]: _removed, ...rest } = prev;
    return rest;
  }), []);

  const clear = useCallback(() => setItems({}), []);

  const replace = useCallback((list = []) => {
    const next = {};
    list.forEach((item) => {
      const name = item.name;
      if (!name) return;
      const qty = Number(item.qty) || 1;
      next[name] = next[name]
        ? { ...next[name], qty: next[name].qty + qty }
        : { price: Number(item.price) || 0, qty };
    });
    setItems(next);
  }, []);

  const entries = useMemo(() => Object.entries(items), [items]);
  const subtotal = useMemo(
    () => entries.reduce((sum, [, item]) => sum + item.price * item.qty, 0),
    [entries],
  );
  const lines = useMemo(
    () => entries.map(([name, item]) => ({ name, price: item.price, qty: item.qty })),
    [entries],
  );

  return {
    items, entries, lines, subtotal,
    isEmpty: entries.length === 0,
    addItem, increase, decrease, remove, clear, replace,
  };
}
