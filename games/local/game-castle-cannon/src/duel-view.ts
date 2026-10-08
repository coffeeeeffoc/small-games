import type { Progress } from './progress.js';
import type { Duel, Side } from './duel-types.js';
import type { MatchMode } from './duel-protocol.js';
export type DuelScreen =
  | 'home'
  | 'maps'
  | 'matching'
  | 'playing'
  | 'paused'
  | 'settings'
  | 'help'
  | 'skins'
  | 'result'
  | 'confirm';
export interface DuelView {
  screen: DuelScreen;
  previous: DuelScreen;
  duel: Duel;
  side: Side;
  mode: MatchMode;
  p: Progress;
  scope: boolean;
  scopeX: number;
  scopeY: number;
  message: string;
  waiting: number;
  address: string;
  developer: boolean;
  matchId: string;
}
