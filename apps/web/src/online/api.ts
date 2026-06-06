import type { CreateRoomRequest, RoomSession } from '@klbsjpolp/realtime-core';
import type { BackgammonGameConfig } from '@backgammon/runtime';
import { getApiBaseUrl } from './config';

const GAME_ID = 'backgammon';

const postJson = async <T>(path: string, body: unknown): Promise<T> => {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
        ? payload.message
        : 'Request failed.';
    throw new Error(message);
  }
  return payload as T;
};

export const createOnlineRoom = (config: BackgammonGameConfig): Promise<RoomSession> =>
  postJson<RoomSession>('/rooms', { gameId: GAME_ID, gameConfig: config } satisfies CreateRoomRequest);

export const joinOnlineRoom = (roomCode: string): Promise<RoomSession> =>
  postJson<RoomSession>('/rooms/join', { roomCode });
