import { useEffect, useState } from 'react';
import type { GameState, Player } from '@backgammon/core';
import { APP_VERSION } from '@/lib/appVersion';
import { reportGameCompleted } from '@/lib/gameAnalytics';
import { createGameStatsTracker, parseOpenRecording } from '@/lib/gameStats';
import type { GameStatsMode, GameStatsRecord, GameStatsTracker, OpenRecording } from '@/lib/gameStats';

/** localStorage: the recording of the local game, saved alongside the game itself. */
export const GAME_STATS_STORAGE_KEY = 'backgammon:local-game-stats';

const loadRecording = (): OpenRecording | null => {
  try {
    const raw = localStorage.getItem(GAME_STATS_STORAGE_KEY);
    return raw === null ? null : parseOpenRecording(JSON.parse(raw));
  } catch {
    return null;
  }
};

const saveRecording = (recording: OpenRecording | null) => {
  try {
    if (recording) localStorage.setItem(GAME_STATS_STORAGE_KEY, JSON.stringify(recording));
    else localStorage.removeItem(GAME_STATS_STORAGE_KEY);
  } catch {
    // Storage unavailable: the game is still reported if it ends in this page.
  }
};

interface UseGameStatsOptions {
  mode: GameStatsMode;
  /** The AI's colour in the local game; null online. */
  aiPlayer: Player | null;
}

/**
 * Reports each finished game once. Pass `state = null` wherever this client is
 * not the one to report: the online guest, since the host sees the same game and
 * one report per game is what makes the counts mean anything.
 *
 * The local game is restored on reload (see savedGame.ts), so its recording is
 * saved with it, on every change and when the page is hidden; otherwise the game
 * iOS evicts in the background is the one that never reports. The online host
 * has nothing to resume — a reload loses its seat — so it keeps nothing.
 */
export const useGameStats = (state: GameState | null, { mode, aiPlayer }: UseGameStatsOptions): void => {
  const persist = mode === 'local';
  const [record, setRecord] = useState<GameStatsRecord | null>(null);

  // Created once; the callback only stores the record, and the report happens in
  // an effect after commit — never inside a render or a state updater, which
  // StrictMode runs twice.
  const [tracker] = useState<GameStatsTracker>(() =>
    createGameStatsTracker({
      appVersion: APP_VERSION,
      mode,
      aiPlayer,
      onComplete: setRecord,
      restored: persist ? loadRecording() : null,
    }),
  );

  useEffect(() => {
    if (!state) return;
    const now = Date.now();
    tracker.observe(state, now);
    if (persist) saveRecording(tracker.checkpoint(now));
  }, [state, tracker, persist]);

  useEffect(() => {
    if (record) reportGameCompleted(record);
  }, [record]);

  // A hidden tab in the local game is a game nobody is playing, so its time is
  // not counted. Online it says nothing: the opponent is still thinking.
  useEffect(() => {
    if (mode !== 'local') return;
    const hide = (hidden: boolean) => {
      const now = Date.now();
      tracker.setHidden(hidden, now);
      saveRecording(tracker.checkpoint(now));
    };
    const onVisibilityChange = () => hide(document.visibilityState === 'hidden');
    const onPageHide = () => hide(true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [mode, tracker]);
};
