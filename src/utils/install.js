/**
 * "Install app" for one portal.
 *
 * Where the browser supports it (Chrome / Edge, on the server computer or
 * over HTTPS) the portal installs as its own app: its own window, the
 * restaurant logo and its own name, opening on that portal and staying inside
 * it - installing Billing never brings in Server or Kitchen.
 *
 * Elsewhere browsers do not allow a one-tap install, so:
 *   - on a computer, a desktop shortcut to that one portal is downloaded;
 *   - on a phone or tablet, the page explains the browser's own
 *     "Add to Home screen" step (which uses the same logo).
 *
 * Once a portal is installed on this device the button hides. The browser
 * gives no direct "is it installed?" answer, so this remembers it per portal
 * (installed, opened as an app, or shortcut downloaded) and forgets it again
 * if the browser offers installation - which it only does when not installed.
 */
import { portalForPath } from '../config/portals';

const installedKey = (portal) => `installed:${portal.id}`;

function remember(portal, installed) {
  try {
    if (installed) localStorage.setItem(installedKey(portal), '1');
    else localStorage.removeItem(installedKey(portal));
  } catch {
    /* storage blocked: the button just stays visible */
  }
}

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());
const currentPortal = () => portalForPath(window.location.pathname);

/** True when this page is running as an installed app. */
function runningAsApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// Opened from the installed app: remember it for the browser tab too.
if (runningAsApp()) remember(currentPortal(), true);

// The browser offers installation once, early; keep the offer for the button.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  remember(currentPortal(), false); // an offer means it is not installed
  notify();
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  remember(currentPortal(), true);
  notify();
});

/** Whether the button should show for this portal on this device. */
export function installAvailable(portal) {
  if (runningAsApp()) return false;
  if (deferredPrompt) return true;
  try {
    return localStorage.getItem(installedKey(portal)) !== '1';
  } catch {
    return true;
  }
}

/** Re-render when the install offer arrives or is used. Returns an unsubscribe. */
export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function mobilePlatform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return null;
}

/** A Windows internet shortcut that opens this portal's login page. */
function downloadShortcut(portal) {
  const url = `${window.location.origin}${portal.path}/login`;
  const body = ['[InternetShortcut]', `URL=${url}`, ''].join('\r\n');
  const blob = new Blob([body], { type: 'application/octet-stream' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `S&H ${portal.name}.url`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/**
 * Install `portal`. Resolves to what happened: 'installed', 'dismissed',
 * 'shortcut', or 'android' / 'ios' when the page must explain the browser's
 * "Add to Home screen" step.
 */
export async function installPortal(portal) {
  if (deferredPrompt) {
    const prompt = deferredPrompt;
    deferredPrompt = null;
    notify();
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      remember(portal, true);
      notify();
      return 'installed';
    }
    return 'dismissed';
  }
  const platform = mobilePlatform();
  if (platform) return platform;
  downloadShortcut(portal);
  remember(portal, true);
  notify();
  return 'shortcut';
}

/** Service worker: required by browsers before they offer installation. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* installation just stays unavailable; the fallbacks still work */
    });
  });
}
