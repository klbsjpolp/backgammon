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
export const fetchRuntimeConfig = async (): Promise<RuntimeConfig | null> => {
  try {
    const response = await fetch(RUNTIME_CONFIG_URL, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as RuntimeConfig;
  } catch {
    return null;
  }
};
