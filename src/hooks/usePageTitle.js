import { useEffect } from 'react';
import { RESTAURANT } from '../config/brand.js';

/**
 * The browser tab title for the page on screen, e.g.
 * "Kitchen Portal · S&H Arabian Mandi Restaurant" - so tabs, bookmarks,
 * history and installed apps say which portal they are.
 */
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${RESTAURANT.title}` : RESTAURANT.title;
  }, [title]);
}
