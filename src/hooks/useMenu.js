import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCategories, fetchMenuItems } from '../api';
import { errorMessage } from '../api/client';

/**
 * Load the menu and its categories together.
 *
 * Categories come from the database rather than being derived from the items,
 * so an empty category still gets a tab and the admin can see where new items
 * will land.
 */
export default function useMenu() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [menuItems, dbCategories] = await Promise.all([fetchMenuItems(), fetchCategories()]);

      // Union of declared categories and any category an item actually uses,
      // so an item filed under a deleted category is still reachable.
      const names = new Set(dbCategories.map((c) => String(c).trim().toLowerCase()));
      menuItems.forEach((item) => names.add(item.category));
      const ordered = [...names].filter(Boolean).sort();

      setItems(menuItems);
      setCategories(ordered);
      setActiveCategory((current) => (current && ordered.includes(current) ? current : ordered[0] || ''));
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load the menu'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keep the portal in step when the admin adds or edits items elsewhere.
  useEffect(() => {
    const handler = () => load();
    window.addEventListener('menu:refresh', handler);
    return () => window.removeEventListener('menu:refresh', handler);
  }, [load]);

  const byCategory = useMemo(() => {
    const groups = Object.fromEntries(categories.map((c) => [c, []]));
    items.forEach((item) => {
      (groups[item.category] ||= []).push(item);
    });
    return groups;
  }, [items, categories]);

  return {
    items, categories, byCategory, activeCategory, setActiveCategory,
    loading, error, reload: load,
  };
}
