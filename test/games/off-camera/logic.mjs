export const cases = [
  {
    id: 'chair', title: '椅子去哪了？', time: '23:08', subtitle: '咖啡还在手里，椅子却不见了。',
    rule: '只发生这两个动作；搬椅时，坐在上面的人会一起被搬走。',
    cards: ['sit', 'move'], count: 2,
    initial: { chair: 'left', boss: 'standing', clerk: 'waiting' },
    target: { chair: 'right', boss: 'floor', clerk: 'right' },
    ending: '搬走的是椅子，留下的是老板的倔强。咖啡一滴没洒。'
  },
  {
    id: 'cream', title: '奶油怎么绕着脸？', time: '23:16', subtitle: '一张干净的脸，一圈不太干净的头发。',
    rule: '纸盘挡住脸中央；奶油留在碰到的表面，拿开纸盘不会擦脸。',
    cards: ['cake', 'unmask', 'mask'], count: 3,
    initial: { mask: 'table', cream: 'none', maskCream: false, cake: true },
    target: { mask: 'hand', cream: 'rim', maskCream: true, cake: false },
    ending: '脸保住了。发型升级成了奶油甜甜圈。'
  },
  {
    id: 'lunch', title: '午餐大盗吃了什么？', time: '23:24', subtitle: '香肠还在，小狗却已经嚼上了。',
    rule: '狗只够得到左盘；餐罩盖左盘，交换时随盘子一起移动。',
    cards: ['steal', 'cover', 'swap'], count: 3,
    initial: { plates: ['sausage', 'broccoli'], food: { sausage: true, broccoli: true }, cover: null, eaten: null, nose: false },
    target: { plates: ['broccoli', 'sausage'], food: { sausage: true, broccoli: false }, cover: 'broccoli', eaten: 'broccoli', nose: false },
    ending: '筹划了一晚，偷到一口西兰花。小狗开始怀疑狗生。'
  }
];
export const actions = {
  move: { label: '搬走椅子', hint: '搬到屏风后', sound: 180 },
  sit: { label: '坐下休息', hint: '老板往下坐', sound: 120 },
  mask: { label: '挡住脸', hint: '举起纸盘', sound: 390 },
  cake: { label: '蛋糕飞来', hint: '奶油撞上去', sound: 90 },
  unmask: { label: '拿开纸盘', hint: '纸盘留在手里', sound: 470 },
  swap: { label: '交换餐盘', hint: '连罩一起换', sound: 280 },
  steal: { label: '小狗偷吃', hint: '只够得到左盘', sound: 220 },
  cover: { label: '盖左餐罩', hint: '扣住左边的盘', sound: 620 }
};
export function step(id, state, action) {
  const s = structuredClone(state);
  if (id === 'chair') {
    if (action === 'move') { s.chair = 'right'; s.clerk = 'right'; if (s.boss === 'seated') s.boss = 'carried'; }
    else if (action === 'sit') s.boss = s.chair === 'left' ? 'seated' : 'floor';
    else throw new Error('这张卡不属于本案');
  } else if (id === 'cream') {
    if (action === 'mask') {
      if (s.mask !== 'table') throw new Error('纸盘已经被拿起来了');
      s.mask = 'face';
    } else if (action === 'cake') {
      s.cake = false; s.cream = s.mask === 'face' ? 'rim' : 'full';
      if (s.mask === 'face') s.maskCream = true;
    } else if (action === 'unmask') {
      if (s.mask !== 'face') throw new Error('脸前还没有纸盘，没法拿开');
      s.mask = 'hand';
    } else throw new Error('这张卡不属于本案');
  } else if (id === 'lunch') {
    if (action === 'swap') s.plates.reverse();
    else if (action === 'cover') s.cover = s.plates[0];
    else if (action === 'steal') {
      const plate = s.plates[0];
      if (s.cover === plate) s.nose = true;
      else { s.food[plate] = false; s.eaten = plate; }
    } else throw new Error('这张卡不属于本案');
  } else throw new Error('未知小案');
  return s;
}
export function simulate(c, order) {
  let state = structuredClone(c.initial);
  const frames = [], used = new Set();
  for (const action of order) {
    if (!c.cards.includes(action) || used.has(action)) return { state, frames, error: '动作卡无效或重复' };
    used.add(action);
    try {
      const after = step(c.id, state, action);
      frames.push({ action, before: state, after }); state = after;
    } catch (e) { return { state, frames, error: e.message }; }
  }
  return { state, frames, error: null };
}
// Only compare visible evidence. A plate hides the cream on the centre of the face.
export function evidence(id, s) {
  if (id === 'chair') return [s.chair, s.boss, s.clerk];
  if (id === 'cream') return [s.mask, s.mask === 'face' && s.cream !== 'none' ? 'rim' : s.cream, s.maskCream, s.cake];
  return [s.plates.join(','), s.food.sausage, s.food.broccoli, s.cover, s.eaten, s.nose];
}
export function matches(c, s, target = c.target) { return JSON.stringify(evidence(c.id, s)) === JSON.stringify(evidence(c.id, target)); }
export function judge(c, order, target = c.target) {
  const result = simulate(c, order);
  return { ...result, won: order.length === c.count && !result.error && matches(c, result.state, target) };
}
export function permutations(items, n = items.length) {
  if (!n) return [[]];
  return items.flatMap((x, i) => permutations(items.filter((_, j) => i !== j), n - 1).map(tail => [x, ...tail]));
}
export function solutions(c, target = c.target) { return permutations(c.cards, c.count).filter(order => judge(c, order, target).won); }
export function mismatch(c, s) {
  const t = c.target;
  if (c.id === 'chair') {
    if (s.boss !== t.boss) return { box: [100, 90, 445, 235], text: '实拍：老板在地上。你的推演：老板跟椅子一起走了。' };
    return { box: [380, 85, 210, 245], text: '看看屏风边：椅子和店员的位置对不上。' };
  }
  if (c.id === 'cream') {
    if (s.mask !== t.mask) return { box: [225, 58, 240, 237], text: '实拍的纸盘已经拿开，留在老板手里。' };
    if (s.cream !== t.cream) return { box: [230, 52, 166, 183], text: '实拍：脸中央干净。你的推演：奶油糊住了整张脸。' };
    return { box: [365, 176, 110, 110], text: '实拍的纸盘上有奶油，你的纸盘却是干净的。' };
  }
  if (s.eaten !== t.eaten) return { box: [166, 153, 230, 177], text: s.eaten === 'sausage' ? '实拍：狗嘴里是西兰花。你的推演：它吃了香肠。' : '实拍：狗嘴里有西兰花。你的推演：餐罩把它挡住了。' };
  if (s.cover !== t.cover) return { box: [93, 126, 404, 135], text: '实拍的餐罩在左盘，你的餐罩跟着盘子去了右边。' };
  return { box: [93, 135, 404, 115], text: '盘子里的午餐和实拍对不上，再看看它们的位置。' };
}
