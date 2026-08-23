import { useCallback, useState } from 'react';
import { UpdateBanner, UpdateRequiredOverlay, UpdatedNotice, VersionLine } from '@/components/AppUpdates';
import { FullscreenButton } from '@/components/FullscreenButton';
import { LocalPanel } from '@/components/LocalPanel';
import { OnlinePanel } from '@/components/OnlinePanel';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { FullscreenContext } from '@/fullscreen';
import { HeaderSlotContext } from '@/headerSlot';
import { cn } from '@/lib/cn';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useAppUpdates } from '@/useAppUpdates';
import { useFullscreen } from '@/useFullscreen';
import { useRoomyScreen } from '@/useRoomyScreen';

type Mode = 'local' | 'online';

export const App = () => {
  const [mode, setMode] = useState<Mode>('local');
  const [isOnlineBusy, setIsOnlineBusy] = useState(false);
  /*
   * The header lends the panels a slot for their abandon-the-game controls, but
   * only where the header row is a line of its own with room going spare — a
   * phone's is already one nowrap line that must never become two, and it is the
   * title that gives when it does.
   *
   * A callback ref into state rather than a `useRef`: the panel portals into this
   * node, and a ref set during commit does not re-render the consumer that has to
   * read it.
   */
  const isRoomy = useRoomyScreen();
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  /*
   * Read once, here, and handed down: fullscreen decides where two things are
   * *drawn* rather than how they look, and neither move is one CSS can make —
   * see `fullscreen.ts`.
   */
  const fullscreen = useFullscreen();
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

  /*
   * Drawn in the footer or in the header's third column — never in both.
   * Rendering it twice and hiding one with a media query would put a second
   * "Rechercher une mise à jour" in the accessible tree, which is the rule the
   * dice and the abandon buttons already follow.
   *
   * One *variable*, not one element across the move: the two positions differ,
   * so React rebuilds `VersionLine` on a fullscreen toggle and its "À jour"
   * flash is dropped if one is showing. That flash is two seconds of cosmetic
   * feedback about a check the player just ran by hand, so it is not worth
   * lifting state out of the component to preserve; the announcer that has to
   * survive a relocation is handled properly instead — see `TurnAnnouncer`.
   */
  const versionLine = (
    <VersionLine
      version={updates.currentVersion}
      isUpdateAvailable={updates.isUpdateAvailable}
      isChecking={updates.isChecking}
      onCheck={updates.checkNow}
      onUpdate={updates.applyUpdate}
    />
  );

  return (
    <ThemeProvider>
      <FullscreenContext.Provider value={fullscreen}>
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
            // Fullscreen leaves exactly one row outside the board — see the header
            // below, which takes the title and the version line onto the switches'
            // line — so the page's own gap is spent once rather than three times.
            'fullscreen:max-w-none fullscreen:gap-2 fullscreen:py-2',
          )}
        >
          {/*
           * Phones put the title and both switches on one line, and this row must
           * never become two: the portrait board budgets a fixed 18.5rem of page
           * chrome in `index.css`, so a second row is ~36px the board never gets
           * back and the controls under it fall past the fold.
           *
           * The French labels are wider than the English ones they replaced, which
           * spends the title's room rather than the board's — see below.
           *
           * Rather than tune the widths until they happen to fit — which depends on
           * the system font's metrics, so it can only ever be true of the phones you
           * measured — the row is nowrap and the title is the part that gives. It
           * needs `min-w-0` to be allowed to shrink at all (a flex item will not go
           * below its content otherwise), and then it ellipsises. Losing the tail of
           * a heading the browser tab already shows beats losing the board.
           *
           * Fullscreen makes the same row a three-column grid — title, switches,
           * version — because it is then the only thing outside the board, and the
           * two lines it absorbs are two lines the board gets. A grid rather than
           * `justify-between`, or the switches would only be centred on the page
           * when the title and the version happened to be the same width.
           */}
          <div
            className={cn(
              'flex w-full flex-col items-center gap-3',
              'max-sm:flex-row max-sm:justify-between max-sm:gap-2',
              'compact:flex-row compact:justify-between compact:gap-2',
              'fullscreen:grid fullscreen:grid-cols-[1fr_auto_1fr] fullscreen:items-center fullscreen:gap-3',
            )}
          >
            <header className="flex min-w-0 items-center fullscreen:justify-self-start">
              <h1 className="min-w-0 truncate text-3xl font-bold tracking-tight text-heading max-sm:text-base compact:text-base fullscreen:text-xl">
                Backgammon
              </h1>
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
                      'touch-manipulation rounded-md px-4 py-1.5 font-semibold transition select-none',
                      'max-sm:px-2',
                      'compact:px-2 compact:py-0.5',
                      mode === m ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg',
                    )}
                  >
                    {m === 'local' ? "Contre l'IA" : 'En ligne'}
                  </button>
                ))}
              </div>

              <ThemeSwitcher />
              <FullscreenButton />

              {/*
               * Last in the row, so the switches beside it keep their position when
               * a panel puts a button here, takes it away, or swaps its width for a
               * confirmation. Rendered only when it will be used: an empty flex
               * child still spends the row's `gap-2`.
               */}
              {isRoomy && <div ref={setHeaderSlot} className="flex items-center gap-2" />}
            </div>

            {/* Fullscreen's third column. `justify-self-end` also stops the `1fr`
              track stretching it, so the line stays its own width and the
              switches beside it stay on the page's centre. */}
            {fullscreen.isFullscreen && <div className="justify-self-end">{versionLine}</div>}
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

          {/* Null until the slot above has mounted, and on a phone for good — either
            way the panels keep their controls under the board until told otherwise. */}
          <HeaderSlotContext.Provider value={isRoomy ? headerSlot : null}>
            {mode === 'local' ? (
              <LocalPanel applyPendingUpdate={applyPendingUpdate} />
            ) : (
              <OnlinePanel applyPendingUpdate={applyPendingUpdate} onBusyChange={setIsOnlineBusy} />
            )}
          </HeaderSlotContext.Provider>

          {/* A landscape phone has no height to give a footer; the same line is one
            rotation away, and an update that matters still banners itself.
            Fullscreen does not drop it — it moved up into the header row. */}
          {!fullscreen.isFullscreen && <div className="w-full compact:hidden">{versionLine}</div>}

          {updates.isUpdateRequired && updates.minimumSupportedVersion && (
            <UpdateRequiredOverlay
              currentVersion={updates.currentVersion}
              minimumVersion={updates.minimumSupportedVersion}
              latestVersion={updates.latestVersion}
              onUpdate={updates.applyUpdate}
            />
          )}
        </div>
      </FullscreenContext.Provider>
    </ThemeProvider>
  );
};
