import { createContext, useContext } from 'react';

/**
 * Kept apart from the provider component so the module exports only plain
 * values — a file mixing components and helpers breaks Fast Refresh.
 */
export const NotificationContext = createContext(() => {});

/** `const notify = useNotify(); notify('Bill saved', 'success')` */
export function useNotify() {
  return useContext(NotificationContext);
}
