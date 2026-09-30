import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/**
 * Link previews (WhatsApp, Facebook, X …) need the full address of the site
 * and of its picture. On Vercel the production address is known at build
 * time; elsewhere set SITE_URL (e.g. https://pos.example.com). Without either
 * the two tags are simply left out.
 */
function linkPreview(siteUrl) {
  return {
    name: 'link-preview',
    transformIndexHtml() {
      if (!siteUrl) return [];
      return [
        { tag: 'meta', attrs: { property: 'og:url', content: `${siteUrl}/` }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:image', content: `${siteUrl}/icons/logo-512.png` }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:image:alt', content: 'S&H Arabian Mandi Restaurant logo' }, injectTo: 'head' },
      ];
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '');
  const apiTarget = env.VITE_API_URL || 'http://localhost:5000';
  const vercelUrl = env.VERCEL_PROJECT_PRODUCTION_URL;
  const siteUrl = (env.SITE_URL || (vercelUrl ? `https://${vercelUrl}` : '')).replace(/\/+$/, '');

  return {
    plugins: [react(), linkPreview(siteUrl)],

    server: {
      // Proxy the API in development so the browser talks to one origin and
      // the portals work unchanged when the app is served from the backend.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },

    build: {
      // Chart.js and the router change far less often than the portal code;
      // splitting them lets the browser keep them cached across deploys.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('chart.js') || id.includes('react-chartjs-2')) return 'charts';
            if (id.includes('react') || id.includes('scheduler')) return 'react';
            return 'vendor';
          },
        },
      },
      chunkSizeWarningLimit: 700,
    },
  };
});
