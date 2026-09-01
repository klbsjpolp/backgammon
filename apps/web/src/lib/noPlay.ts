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
/*
 * Online, this needs the host to be on a build that clears `noPlay` when a
 * double is taken — and a host a release behind is ordinary here. Against an
 * older one the record survives that exchange, the state comes back
 * indistinguishable from the failed roll's own, and this fires a second time:
 * the dice are redrawn and an auto-roll takes the long hold. It is the bug the
 * fix removes, not a new one, and it is cosmetic and transient.
 *
 * There is no guard for it on this side. The only difference between the two
 * states is the cube, and a test on it is wrong in the case where the cube was
 * already the dancer's — taken a turn or more before the dance — which is a
 * legitimate `pendingNoPlay` that such a guard would suppress. Nothing else in
 * the state says which of the two beats this is, which is exactly why the fix
 * had to go where the transition happens.
 */
export const pendingNoPlay = (state: GameState): NoPlay | null =>
  state.phase === 'rolling' && state.noPlay && state.noPlay.player !== state.turn ? state.noPlay : null;
