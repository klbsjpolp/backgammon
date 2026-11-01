import * as Sentry from '@sentry/react';
import type { GameStatsRecord } from '@/lib/gameStats';

/**
 * Sends a finished game to Sentry, the same two-part shape skip-bo uses so both
 * games read the same way in one dashboard:
 *
 * - a `game.completed` message whose **tags** are the categorical breakdown —
 *   Sentry groups every game into one issue, and its tag distribution is "how
 *   many games, how many won by the AI, how many gammons, how many ended on a
 *   dropped double";
 * - a forced `game.completed` **span** carrying the numbers (duration, turns,
 *   hits, cube), which the Trace Explorer can average and percentile by the same
 *   dimensions. `tracesSampleRate` is 1.0, so no game is sampled away.
 *
 * Tags stay low-cardinality; the per-player lines ride in `extra`. No player
 * name is sent: the local game has none, and online ones are whatever a stranger
 * typed into the lobby.
 *
 * Without a DSN Sentry is never initialised and both calls are no-ops.
 */
export const reportGameCompleted = (record: GameStatsRecord): void => {
  const winnerKind = record.winnerIsAI ? 'ai' : 'human';
  const [white, black] = record.players;

  Sentry.captureMessage('game.completed', {
    level: 'info',
    // Without a fingerprint Sentry groups the message by its attached stack
    // trace, whose top frame is a minified name (`$w` on the first deploy) that
    // a rebuild can rename — every release would then open a new issue, and no
    // one issue's tag distribution would cover all the games.
    fingerprint: ['game.completed'],
    tags: {
      'game.mode': record.mode,
      'game.winner_kind': winnerKind,
      'game.winner_color': record.winner,
      'game.result_kind': record.resultKind,
      'game.end_reason': record.endReason,
      'game.cube_value': String(record.cubeValue),
      'game.points': String(record.points),
      'game.app_version': record.appVersion,
    },
    extra: {
      durationMs: record.durationMs,
      totalTurns: record.totalTurns,
      startedAt: record.startedAt,
      players: record.players,
    },
  });

  // Explicit start and end: a span left open would be cut off at the end of the
  // page-load transaction instead of lasting as long as the game did.
  const startMs = Date.parse(record.startedAt);
  const endMs = Date.parse(record.endedAt);
  if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
    const span = Sentry.startInactiveSpan({
      name: 'game.completed',
      op: 'game',
      forceTransaction: true,
      startTime: new Date(startMs),
      attributes: {
        'game.mode': record.mode,
        'game.winner_kind': winnerKind,
        'game.result_kind': record.resultKind,
        'game.end_reason': record.endReason,
        'game.duration_ms': record.durationMs,
        'game.total_turns': record.totalTurns,
        'game.cube_value': record.cubeValue,
        'game.points': record.points,
        'game.white_hits': white.hits,
        'game.black_hits': black.hits,
        'game.loser_pips_left': record.winner === 'white' ? black.pipsLeft : white.pipsLeft,
      },
    });
    span.end(new Date(endMs));
  }

  if (import.meta.env.DEV) console.info('[game-analytics] completed', record);
};
