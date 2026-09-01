import type { GameResult, GameState, Move, Player, WinKind } from './types.js';
import { CHECKERS_PER_SIDE, checkersOn, createInitialBoard, homeRange, opponent } from './board.js';
import { applyMove, isLegalMove, legalMoves } from './moves.js';

export type Rng = () => number;

/** Deterministic, seedable RNG (mulberry32) — handy for tests and replays. */
export const createRng = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const rollDie = (rng: Rng): number => 1 + Math.floor(rng() * 6);

export const rollDice = (rng: Rng = Math.random): [number, number] => [rollDie(rng), rollDie(rng)];

export const createInitialState = (startingPlayer: Player = 'white'): GameState => ({
  board: createInitialBoard(),
  turn: startingPlayer,
  phase: 'rolling',
  roll: null,
  remaining: [],
  cube: { value: 1, owner: null },
  doubleOfferedBy: null,
  noPlay: null,
  result: null,
});

/** Moves available to the player on roll right now (empty unless phase is 'moving'). */
export const currentLegalMoves = (state: GameState): Move[] =>
  state.phase === 'moving' ? legalMoves(state.board, state.turn, state.remaining) : [];

const endTurn = (state: GameState): GameState => ({
  ...state,
  turn: opponent(state.turn),
  phase: 'rolling',
  roll: null,
  remaining: [],
});

const loserTrappedInWinnerHome = (state: GameState, winner: Player, loser: Player): boolean => {
  if (state.board.bar[loser] > 0) return true;
  const [start, end] = homeRange(winner);
  for (let i = start; i <= end; i++) {
    if (checkersOn(state.board, loser, i) > 0) return true;
  }
  return false;
};

const detectResult = (state: GameState, winner: Player): GameResult => {
  const loser = opponent(winner);
  let kind: WinKind = 'single';
  if (state.board.off[loser] === 0) {
    kind = loserTrappedInWinnerHome(state, winner, loser) ? 'backgammon' : 'gammon';
  }
  const base = kind === 'single' ? 1 : kind === 'gammon' ? 2 : 3;
  return { winner, kind, points: base * state.cube.value, cubeValue: state.cube.value };
};

/** Record a dice roll and enter the moving phase (passing the turn if no move is possible). */
export const applyRoll = (state: GameState, roll: [number, number]): GameState => {
  if (state.phase !== 'rolling') return state;
  const [d1, d2] = roll;
  const remaining = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
  // A player's own new roll answers whatever their last one failed to do.
  const noPlay = state.noPlay?.player === state.turn ? null : state.noPlay;
  const moving: GameState = { ...state, roll, remaining, phase: 'moving', noPlay };
  if (legalMoves(moving.board, moving.turn, remaining).length === 0) {
    return { ...endTurn(moving), noPlay: { player: state.turn, roll } };
  }
  return moving;
};

/** Convenience: roll the dice with an RNG and apply them. */
export const roll = (state: GameState, rng: Rng = Math.random): GameState => applyRoll(state, rollDice(rng));

/**
 * Play a move that is already known to be legal, consuming its die.
 *
 * The fast path, for callers that took the move straight out of
 * {@link currentLegalMoves} and would otherwise pay to regenerate the same list
 * — the AI search does this at every node. Anything else should use
 * {@link playMove}, which validates first.
 */
export const applyLegalMove = (state: GameState, move: Move): GameState => {
  const idx = state.remaining.indexOf(move.die);
  // Not defensive padding: at -1 the two slices below overlap and `remaining`
  // *grows*, handing the mover a die they never rolled and a turn that cannot
  // end. This is the one thing the fast path cannot skip checking, and it costs
  // the `indexOf` it was going to do anyway.
  if (idx === -1) {
    throw new Error(`die ${move.die} is not among the remaining dice [${state.remaining.join(', ')}]`);
  }

  const board = applyMove(state.board, state.turn, move);
  const remaining = state.remaining.slice(0, idx).concat(state.remaining.slice(idx + 1));
  let next: GameState = { ...state, board, remaining };

  if (board.off[state.turn] === CHECKERS_PER_SIDE) {
    const result = detectResult(next, state.turn);
    return { ...next, phase: 'gameOver', result, remaining: [] };
  }

  if (remaining.length === 0 || legalMoves(board, state.turn, remaining).length === 0) {
    next = endTurn(next);
  }
  return next;
};

/**
 * Play one checker move, consuming its die. Ends the turn or the game as needed.
 *
 * The move is checked against the legal set first. Applying an unchecked move
 * cannot fail loudly — it just writes a board that the rules can no longer
 * produce (a die that was never rolled goes unconsumed and the turn never ends;
 * landing on a made point overwrites the checkers standing there) — so an
 * illegal move throws rather than quietly corrupting the game.
 */
export const playMove = (state: GameState, move: Move): GameState => {
  if (state.phase !== 'moving') return state;
  if (!isLegalMove(state.board, state.turn, state.remaining, move)) {
    throw new Error(`illegal move: ${move.from} -> ${move.to} with die ${move.die}`);
  }
  return applyLegalMove(state, move);
};

// --- Doubling cube ---------------------------------------------------------

/** May the player on roll offer a double right now? */
export const canDouble = (state: GameState, player: Player): boolean =>
  state.phase === 'rolling' &&
  state.turn === player &&
  state.result === null &&
  (state.cube.owner === null || state.cube.owner === player);

export const offerDouble = (state: GameState): GameState => {
  if (!canDouble(state, state.turn)) return state;
  return { ...state, phase: 'doubleOffered', doubleOfferedBy: state.turn };
};

/**
 * Respond to a pending double. Accepting doubles the cube and hands it to the
 * responder; declining ends the game, conceding the current cube stake.
 */
export const respondDouble = (state: GameState, accept: boolean): GameState => {
  if (state.phase !== 'doubleOffered' || state.doubleOfferedBy === null) return state;
  const offerer = state.doubleOfferedBy;
  const responder = opponent(offerer);
  if (!accept) {
    return {
      ...state,
      phase: 'gameOver',
      doubleOfferedBy: null,
      result: { winner: offerer, kind: 'single', points: state.cube.value, cubeValue: state.cube.value },
    };
  }
  return {
    ...state,
    phase: 'rolling',
    doubleOfferedBy: null,
    cube: { value: state.cube.value * 2, owner: responder },
    // The exchange just answered whatever roll went unplayed before it, so the
    // record is spent. Without this the state it returns to — same turn, back to
    // `rolling`, `noPlay` untouched — is indistinguishable from the moment right
    // after the failed roll, and the UI reads it as news a second time: the dice
    // it draws struck out reappear seconds after the cube changed hands. Only
    // the accepting branch needs it; refusing ends the game.
    noPlay: null,
  };
};
