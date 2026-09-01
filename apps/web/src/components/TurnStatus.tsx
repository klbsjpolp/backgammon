import { pipCount, type GameState, type Player } from '@backgammon/core';
import { cn } from '@/lib/cn';
import { capitalise, SIDE, WIN_KIND } from '@/lib/french';

/**
 * The line above the board, shared by both game modes.
 *
 * It used to be written out twice — once in each panel — which is how the two
 * drifted: only the local one named the cube's owner, and only the local one
 * spelled out the stake when a double was offered to you, though both are just
 * as worth knowing in an online game.
 */
interface TurnStatusProps {
  state: GameState;
  /** The colour this client plays; "vous" in every sentence below. */
  you: Player;
  /** What to call the other seat. `IA` locally; online it stays anonymous. */
  opponentLabel?: string;
}

/** The headline: who is on play, what they owe, or how the game ended. */
const describeTurn = ({ state, you, opponentLabel }: TurnStatusProps): string => {
  if (state.phase === 'gameOver' && state.result) {
    const { winner, kind, points } = state.result;
    const subject = winner === you ? 'Vous gagnez' : `${capitalise(SIDE[winner])} gagne`;
    return `${subject} ${WIN_KIND[kind]} — ${points} point${points === 1 ? '' : 's'}`;
  }

  if (state.phase === 'doubleOffered' && state.doubleOfferedBy) {
    const isYours = state.doubleOfferedBy === you;
    const offerer = isYours ? 'Vous' : (opponentLabel ?? capitalise(SIDE[state.doubleOfferedBy]));
    // Only the player being asked needs the stake spelled out — it is what they
    // are deciding about.
    const stake = isYours ? '' : ` — prenez à ×${state.cube.value * 2} ou refusez`;
    return `${offerer} propose${isYours ? 'z' : ''} un doublement${stake}`;
  }

  const verb = state.phase === 'rolling' ? 'lancer' : 'jouer';
  const whose = state.turn === you ? ' (vous)' : opponentLabel ? ` (${opponentLabel})` : '';
  return `${capitalise(SIDE[state.turn])} doit ${verb}${whose}`;
};

/**
 * The turn that was rolled and could not be played. Without a line of its own
 * this passes in silence: the turn flips back before the dice have been drawn,
 * and all the player sees is that it is suddenly not their move.
 */
const describeNoPlay = ({ state, you, opponentLabel }: TurnStatusProps): string | null => {
  if (!state.noPlay) return null;
  const { player, roll } = state.noPlay;
  // "Vous" takes its own conjugation, and there is no shorter way to say it
  // that stays a sentence.
  if (player === you) return `Vous avez fait ${roll[0]}-${roll[1]} et n'avez pas pu jouer`;
  const subject = opponentLabel ?? capitalise(SIDE[player]);
  return `${subject} a fait ${roll[0]}-${roll[1]} et n'a pas pu jouer`;
};

/**
 * What is worth hearing, as one string. The dice belong in it because the board
 * is where they are drawn and the board has nothing permanently on screen to
 * announce them from — `<Dice>` is unmounted entirely until a roll lands.
 */
const describeAloud = (props: TurnStatusProps): string => {
  const { state } = props;
  const parts = [describeTurn(props)];
  if (state.phase === 'moving' && state.roll) {
    parts.push(`dés ${state.roll[0]}-${state.roll[1]}, il reste ${state.remaining.join(', ')} à jouer`);
  }
  const noPlay = describeNoPlay(props);
  if (noPlay) parts.push(noPlay);
  return parts.join('. ');
};

/**
 * The one live region, and the only thing in this file that speaks.
 *
 * It is a component of its own, rendered by the panels as a sibling of
 * `GameLayout` rather than inside `TurnStatus`, because the visible lines below
 * *move*: fullscreen draws them inside the board's frame, and a subtree that
 * changes position in the tree is unmounted and rebuilt, not relocated. That put
 * the region back in the tree together with its text on every toggle, which is
 * exactly the silence the comment below describes — the invariant is that this
 * is mounted *before* anything it announces changes, so it must outlive every
 * layout the status line is drawn in.
 *
 * Polite: a turn changing is worth hearing, not worth cutting off whatever the
 * player is already being read.
 */
