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

  return (
    <div
      className={cn(
        'flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-surface px-4 py-2 text-sm',
        'max-sm:px-3 max-sm:py-1 max-sm:text-xs compact:px-3 compact:py-1 compact:text-xs',
        state.phase === 'gameOver' && 'bg-highlight-soft',
      )}
    >
      <span className="font-semibold capitalize">{describeTurn(props)}</span>
      <span className="text-muted">
        cube ×{state.cube.value}
        {state.cube.owner ? ` (${state.cube.owner})` : ''} · pips W {pipCount(state.board, 'white')} / B{' '}
        {pipCount(state.board, 'black')}
      </span>
      {noPlay && <span className="w-full text-muted first-letter:capitalize">{noPlay}</span>}

      {/*
       * One region for the whole game, and always mounted — that is the part
       * that matters. A live region has to be in the accessible tree *before*
       * its content changes for the change to be announced; one that appears
       * together with its text is silent in NVDA, JAWS and VoiceOver alike,
       * which is what the conditionally-rendered regions here and in `<Dice>`
       * were. The visible spans above carry no `aria-live` of their own, so
       * this is also the only thing that speaks.
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
