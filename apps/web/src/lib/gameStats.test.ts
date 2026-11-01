import { describe, expect, it, vi } from 'vitest';
import {
  applyRoll,
  chooseTurn,
  createInitialState,
  createRng,
  currentLegalMoves,
  offerDouble,
  pipCount,
  playMove,
  respondDouble,
  roll,
  undoMove,
} from '@backgammon/core';
import type { GameState, Move } from '@backgammon/core';
import { createGameStatsTracker, isOpeningPosition, parseOpenRecording } from './gameStats';
import type { GameStatsRecord, GameStatsTrackerOptions } from './gameStats';

const track = (overrides: Partial<GameStatsTrackerOptions> = {}) => {
  const onComplete = vi.fn<(record: GameStatsRecord) => void>();
  let n = 0;
  const tracker = createGameStatsTracker({
    appVersion: 'v1.2.3',
    mode: 'local',
    aiPlayer: 'black',
    onComplete,
    generateId: () => `game-${++n}`,
    ...overrides,
  });
  return { tracker, onComplete };
};

/** Plays a whole seeded game AI against AI, yielding every state the UI would see. */
const playGame = (seed: number): GameState[] => {
  const rng = createRng(seed);
  let state = createInitialState('white');
  const states = [state];
  while (state.phase !== 'gameOver') {
    if (state.phase === 'rolling') state = roll(state, rng);
    else {
      const [move] = chooseTurn(state);
      state = playMove(state, move);
    }
    states.push(state);
  }
  return states;
};

const find = (state: GameState, from: number, die: number): Move => {
  const move = currentLegalMoves(state).find((m) => m.from === from && m.die === die);
  if (!move) throw new Error(`no move from ${from} with ${die}`);
  return move;
};

