/**
 * Board geometry & conventions
 * ---------------------------------------------------------------------------
 * `points` is a length-24 array of signed checker counts:
 *   - positive => that many WHITE checkers on the point
 *   - negative => that many BLACK checkers on the point
 *   - zero     => empty
 *
 * Absolute index 0..23. WHITE moves from high indices toward low (23 -> 0) and
 * bears off below 0; WHITE's home board is indices 0..5. BLACK is the mirror:
 * it moves 0 -> 23, bears off above 23, and its home board is indices 18..23.
 *
 * All rule logic is implemented in a "normalized" frame where the mover always
 * moves 23 -> 0 (see board.ts), so the engine never special-cases black.
 */
export type Player = 'white' | 'black';

export interface Board {
  /** Length 24. + = white checkers, - = black checkers, 0 = empty. */
  points: number[];
  /** Checkers sitting on the bar, waiting to re-enter. */
  bar: Record<Player, number>;
  /** Checkers borne off the board. 15 = win. */
  off: Record<Player, number>;
}

/** Win severity, before applying the doubling cube. */
export type WinKind = 'single' | 'gammon' | 'backgammon';

export interface GameResult {
  winner: Player;
  kind: WinKind;
  /** Base points (1/2/3) multiplied by the cube value at game end. */
  points: number;
  cubeValue: number;
}

export interface DoublingCube {
  value: number;
  /** `null` => centered (either player may double). */
  owner: Player | null;
}

/**
 * A single checker move using one die.
 * `from`/`to` are absolute point indices; the sentinels below cover bar/off.
 */
export const BAR = -1 as const;
export const OFF = 24 as const;

export interface Move {
  /** Absolute source index, or {@link BAR} to enter from the bar. */
  from: number;
  /** Absolute destination index, or {@link OFF} to bear off. */
  to: number;
  /** Die pip value consumed (1..6). */
  die: number;
  /** True when this move hits an opponent blot at `to`. */
  hit: boolean;
}

export type GamePhase = 'rolling' | 'moving' | 'doubleOffered' | 'gameOver';

export interface GameState {
  board: Board;
  turn: Player;
  phase: GamePhase;
  /** The raw two dice rolled this turn, or null before rolling. */
  roll: [number, number] | null;
  /** Remaining die pips still playable this turn (doubles expand to four). */
  remaining: number[];
  cube: DoublingCube;
  /** When phase === 'doubleOffered', the player who offered the double. */
  doubleOfferedBy: Player | null;
  /**
   * A roll that could not be played at all — every die blocked, most often a
   * failed entry from the bar — and so passed the turn straight back.
   *
   * The turn state alone cannot carry this: passing the turn clears `roll`, so
   * without it the dice are gone before anything has drawn them and the player
   * is told nothing except that it is suddenly the opponent's move. It stays set
   * until the player who rolled it rolls again, which keeps it on screen for the
   * whole of the opponent's reply rather than flashing past.
   */
  noPlay: NoPlay | null;
  result: GameResult | null;
}

/** A roll that had no legal move, kept so the UI can say so. */
export interface NoPlay {
  player: Player;
  roll: [number, number];
}
