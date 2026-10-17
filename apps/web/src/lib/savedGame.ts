import type { GameState } from '@backgammon/core';
import { parseGameState } from '@backgammon/runtime';

/** localStorage: the game against the AI, as of its last change. */
export const SAVED_GAME_STORAGE_KEY = 'backgammon:local-game';

/**
 * The game against the AI the last visit left behind, or null for a fresh one.
 *
 * Parsed with the same schema the guest uses on the wire rather than cast: what
 * is in storage was written by whichever release was running then, and an update
 * lands on reload — so a saved game is a frame from an older version exactly as
 * often as a relayed one is, and has to be read with the same suspicion. One
 * that does not parse is a game lost, not a board corrupted, and is said so.
 */
export const loadSavedGame = (): GameState | null => {
  let raw: string | null;
  try {
    raw = localStorage.getItem(SAVED_GAME_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = undefined;
  }
  const state = parseGameState(payload);
  if (!state) console.warn('Saved game could not be restored; starting a new one');
  return state;
};

export const saveGame = (state: GameState) => {
  try {
    localStorage.setItem(SAVED_GAME_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or a full quota: the game still plays, it just will not
    // survive a reload — which is how every game behaved before this existed.
  }
};
