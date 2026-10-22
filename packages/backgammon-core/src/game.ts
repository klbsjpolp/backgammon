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
  played: null,
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
  played: null,
});

const diceFor = ([d1, d2]: [number, number]): number[] => (d1 === d2 ? [d1, d1, d1, d1] : [d1, d2]);

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
  const remaining = diceFor(roll);
  // A player's own new roll answers whatever their last one failed to do.
  const noPlay = state.noPlay?.player === state.turn ? null : state.noPlay;
  const played = { start: state.board, moves: [] };
  const moving: GameState = { ...state, roll, remaining, phase: 'moving', noPlay, played };
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
  // A state from before the log existed has none to extend, and keeps it that
  // way rather than starting one mid-turn that would rewind to the wrong board.
  const played = state.played && { start: state.played.start, moves: [...state.played.moves, move] };
  let next: GameState = { ...state, board, remaining, played };

  if (board.off[state.turn] === CHECKERS_PER_SIDE) {
    const result = detectResult(next, state.turn);
    return { ...next, phase: 'gameOver', result, remaining: [], played: null };
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

// --- Taking a move back ---------------------------------------------------

/**
 * May the player take back the last checker they moved?
 *
 * Only while their turn is still open. The move that spends the last die — or
 * leaves nothing else playable — ends the turn in the same step, so there is no
 * moment to undo it in, and that is deliberate: the alternative is a "confirm
 * the turn" click on every single turn, to protect a move most players never
 * want back.
 */
export const canUndo = (state: GameState, player: Player): boolean =>
  state.phase === 'moving' && state.turn === player && (state.played?.moves.length ?? 0) > 0;

/**
 * Take back the last checker moved this turn.
 *
 * Replays the turn from its starting board minus the last move, rather than
 * running that move backwards. A move can hit, enter from the bar or bear off,
 * and each wants its own inverse — written once more, in the absolute frame, by
 * hand. The replay goes through {@link playMove}, so it is checked as it goes
 * and lands on exactly the state those moves produced the first time, dice
 * order included.
 */
export const undoMove = (state: GameState): GameState => {
  if (!canUndo(state, state.turn) || !state.played || !state.roll) return state;
  const { start, moves } = state.played;
  let next: GameState = { ...state, board: start, remaining: diceFor(state.roll), played: { start, moves: [] } };
  for (const move of moves.slice(0, -1)) next = playMove(next, move);
  return next;
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
  };
};
