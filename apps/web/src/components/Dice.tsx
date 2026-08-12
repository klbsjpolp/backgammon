import type { GameState } from '@backgammon/core';
import { cn } from '@/lib/cn';

const die = (n: number) => '⚀⚁⚂⚃⚄⚅'[n - 1] ?? '?';

interface Face {
  value: number;
  /** Already spent on a checker move — drawn faded rather than dropped. */
  played: boolean;
}

/**
 * The dice this turn still has: four of them on doubles, since that is how many
 * moves a double buys. `remaining` carries values and not identities, so a face
 * is matched to it by value — the first face of a value is the one still to play,
 * which is enough to show *how many* of a value are left.
 */
const facesFor = (roll: readonly [number, number], remaining: readonly number[]): Face[] => {
  const values = roll[0] === roll[1] ? [roll[0], roll[0], roll[0], roll[0]] : [roll[0], roll[1]];
  const left = new Map<number, number>();
  for (const value of remaining) left.set(value, (left.get(value) ?? 0) + 1);

  return values.map((value) => {
    const count = left.get(value) ?? 0;
    if (count === 0) return { value, played: true };
    left.set(value, count - 1);
    return { value, played: false };
  });
};

/**
 * The roll, drawn as pips rather than spelled out. Fading the dice already played
 * says the same thing the old "remaining: 6, 5" line did in a fraction of the
 * width, which is what lets the dice ride in the header row beside the title
 * instead of costing the board a strip of the little room a phone has.
 *
 * Size and colour are the caller's: the header draws them one way, the fallback
 * row under the board another.
 */
export const Dice = ({ state, className }: { state: GameState; className?: string }) => {
  if (!state.roll || state.phase === 'rolling') return null;

  return (
    <div role="group" aria-label="dice" className={cn('flex items-center gap-1 leading-none text-dice', className)}>
      {facesFor(state.roll, state.remaining).map((face, i) => (
        <span key={i} className={cn('transition-opacity', face.played && 'opacity-30')}>
          {die(face.value)}
        </span>
      ))}
      {state.remaining.length > 0 && (
        // The pips carry this to anyone who can see them; screen readers get the
        // list they used to read off the board. Live, because a roll landing is
        // the one thing on this page that happens without being asked for —
        // polite, so it waits its turn rather than cutting off the status line.
        <span aria-live="polite" className="sr-only">
          <span>remaining: </span>
          {state.remaining.join(', ')}
        </span>
      )}
    </div>
  );
};
