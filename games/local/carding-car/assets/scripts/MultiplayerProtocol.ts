import type { KartInput } from './KartConfig.ts';
import type { RaceManager } from './RaceManager.ts';
import type { Selection } from './Selection.ts';

export const multiplayerVersion = 2;
export const maxRacers = 8;
export type Appearance = Pick<Selection, 'vehicle' | 'driver'>;
export type RoomMember = Appearance & {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  loadedRevision: number;
};
export type Racer = Appearance & { id: string; name: string; bot: boolean };
export type RoomState = {
  code: string;
  hostId: string;
  phase: 'lobby' | 'loading' | 'racing' | 'finished';
  theme: string;
  route: string;
  vehicle: string;
  driver: string;
  revision: number;
  bots: number;
  members: RoomMember[];
  raceId: number;
  seed: number;
  roster: Racer[];
  ranked?: boolean;
  settlement?: 'practice' | 'pending' | 'saved' | 'failed';
};
export type RaceSnapshot = {
  raceId: number;
  tick: number;
  phase: RaceManager['phase'];
  time: number;
  countdown: number;
  drivers: Pick<RaceManager['drivers'][number], 'kart' | 'progress'>[];
  itemAvailableAt: number[];
  order: number[];
};
export type ClientMessage =
  | ({
      type: 'create';
      version: number;
      name: string;
      theme: string;
      route: string;
      bots: number;
      ranked?: boolean;
      competitionToken?: string;
    } & Appearance)
  | ({ type: 'join'; version: number; name: string; code: string; competitionToken?: string } & Appearance)
  | { type: 'resume'; version: number; code: string; token: string }
  | { type: 'bots'; count: number }
  | ({ type: 'selection' } & Selection)
  | { type: 'prepared'; revision: number }
  | { type: 'ready'; ready: boolean }
  | { type: 'loaded'; raceId: number }
  | { type: 'input'; raceId: number; seq: number; input: KartInput }
  | { type: 'start' | 'leave' | 'rematch' };
export type ServerMessage =
  | { type: 'joined'; selfId: string; token: string; room: RoomState }
  | { type: 'room'; room: RoomState }
  | { type: 'state'; state: RaceSnapshot }
  | { type: 'error'; message: string; fatal?: boolean };
