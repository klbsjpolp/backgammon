import type { GameState, NoPlay, Player } from '@backgammon/core';
import { cn } from '@/lib/cn';
import { pendingNoPlay } from '@/lib/noPlay';
import { useFullscreenState } from '@/fullscreen.ts';

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
  /**
   * The whole roll had no legal move, so this die was never spendable. Marked on
   * its rim rather than faded: "spent" and "never playable" are exactly the two
   * things a player has to be able to tell apart here, and fading says the first.
   */
  blocked?: boolean;
  /** Whose roll this is — the die is drawn in that player's own checker colour. */
  player: Player;
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
const Die = ({ value, played, blocked, player }: Face) => {
  const { isFullscreen } = useFullscreenState();
  // Same colours as that player's checker, and the same reason the checker needs
  // a rim: the dark theme's dark checker sits within a hair of the canvas's own
  // luminance (and the light theme's pale one of its canvas), so the die would
  // vanish into the page behind it without the line to draw its edge.
  const [face, line, pip] =
    player === 'white'
      ? ['fill-checker-light', 'stroke-checker-light-line', 'fill-checker-light-fg']
      : ['fill-checker-dark', 'stroke-checker-dark-line', 'fill-checker-dark-fg'];
  return (
    <svg
      viewBox="0 0 100 100"
      // The pips are decoration: what a reader needs is the list below, which says
      // what is *left* rather than making it count faded faces.
      aria-hidden="true"
      data-face={value}
      data-played={played}
      data-blocked={blocked ?? false}
      className={cn(
        'shrink-0 transition-opacity',
        played && 'opacity-30',
        // Fullscreen has room for a die that reads across a desk, and there the
        // size comes from the board's own unit — see `--spacing-board-die`,
        // which is the width the band's controls half has left once the three
        // buttons beside the dice have taken theirs. A flat size cannot work in
        // both places: those buttons cost the same pixels whatever the board's
        // size, so the room for dice is what is left over, not a proportion.
        //
        // Everywhere else the size stays the caller's `1em`, because `Controls`
        // reserves the dice cell at the width of four of them (`min-w-33`,
        // measured at the 1.875rem a phone sets). A flat `size-10` made a double
        // 171px wide against that 132px reservation, and the fourth die spent
        // the difference underneath the new-game button on a 360px screen.
        isFullscreen ? 'size-board-die' : 'size-[1em]',
      )}
    >
      {/*
       * The rim is dashed on a die that was never playable, and that is the only
       * mark: everything else stays exactly as a live die is drawn.
       *
       * It started as a strike through the face, which is what "cancelled" looks
       * like — and at the ~30px a phone draws a die, the stroke swallowed the
       * pips it crossed, whichever diagonal it took and however thin it was cut.
       * A 5 struck through reads as a 3. That is the opposite of the point:
       * these dice are drawn precisely because the player never got to see them.
       * The rim is the one part of the face carrying nothing to read.
       *
       * The heavier rim is inset by the half-width it gains. A stroke straddles
       * its path, so `x=2` at width 4 puts the outer edge exactly on the
       * viewBox — which is where the 2 came from — and at width 6 it would run
       * to -1. A non-root `<svg>` is `overflow: hidden` in the UA stylesheet, so
       * that unit is cut off on all four sides, flattening the rounded corners
       * of the one line the whole mark is carried by.
       */}
      <rect
        x={blocked ? 3 : 2}
        y={blocked ? 3 : 2}
        width={blocked ? 94 : 96}
        height={blocked ? 94 : 96}
        rx="22"
        strokeWidth={blocked ? 6 : 4}
        strokeDasharray={blocked ? '14 10' : undefined}
        className={cn(face, line)}
      />
      {PIPS[value]?.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="10" className={pip} />
      ))}
    </svg>
  );
};

/** A roll as the dice it is drawn with: four on doubles, since that is how many moves a double buys. */
const facesOf = (roll: readonly [number, number]): number[] =>
  roll[0] === roll[1] ? [roll[0], roll[0], roll[0], roll[0]] : [roll[0], roll[1]];

