import { useEffect, useRef, useState } from 'react';

/**
 * The open/close half of a header popover: a trigger button and a panel that
 * shuts on a click outside both or on Escape, and hands focus back to the
 * trigger when it shuts with focus inside it. `HeaderMenu` and `ThemeSwitcher`
 * both need exactly this, and two copies of it are two places for the
 * focus-return rule to drift apart.
 *
 * `panel` is a node, not a ref, because the caller usually needs it as state
 * anyway (`HeaderMenu` publishes it as a portal target) and an effect keyed on
 * a ref would never see it arrive.
 *
 * `initialFocus` picks what takes focus when the panel opens — the first button
 * by default; the theme panel wants the theme already chosen instead, so a
 * keyboard player lands where they are rather than at the top of the list.
 */
export const useDisclosure = (
  panel: HTMLElement | null,
  initialFocus: (panel: HTMLElement) => HTMLElement | null = (node) => node.querySelector('button'),
) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panel?.contains(target)) return;
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
  }, [open, panel]);

  useEffect(() => {
    if (!panel) return;
    if (open) {
      initialFocus(panel)?.focus();
      return;
    }
    // A close that came from clicking some other control (the mode toggle, the
    // other popover's trigger) already moved focus where the player put it —
    // pulling it back to this trigger a moment later would fight that click.
    // Only a close that leaves the panel itself focused (Escape, or a confirmed
    // action) hands focus back here.
    if (panel.contains(document.activeElement)) triggerRef.current?.focus();
    // `initialFocus` is read on the opening edge only; a caller passing an inline
    // arrow would otherwise re-run this, and re-focus, on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, panel]);

  return { open, setOpen, triggerRef };
};
