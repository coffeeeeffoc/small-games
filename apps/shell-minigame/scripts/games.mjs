// Reviewed build-time choices only; platform/runtime input never selects executable code.
import { wechatPlatform } from '@coffeeeeffoc/platform-wechat/build';
import { bilibiliPlatform } from '@coffeeeeffoc/platform-bilibili/build';
import { douyinPlatform } from '@coffeeeeffoc/platform-douyin/build';
import { kuaishouPlatform } from '@coffeeeeffoc/platform-kuaishou/build';
import { wulongSharedSourcePlugin } from '@coffeeeeffoc/wulong-city/build-plugin';
export const games = {
  'place-and-clear': {
    title: '摆消乐',
    root: 'place-and-clear',
    storageGameId: 'three-choose-two',
    module: '@coffeeeeffoc/place-and-clear/canvas',
    manifest: 'native/manifest.json',
    definition: 'placeAndClearCanvasDefinition',
    content: 'defaultPlaceAndClearEnvelope',
    configureCompetition: true,
    configureAdvertising: true,
    orientation: 'portrait',
    assets: [{ source: 'native/assets', target: 'assets' }],
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
};
export const platforms = {
  wechat: wechatPlatform,
  bilibili: bilibiliPlatform,
  douyin: douyinPlatform,
  kuaishou: kuaishouPlatform,
};