/**
 * The dice this turn still has. `remaining` carries values and not identities, so
 * a face is matched to it by value — the first face of a value is the one still
 * to play, which is enough to show *how many* of a value are left.
 */
const facesFor = (roll: readonly [number, number], remaining: readonly number[], player: Player): Face[] => {
  const values = facesOf(roll);
  const left = new Map<number, number>();
  for (const value of remaining) left.set(value, (left.get(value) ?? 0) + 1);

  return values.map((value) => {
    const count = left.get(value) ?? 0;
    if (count === 0) return { value, played: true, player };
    left.set(value, count - 1);
    return { value, played: false, player };
  });
};

/**
 * The roll that had no move in it, drawn in the colour of the player who rolled
 * it — which is half of what says it is not the roll on play. Nothing is faded:
 * no die was spent, and the point of drawing them at all is that the rules gave
 * the player no chance to see them.
 */
const blockedFaces = ({ player, roll }: NoPlay): Face[] =>
  facesOf(roll).map((value) => ({ value, played: false, blocked: true, player }));

/**
 * The roll, drawn as pips rather than spelled out. Fading the dice already played
 * says the same thing the old "restants : 6, 5" line did in a fraction of the
 * width, which is what lets the dice ride in a row the page already pays for
 * instead of costing the board a strip of the little room a phone has.
 *
 * Size and colour are the caller's — see `Controls`, which owns the cell they are
 * drawn in and moves it per layout. The gap is in `em` for the same reason: it
 * has to stay a hair between two dice at every size, and four dice plus their
 * gaps are what that cell reserves room for.
 */
export const Dice = ({ state, className }: { state: GameState; className?: string }) => {
  // The cell holds one roll, so this is a choice and not a stack: the roll on
  // play whenever there is one, and otherwise — for the beat between a roll
  // nobody could play and the answer to it — the roll that failed. `endTurn`
  // clears `roll`, so that one is only readable from `noPlay`, and without this
  // it was never drawn at all: the turn passed back before the dice reached the
  // screen, which is the complaint this answers.
  const blocked = pendingNoPlay(state);
  const faces = blocked
    ? blockedFaces(blocked)
    : state.roll && state.phase !== 'rolling'
      ? facesFor(state.roll, state.remaining, state.turn)
      : null;
  if (!faces) return null;

  return (
    <div
      role="group"
      // Named for what it is, since the dashed rim that says so is drawn and
      // not written.
      aria-label={blocked ? "dés qui n'ont pas pu être joués" : 'dés'}
      className={cn('flex items-center gap-[0.12em] leading-none', className)}
    >
      {faces.map((face, i) => (
        <Die key={i} value={face.value} played={face.played} blocked={face.blocked} player={face.player} />
      ))}
      {blocked && (
        // Without this the group is a name with nothing under it: every die is
        // `aria-hidden` — the pips are decoration — and the "restants" span
        // below belongs to a live roll. Browse mode then has no node to stop
        // on, so the label is never spoken and the dashed rim, the one thing
        // telling these dice from a live roll, has no non-visual equivalent
        // here at all. Not a live region, for the reason below: this enters the
        // DOM with its text. `TurnAnnouncer` is what announces it.
        <span className="sr-only">
          {blocked.roll[0]}-{blocked.roll[1]}, aucun coup possible
        </span>
      )}
      {!blocked && state.remaining.length > 0 && (
        // The pips carry this to anyone who can see them; a screen reader that
        // lands here reads the list instead. Deliberately *not* a live region:
        // this element only exists once a roll has landed, so it enters the DOM
        // with its content and would never announce anyway. Saying it is the
        // job of the one region that is always mounted — see `TurnStatus`.
        <span className="sr-only">
          <span>restants : </span>
          {state.remaining.join(', ')}
        </span>
      )}
    </div>
  );
};
