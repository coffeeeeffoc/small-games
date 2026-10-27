import { CONTROL_GAME_IDS } from '@coffeeeeffoc/service-kit';

// Identity support does not grant ranked rules or extend signed control snapshots.
export const IDENTITY_GAME_IDS = [...CONTROL_GAME_IDS, 'wulong-city'] as const;
export const basicServiceGames: Readonly<Record<string, string>> = {
  'carding-car': '浪湾卡丁车',
  'wulong-city': '乌龙城',
  'night-overwatch': '夜航守望',
};
