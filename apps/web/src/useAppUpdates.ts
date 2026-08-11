import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_VERSION } from '@/lib/appVersion';
import { reloadApp } from '@/lib/reload';
import { fetchRuntimeConfig } from '@/lib/runtimeConfig';
import { compareVersions, normalizeVersion } from '@/lib/versionUtils';

/** How often an open tab polls the deploy for a newer build. */
export const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;
/** Collapses bursts of visibility/pageshow/online events into one request. */
export const RECHECK_THROTTLE_MS = 30 * 1000;
/**
 * sessionStorage survives a reload, so this records the version an automatic
 * reload was fired for. If that reload lands on the same build anyway — a stale
 * edge cache, a half-finished deploy — the tab shows the banner instead of
 * reloading again, which is what keeps a bad deploy from looping the app.
 */
export const APPLIED_UPDATE_STORAGE_KEY = 'backgammon:applied-update';
/** localStorage: the build the previous visit ran, for the "updated" notice. */
export const LAST_SEEN_VERSION_STORAGE_KEY = 'backgammon:last-seen-version';

// Storage throws outright in private-mode Safari and with cookies blocked.
// Every access degrades to "no memory of a previous run", which costs at most a
// duplicate notice — never a crash.
const readStorage = (storage: Storage | undefined, key: string): string | null => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const writeStorage = (storage: Storage | undefined, key: string, value: string) => {
  try {
    storage?.setItem(key, value);
  } catch {
    // Nothing to do: the guard is an optimization, not a correctness requirement.
  }
};

interface DeployedVersions {
  latestVersion: string | null;
  minimumSupportedVersion: string | null;
  lastCheckAt: number | null;
}

export interface AppUpdates {
  /** Version this tab is running. */
  currentVersion: string;
  /** Newest version the deploy advertises, or null before the first check. */
  latestVersion: string | null;
  /** Oldest version the deploy still supports, or null when none is set. */
  minimumSupportedVersion: string | null;
  /** A newer build is deployed. */
  isUpdateAvailable: boolean;
  /** This build is below the supported floor and must reload to keep running. */
  isUpdateRequired: boolean;
  /** A version check is in flight. */
  isChecking: boolean;
  /** Timestamp of the last completed check, for the "checked just now" line. */
  lastCheckAt: number | null;
  /** Set when this load came up on a newer version than the previous one. */
  justUpdatedFrom: string | null;
  /** Show the non-blocking update banner (pending, not required, not dismissed). */
  shouldShowUpdateBanner: boolean;
  /** Manual check; resolves once the result has been applied to the state. */
  checkNow: () => Promise<void>;
  /** Manual update: reloads onto the deployed build. */
  applyUpdate: () => void;
  /** Hide the banner until a version newer than this one shows up. */
  dismissUpdate: () => void;
  /** Hide the "updated to …" notice. */
  dismissJustUpdated: () => void;
}

export interface UseAppUpdatesOptions {
  /**
   * Hold off the automatic reload while a reload would throw something away — a
   * game in progress, a room the player would be dropped from. The update is
   * applied as soon as this clears (game over, back to the menu), or right away
   * if the player presses the update button.
   */
  deferUpdate?: boolean;
}

/**
 * Keeps a running tab in step with what is deployed.
 *
 * The tab polls `runtime-config.json` (written by the Deploy workflow with the
 * released tag) on an interval and whenever it comes back to the foreground.
 * When a newer version shows up it reloads by itself at a moment where nothing
 * is lost; the update button forces that same reload immediately. A version
 * below `minimumSupportedVersion` cannot keep playing and is reloaded — or
 * blocked behind the overlay until the player accepts, if a game is running.
 */
