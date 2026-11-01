import { CHECKERS_PER_SIDE, createInitialBoard, opponent, pipCount } from '@backgammon/core';
import type { GameState, Player, WinKind } from '@backgammon/core';

/**
 * One record per finished game, built by watching the stream of `GameState`s
 * rather than by instrumenting the engine.
 *
 * It stays out of `@backgammon/core` on purpose: timing reads the wall clock,
 * which the rules engine must never do, and everything else it needs — whose
 * turn it is, the bar, the checkers off, the result — is already on every
 * state. The same tracker therefore serves the local game and the online host
 * without a field added to `GameState` or to the wire.
 *
 * Timestamps are passed in rather than read, so the arithmetic is tested
 * without fake timers. `durationMs` is the sum of both players' `playTimeMs`:
 * time while the tab is hidden is not counted for anyone, so it is not counted
 * for the game either.
 */

export const GAME_STATS_SCHEMA_VERSION = 1;

export type GameStatsMode = 'local' | 'online';

/** Every checker borne off, or a double declined. */
export type GameEndReason = 'borneOff' | 'doubleDropped';

export interface GameStatsPlayer {
  color: Player;
  isAI: boolean;
  /** Turns this player was on roll, a roll that could not be played included. */
  turns: number;
  /** Visible wall-clock time spent on this player's turns. */
  playTimeMs: number;
  /** Opponent checkers this player sent to the bar (net of any taken back). */
  hits: number;
  checkersOff: number;
  /** Pips still to travel at the end — 0 for a winner who bore off. */
  pipsLeft: number;
  isWinner: boolean;
}

export interface GameStatsRecord {
  id: string;
  schemaVersion: number;
  appVersion: string;
  mode: GameStatsMode;
  /** ISO-8601: when the opening position was first seen. */
  startedAt: string;
  endedAt: string;
  durationMs: number;
  totalTurns: number;
  winner: Player;
  winnerIsAI: boolean;
  resultKind: WinKind;
  endReason: GameEndReason;
  cubeValue: number;
  points: number;
  /** White first, then black. */
  players: [GameStatsPlayer, GameStatsPlayer];
}

interface PlayerAccumulator {
  turns: number;
  playTimeMs: number;
  hits: number;
}

/**
 * The game being recorded, in a form that survives `JSON.stringify` — the local
 * game is saved on every change and restored on reload, and a recording that
 * did not come back with it would report nothing for exactly the games iOS
 * evicts in the background.
 */
export interface OpenRecording {
  version: typeof GAME_STATS_SCHEMA_VERSION;
  id: string;
  startedAtMs: number;
  turn: Player;
  totalTurns: number;
  /**
   * The opponent's bar count when the current turn began. Hits are counted as
   * that bar's growth over the turn, not per move: an undo takes a hit back, and
   * counting moves would keep the hit that was taken back.
   */
  opponentBarAtTurnStart: number;
  /** A position other than the opening one has been seen, so a fresh board is a new game. */
  hasLeftOpening: boolean;
  players: Record<Player, PlayerAccumulator>;
}

export interface GameStatsTrackerOptions {
  appVersion: string;
  mode: GameStatsMode;
  /** Which colour the AI plays, or null when both are human. */
  aiPlayer: Player | null;
  onComplete: (record: GameStatsRecord) => void;
  /** A recording to pick up where it left off (the saved local game). */
  restored?: OpenRecording | null;
  generateId?: () => string;
}

export interface GameStatsTracker {
  observe: (state: GameState, nowMs: number) => void;
  setHidden: (hidden: boolean, nowMs: number) => void;
  /**
   * The open recording with the running turn credited up to `nowMs`, for saving.
   * Counting carries on from `nowMs`, so calling this changes no total.
   */
  checkpoint: (nowMs: number) => OpenRecording | null;
}

const OPENING_POINTS = createInitialBoard().points;

/** The position every game starts from, before anyone has rolled. */
export const isOpeningPosition = (state: GameState): boolean =>
  state.phase === 'rolling' &&
  state.roll === null &&
  state.cube.value === 1 &&
  state.board.bar.white === 0 &&
  state.board.bar.black === 0 &&
  state.board.off.white === 0 &&
  state.board.off.black === 0 &&
  state.board.points.every((count, index) => count === OPENING_POINTS[index]);

