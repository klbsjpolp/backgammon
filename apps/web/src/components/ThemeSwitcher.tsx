import { useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { useTheme } from '@/theme/context';
import type { ThemeDefinition, ThemeId } from '@/theme/themes';
import { THEMES } from '@/theme/themes';
import { useDisclosure } from '@/useDisclosure';

/**
 * A theme drawn *in* itself: the swatch sets its own `data-theme`, so the palette
 * variables resolve inside it and it shows the felt and accent you would get
 * rather than a legend you have to decode.
 */
const Swatch = ({ id, className }: { id: ThemeId; className?: string }) => (
  <span
    data-theme={id}
    className={cn(
      'flex size-6 shrink-0 items-center justify-center gap-px rounded-full bg-felt ring-1 ring-board-frame',
      className,
    )}
  >
    <span className="size-1.5 rounded-full bg-checker-light" />
    <span className="size-1.5 rounded-full bg-accent" />
  </span>
);

const GROUPS: readonly { scheme: ThemeDefinition['scheme']; label: string }[] = [
  { scheme: 'dark', label: 'Sombres' },
  { scheme: 'light', label: 'Clairs' },
];

/**
 * One swatch in the header — the active theme's — opening a panel that lists
 * them all by name.
 *
 * It was a row of every swatch, which was fine at three: 88px of a header row a
 * phone shares with the mode switch and the menu. Each theme added 32px to it,
 * and at seven the row no longer fitted a 375px screen without shrinking the
 * touch targets it had just been sized to keep. One swatch costs 24px however
 * many themes there are.
 *
 * The panel overlays the page rather than pushing it, so it spends none of the
 * board's height budget (`--avail-h`) in any layout. It is positioned against
 * the whole header row, not against the trigger — see `App`'s `relative` on that
 * row: on a phone the trigger sits right of centre, and a panel two columns wide
 * anchored to it ran off the left edge of the screen. Centred under the row it
 * cannot, since it is never wider than the row.
 *
 * Choosing a theme applies it at once and leaves the panel open, so the board
 * behind it can be compared theme against theme; a click outside or Escape
 * closes it.
 */
export const ThemeSwitcher = () => {
  const { theme, setTheme } = useTheme();
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const { open, setOpen, triggerRef } = useDisclosure(panel, (node) =>
    node.querySelector('button[aria-pressed="true"]'),
  );
  const panelId = useId();
  const current = THEMES.find((option) => option.id === theme);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Thème : ${current?.label ?? ''}`}
        title="Changer de thème"
        className={cn(
          'relative touch-manipulation rounded-full transition select-none',
          // 32 × 44 around a 24px swatch, the same box `HeaderMenu`'s trigger uses
          // and for the same reason: 4px of horizontal inset against the row's
          // 8px gap tiles the targets without overlap, and the row is already
          // tall enough for the full 44px vertically.
          'before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[""]',
          open && 'ring-2 ring-accent ring-offset-2 ring-offset-canvas',
        )}
      >
        <Swatch id={theme} />
      </button>

      <div
        id={panelId}
        ref={setPanel}
        hidden={!open}
        className={cn(
          'absolute top-full inset-x-0 z-10 mx-auto mt-2 w-max max-w-full',
          // A landscape phone spreads the row edge to edge with the switches on
          // the right, so centred would open the panel over the middle of the
          // board, a long way from the swatch that opened it.
          'compact:mr-0',
          // A landscape phone has ~360px of height and the header already spent
          // some: the panel scrolls itself rather than run off the bottom.
          'max-h-[calc(100svh-5rem)] overflow-y-auto',
          'flex flex-col gap-2 rounded-lg bg-surface p-2 text-left shadow-lg ring-1 ring-line',
        )}
      >
        {GROUPS.map((group) => (
          <div key={group.scheme} role="group" aria-label={`Thèmes ${group.label.toLowerCase()}`}>
            <p aria-hidden="true" className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">
              {group.label}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {THEMES.filter((option) => option.scheme === group.scheme).map((option) => {
                const active = option.id === theme;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setTheme(option.id)}
                    aria-label={`thème ${option.label}`}
                    aria-pressed={active}
                    title={option.blurb}
                    className={cn(
                      // 44px tall: these are the touch targets now, and inside the
                      // panel there is room for them at full size.
                      'flex min-h-11 touch-manipulation items-center gap-2 rounded-md px-2 text-sm transition select-none',
                      active
                        ? 'bg-highlight-soft font-semibold text-fg'
                        : 'text-muted hover:bg-surface-soft hover:text-fg',
                    )}
                  >
                    <Swatch id={option.id} className={cn(active && 'ring-2 ring-accent')} />
                    <span className="whitespace-nowrap">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};
