import { useCallback, useState } from 'react';
import { UpdateBanner, UpdateRequiredOverlay, UpdatedNotice, VersionLine } from '@/components/AppUpdates';
import { DiceSlotContext } from '@/components/diceSlot';
import { LocalPanel } from '@/components/LocalPanel';
import { OnlinePanel } from '@/components/OnlinePanel';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { cn } from '@/lib/cn';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useAppUpdates } from '@/useAppUpdates';

type Mode = 'local' | 'online';

export const App = () => {
  const [mode, setMode] = useState<Mode>('local');
  const [isOnlineBusy, setIsOnlineBusy] = useState(false);
  // A callback ref in state, not a `useRef`: the board renders into this element,
  // so the render that fills it has to be the one that follows the header mounting.
  const [diceSlot, setDiceSlot] = useState<HTMLElement | null>(null);

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
    <ThemeProvider>
      <DiceSlotContext.Provider value={diceSlot}>
        <div
          className={cn(
            'mx-auto flex min-h-full w-full max-w-3xl flex-col items-center gap-4 px-4 py-4 text-fg',
            // Keep the bottom row of controls clear of the home indicator / gesture bar.
            'pb-[calc(1rem+env(safe-area-inset-bottom))]',
            // The page is `viewport-fit=cover`, so in landscape the notch eats into
            // 100vw. It never used to matter — nothing came near the edge — but the
            // board now claims the width it is given, and would claim that too.
            'pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))]',
            // Every gap here is height the board does not get: on a phone the page
            // is scaled around the board, not the other way round.
            'max-sm:gap-2 max-sm:py-2',
            'compact:max-w-none compact:gap-1 compact:py-1',
          )}
        >
          {/*
           * Phones put the title, the dice and both switches on one line, and this
           * row must never become two: the portrait board budgets a fixed 18.5rem
           * of page chrome in `index.css`, so a second row is ~36px the board never
           * gets back and the controls under it fall past the fold.
           *
           * Rather than tune the widths until they happen to fit — which depends on
           * the system font's metrics, so it can only ever be true of the phones you
           * measured — the row is nowrap and the title is the part that gives. It
           * needs `min-w-0` to be allowed to shrink at all (a flex item will not go
           * below its content otherwise), and then it ellipsises. Losing the tail of
           * a heading the browser tab already shows beats losing the board.
           */}
          <div
            className={cn(
              'flex w-full flex-col items-center gap-3',
              'max-sm:flex-row max-sm:justify-between max-sm:gap-2',
              'compact:flex-row compact:justify-between compact:gap-2',
            )}
          >
            <header className="flex min-w-0 items-center gap-3 max-sm:gap-2 compact:gap-2">
              <h1 className="min-w-0 truncate text-3xl font-bold tracking-tight text-heading max-sm:text-base compact:text-base">
                Backgammon
              </h1>

              {/*
               * Where the board portals its dice. Anywhere else on the page they are
               * a row or a strip that only exists to hold them, and on a phone that
               * comes straight out of the board; here they ride in a row the layout
               * already has.
               *
               * The width is reserved rather than measured so that a roll landing
               * does not re-truncate the title under the player's eyes — it fits the
               * two dice of an ordinary roll, and doubles (four) borrow a little more
               * from the title for the length of the turn.
               *
               * The pip glyphs carry a lot of built-in padding — the drawn die is
               * appreciably smaller than its font size — so on a phone they are set
               * to about the height of the row itself rather than to the title's
               * size, which left them a smudge. `leading-none` (in `Dice`) keeps the
               * taller text from growing the row: the buttons opposite still set its
               * height, so the board's height budget below is untouched.
               */}
              <div
                ref={setDiceSlot}
                className={cn(
                  'flex min-w-14 shrink-0 items-center justify-center text-2xl',
                  'max-sm:min-w-16 max-sm:text-3xl compact:min-w-16 compact:text-3xl',
                )}
              />
            </header>

            {/* Never the item that gives: without `shrink-0` the row stays one line
              but the mode buttons wrap their own labels instead, which costs the
              same height. */}
            <div className="flex shrink-0 items-center gap-2">
              <div className="inline-flex rounded-lg bg-surface p-1 text-sm">
                {(['local', 'online'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      'touch-manipulation rounded-md px-4 py-1.5 font-semibold capitalize transition select-none',
                      'max-sm:px-2',
                      'compact:px-2 compact:py-0.5',
                      mode === m ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg',
                    )}
                  >
                    {m === 'local' ? 'vs AI' : 'online'}
                  </button>
                ))}
              </div>

              <ThemeSwitcher />
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

          {/* A landscape phone has no height to give a footer; the same line is one
            rotation away, and an update that matters still banners itself. */}
          <div className="w-full compact:hidden">
            <VersionLine
              version={updates.currentVersion}
              isUpdateAvailable={updates.isUpdateAvailable}
              isChecking={updates.isChecking}
              onCheck={updates.checkNow}
              onUpdate={updates.applyUpdate}
            />
          </div>

          {updates.isUpdateRequired && updates.minimumSupportedVersion && (
            <UpdateRequiredOverlay
              currentVersion={updates.currentVersion}
              minimumVersion={updates.minimumSupportedVersion}
              latestVersion={updates.latestVersion}
              onUpdate={updates.applyUpdate}
            />
          )}
        </div>
      </DiceSlotContext.Provider>
    </ThemeProvider>
  );
};
