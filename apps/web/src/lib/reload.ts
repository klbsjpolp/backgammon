/**
 * A reload re-fetches the document past the HTTP cache, so it is enough to pull
 * a new deploy in: the hashed asset URLs in the fresh HTML take care of the
 * rest. Isolated in its own module so tests can stub the navigation.
 */
export const reloadApp = () => {
  globalThis.location.reload();
};