export const TurnAnnouncer = (props: TurnStatusProps) => (
  <span aria-live="polite" className="sr-only">
    {describeAloud(props)}
  </span>
);

export const TurnStatus = (props: TurnStatusProps) => {
  const { state } = props;
  const noPlay = describeNoPlay(props);
  const isOver = state.phase === 'gameOver';

  return (
    <div
      className={cn(
        'w-full rounded-lg bg-surface px-4 py-2 text-sm',
        'max-sm:px-3 max-sm:py-1 max-sm:text-xs compact:px-3 compact:py-1 compact:text-xs',
        isOver && 'bg-highlight-soft',
      )}
    >
      {/*
       * Two lines, always, whatever there is to say — that height is the
       * position of the board under it. This was one wrapping row (turn on the
       * left, cube and pips on the right) and it grew a line whenever either
       * half outgrew the other's room: a turn phrase one word longer at 360px,
       * or a roll nobody could play, each of which moved the board and every
       * control under it 20px down the screen and back again a turn later.
       *
       * `2lh` rather than a pixel height, so it follows the `text-xs` the phone
       * and the landscape sidebar switch to.
       */}
      <div className="min-h-[2lh]">
        {/*
         * The result is the one line here worth more than the layout:
         * "Noir gagne un backgammon — 3 points" is ~240px — wider than the
         * English it replaced — and the landscape sidebar gives it ~156px, so truncating loses the win kind and the
         * points — the sentence the whole game was played for, and the only
         * one with no later state that brings it back. So it wraps instead,
         * and the counts stand down beside it: a finished game has nothing
         * left to count.
         *
         * That is the single place the no-shift rule is relaxed, and it is the
         * one that costs nothing — there are no more moves to make under a
         * board that moved. It does not move on a phone or a desktop either
         * way, where the sentence fits the line the reservation already pays
         * for; only the sidebar, which needs three lines for it, grows.
         *
         * No `capitalize` either, which this line used to carry: the sentences
         * start on a capital of their own now, and CSS would title-case every
         * word after it — a French sentence set as an English headline.
         */}
        <div className={cn('font-semibold', !isOver && 'truncate')}>{describeTurn(props)}</div>

        {/*
         * One line, three things, in the order they can least afford to be cut.
         *
         * The cube is drawn nowhere else on the page, so it goes first and is
         * never the part that clips: take a double and the ×2 you are now
         * playing for has to be visible immediately, not once the opponent
         * rolls again. Then the roll nobody could play, which is gone for good
         * if it is missed — and which lives until the player who rolled it
         * rolls again, or until a double offered in reply is taken (see
         * `applyRoll` and `respondDouble`), so it is on screen for the reply
         * and not for a moment. The pip counts come last because they
         * are the one thing here the board itself carries: on a phone with news
         * to report they are what runs off the end.
         */}
        {!isOver && (
          <div className="truncate text-muted">
            videau ×{state.cube.value}
            {state.cube.owner ? ` (${SIDE[state.cube.owner]})` : ''}
            {noPlay ? ` · ${noPlay}` : ''} · pips B {pipCount(state.board, 'white')} / N{' '}
            {pipCount(state.board, 'black')}
          </div>
        )}
      </div>

      {/*
       * One region for the whole game, and always mounted — that is the part
       * that matters. A live region has to be in the accessible tree *before*
       * its content changes for the change to be announced; one that appears
       * together with its text is silent in NVDA, JAWS and VoiceOver alike,
       * which is what the conditionally-rendered regions here and in `<Dice>`
       * were. It lives in {@link TurnAnnouncer} above, outside this component
       * and outside every layout, for the same reason.
       *
       * The visible lines here carry no `aria-live` of their own, so that
       * region is the only thing that speaks — and the only place the tail of
       * a truncated line survives.
       */}
    </div>
  );
};
