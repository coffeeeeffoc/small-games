import { parseWordList } from './engine.js';

// Version 1 keeps its theme order stable so shared dates always start on the same island.
export const collections = [
  { name: '林间漫游', text: 'forest 森林\nflower 花朵\nleaf 叶子\nriver 河流\nbird 鸟儿\nsunshine 阳光' },
  { name: '海风来信', text: 'ocean 海洋\nwave 海浪\nisland 岛屿\nshell 贝壳\nsand 沙子\nbreeze 微风' },
  { name: '生活碎片', text: "coffee 咖啡\napple 苹果\nbook 书本\nmusic 音乐\ncan't 不能\nsmile 微笑" },
  { name: '漫游宇宙', text: 'planet 行星\nmoon 月亮\nstar 星星\nspace 太空\nrocket 火箭\ndream 梦想' },
  { name: '甜甜日常', text: "ice-cream 冰淇淋\ncake 蛋糕\nhoney 蜂蜜\nlemon 柠檬\npeach 桃子\ndon't 不要" },
  { name: '街角寻味', text: 'noodles 面条\ndumpling 饺子\nsoup 汤\nrice 米饭\npotato 土豆\ncarrot 胡萝卜' },
  { name: '小小天气站', text: 'rain 雨\nsnow 雪\ncloud 云朵\nwind 风\nrainbow 彩虹\nthunder 雷声' },
  { name: '动物来做客', text: 'panda 熊猫\nrabbit 兔子\nturtle 乌龟\nfox 狐狸\nwhale 鲸鱼\nkoala 考拉' },
];

// Short, fixed vocabulary adventures. Keep v1 words and order stable for shared links.
export const miniIslands = Object.freeze([
  { id: 'dawn', name: '早餐开张', icon: '☀', description: '备好鸡蛋、牛奶和面包', text: 'egg 鸡蛋\nmilk 牛奶\nbread 面包', finds: ['鸡蛋上桌', '倒一杯牛奶', '面包出炉'] },
  { id: 'shore', name: '海边拾光', icon: '≋', description: '听海浪，拾贝壳，踩沙滩', text: 'wave 海浪\nshell 贝壳\nsand 沙子', finds: ['听见海浪', '拾到贝壳', '留下一串脚印'] },
  { id: 'orbit', name: '星空出发', icon: '✦', description: '从月亮与星星走向太空', text: 'moon 月亮\nstar 星星\nspace 太空', finds: ['月亮升起', '点亮一颗星', '向太空出发'] },
]);
export function miniIsland(id) {
  const island = miniIslands.find(item => item.id === id);
  if (!island) throw new Error('三词小岛无效。');
  return { ...island, entries: parseWordList(island.text) };
}

export function validDay(day) {
  if (typeof day !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(day)) return false;
  const time = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day;
}
export function today(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function seededRandom(key) {
  let seed = 2166136261;
  for (const char of key) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function dailyIsland(day) {
  if (!validDay(day)) throw new Error('每日词岛日期无效。');
  const dayIndex = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000);
  const collection = collections[dayIndex % collections.length];
  return { entries: parseWordList(collection.text), name: `${day} · ${collection.name}` };
}
export function parseChallenge(search) {
  const params = new URLSearchParams(search);
  if (!params.has('daily') && !params.has('mini')) return { day: null, error: false };
  if (search.length > 512 || ['daily', 'mini', 'v'].some(key => params.getAll(key).length > 1)
      || params.has('daily') && params.has('mini') || ![null, '1'].includes(params.get('v'))) return { day: null, error: true };
  if (params.has('mini')) return miniIslands.some(item => item.id === params.get('mini'))
    ? { day: null, mini: params.get('mini'), error: false } : { day: null, error: true };
  if (!validDay(params.get('daily'))) return { day: null, error: true };
  return { day: params.get('daily'), error: false };
}
export function miniUrl(location, id) {
  miniIsland(id);
  const url = publicUrl(location);
  url.searchParams.set('mini', id);
  url.searchParams.set('v', '1');
  return url.href;
}
export function challengeUrl(location, day) {
  if (!validDay(day)) throw new Error('每日词岛日期无效。');
  const url = publicUrl(location);
  url.searchParams.set('daily', day);
  url.searchParams.set('v', '1');
  return url.href;
}
function publicUrl(location) {
  const url = new URL(location.href);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('请通过网页地址打开词岛。');
  url.username = ''; url.password = '';
  url.search = ''; url.hash = '';
  return url;
}
