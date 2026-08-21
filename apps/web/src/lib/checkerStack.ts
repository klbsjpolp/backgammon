import type { PileId } from '@/lib/boardDiff';

/**
 * The checker on the free end of a stack — the one a move adds, the one it takes
 * away, and the one a drag picks up.
 *
 * A pile is pinned at its point's base and grows away from it, so the free slot
 * is at the far end. But the stack is always drawn top-down while the *point* is
 * what gets reversed along the bottom row: React appends, so on a bottom-row
 * point the appended node is the one at the base and every checker already there
 * shifts up a slot. The outermost checker is then the first child, not the last —
 * which is what `data-arrives` records.
 */
export const outerChecker = (stack: HTMLElement): HTMLElement | null => {
  const outer = stack.dataset.arrives === 'first' ? stack.firstElementChild : stack.lastElementChild;
  return outer instanceof HTMLElement ? outer : null;
};

/** The same, found by pile rather than handed the stack. */
export const outerCheckerOf = (root: ParentNode, pile: PileId): HTMLElement | null => {
  const stack = root.querySelector<HTMLElement>(`[data-pile="${pile}"]`);
  return stack ? outerChecker(stack) : null;
};
