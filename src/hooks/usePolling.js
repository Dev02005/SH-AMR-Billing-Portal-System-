import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client';

/**
 * Run an async fetcher on mount and then on an interval.
 *
 * Used by the kitchen board, the table plan and the print queue, which need
 * to see new orders without the staff reloading the page. A ref guards
 * against a slow response landing after the component has unmounted.
 *
 * Polls run only while the page is on screen: a minimised window, another tab
 * or a phone with its screen off asks nothing, and catches up the moment it is
 * visible again. Every poll is a request the host counts (and bills).
 */
export default function usePolling(fetcher, intervalMs = 0, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const inFlight = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableFetcher = useCallback(fetcher, deps);

  const refresh = useCallback(
    async ({ silent = false } = {}) => {
      // Skip a tick rather than stacking requests when the server is slow.
      if (inFlight.current) return;
      inFlight.current = true;
      if (!silent) setLoading(true);
      try {
        const result = await stableFetcher();
        if (mounted.current) {
          setData(result);
          setError('');
        }
      } catch (err) {
        if (mounted.current) setError(errorMessage(err));
      } finally {
        inFlight.current = false;
        if (mounted.current) setLoading(false);
      }
    },
    [stableFetcher],
  );

  useEffect(() => {
    mounted.current = true;
    refresh();

    if (!intervalMs) return () => { mounted.current = false; };

    const pollIfVisible = () => {
      if (document.visibilityState === 'visible') refresh({ silent: true });
    };
    const id = setInterval(pollIfVisible, intervalMs);
    document.addEventListener('visibilitychange', pollIfVisible);
    return () => {
      mounted.current = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', pollIfVisible);
    };
  }, [refresh, intervalMs]);

  return { data, loading, error, refresh, setData };
}
