import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * `text-*` is the one ambiguous prefix in Tailwind — it carries both font sizes
 * and text colours — so tailwind-merge decides which group a class belongs to by
 * recognising the value. Our board font sizes come from `@theme` keys it has
 * never heard of, so it filed them under text-colour and dropped them whenever a
 * colour followed in the same `cn()` call. Registering them restores the split:
 * a size and a colour survive together, and two sizes still collapse to the last.
 *
 * Only `text-*` needs this. `w-`, `h-`, `gap-` and friends cannot be mistaken for
 * anything else, so the board's spacing keys pass through unharmed.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['board-checker', 'board-count', 'board-label'] }],
    },
  },
});

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
