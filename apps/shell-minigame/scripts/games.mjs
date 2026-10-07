// Reviewed build-time choices only; platform/runtime input never selects executable code.
import { wechatPlatform } from '@coffeeeeffoc/platform-wechat/build';
import { bilibiliPlatform } from '@coffeeeeffoc/platform-bilibili/build';
import { douyinPlatform } from '@coffeeeeffoc/platform-douyin/build';
import { kuaishouPlatform } from '@coffeeeeffoc/platform-kuaishou/build';
import { wulongSharedSourcePlugin } from '@coffeeeeffoc/wulong-city/build-plugin';
export const games = {
  'three-choose-two': {
    title: '三块选两块',
    root: 'three-choose-two',
    module: '@coffeeeeffoc/three-choose-two/canvas',
    manifest: 'native/manifest.json',
    definition: 'threeChooseTwoCanvasDefinition',
    content: 'defaultThreeChooseTwoEnvelope',
    configureCompetition: true,
    configureAdvertising: true,
    orientation: 'portrait',
    assets: [{ source: 'native/assets/audio', target: 'assets/audio' }],
  },
  'retreat-rally': {
    title: '收兵再冲',
    root: 'retreat-rally',
    orientation: 'landscape',
    module: '@coffeeeeffoc/retreat-rally/canvas',
    definition: 'rallyCanvasDefinition',
    content: 'defaultRallyEnvelope',
    assets: [{ source: 'assets', target: 'rally-assets' }],
  },
  'flick-arena': {
    title: '弹指擂台',
    root: 'flick-arena',
    module: '@coffeeeeffoc/flick-arena/canvas',
    definition: 'flickCanvasDefinition',
    content: 'defaultFlickEnvelope',
    assets: [{ source: 'public/audio', target: 'audio' }],
  },
  'wulong-city': {
    title: '乌龙城',
    root: 'wulong-city',
    module: '@coffeeeeffoc/wulong-city/canvas',
    manifest: 'native/manifest.json',
    definition: 'wulongCityCanvasDefinition',
    content: 'defaultWulongCityEnvelope',
    orientation: 'portrait',
    plugins: [wulongSharedSourcePlugin],
    assets: [
      { source: 'assets/art', target: 'assets/art' },
      { source: 'assets/audio', target: 'assets/audio' },
    ],
  },
  'moss-garden': {
    title: '苔光花园',
    definition: 'mossGardenCanvasDefinition',
    content: 'defaultMossGardenEnvelope',
    orientation: 'portrait',
    assets: [{ source: 'public/moss-garden-audio', target: 'moss-garden-audio' }],
  },
  'castle-cannon': {
    title: '一炮拆城',
    definition: 'castleCannonCanvasDefinition',
    content: 'defaultCastleCannonEnvelope',
    orientation: 'landscape',
    configureAdvertising: true,
    assets: [
      { source: 'public/castle-cannon-audio', target: 'castle-cannon-audio' },
      { source: 'public/castle-cannon-art', target: 'castle-cannon-art' },
    ],
  },
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
  kuaishou: kuaishouPlatform,
};
