import { useCallback, useState } from 'react';
import { UpdateBanner, UpdateRequiredOverlay, UpdatedNotice, VersionLine } from '@/components/AppUpdates';
import { LocalPanel } from '@/components/LocalPanel';
import { OnlinePanel } from '@/components/OnlinePanel';
import { cn } from '@/lib/cn';
import { useAppUpdates } from '@/useAppUpdates';

type Mode = 'local' | 'online';

export const App = () => {
  const [mode, setMode] = useState<Mode>('local');
  const [isOnlineBusy, setIsOnlineBusy] = useState(false);

  // A local game is always live on screen, so an automatic reload would throw it
  // away; online only has something to lose once a room is joined. Either way the
  // update lands on the next deliberate start — see `applyPendingUpdate`.
  const updates = useAppUpdates({ deferUpdate: mode === 'local' || isOnlineBusy });
  const { applyUpdate, isUpdateAvailable, isUpdateRequired } = updates;

  /**
   * Starting a game is a lossless moment: whatever a reload would have discarded
   * is being discarded anyway. Returns true when the reload is under way, so the
   * caller drops the start it was about to perform.
   */
  const applyPendingUpdate = useCallback((): boolean => {
    if (!isUpdateAvailable && !isUpdateRequired) return false;
    applyUpdate();
    return true;
  }, [applyUpdate, isUpdateAvailable, isUpdateRequired]);

  return (
    <div
      className={cn(
        'mx-auto flex min-h-full w-full max-w-3xl flex-col items-center gap-4 px-4 py-4 text-emerald-50',
        // Keep the bottom row of controls clear of the home indicator / gesture bar.
        'pb-[calc(1rem+env(safe-area-inset-bottom))]',
        'compact:max-w-none compact:gap-2 compact:py-2',
      )}
    >
      {/* Phones put the title and the mode switch on one line; there is height to save. */}
      <div
        className={cn(
          'flex w-full flex-col items-center gap-3',
          'max-sm:flex-row max-sm:justify-between max-sm:gap-2',
          'compact:flex-row compact:justify-between compact:gap-2',
        )}
      >
        <header className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-amber-300 max-sm:text-xl compact:text-xl">
            Backgammon
          </h1>
        </header>

        <div className="inline-flex rounded-lg bg-emerald-950/60 p-1 text-sm">
          {(['local', 'online'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'touch-manipulation rounded-md px-4 py-1.5 font-semibold capitalize transition select-none',
                mode === m ? 'bg-amber-500 text-stone-900' : 'text-emerald-200/70 hover:text-emerald-50',
              )}
            >
              {m === 'local' ? 'vs AI' : 'online'}
            </button>
          ))}
        </div>
      </div>

      {updates.justUpdatedFrom && (
        <UpdatedNotice
          version={updates.currentVersion}
          previousVersion={updates.justUpdatedFrom}
          onDismiss={updates.dismissJustUpdated}
        />
      )}

      {updates.shouldShowUpdateBanner && (
        <UpdateBanner
          version={updates.latestVersion}
          onUpdate={updates.applyUpdate}
          onDismiss={updates.dismissUpdate}
        />
      )}

      {mode === 'local' ? (
        <LocalPanel applyPendingUpdate={applyPendingUpdate} />
      ) : (
        <OnlinePanel applyPendingUpdate={applyPendingUpdate} onBusyChange={setIsOnlineBusy} />
      )}

      <VersionLine
        version={updates.currentVersion}
        isUpdateAvailable={updates.isUpdateAvailable}
        isChecking={updates.isChecking}
        onCheck={updates.checkNow}
        onUpdate={updates.applyUpdate}
      />

      {updates.isUpdateRequired && updates.minimumSupportedVersion && (
        <UpdateRequiredOverlay
          currentVersion={updates.currentVersion}
          minimumVersion={updates.minimumSupportedVersion}
          latestVersion={updates.latestVersion}
          onUpdate={updates.applyUpdate}
        />
      )}
    </div>
  );
};
