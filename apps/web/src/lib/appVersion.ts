/**
 * The build's own version. Deploys inject the release tag as `VITE_APP_VERSION`;
 * `__APP_VERSION__` is the workspace version stamped in by Vite, which is what
 * dev builds and local previews report.
 */
export const APP_VERSION = import.meta.env.VITE_APP_VERSION?.trim() || __APP_VERSION__;
