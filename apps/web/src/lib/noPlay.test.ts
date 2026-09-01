import { describe, expect, it } from 'vitest';
import { applyRoll, createInitialState, offerDouble, respondDouble, type GameState } from '@backgammon/core';
import { pendingNoPlay } from './noPlay';

/**
 * A board with nothing but a checker on the bar and the opponent holding every
 * point it could enter on — the ordinary way a roll turns out to have no move in
 * it. White enters onto 18..23, so those six are the ones to block.
 */
const barred = (): GameState => {
  const state = createInitialState('white');
  const points = [...state.board.points];
  for (let i = 18; i <= 23; i++) points[i] = -2;
  return { ...state, board: { ...state.board, points, bar: { ...state.board.bar, white: 1 } } };
};

describe('pendingNoPlay', () => {
  it('is nothing while there is a turn being played normally', () => {
    expect(pendingNoPlay(createInitialState('white'))).toBeNull();
    expect(pendingNoPlay(applyRoll(createInitialState('white'), [6, 5]))).toBeNull();
  });

  it('is the roll that just went unplayed, for the beat before the answer to it', () => {
    const passed = applyRoll(barred(), [6, 5]);
    // The rules pass the turn straight back, which is the whole problem: this is
    // the only moment anything can say what was rolled.
    expect(passed.turn).toBe('black');
    expect(pendingNoPlay(passed)).toEqual({ player: 'white', roll: [6, 5] });
  });

  it('is nothing again once the answer to it has been rolled', () => {
    const answered = applyRoll(applyRoll(barred(), [6, 5]), [3, 1]);
    // `noPlay` is deliberately kept this long — the sentence about it stays on
    // screen for the whole reply — but the dice cell now holds the reply's own
    // roll, and it only has room for one.
    expect(answered.noPlay).toEqual({ player: 'white', roll: [6, 5] });
    expect(pendingNoPlay(answered)).toBeNull();
  });

  it('holds across a double offered in reply, rather than blinking off and back', () => {
    // The turn does not change hands over a cube exchange, so the roll is still
    // unanswered throughout it. Leaving `doubleOffered` out took the dice off
    // the screen at the offer and put them back at the take — and coming back is
    // what reads as news a second time. Staying is not news at all.
    const passed = applyRoll(barred(), [6, 5]);
    const offered = offerDouble(passed);
    const taken = respondDouble(offered, true);

    expect(offered.phase).toBe('doubleOffered');
    expect(taken.phase).toBe('rolling');
    for (const state of [passed, offered, taken]) {
      expect(pendingNoPlay(state)).toEqual({ player: 'white', roll: [6, 5] });
    }
  });

  it('is nothing once the game is over, whatever the record still says', () => {
    // A refused double ends the game with the record still set. There are no
    // more dice to draw under a result.
    const dropped = respondDouble(offerDouble(applyRoll(barred(), [6, 5])), false);
    expect(dropped.phase).toBe('gameOver');
    expect(dropped.noPlay).not.toBeNull();
    expect(pendingNoPlay(dropped)).toBeNull();
  });

  it('is nothing when the failure belongs to the player now on roll', () => {
    // A turn later the same record is still set, and it is then the roll this
    // player is about to replace rather than news about the one just played.
    const passed = applyRoll(barred(), [6, 5]);
    expect(pendingNoPlay({ ...passed, turn: 'white' })).toBeNull();
  });
});
