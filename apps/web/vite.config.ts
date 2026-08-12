import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { workspaceVersionTag } from './version.ts';

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/backgammon/' : '/',
  define: {
    // Deploys override this with the release tag via VITE_APP_VERSION; this is
    // what dev servers and local previews report.
    __APP_VERSION__: JSON.stringify(workspaceVersionTag()),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}));
