import { registerSW } from 'virtual:pwa-register';

/**
 * The service worker that makes the app installable and playable offline.
 *
 * It registers in `prompt` mode, so a new build is fetched but never activated
 * on its own: `useAppUpdates` owns that moment, because a reload mid-game costs
 * the player their position. What this module adds is the step a plain
 * `location.reload()` cannot do once a worker is in charge — with the bundle
 * precached, reloading re-serves the *same* build, so the waiting worker has to
 * take control first or the app can never move forward.
 *
 * The handover is done here rather than through vite-plugin-pwa's
 * `updateServiceWorker`, which looks like it does exactly this and does not. It
 * ignores its `reloadPage` argument outright and only posts skip-waiting; the
 * reload comes from a `controlling` listener the plugin attaches when workbox
 * fires `waiting` — and workbox only fires that 200ms after `installed`, from a
 * timer it clears the moment the worker reaches `activating`. Skip-waiting
 * inside that window — precisely "the player pressed Update shortly after
 * opening the tab" — therefore activates the new worker, cancels the event, and
 * reloads nothing. So the message goes straight to the waiting worker, and the
 * reload is ours to make once control has actually changed.
 */

let registered = false;
let registration: ServiceWorkerRegistration | null = null;

export const registerServiceWorker = () => {
  if (registered) return;
  registered = true;

  registerSW({
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
  registered = false;
  registration = null;
};

/** Bounds `registration.update()`, which can hang rather than fail. */
const UPDATE_CHECK_TIMEOUT_MS = 5000;
const INSTALL_TIMEOUT_MS = 8000;
/** How long the new worker gets to take control after skip-waiting. */
const CONTROLLER_CHANGE_TIMEOUT_MS = 3000;

/**
 * Settles with the promise or on the deadline, and never rejects.
 *
 * A hung update check is not a failed one: a captive portal or a proxy holding
 * the connection open leaves `update()` pending rather than rejecting, and
 * awaiting it unbounded means the Update button does nothing at all — no reload,
 * no error, no feedback. Whatever is already staged still counts.
 */
const withDeadline = async (promise: Promise<unknown>, timeoutMs: number): Promise<void> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  await Promise.race([
    promise.catch((error: unknown) => {
      // Offline, or the deploy is momentarily unreachable.
      console.warn('Service worker update check failed', error);
    }),
    new Promise<void>((resolve) => {
      timeoutId = globalThis.setTimeout(resolve, timeoutMs);
    }),
  ]);

  globalThis.clearTimeout(timeoutId);
};

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

// Must be listening *before* skip-waiting is posted: the worker can take control
// immediately, and a listener attached afterwards would wait for an event that
// has already fired. The deadline keeps a worker that never activates from
// stranding the caller — reloading anyway is the safer of the two answers.
const waitForControllerChange = (container: ServiceWorkerContainer): Promise<void> =>
  new Promise((resolve) => {
    const finish = () => {
      container.removeEventListener('controllerchange', finish);
      globalThis.clearTimeout(timeoutId);
      resolve();
    };

    const timeoutId = globalThis.setTimeout(finish, CONTROLLER_CHANGE_TIMEOUT_MS);
    container.addEventListener('controllerchange', finish);
  });

// The module-local registration is only set once `onRegisteredSW` has fired, and
// the plugin defers `wb.register()` to `window.load`. A version check that lands
// before that would otherwise read as "this browser has no worker" — and reload
// straight back into the precached build it was trying to leave.
const getRegistration = async (container: ServiceWorkerContainer): Promise<ServiceWorkerRegistration | null> => {
  if (registration) return registration;

  try {
    return (await container.getRegistration()) ?? null;
  } catch {
    return null;
  }
};

/**
 * Hands control to a newer service worker and reloads onto it.
 *
 * Resolves `true` only once it has reloaded, so the caller can trust the page is
 * on its way out. `false` means there was nothing to activate — no worker in
 * this browser, or a build the deploy has not staged yet — and the caller's own
 * plain reload is then the right answer.
 */
export const activateWaitingServiceWorker = async (): Promise<boolean> => {
  const container = globalThis.navigator?.serviceWorker;
  if (!container) return false;

  const swRegistration = await getRegistration(container);
  if (!swRegistration) return false;

  await withDeadline(swRegistration.update(), UPDATE_CHECK_TIMEOUT_MS);

  if (swRegistration.installing) await waitForInstall(swRegistration.installing);

  const waiting = swRegistration.waiting;
  if (!waiting) return false;

  const controllerChanged = waitForControllerChange(container);
  waiting.postMessage({ type: 'SKIP_WAITING' });
  await controllerChanged;

  globalThis.location.reload();
  return true;
};
