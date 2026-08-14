import { registerSW } from 'virtual:pwa-register';

/**
 * The service worker that makes the app installable and playable offline.
 *
 * It registers in `prompt` mode, so a new build is fetched but never activated
 * on its own: `useAppUpdates` owns that moment, because a reload mid-game costs
 * the player their position. What this module adds is the step a plain
 * `location.reload()` cannot do once a worker is in charge — with the bundle
 * precached, reloading re-serves the *same* build, so the waiting worker has to
 * be activated first or the app can never move forward.
 */

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

let updateServiceWorker: UpdateServiceWorker | null = null;
let registration: ServiceWorkerRegistration | null = null;

export const registerServiceWorker = () => {
  if (updateServiceWorker) return;

  updateServiceWorker = registerSW({
    onRegisteredSW(_swScriptUrl, swRegistration) {
      registration = swRegistration ?? null;
    },
    onRegisterError(error: unknown) {
      // Registration fails on an insecure origin and with storage blocked. The
      // app works without a worker; it just is not installable or offline.
      console.warn('Service worker registration failed', error);
    },
  });
};

/** Test seam: drops the module's registration so a case starts from nothing. */
export const resetServiceWorkerForTests = () => {
  updateServiceWorker = null;
  registration = null;
};

const INSTALL_TIMEOUT_MS = 8000;

// `registration.update()` resolves as soon as the new worker starts installing,
// not when it is ready to take over. Waiting for it to leave `installing` is
// what keeps the `waiting` check below from concluding "no update staged" for a
// worker that was seconds away — the timeout bounds a download that stalls.
const waitForInstall = (worker: ServiceWorker): Promise<void> =>
  new Promise((resolve) => {
    if (worker.state !== 'installing') {
      resolve();
      return;
    }

    const finish = () => {
      worker.removeEventListener('statechange', onStateChange);
      globalThis.clearTimeout(timeoutId);
      resolve();
    };

    const onStateChange = () => {
      if (worker.state !== 'installing') finish();
    };

    const timeoutId = globalThis.setTimeout(finish, INSTALL_TIMEOUT_MS);
    worker.addEventListener('statechange', onStateChange);
  });

/**
 * Hands control to a newer service worker and reloads onto it.
 *
 * Resolves `false` when there is nothing to activate — no worker registered, or
 * the deploy's new build has not been fetched yet. The caller then reloads
 * normally, which is the right answer for a tab that has no worker at all.
 */
export const activateWaitingServiceWorker = async (): Promise<boolean> => {
  if (!registration || !updateServiceWorker) return false;

  await registration.update().catch((error: unknown) => {
    // Offline, or the deploy is momentarily unreachable. Whatever is already
    // waiting still counts, so fall through instead of giving up here.
    console.warn('Service worker update check failed', error);
  });

  if (registration.installing) await waitForInstall(registration.installing);
  if (!registration.waiting) return false;

  await updateServiceWorker(true);
  return true;
};
