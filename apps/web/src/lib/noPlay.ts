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
 * The roll that just went unplayed, while it is still the last thing that
 * happened — or `null`.
 *
 * `state.noPlay` deliberately outlives that moment: it is kept until the player
 * who rolled it rolls again, so the sentence about it stays on screen for the
 * whole of the reply. The dice cannot be kept that long, because the cell that
 * draws them holds one roll and the reply needs it. So this narrows the record
 * to the beat between the failed roll and the answer to it: nothing has been
 * rolled since (`rolling`), and the failure belongs to the other seat, which is
 * what tells this beat apart from the one a turn later — there `noPlay` is still
 * set, but it is the roll the player on turn is about to replace, not news.
 */
export const pendingNoPlay = (state: GameState): NoPlay | null =>
  state.phase === 'rolling' && state.noPlay && state.noPlay.player !== state.turn ? state.noPlay : null;
