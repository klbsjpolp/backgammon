import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { HeaderSlot } from '@/headerSlot';
import { cn } from '@/lib/cn';

/**
 * Three dots, drawn rather than borrowed from a font — see `FullscreenIcon` for
 * why a glyph is the wrong tool at icon size.
 */
const MoreIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className="size-5">
    <circle cx="12" cy="5" r="1.75" />
    <circle cx="12" cy="12" r="1.75" />
    <circle cx="12" cy="19" r="1.75" />
  </svg>
);

interface HeaderMenuProps {
  /**
   * Whether there is currently an abandon-the-game action to offer at all. False
   * renders nothing — not even the trigger, the same reasoning `App` used to gate
   * the plain slot div on `isRoomy`: a button that opens on nothing is worse than
   * no button, and an unused flex child still spends the header row's `gap-2`.
   */
  hasAction: boolean;
  /** Hands the portal target and the close callback up to `App`, which threads
   * them into `HeaderSlotContext` for `LocalPanel`/`OnlinePanel`/`Controls`. */
  onSlotChange: (slot: HeaderSlot | null) => void;
}

/**
 * The one place a "Nouvelle partie" or "Quitter" lives, whatever the screen size
 * or fullscreen state — see `headerSlot.ts`. It used to move between this header
 * and a row under the board depending on `isRoomy`; now it is always here, and
 * only ever appears or disappears with whether there is anything to abandon.
 *
 * The panel is a plain labelled disclosure, not a `role="menu"` widget: it never
 * holds more than the one action a screen has to offer, so there is nothing to
 * navigate with arrow keys.
 */
export const HeaderMenu = ({ hasAction, onSlotChange }: HeaderMenuProps) => {
  const [open, setOpen] = useState(false);
  const [node, setNode] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  /*
   * Losing the action entirely — the room was left, and nothing new has been
   * joined yet — does not close the menu by itself: `open` is state of its own,
   * so it survives the trigger vanishing underneath it. Without this, hosting or
   * joining a new room a moment later would bring the trigger back already open,
   * for a click nobody made.
   *
   * Adjusted during render rather than in an effect — React's own guidance for
   * resetting state off a prop change, and it avoids the extra commit an effect
   * would cost for what is otherwise a one-line derivation.
   */
  const [prevHasAction, setPrevHasAction] = useState(hasAction);
  if (hasAction !== prevHasAction) {
    setPrevHasAction(hasAction);
    if (!hasAction) setOpen(false);
  }

  const closeMenu = useCallback(() => setOpen(false), []);

  useEffect(() => {
    onSlotChange(node ? { node, closeMenu } : null);
    // `onSlotChange` is `setHeaderSlot` from `App`, stable across renders; adding
    // it would re-run this for no reason every time `App` re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, closeMenu]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || node?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, node]);

  useEffect(() => {
    if (!node) return;
    if (open) {
      node.querySelector<HTMLButtonElement>('button')?.focus();
      return;
    }
    // A close that came from clicking some other control (the theme switch, the
    // mode toggle) already moved focus where the player put it — pulling it back
    // to this trigger a moment later would fight that click. Only a close that
    // leaves the panel itself focused (Escape, or the confirmed action) hands
    // focus back here.
    if (node.contains(document.activeElement)) triggerRef.current?.focus();
  }, [open, node]);

  if (!hasAction) return null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Actions"
        className={cn(
          'relative touch-manipulation rounded-full p-0.5 text-muted transition select-none hover:text-fg',
          // Same 24px-box-with-invisible-hit-area trick as `ThemeSwitcher`'s
          // swatches, and the same math (4px horizontal against an 8px `gap-2`,
          // 10px vertical): the header row's own width is what a phone is short
          // on, so this trigger costs it as little as the touch target still
          // allows, rather than the plain `p-2` box `FullscreenButton` can afford
          // since it hides on a phone altogether.
          "before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']",
        )}
      >
        <MoreIcon />
      </button>
      <div
        id={panelId}
        ref={setNode}
        hidden={!open}
        className={cn(
          'absolute top-full right-0 z-10 mt-2 flex flex-col items-stretch gap-2 rounded-lg bg-surface p-2',
          'shadow-lg ring-1 ring-line',
        )}
      >
        {/* Populated by a portal from whichever panel is mounted — see `useHeaderSlot`. */}
      </div>
    </div>
  );
};
