import type { GameState } from '@backgammon/core';
import { cn } from '@/lib/cn';

/**
 * Pip centres on a 100 × 100 face, in the arrangement a real die uses: the odd
 * faces add the centre pip, the even ones never have it, and six is three down
 * each side rather than the two-plus-four a naive layout produces.
 */
const PIPS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[50, 50]],
  2: [
    [30, 30],
    [70, 70],
  ],
  3: [
    [30, 30],
    [50, 50],
    [70, 70],
  ],
  4: [
    [30, 30],
    [70, 30],
    [30, 70],
    [70, 70],
  ],
  5: [
    [30, 30],
    [70, 30],
    [50, 50],
    [30, 70],
    [70, 70],
  ],
  6: [
    [30, 26],
    [70, 26],
    [30, 50],
    [70, 50],
    [30, 74],
    [70, 74],
  ],
};

interface Face {
  value: number;
  /** Already spent on a checker move — drawn faded rather than dropped. */
  played: boolean;
}

/**
 * One die, drawn rather than typed. The Unicode pip glyphs (⚀..⚅) look like the
 * obvious answer and are not: the drawn face is a fraction of the font size and
 * the rest is the glyph's own padding, so a die that has to fit a header row
 * ends up a few millimetres of hairline outline — the complaint that started
 * this. A path fills the box it is given, at the weight we choose, identically
 * on every platform, instead of leaving both to whichever font the system
 * decided the character belongs to.
 *
 * Sized in `em` so the size stays the caller's, set with `text-*` as before.
 */
const Die = ({ value, played }: Face) => (
  <svg
    viewBox="0 0 100 100"
    // The pips are decoration: what a reader needs is the list below, which says
    // what is *left* rather than making it count faded faces.
    aria-hidden="true"
    data-face={value}
    data-played={played}
    className={cn('size-[1em] shrink-0 transition-opacity', played && 'opacity-30')}
  >
    <rect x="2" y="2" width="96" height="96" rx="22" className="fill-dice" />
    {PIPS[value]?.map(([cx, cy], i) => (
      <circle key={i} cx={cx} cy={cy} r="10" className="fill-dice-pip" />
    ))}
  </svg>
);

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
 * width, which is what lets the dice ride in a row the page already pays for
 * instead of costing the board a strip of the little room a phone has.
 *
 * Size and colour are the caller's — see `Controls`, which owns the cell they are
 * drawn in and moves it per layout. The gap is in `em` for the same reason: it
 * has to stay a hair between two dice at every size, and four dice plus their
 * gaps are what that cell reserves room for.
 */
export const Dice = ({ state, className }: { state: GameState; className?: string }) => {
  if (!state.roll || state.phase === 'rolling') return null;

  return (
    <div role="group" aria-label="dice" className={cn('flex items-center gap-[0.12em] leading-none', className)}>
      {facesFor(state.roll, state.remaining).map((face, i) => (
        <Die key={i} value={face.value} played={face.played} />
      ))}
      {state.remaining.length > 0 && (
        // The pips carry this to anyone who can see them; a screen reader that
        // lands here reads the list instead. Deliberately *not* a live region:
        // this element only exists once a roll has landed, so it enters the DOM
        // with its content and would never announce anyway. Saying it is the
        // job of the one region that is always mounted — see `TurnStatus`.
        <span className="sr-only">
          <span>remaining: </span>
          {state.remaining.join(', ')}
        </span>
      )}
    </div>
  );
};
