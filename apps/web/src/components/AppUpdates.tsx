import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { cn } from '@/lib/cn';

/** How long the footer confirms "up to date" after a manual check finds nothing. */
const UP_TO_DATE_FLASH_MS = 4000;
/** How long the post-update confirmation stays before it gets out of the way. */
const UPDATED_NOTICE_MS = 6000;

const smallButton =
  'min-h-0 rounded px-2 py-1 text-xs font-semibold text-stone-900 transition disabled:cursor-not-allowed disabled:opacity-50';

/**
 * The running version, with the manual half of the update flow next to it:
 * "Check for updates" when nothing is pending, "Update now" once something is.
 */
export const VersionLine = ({
  version,
  isUpdateAvailable,
  isChecking,
  onCheck,
  onUpdate,
}: {
  version: string;
  isUpdateAvailable: boolean;
  isChecking: boolean;
  onCheck: () => Promise<void>;
  onUpdate: () => void;
}) => {
  const [flashUpToDate, setFlashUpToDate] = useState(false);

  useEffect(() => {
    if (!flashUpToDate) return;
    const timeout = setTimeout(() => setFlashUpToDate(false), UP_TO_DATE_FLASH_MS);
    return () => clearTimeout(timeout);
  }, [flashUpToDate]);

  return (
    <footer className="flex w-full items-center justify-center gap-2 text-xs text-emerald-200/60">
      <span data-testid="app-version">Version {version}</span>
      {isUpdateAvailable ? (
        <Button onClick={onUpdate} className={cn(smallButton, 'bg-amber-500 hover:bg-amber-400')}>
          Update now
        </Button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              // The flash is about *this* click, so it is armed on the result of
              // this check rather than on any check the interval happens to run.
              void onCheck().then(() => setFlashUpToDate(true));
            }}
            disabled={isChecking}
            className={cn(
              'touch-manipulation rounded px-2 py-1 underline underline-offset-2 transition select-none',
              'hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {isChecking ? 'Checking…' : 'Check for updates'}
          </button>
          <span aria-live="polite" className="text-emerald-300/70">
            {flashUpToDate && !isChecking ? 'Up to date' : ''}
          </span>
        </>
      )}
    </footer>
  );
};

/**
 * Non-blocking notice that a newer build is deployed. It only appears while the
 * automatic reload is held back — mid-game — so it always comes with a way to
 * take the update right now or to leave it until the game ends.
 */
export const UpdateBanner = ({
  version,
  onUpdate,
  onDismiss,
}: {
  version: string | null;
  onUpdate: () => void;
  onDismiss: () => void;
}) => (
  <div
    data-testid="update-banner"
    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg bg-sky-950/70 px-4 py-2 text-sm text-sky-100"
  >
    <span>
      {version ? `Version ${version} is available` : 'An update is available'} — it installs when this game ends.
    </span>
    <span className="flex items-center gap-2">
      <Button onClick={onUpdate} className={cn(smallButton, 'bg-amber-500 hover:bg-amber-400')}>
        Update now
      </Button>
      <Button
        onClick={onDismiss}
        className={cn(smallButton, 'bg-transparent text-sky-100 underline underline-offset-2 hover:bg-sky-900/60')}
      >
        Later
      </Button>
    </span>
  </div>
);

/** Confirms the reload landed on the new build, then gets out of the way. */
export const UpdatedNotice = ({
  version,
  previousVersion,
  onDismiss,
}: {
  version: string;
  previousVersion: string;
  onDismiss: () => void;
}) => {
  useEffect(() => {
    const timeout = setTimeout(onDismiss, UPDATED_NOTICE_MS);
    return () => clearTimeout(timeout);
  }, [onDismiss]);

  return (
    <div
      data-testid="updated-notice"
      className="flex w-full items-center justify-between gap-2 rounded-lg bg-emerald-800/60 px-4 py-2 text-sm text-emerald-50"
    >
      <span>
        Updated to {version} <span className="text-emerald-200/70">(was {previousVersion})</span>
      </span>
      <Button
        onClick={onDismiss}
        className={cn(smallButton, 'bg-transparent text-emerald-50 underline underline-offset-2 hover:bg-emerald-700')}
      >
        Dismiss
      </Button>
    </div>
  );
};

/**
 * Shown when this build is below the deployed floor. It blocks play instead of
 * reloading under the player: the automatic reload is held while a game is on,
 * and this makes the choice explicit rather than throwing the game away.
 */
export const UpdateRequiredOverlay = ({
  currentVersion,
  minimumVersion,
  latestVersion,
  onUpdate,
}: {
  currentVersion: string;
  minimumVersion: string;
  latestVersion: string | null;
  onUpdate: () => void;
}) => (
  <div
    data-testid="update-required-overlay"
    className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/90 px-4 py-6 backdrop-blur-sm"
  >
    <section
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-required-title"
      aria-describedby="update-required-description"
      className="w-full max-w-md rounded-xl bg-emerald-900 p-6 text-emerald-50 shadow-xl ring-1 ring-emerald-700"
    >
      <h2 id="update-required-title" className="text-xl font-bold text-amber-300">
        Update required
      </h2>
      <p id="update-required-description" className="mt-2 text-sm text-emerald-100/90">
        This version is no longer supported. Reload to keep playing — a game in progress will be lost.
      </p>
      <dl className="mt-4 rounded-lg bg-emerald-950/60 p-3 text-sm text-emerald-200/80">
        <div className="flex justify-between gap-4">
          <dt>Running</dt>
          <dd className="tabular-nums">{currentVersion}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Minimum</dt>
          <dd className="tabular-nums">{minimumVersion}</dd>
        </div>
        {latestVersion && (
          <div className="flex justify-between gap-4">
            <dt>Available</dt>
            <dd className="tabular-nums">{latestVersion}</dd>
          </div>
        )}
      </dl>
      <div className="mt-5 flex justify-end">
        <Button onClick={onUpdate}>Reload now</Button>
      </div>
    </section>
  </div>
);
