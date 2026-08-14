import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspaceVersionTag } from './version.ts';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Mirrors the app build so the version the UI renders is a real one in tests.
  define: {
    __APP_VERSION__: JSON.stringify(workspaceVersionTag()),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
      // vite-plugin-pwa's virtual module has no existence outside a build.
      'virtual:pwa-register': path.resolve(dirname, './src/testing/virtualPwaRegisterStub.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/main.tsx'],
    },
  },
});
