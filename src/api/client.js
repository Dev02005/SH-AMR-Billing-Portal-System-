import axios from 'axios';
import { clearSession, getToken } from './session';

/**
 * The API origin.
 *
 * By default requests go to the same address the page was loaded from; the
 * Vite server forwards /api to the Flask API (vite.config.js).
 * That way a waiter's phone or a second till reaches the restaurant server,
 * not "localhost" on its own device. Set VITE_API_URL only when the API lives
 * on a different address from the web app (a trailing "/" is ignored).
 */
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

/** A menu picture the browser may load - a web link or a data: image - or null. */
export function assetUrl(path) {
  return typeof path === 'string' && /^(https?:|data:image\/)/i.test(path) ? path : null;
}

const client = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

// Attach the bearer token to every request instead of repeating the header at
// each call site (where it was regularly forgotten, producing silent 401s).
client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    // An expired or revoked token should drop the user at the login screen
    // rather than leaving the portal stuck on empty data.
    if (status === 401 && !error.config?.skipAuthRedirect) {
      clearSession();
      const portal = window.location.pathname.split('/')[1] || 'billing';
      if (!window.location.pathname.endsWith('/login')) {
        window.location.replace(`/${portal}/login`);
      }
    }

    return Promise.reject(error);
  },
);

/** Human-readable message from an axios error, for display in the UI. */
export function errorMessage(error, fallback = 'Something went wrong') {
  return (
    error?.response?.data?.error ||
    (error?.code === 'ECONNABORTED' ? 'The server took too long to respond' : null) ||
    (error?.message === 'Network Error' ? 'Cannot reach the server. Is it running?' : null) ||
    error?.message ||
    fallback
  );
}

export default client;
