import type { GameState, Player, Rng } from '@backgammon/core';
import {
  canDouble,
  createInitialState,
  currentLegalMoves,
  offerDouble,
  opponent,
  playMove,
  respondDouble,
  roll,
} from '@backgammon/core';
import type { BackgammonAction, BackgammonGameConfig } from './actionSchema.js';
import { serializeView, type BackgammonView } from './views.js';

export interface HostSnapshot {
  state: GameState;
  seating: number[];
  players: Record<number, Player>;
}

export interface HostOptions {
  /** Seat indices in play, in seating order (from the server's `gameStarted`). */
  seating: number[];
  /**
   * Seat index that takes the first turn (the server's `currentSeatIndex`). When
   * given, the player on that seat starts so the host stays in lockstep with the
   * server's abstract turn pointer.
   */
  startingSeatIndex?: number;
  config?: BackgammonGameConfig;
  /** Injectable RNG for deterministic tests/replays. Defaults to Math.random. */
  rng?: Rng;
}

/**
 * Host-authoritative backgammon runtime (seat 0 in an online room). Owns the
 * canonical {@link GameState}, maps seats to colors, validates and applies the
 * actions relayed from each seat, and produces a per-seat {@link BackgammonView}.
 * Dice are rolled here so a guest can never forge them.
 */
export class BackgammonHost {
  private state: GameState;
  private seating: number[] = [];
  private readonly seatToPlayer = new Map<number, Player>();
  private readonly playerToSeat = new Map<Player, number>();
  private readonly rng: Rng;

  constructor(options: HostOptions) {
    if (options.seating.length !== 2) {
      throw new Error('backgammon requires exactly two seats');
    }
    this.rng = options.rng ?? Math.random;
    // First seat in seating order plays white, the second black.
    const [whiteSeat, blackSeat] = options.seating;
    this.setSeating(options.seating, { [whiteSeat]: 'white', [blackSeat]: 'black' });
    const startingPlayer =
      options.startingSeatIndex !== undefined
        ? (this.seatToPlayer.get(options.startingSeatIndex) ?? 'white')
        : (options.config?.startingPlayer ?? 'white');
    this.state = createInitialState(startingPlayer);
  }

  /** Color assigned to a seat, or undefined if the seat isn't in play. */
  playerForSeat(seatIndex: number): Player | undefined {
    return this.seatToPlayer.get(seatIndex);
  }

  getState(): GameState {
    return this.state;
  }

  /** Seat index of the player currently on roll. */
  currentSeatIndex(): number {
    return this.playerToSeat.get(this.state.turn)!;
  }

  viewFor(seatIndex: number): BackgammonView {
    const player = this.seatToPlayer.get(seatIndex);
    if (!player) throw new Error(`unknown seat ${seatIndex}`);
    return serializeView(this.state, player);
  }

  /** Validate and apply an action from a seat. Throws on any illegal action. */
  applyAction(seatIndex: number, action: BackgammonAction): void {
    const player = this.seatToPlayer.get(seatIndex);
    if (!player) throw new Error(`unknown seat ${seatIndex}`);

    switch (action.type) {
      case 'roll': {
        this.requireTurn(player);
        if (this.state.phase !== 'rolling') throw new Error('cannot roll right now');
        this.state = roll(this.state, this.rng);
        return;
      }
      case 'move': {
        this.requireTurn(player);
        if (this.state.phase !== 'moving') throw new Error('cannot move right now');
        const legal = currentLegalMoves(this.state).find(
          (m) => m.from === action.from && m.to === action.to && m.die === action.die,
        );
        if (!legal) throw new Error('illegal move');
        this.state = playMove(this.state, legal);
        return;
      }
      case 'offerDouble': {
        if (!canDouble(this.state, player)) throw new Error('cannot double');
        this.state = offerDouble(this.state);
        return;
      }
      case 'respondDouble': {
        if (this.state.phase !== 'doubleOffered') throw new Error('no double to respond to');
        if (this.state.doubleOfferedBy !== opponent(player)) throw new Error('not your double to answer');
        this.state = respondDouble(this.state, action.accept);
        return;
      }
    }
  }

  snapshot(): HostSnapshot {
    return {
      state: this.state,
      seating: [...this.seating],
      players: Object.fromEntries(this.seatToPlayer),
    };
  }

  /**
   * Adopt a snapshot wholesale. A snapshot can come from a *different* host
   * instance (that is the point of `snapshotRestore`: whoever takes over as host
   * after a disconnect rebuilds from it), so the seating and seat→color mapping
   * are restored alongside the state rather than keeping this instance's own.
   */
  restore(snapshot: HostSnapshot): void {
    if (snapshot.seating.length !== 2) {
      throw new Error('backgammon requires exactly two seats');
    }
    this.setSeating(snapshot.seating, snapshot.players);
    this.state = snapshot.state;
  }

  private setSeating(seating: number[], players: Record<number, Player>): void {
    this.seating = [...seating];
    this.seatToPlayer.clear();
    this.playerToSeat.clear();
    for (const seatIndex of this.seating) {
      const player = players[seatIndex];
      if (!player) throw new Error(`no color assigned to seat ${seatIndex}`);
      this.seatToPlayer.set(seatIndex, player);
      this.playerToSeat.set(player, seatIndex);
    }
    if (this.playerToSeat.size !== 2) {
      throw new Error('seating must cover both colors exactly once');
    }
  }

  private requireTurn(player: Player): void {
    if (this.state.turn !== player) throw new Error('not your turn');
  }
}
