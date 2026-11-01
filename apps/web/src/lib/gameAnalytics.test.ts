import { describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/react';
import { reportGameCompleted } from './gameAnalytics';
import type { GameStatsPlayer, GameStatsRecord } from './gameStats';

const end = vi.fn();
vi.mock('@sentry/react', () => ({
  captureEvent: vi.fn(),
  startInactiveSpan: vi.fn(() => ({ end })),
}));

const player = (overrides: Partial<GameStatsPlayer>): GameStatsPlayer => ({
  color: 'white',
  isAI: false,
  turns: 20,
  playTimeMs: 60_000,
  hits: 2,
  checkersOff: 15,
  pipsLeft: 0,
  isWinner: true,
  ...overrides,
});

const record: GameStatsRecord = {
  id: 'game-1',
  schemaVersion: 1,
  appVersion: 'v1.2.3',
  mode: 'local',
  startedAt: '2026-11-01T10:00:00.000Z',
  endedAt: '2026-11-01T10:05:00.000Z',
  durationMs: 100_000,
  totalTurns: 39,
  winner: 'white',
  winnerIsAI: false,
  resultKind: 'gammon',
  endReason: 'borneOff',
  cubeValue: 2,
  points: 4,
  players: [player({}), player({ color: 'black', isAI: true, hits: 1, checkersOff: 0, pipsLeft: 87, isWinner: false })],
};

describe('reportGameCompleted', () => {
  it('sends the breakdown as tags and the numbers on a span lasting the game', () => {
    reportGameCompleted(record);

    expect(Sentry.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'game.completed',
        fingerprint: ['game.completed'],
        tags: expect.objectContaining({
          'game.mode': 'local',
          'game.winner_kind': 'human',
          'game.result_kind': 'gammon',
          'game.end_reason': 'borneOff',
          'game.cube_value': '2',
        }),
      }),
    );
    expect(Sentry.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        forceTransaction: true,
        startTime: new Date(record.startedAt),
        attributes: expect.objectContaining({ 'game.white_hits': 2, 'game.loser_pips_left': 87 }),
      }),
    );
    expect(end).toHaveBeenCalledWith(new Date(record.endedAt));
  });

  it('names the AI as the winner, and sends no span for a game with no usable times', () => {
    vi.mocked(Sentry.startInactiveSpan).mockClear();
    const [white, black] = record.players;
    reportGameCompleted({
      ...record,
      winner: 'black',
      winnerIsAI: true,
      startedAt: 'not a date',
      players: [
        { ...white, isWinner: false },
        { ...black, isWinner: true },
      ],
    });
    expect(Sentry.captureEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ tags: expect.objectContaining({ 'game.winner_kind': 'ai' }) }),
    );
    expect(Sentry.startInactiveSpan).not.toHaveBeenCalled();
  });

  it('reads the loser as white when black wins', () => {
    vi.mocked(Sentry.startInactiveSpan).mockClear();
    reportGameCompleted({ ...record, winner: 'black' });
    expect(Sentry.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({ attributes: expect.objectContaining({ 'game.loser_pips_left': 0 }) }),
    );
  });
});