export const useAppUpdates = ({ deferUpdate = false }: UseAppUpdatesOptions = {}): AppUpdates => {
  const [deployed, setDeployed] = useState<DeployedVersions>({
    latestVersion: null,
    minimumSupportedVersion: null,
    lastCheckAt: null,
  });
  const [isChecking, setIsChecking] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [justUpdatedFrom, setJustUpdatedFrom] = useState<string | null>(() => {
    const lastSeen = readStorage(globalThis.localStorage, LAST_SEEN_VERSION_STORAGE_KEY);
    return lastSeen && compareVersions(lastSeen, APP_VERSION) < 0 ? lastSeen : null;
  });
  const lastCheckAtRef = useRef(0);
  const checkInFlightRef = useRef<Promise<void> | null>(null);

  const checkNow = useCallback(async (): Promise<void> => {
    // Share one request between the interval, the focus listeners and the
    // button rather than stacking round-trips.
    if (checkInFlightRef.current) return checkInFlightRef.current;

    // Stamp before awaiting so the throttle below measures from the start of
    // the in-flight check, not from the last completed one.
    lastCheckAtRef.current = Date.now();
    setIsChecking(true);

    const check = fetchRuntimeConfig()
      .then((config) => {
        // A failed fetch leaves the previous answer standing: offline is not
        // evidence that this build is current.
        if (!config) return;

        setDeployed({
          latestVersion: normalizeVersion(config.appVersion),
          minimumSupportedVersion: normalizeVersion(config.minimumSupportedVersion),
          lastCheckAt: Date.now(),
        });
      })
      .finally(() => {
        setIsChecking(false);
        checkInFlightRef.current = null;
      });

    checkInFlightRef.current = check;
    return check;
  }, []);

  useEffect(() => {
    void checkNow();

    const intervalId = globalThis.setInterval(() => void checkNow(), UPDATE_CHECK_INTERVAL_MS);
    return () => globalThis.clearInterval(intervalId);
  }, [checkNow]);

  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState !== 'visible') return;
      // Phones fire visibility, pageshow and online together when the app comes
      // back; one check per window is enough.
      if (Date.now() - lastCheckAtRef.current < RECHECK_THROTTLE_MS) return;
      void checkNow();
    };

    document.addEventListener('visibilitychange', recheck);
    globalThis.addEventListener('pageshow', recheck);
    globalThis.addEventListener('online', recheck);

    return () => {
      document.removeEventListener('visibilitychange', recheck);
      globalThis.removeEventListener('pageshow', recheck);
      globalThis.removeEventListener('online', recheck);
    };
  }, [checkNow]);

  // Remember the build this visit ran, so the next one can tell it just moved up.
  useEffect(() => {
    writeStorage(globalThis.localStorage, LAST_SEEN_VERSION_STORAGE_KEY, APP_VERSION);
  }, []);

  const isUpdateAvailable = compareVersions(APP_VERSION, deployed.latestVersion) < 0;
  const isUpdateRequired = compareVersions(APP_VERSION, deployed.minimumSupportedVersion) < 0;
  // What an apply is aiming at. The floor stands in when it is above the
  // advertised version — a config that requires more than it offers is
  // contradictory, and reloading towards the higher of the two is the safe read.
  const targetVersion =
    compareVersions(deployed.latestVersion, deployed.minimumSupportedVersion) < 0
      ? deployed.minimumSupportedVersion
      : deployed.latestVersion;
  const isUpdatePending = isUpdateAvailable || isUpdateRequired;

  const applyUpdate = useCallback(() => {
    // The player asked for this one, so it goes through even if the automatic
    // path already spent its single attempt on this version.
    if (targetVersion) {
      writeStorage(globalThis.sessionStorage, APPLIED_UPDATE_STORAGE_KEY, targetVersion);
    }
    reloadApp();
  }, [targetVersion]);

  useEffect(() => {
    if (!isUpdatePending || !targetVersion) return;
    // Mid-game: the update waits. A required one keeps the overlay up until the
    // player accepts, so nobody plays on below the floor.
    if (deferUpdate) return;
    if (readStorage(globalThis.sessionStorage, APPLIED_UPDATE_STORAGE_KEY) === targetVersion) return;

    writeStorage(globalThis.sessionStorage, APPLIED_UPDATE_STORAGE_KEY, targetVersion);
    reloadApp();
  }, [deferUpdate, isUpdatePending, targetVersion]);

  return {
    currentVersion: APP_VERSION,
    latestVersion: deployed.latestVersion,
    minimumSupportedVersion: deployed.minimumSupportedVersion,
    isUpdateAvailable,
    isUpdateRequired,
    isChecking,
    lastCheckAt: deployed.lastCheckAt,
    justUpdatedFrom,
    shouldShowUpdateBanner: isUpdatePending && !isUpdateRequired && dismissedVersion !== targetVersion,
    checkNow,
    applyUpdate,
    dismissUpdate: useCallback(() => setDismissedVersion(targetVersion), [targetVersion]),
    dismissJustUpdated: useCallback(() => setJustUpdatedFrom(null), []),
  };
};
