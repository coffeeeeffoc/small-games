// Reviewed build-time choices only; platform/runtime input never selects executable code.
import { wechatPlatform } from '@coffeeeeffoc/platform-wechat/build';
import { bilibiliPlatform } from '@coffeeeeffoc/platform-bilibili/build';
import { douyinPlatform } from '@coffeeeeffoc/platform-douyin/build';
export const games = {
  'building-power': {
    title: '忙碌的电工',
    definition: 'buildingPowerCanvasDefinition',
    content: 'defaultBuildingPowerEnvelope',
    assets: [{ source: 'public/building-power-audio', target: 'building-power-audio' }],
  },
  cricket: {
    title: '秋声斗蟋',
    definition: 'cricketCanvasDefinition',
    content: 'defaultCricketEnvelope',
    assets: [{ source: 'public/cricket-audio', target: 'cricket-audio' }],
  },
  cultivation: {
    title: '三分钟修仙',
    definition: 'cultivationCanvasDefinition',
    content: 'defaultCultivationEnvelope',
    assets: [{ source: 'src/assets/audio', target: 'trial-audio' }],
  },
  arena: {
    title: '电子斗蛐蛐',
    definition: 'arenaCanvasDefinition',
    content: 'defaultArenaEnvelope',
    assets: [{ source: 'public/arena-audio', target: 'arena-audio' }],
  },
  office: {
    title: '打工人摸鱼记',
    definition: 'officeCanvasDefinition',
    content: 'defaultOfficeEnvelope',
    assets: [{ source: 'public/office-scene/audio', target: 'office-scene/audio' }],
  },
};
export const platforms = {
  wechat: wechatPlatform,
  bilibili: bilibiliPlatform,
  douyin: douyinPlatform,
};
