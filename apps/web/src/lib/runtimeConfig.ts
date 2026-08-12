/**
 * Values the deploy publishes next to the bundle, read at runtime instead of
 * baked in — that is what lets a *running* tab notice it is out of date. The
 * file is rewritten by the Deploy workflow on every release.
 */
export interface RuntimeConfig {
  /** Release tag of the build currently deployed, e.g. `v1.2.3`. */
  appVersion?: string;
  /** Oldest tag still allowed to run; older clients are forced to reload. */
  minimumSupportedVersion?: string;
}

const RUNTIME_CONFIG_URL = `${import.meta.env.BASE_URL}runtime-config.json`;

/**
 * Fetches the deployed config, bypassing the HTTP cache so a poll can actually
 * see a new deploy. Returns null on any failure (offline, 404 on a preview
 * build, malformed JSON) — the caller keeps whatever it last knew rather than
 * concluding the app is up to date.
 */
const asVersion = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

export const fetchRuntimeConfig = async (): Promise<RuntimeConfig | null> => {
  try {
    const response = await fetch(RUNTIME_CONFIG_URL, { cache: 'no-store' });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object') return null;

    // The fields are read, compared and rendered as strings. Casting the parsed
    // JSON straight to `RuntimeConfig` meant a file that answered with a number
    // — a hand-edited deploy, something else served at this path — threw inside
    // the caller's `.then` and came out as an unhandled rejection rather than as
    // the "could not check" this function exists to return.
    const { appVersion, minimumSupportedVersion } = payload as Record<string, unknown>;
    return {
      appVersion: asVersion(appVersion),
      minimumSupportedVersion: asVersion(minimumSupportedVersion),
    };
  } catch {
    return null;
  }
};
