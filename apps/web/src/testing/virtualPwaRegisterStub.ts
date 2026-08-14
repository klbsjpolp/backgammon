/**
 * Stands in for `virtual:pwa-register`, which only exists once vite-plugin-pwa
 * has run. Vitest aliases this file in its place so `lib/serviceWorker.ts` can
 * be imported — and its callbacks captured with `vi.mock` — outside a build.
 */

interface RegisterSWOptions {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisteredSW?: (swScriptUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: unknown) => void;
}

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

export const registerSW: (options?: RegisterSWOptions) => UpdateServiceWorker = () => async () => {};
