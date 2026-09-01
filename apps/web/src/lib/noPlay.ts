import type { GameState, NoPlay } from '@backgammon/core';

/**
 * How long an automatic roll waits when the roll before it could not be played.
 *
 * The pause is the whole point: the rules pass the turn back the instant a roll
 * has no move in it, so on a phone the failure, the message and the reply all
 * landed inside about half a second and the player was left looking at a board
 * that had simply changed hands. Long enough to read six words and a pair of
 * dice, short enough that it still reads as the game answering rather than
 * hanging.
 */
export const NO_PLAY_HOLD_MS = 1500;

/**
 * The roll that just went unplayed, for as long as it is still the last thing
 * that happened — or `null`.
 *
 * `state.noPlay` deliberately outlives that: it is kept until the player who
 * rolled it rolls again, so the sentence about it stays on screen for the whole
 * reply. The dice cannot be kept that long, because the cell that draws them
 * holds one roll and the reply needs it. So this is the narrower question of
 * whether the failed roll is still unanswered — which is exactly the two phases
 * in which no roll is on play and the game is still going.
 *
 * `doubleOffered` belongs in that list and leaving it out was a bug of its own.
 * The turn does not change hands over a cube exchange, so an opponent who
 * doubles instead of rolling has not answered the roll — but the phase moves
 * `rolling → doubleOffered → rolling`, which took the dice off the screen and
 * put them back. Coming back is what read as news a second time; staying is not
 * news at all, and it is also the honest picture: those dice are still the last
 * thing thrown, and a roll the opponent could not play is worth knowing while
 * deciding whether to take.
 *
 * The second condition is what ends the episode without a roll: a turn later the
 * record is still set, and it then belongs to the player about to replace it
 * rather than to the one waiting to see it.
 */
export const pendingNoPlay = (state: GameState): NoPlay | null =>
  (state.phase === 'rolling' || state.phase === 'doubleOffered') && state.noPlay && state.noPlay.player !== state.turn
    ? state.noPlay
    : null;
