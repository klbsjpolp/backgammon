const normalize = (url: string | undefined | null): string | null => {
  const value = url?.trim();
  return value ? value.replace(/\/$/, '') : null;
};

/**
 * Base URL of the shared realtime-infra server. Configured per deployment via
 * `VITE_BACKGAMMON_API_URL` (point it at the same server skip-bo uses).
 */
export const getApiBaseUrl = (): string => {
  const env = normalize(import.meta.env.VITE_BACKGAMMON_API_URL);
  if (!env) {
    // Player-visible: the banner shows whatever this says, so it is written for
    // the person in front of the screen and not only for whoever deploys.
    throw new Error("Le jeu en ligne n'est pas configuré. Renseignez VITE_BACKGAMMON_API_URL avec l'URL du serveur.");
  }
  return env;
};
