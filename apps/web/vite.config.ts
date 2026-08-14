import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';
import { workspaceVersionTag } from './version.ts';

export default defineConfig(({ mode }) => {
  const base = mode === 'production' ? '/backgammon/' : '/';

  return {
    base,
    define: {
      // Deploys override this with the release tag via VITE_APP_VERSION; this is
      // what dev servers and local previews report.
      __APP_VERSION__: JSON.stringify(workspaceVersionTag()),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // The app already decides when to update — it holds a new build back
        // until nothing is mid-game (see useAppUpdates). `prompt` is the only
        // mode that leaves that decision to us; `autoUpdate` would activate the
        // new worker and reload out from under a player's turn.
        injectRegister: null,
        registerType: 'prompt',
        manifest: {
          name: 'Backgammon',
          short_name: 'Backgammon',
          description: 'Play backgammon against the computer, or online against a friend.',
          // The classic theme's canvas, matching the pre-paint script's default
          // in index.html. A remembered theme repaints the meta tag on load; the
          // manifest colour is what the launcher and the splash screen use.
          theme_color: '#03130d',
          background_color: '#03130d',
          display: 'standalone',
          orientation: 'any',
          lang: 'en',
          // Both are relative to the deploy, which is a project path on GitHub
          // Pages rather than the origin root.
          start_url: base,
          scope: base,
          icons: [
            { src: 'manifest-icon-192.maskable.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'manifest-icon-192.maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: 'manifest-icon-512.maskable.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'manifest-icon-512.maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
          navigateFallback: `${base}index.html`,
          // `runtime-config.json` is deliberately absent from both the precache
          // globs and any runtime cache: it is how a running tab learns a newer
          // build is out, so it has to come from the network every time.
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
