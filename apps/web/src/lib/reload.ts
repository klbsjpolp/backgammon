import { activateWaitingServiceWorker } from '@/lib/serviceWorker';

/**
 * A reload re-fetches the document past the HTTP cache, so it is enough to pull
 * a new deploy in: the hashed asset URLs in the fresh HTML take care of the
 * rest. Isolated in its own module so tests can stub the navigation.
 *
 * Once a service worker is installed that stops being true — the document comes
 * from the precache, and reloading serves the very build we are trying to leave.
 * So the waiting worker gets its turn first; `activateWaitingServiceWorker`
 * reloads once the new worker has control, and answers `false` only when there
 * was nothing to take over from — no worker in this browser, or nothing newer
 * staged — which is when the plain reload below is still the right move.
 */
export const reloadApp = () => {
  void activateWaitingServiceWorker()
    .catch((error: unknown) => {
      console.warn('Service worker activation failed', error);
      return false;
    })
    .then((activated) => {
      if (!activated) globalThis.location.reload();
    });
};
