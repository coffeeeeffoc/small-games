// 景点坐标、费用与用时均为虚构游戏数值。
export const PLACES = [
  { id: 'oldtown', name: '大理古城', subtitle: '石板路上的慢时光', description: '穿过城门，风把一朵云留在白墙上。', x: 25, y: 49, cost: 18, energy: 16, stamp: '古城', color: '#d88962', detail: '把城楼和远山一起装进取景框，留住这座城的温柔。', flavor: '巷口的花开了，今天适合慢慢走。' },
  { id: 'pagodas', name: '崇圣寺三塔', subtitle: '在千年塔影下停一停', description: '三塔向天而立，苍山把静谧铺在身后。', x: 20, y: 25, cost: 38, energy: 20, stamp: '三塔', color: '#c19b59', detail: '等三座塔与水中的倒影对齐，按下快门。', flavor: '风经过塔铃，时间忽然慢了一拍。' },
  { id: 'meadow', name: '苍山花甸', subtitle: '把自己交给山风', description: '走进一片野花，云影从草尖轻轻掠过。', x: 47, y: 22, cost: 24, energy: 24, stamp: '苍山', color: '#89a86b', detail: '追上花甸间的那束光，让山风也留在照片里。', flavor: '没有赶路，只有风和一整片绿色。' },
  { id: 'village', name: '喜洲古镇', subtitle: '转角遇见稻田与老屋', description: '白族老屋旁，一片稻田正轻轻起伏。', x: 77, y: 24, cost: 26, energy: 20, stamp: '喜洲', color: '#c6ad66', detail: '用白墙作背景，抓住稻浪翻起的金色瞬间。', flavor: '刚出炉的饵块香，替小镇写了一封信。' },
  { id: 'cafe', name: '洱海咖啡', subtitle: '一杯咖啡，一整片蓝', description: '找一个临海的座位，听浪花轻敲岸边。', x: 82, y: 56, cost: 32, energy: 16, stamp: '洱海', color: '#7ba6af', detail: '让咖啡杯沿与海平线相遇，收好午后的蓝。', flavor: '这一杯喝得很慢，刚好等来一朵云。' },
  { id: 'pier', name: '龙龛码头', subtitle: '在水杉旁等一场日落', description: '栈桥伸向水面，远处的天空正染上暖色。', x: 52, y: 71, cost: 18, energy: 18, stamp: '龙龛', color: '#bd8379', detail: '等光落在水面中央，把今天的最后一抹暖色带走。', flavor: '不必走到海的那边，此刻已经很好。' },
];

export function newGame() {
  return { version: 1, day: 1, hour: 8, money: 200, energy: 100, visits: [], memories: 0, status: 'playing', position: { x: 47, y: 85 } };
}

export function starsForScore(score) {
  if (!Number.isFinite(score)) throw new Error('照片评分无效');
  return score >= 85 ? 3 : score >= 55 ? 2 : 1;
}

export function isValidPhoto(value) {
  return typeof value === 'string' && value.length <= 220000
    && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) && !/[\r\n]/.test(value);
}

const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const coordinate = value => Number.isFinite(value) && value >= 0 && value <= 100;

function validState(s) {
  if (!s || s.version !== 1 || s.day !== 1 || !integer(s.hour, 8, 18) || !integer(s.money, 0, 200)
    || !integer(s.energy, 0, 100) || !integer(s.memories, 0, 600) || !['playing', 'finished'].includes(s.status)
    || !s.position || !coordinate(s.position.x) || !coordinate(s.position.y)
    || !Array.isArray(s.visits) || s.visits.length > PLACES.length || s.hour < 8 + 2 * s.visits.length) return false;
  const ids = new Set();
  for (const visit of s.visits) {
    if (!visit || !PLACES.some(p => p.id === visit.id) || ids.has(visit.id)
      || !integer(visit.score, 0, 100) || visit.stars !== starsForScore(visit.score)
      || (visit.photo !== undefined && !isValidPhoto(visit.photo))) return false;
    ids.add(visit.id);
  }
  return s.memories === s.visits.reduce((sum, visit) => sum + visit.score, 0)
    && !(s.status === 'playing' && (s.hour >= 18 || s.visits.length === PLACES.length));
}

function copyState(s) {
  return { version: 1, day: 1, hour: s.hour, money: s.money, energy: s.energy,
    visits: s.visits.map(({ id, score, stars, photo }) => ({ id, score, stars, ...(photo === undefined ? {} : { photo }) })), memories: s.memories,
    status: s.status, position: { x: s.position.x, y: s.position.y } };
}

function assertState(s) {
  if (!validState(s)) throw new Error('旅行存档无效，请重新出发');
}

export function restoreGame(raw) {
  try { return validState(raw) ? copyState(raw) : newGame(); }
  catch { return newGame(); }
}

export function canVisit(state, id) {
  if (!validState(state)) return { ok: false, reason: '旅行存档无效，请重新出发' };
  const place = PLACES.find(p => p.id === id);
  const reason = !place ? '这个目的地还没有开放' : state.status !== 'playing' ? '今天的旅程已经结束'
    : state.visits.some(v => v.id === id) ? '已经收集过这里的回忆啦'
    : state.hour + 2 > 18 ? '天色渐晚，留到下次再来吧'
    : state.money < place.cost ? '旅费不足，换一处风景吧'
    : state.energy < place.energy ? '体力不足，先找个地方歇歇脚吧' : '';
  return { ok: !reason, reason };
}

export function completeVisit(state, id, score, photo) {
  const eligible = canVisit(state, id);
  if (!eligible.ok) throw new Error(eligible.reason);
  if (!Number.isFinite(score)) throw new Error('照片评分无效');
  if (photo !== undefined && !isValidPhoto(photo)) throw new Error('照片格式无效');
  const place = PLACES.find(p => p.id === id);
  const next = copyState(state);
  score = Math.round(Math.max(0, Math.min(100, score)));
  next.hour += 2;
  next.money -= place.cost;
  next.energy -= place.energy;
  next.visits.push({ id, score, stars: starsForScore(score), ...(photo === undefined ? {} : { photo }) });
  next.memories += score;
  next.position = { x: place.x, y: place.y };
  if (next.hour >= 18 || next.visits.length === PLACES.length) next.status = 'finished';
  return next;
}

export function rest(state) {
  assertState(state);
  const reason = state.status !== 'playing' ? '今天的旅程已经结束' : state.energy >= 100 ? '体力满满，继续出发吧'
    : state.money < 15 ? '旅费不足，休息需要 15 元' : state.hour + 1 > 18 ? '天色已晚，该收好今天的回忆了' : '';
  if (reason) throw new Error(reason);
  const next = copyState(state);
  next.money -= 15;
  next.hour += 1;
  next.energy = Math.min(100, next.energy + 30);
  if (next.hour >= 18) next.status = 'finished';
  return next;
}

export function finishTrip(state) {
  assertState(state);
  return { ...copyState(state), status: 'finished' };
}

export function tripTitle(state) {
  assertState(state);
  const count = state.visits.length;
  const average = count ? state.memories / count : 0;
  return count >= 4 && average >= 85 ? '山海摄影师' : count >= 4 ? '风景收藏家'
    : count >= 2 && average >= 85 ? '光影捕手' : count >= 2 ? '自在漫游家' : count ? '追风旅人' : '心向远方';
}