describe('game stats tracker', () => {
  it('reports a finished game once, with totals that add up', () => {
    const { tracker, onComplete } = track();
    const states = playGame(42);
    states.forEach((state, i) => tracker.observe(state, i * 1000));
    // A finished game seen again (a re-render, a reload onto the result) is not a second game.
    tracker.observe(states[states.length - 1], 999_999);

    expect(onComplete).toHaveBeenCalledTimes(1);
    const record = onComplete.mock.calls[0][0];
    const final = states[states.length - 1];
    const [white, black] = record.players;

    expect(record.winner).toBe(final.result!.winner);
    expect(record.endReason).toBe('borneOff');
    expect(record.resultKind).toBe(final.result!.kind);
    expect(record.winnerIsAI).toBe(final.result!.winner === 'black');
    expect(record.totalTurns).toBe(white.turns + black.turns);
    expect(record.durationMs).toBe(white.playTimeMs + black.playTimeMs);
    expect(record.durationMs).toBe((states.length - 1) * 1000);
    expect(record.startedAt).toBe(new Date(0).toISOString());

    const winner = record.players.find((p) => p.isWinner)!;
    expect(winner.checkersOff).toBe(15);
    expect(winner.pipsLeft).toBe(0);
    const loser = record.players.find((p) => !p.isWinner)!;
    expect(loser.pipsLeft).toBe(pipCount(final.board, loser.color));
  });

  it('counts the turns by who was on roll', () => {
    const { tracker, onComplete } = track();
    const states = playGame(7);
    states.forEach((state, i) => tracker.observe(state, i));
    let changes = 0;
    for (let i = 1; i < states.length; i++) if (states[i].turn !== states[i - 1].turn) changes++;
    expect(onComplete.mock.calls[0][0].totalTurns).toBe(changes + 1);
  });

  it('says a game ended on a dropped double', () => {
    const { tracker, onComplete } = track();
    let state = createInitialState('white');
    tracker.observe(state, 0);
    state = offerDouble(state);
    tracker.observe(state, 10);
    state = respondDouble(state, false);
    tracker.observe(state, 20);

    const record = onComplete.mock.calls[0][0];
    expect(record).toMatchObject({ endReason: 'doubleDropped', winner: 'white', cubeValue: 1, points: 1 });
    expect(record.winnerIsAI).toBe(false);
  });

  it('skips a game it did not see start', () => {
    const { tracker, onComplete } = track();
    const states = playGame(3);
    states.slice(5).forEach((state, i) => tracker.observe(state, i));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('starts over when the board goes back to the opening', () => {
    const { tracker, onComplete } = track();
    const abandoned = playGame(11).slice(0, 20);
    abandoned.forEach((state, i) => tracker.observe(state, i));
    const states = playGame(12);
    states.forEach((state, i) => tracker.observe(state, 100 + i));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].id).toBe('game-2');
    expect(onComplete.mock.calls[0][0].startedAt).toBe(new Date(100).toISOString());
  });

  it('does not count the time the tab was hidden', () => {
    const { tracker, onComplete } = track();
    let state = createInitialState('white');
    tracker.observe(state, 0);
    tracker.setHidden(true, 1_000);
    tracker.setHidden(false, 61_000);
    state = offerDouble(state);
    tracker.observe(state, 62_000);
    state = respondDouble(state, false);
    tracker.observe(state, 63_000);
    expect(onComplete.mock.calls[0][0].durationMs).toBe(3_000);
  });

  it('counts a hit once, even after it is taken back and played again', () => {
    const { tracker } = track();
    const opening = createInitialState('white');
    tracker.observe(opening, 0);
    // Black has split its back checkers, leaving a blot white can hit with a 5.
    const points = [...opening.board.points];
    points[0] = -1;
    points[1] = -1;
    let state = applyRoll({ ...opening, board: { ...opening.board, points } }, [5, 1]);
    tracker.observe(state, 1);
    state = playMove(state, find(state, 5, 5));
    expect(state.board.bar.black).toBe(1);
    tracker.observe(state, 2);
    state = undoMove(state);
    tracker.observe(state, 3);
    state = playMove(state, find(state, 5, 5));
    tracker.observe(state, 4);
    state = playMove(state, find(state, 7, 1));
    expect(state.turn).toBe('black');
    tracker.observe(state, 5);

    const saved = tracker.checkpoint(5)!;
    expect(saved.players.white.hits).toBe(1);
    expect(saved.players.black.hits).toBe(0);
  });

  it('picks a saved recording back up after a reload', () => {
    const states = playGame(5);
    const first = track();
    states.slice(0, 30).forEach((state, i) => first.tracker.observe(state, i * 1000));
    const saved = JSON.parse(JSON.stringify(first.tracker.checkpoint(29_000)));

    // The page comes back an hour later; the gap is nobody's turn.
    const second = track({ restored: parseOpenRecording(saved) });
    states.slice(29).forEach((state, i) => second.tracker.observe(state, 3_600_000 + i * 1000));

    const whole = track();
    states.forEach((state, i) => whole.tracker.observe(state, i * 1000));

    const resumed = second.onComplete.mock.calls[0][0];
    const uninterrupted = whole.onComplete.mock.calls[0][0];
    expect(resumed.id).toBe('game-1');
    expect(resumed.totalTurns).toBe(uninterrupted.totalTurns);
    expect(resumed.durationMs).toBe(uninterrupted.durationMs);
    expect(resumed.players.map((p) => p.hits)).toEqual(uninterrupted.players.map((p) => p.hits));
  });

  it('refuses anything that is not a saved recording', () => {
    expect(parseOpenRecording(null)).toBeNull();
    expect(parseOpenRecording('game')).toBeNull();
    expect(parseOpenRecording({ version: 99 })).toBeNull();
    const { tracker } = track();
    tracker.observe(createInitialState('white'), 0);
    const saved = tracker.checkpoint(0)!;
    expect(parseOpenRecording({ ...saved, players: { white: saved.players.white } })).toBeNull();
    expect(parseOpenRecording(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('knows the opening position', () => {
    expect(isOpeningPosition(createInitialState('black'))).toBe(true);
    expect(isOpeningPosition(roll(createInitialState('white'), createRng(1)))).toBe(false);
  });
});
