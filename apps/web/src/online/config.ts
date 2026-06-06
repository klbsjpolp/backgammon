const normalize = (url: string | undefined | null): string | null => {
  const value = url?.trim();
  return value ? value.replace(/\/$/, '') : null;
};

/**
 * Base URL of the shared realtime-infra server. Configured per deployment via
 * `VITE_BACKGAMMON_API_URL` (point it at the same server skip-bo uses).
 */
export const getApiBaseUrl = (): string => {
  const env = normalize(import.meta.env.VITE_BACKGAMMON_API_URL as string | undefined);
  if (!env) {
    throw new Error('Online play is not configured. Set VITE_BACKGAMMON_API_URL to the realtime server URL.');
  }
  return env;
};
