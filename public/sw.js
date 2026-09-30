/*
 * Service worker for the installable portals.
 *
 * Browsers only offer "Install app" for pages controlled by a service worker.
 * This one caches nothing - the tills must always show live orders - it only
 * answers a page load with a clear message when the server cannot be reached,
 * instead of the browser's own error page.
 */
const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>S&amp;H Arabian Mandi — offline</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0F120D;color:#E7EDDF;
font-family:system-ui,sans-serif;text-align:center;padding:24px}h1{color:#A3E635;font-size:22px}
button{margin-top:16px;padding:10px 22px;border:0;border-radius:8px;background:#A3E635;color:#0F120D;
font-weight:700;font-size:15px;cursor:pointer}</style></head><body><div>
<h1>Cannot reach the restaurant server</h1>
<p>Check that the server computer is on and connected to the network, then try again.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_PAGE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
    ),
  );
});
