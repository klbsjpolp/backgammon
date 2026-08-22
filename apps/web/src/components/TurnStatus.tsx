import { pipCount, type GameState, type Player } from '@backgammon/core';
import { cn } from '@/lib/cn';

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
  /** The colour this client plays; "you" in every sentence below. */
  you: Player;
  /** What to call the other seat. `AI` locally; online it stays anonymous. */
  opponentLabel?: string;
}

/** The headline: who is on play, what they owe, or how the game ended. */
const describeTurn = ({ state, you, opponentLabel }: TurnStatusProps): string => {
  if (state.phase === 'gameOver' && state.result) {
    const { winner, kind, points } = state.result;
    const subject = winner === you ? 'You win' : `${winner} wins`;
    return `${subject} a ${kind} — ${points} point${points === 1 ? '' : 's'}`;
  }

  if (state.phase === 'doubleOffered' && state.doubleOfferedBy) {
    const offerer = state.doubleOfferedBy === you ? 'You' : (opponentLabel ?? state.doubleOfferedBy);
    // Only the player being asked needs the stake spelled out — it is what they
    // are deciding about.
    const stake = state.doubleOfferedBy === you ? '' : ` — take at ×${state.cube.value * 2} or drop`;
    return `${offerer} offer${state.doubleOfferedBy === you ? '' : 's'} a double${stake}`;
  }

  const verb = state.phase === 'rolling' ? 'to roll' : 'to move';
  const whose = state.turn === you ? ' (you)' : opponentLabel ? ` (${opponentLabel})` : '';
  return `${state.turn} ${verb}${whose}`;
};

/**
 * The turn that was rolled and could not be played. Without a line of its own
 * this passes in silence: the turn flips back before the dice have been drawn,
 * and all the player sees is that it is suddenly not their move.
 */
const describeNoPlay = ({ state, you, opponentLabel }: TurnStatusProps): string | null => {
  if (!state.noPlay) return null;
  const { player, roll } = state.noPlay;
  const subject = player === you ? 'You' : (opponentLabel ?? player);
  return `${subject} rolled ${roll[0]}-${roll[1]} and could not move`;
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
    parts.push(`rolled ${state.roll[0]}-${state.roll[1]}, ${state.remaining.join(', ')} left to play`);
  }
  const noPlay = describeNoPlay(props);
  if (noPlay) parts.push(noPlay);
  return parts.join('. ');
};

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
         * "black wins a backgammon — 3 points" is ~220px and the landscape
         * sidebar gives it ~156px, so truncating loses the win kind and the
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
         */}
        <div className={cn('font-semibold capitalize', !isOver && 'truncate')}>{describeTurn(props)}</div>

        {/*
         * One line, three things, in the order they can least afford to be cut.
         *
         * The cube is drawn nowhere else on the page, so it goes first and is
         * never the part that clips: take a double and the ×2 you are now
         * playing for has to be visible immediately, not once the opponent
         * rolls again. Then the roll nobody could play, which is gone for good
         * if it is missed — and which lives until the player who rolled it
         * rolls again (see `applyRoll`), so it is on screen for the whole of
         * the reply, not for a moment. The pip counts come last because they
         * are the one thing here the board itself carries: on a phone with news
         * to report they are what runs off the end.
         */}
        {!isOver && (
          <div className="truncate text-muted">
            cube ×{state.cube.value}
            {state.cube.owner ? ` (${state.cube.owner})` : ''}
            {noPlay ? ` · ${noPlay}` : ''} · pips W {pipCount(state.board, 'white')} / B{' '}
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
       * were. The visible lines above carry no `aria-live` of their own, so
       * this is also the only thing that speaks — and the only place the tail
       * of a truncated line survives.
       *
       * Polite: a turn changing is worth hearing, not worth cutting off
       * whatever the player is already being read.
       */}
      <span aria-live="polite" className="sr-only">
        {describeAloud(props)}
      </span>
    </div>
  );
};