const defaultGenerateId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `game-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const cloneRecording = (recording: OpenRecording): OpenRecording => ({
  ...recording,
  players: { white: { ...recording.players.white }, black: { ...recording.players.black } },
});

export const createGameStatsTracker = (options: GameStatsTrackerOptions): GameStatsTracker => {
  const generateId = options.generateId ?? defaultGenerateId;
  let open: OpenRecording | null = options.restored ? cloneRecording(options.restored) : null;
  // Kept beside the recording rather than in it: a running segment is a
  // wall-clock instant, which means nothing to a page loaded after it.
  let segmentStartMs: number | null = null;
  let hidden = false;

  const closeSegment = (nowMs: number) => {
    if (open && segmentStartMs !== null) {
      open.players[open.turn].playTimeMs += Math.max(0, nowMs - segmentStartMs);
    }
    segmentStartMs = null;
  };

  const startSegment = (nowMs: number) => {
    if (open && !hidden && segmentStartMs === null) segmentStartMs = nowMs;
  };

  const creditHits = (state: GameState) => {
    if (!open) return;
    const grown = state.board.bar[opponent(open.turn)] - open.opponentBarAtTurnStart;
    open.players[open.turn].hits += Math.max(0, grown);
  };

  const begin = (state: GameState, nowMs: number) => {
    open = {
      version: GAME_STATS_SCHEMA_VERSION,
      id: generateId(),
      startedAtMs: nowMs,
      turn: state.turn,
      totalTurns: 1,
      opponentBarAtTurnStart: state.board.bar[opponent(state.turn)],
      hasLeftOpening: false,
      players: {
        white: { turns: state.turn === 'white' ? 1 : 0, playTimeMs: 0, hits: 0 },
        black: { turns: state.turn === 'black' ? 1 : 0, playTimeMs: 0, hits: 0 },
      },
    };
    segmentStartMs = null;
    startSegment(nowMs);
  };

  const finalize = (state: GameState, nowMs: number) => {
    if (!open || !state.result) return;
    closeSegment(nowMs);
    creditHits(state);

    const { result, board } = state;
    const recording = open;
    const player = (color: Player): GameStatsPlayer => ({
      color,
      isAI: options.aiPlayer === color,
      ...recording.players[color],
      checkersOff: board.off[color],
      pipsLeft: pipCount(board, color),
      isWinner: result.winner === color,
    });
    const players: [GameStatsPlayer, GameStatsPlayer] = [player('white'), player('black')];

    const record: GameStatsRecord = {
      id: recording.id,
      schemaVersion: GAME_STATS_SCHEMA_VERSION,
      appVersion: options.appVersion,
      mode: options.mode,
      startedAt: new Date(recording.startedAtMs).toISOString(),
      endedAt: new Date(nowMs).toISOString(),
      durationMs: players[0].playTimeMs + players[1].playTimeMs,
      totalTurns: recording.totalTurns,
      winner: result.winner,
      winnerIsAI: options.aiPlayer === result.winner,
      resultKind: result.kind,
      // A game only ends two ways: the last checker comes off, or a double is
      // dropped — and a drop leaves the winner with checkers still on the board.
      endReason: board.off[result.winner] === CHECKERS_PER_SIDE ? 'borneOff' : 'doubleDropped',
      cubeValue: result.cubeValue,
      points: result.points,
      players,
    };

    open = null;
    options.onComplete(record);
  };

  return {
    observe(state, nowMs) {
      const opening = isOpeningPosition(state);

      if (opening && (!open || open.hasLeftOpening)) {
        // A board back at the start after play means the last game was abandoned
        // ("Nouvelle partie", a fresh online game): it ends unreported.
        begin(state, nowMs);
        return;
      }
      // A game first seen part-way through has no start to measure from — a
      // reload that lost its recording, a guest promoted to host. Skipping it
      // beats reporting a game of four turns.
      if (!open) return;

      if (!opening) open.hasLeftOpening = true;

      if (state.turn !== open.turn) {
        closeSegment(nowMs);
        creditHits(state);
        open.turn = state.turn;
        open.totalTurns += 1;
        open.players[state.turn].turns += 1;
        open.opponentBarAtTurnStart = state.board.bar[opponent(state.turn)];
      }

      if (state.phase === 'gameOver') {
        finalize(state, nowMs);
        return;
      }
      startSegment(nowMs);
    },

    setHidden(nextHidden, nowMs) {
      if (nextHidden === hidden) return;
      hidden = nextHidden;
      if (hidden) closeSegment(nowMs);
      else startSegment(nowMs);
    },

    checkpoint(nowMs) {
      if (!open) return null;
      if (segmentStartMs !== null) {
        closeSegment(nowMs);
        startSegment(nowMs);
      }
      return cloneRecording(open);
    },
  };
};

/** Reads back a saved recording, or null for anything that is not one. */
export const parseOpenRecording = (value: unknown): OpenRecording | null => {
  if (!value || typeof value !== 'object') return null;
  const r = value as Partial<OpenRecording>;
  const isAccumulator = (a: unknown): a is PlayerAccumulator =>
    !!a &&
    typeof a === 'object' &&
    ['turns', 'playTimeMs', 'hits'].every((key) => Number.isFinite((a as Record<string, unknown>)[key]));
  if (
    r.version !== GAME_STATS_SCHEMA_VERSION ||
    typeof r.id !== 'string' ||
    !Number.isFinite(r.startedAtMs) ||
    (r.turn !== 'white' && r.turn !== 'black') ||
    !Number.isFinite(r.totalTurns) ||
    !Number.isFinite(r.opponentBarAtTurnStart) ||
    typeof r.hasLeftOpening !== 'boolean' ||
    !r.players ||
    !isAccumulator(r.players.white) ||
    !isAccumulator(r.players.black)
  ) {
    return null;
  }
  return cloneRecording(r as OpenRecording);
};
