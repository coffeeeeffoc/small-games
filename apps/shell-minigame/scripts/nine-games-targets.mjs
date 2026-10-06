// Scope frozen from dev e07dc064 GameCatalog.featuredGameOrder on 2026-10-06.
// New catalog registrations must not change this release batch.
export const scopeCommit = 'e07dc06483bd7fe0b9fdfe219e06362fce3c0caf';
export const nineGames = [
  { id: 'carding-car', title: '浪湾卡丁车', directory: 'games/local/carding-car', cocos: true },
  {
    id: 'cops-robbers',
    title: '围捕小队',
    directory: 'games/local/cops-robbers',
    entry: 'src/native.js',
    start: 'startNativeCopsGame',
    orientation: 'portrait',
    assets: [],
  },
  {
    id: 'cops-robbers-realtime',
    title: '别跑！街区围捕',
    directory: 'games/local/cops-robbers-realtime',
    entry: 'src/native.js',
    start: 'startNativeStreetGame',
    orientation: 'landscape',
    assets: [['src/assets/home-city.png', 'home-city.png']],
  },
  {
    id: 'letters-words2',
    title: '词屿 · 字母叠叠乐',
    directory: 'games/local/letters-words2',
    entry: 'native.js',
    start: 'startNativeLettersGame',
    orientation: 'portrait',
    assets: [['assets', 'assets']],
  },
  {
    id: 'vibeJam-myself-history-guess',
    title: '此时·此地',
    directory: 'games/local/vibeJam-myself-history-guess',
    entry: 'native.js',
    start: 'startNativeHistoryGame',
    orientation: 'portrait',
    assets: [['public/assets', 'assets']],
  },
  {
    id: 'xiangqi-five',
    title: '象五子棋',
    directory: 'platforms/competition/xiangqi-five',
    entry: 'native.js',
    start: 'startNativeXiangqiGame',
    orientation: 'portrait',
    assets: [],
  },
  {
    id: 'travel-bund',
    title: '江风入境 · 外滩漫游',
    directory: 'games/local/travel-bund',
    blocked:
      'React DOM / R3F / HTML UI require a real native WebGL scene and UI port; H5 export is not a mini-game package.',
  },
  {
    id: 'night-overwatch',
    title: '夜航守望',
    directory: 'games/local/night-overwatch',
    cocos: true,
  },
  {
    id: 'wulong-city',
    title: '乌龙城',
    directory: 'games/local/wulong-city',
    entry: 'native.js',
    start: 'startNativeWulongGame',
    orientation: 'landscape',
    assets: [],
  },
];
export const fivePlatforms = ['wechat', 'bilibili', 'douyin', 'kuaishou', 'alipay'];
export function appIdVariable(game, platform) {
  return `MINIGAME_${game}_${platform}_APP_ID`.toUpperCase().replaceAll('-', '_');
}
export function targetOptions(game, platform, { preview = false, env = process.env } = {}) {
  const key = appIdVariable(game, platform);
  const appId = env[key] || '';
  const formats = {
    wechat: /^wx[\da-f]{16}$/i,
    bilibili: /^biligame[A-Za-z0-9]+$/,
    douyin: /^tt[A-Za-z0-9]+$/,
    kuaishou: /^[A-Za-z0-9_-]{6,128}$/,
    alipay: /^\d{16}$/,
  };
  if (typeof appId !== 'string' || (appId && !formats[platform]?.test(appId)))
    throw new Error(`Invalid public AppID in ${key}`);
  if (!preview && !appId)
    throw new Error(
      `Release requires ${key}; explicitly use --preview for unconfigured local builds.`,
    );
  const apiUrl = env.MINIGAME_COMPETITION_API_URL || '';
  if (apiUrl && !/^https:\/\/[^\s/@]+(?:\/|$)/.test(apiUrl))
    throw new Error('MINIGAME_COMPETITION_API_URL must be a public HTTPS URL without credentials.');
  // Never spread process.env into client configuration: secrets remain server-side.
  return {
    game,
    platform,
    appId,
    apiUrl,
    preview,
    competitionConfigured: Boolean(appId && apiUrl && platform !== 'alipay'),
  };
}
