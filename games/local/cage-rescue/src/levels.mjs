/** Game-owned content, measured in a 390 × 700 portrait playfield. */
export const CONTENT_VERSION = 1;
export const VIEWPORT = Object.freeze({ width: 390, height: 700 });

const cage = (id, x, y, hp = 1) => ({ id, x, y, w: 50, h: 54, hp });
const brick = (id, x, y, w = 54) => ({ id, x, y, w, h: 18, hp: 1 });
const row = (prefix, xs, y) => xs.map((x, i) => brick(`${prefix}-${i + 1}`, x, y));
const makeLevel = (index, name, subtitle, hint, cages, bricks, changes = {}) => ({
  schemaVersion: CONTENT_VERSION,
  id: `rescue-${String(index + 1).padStart(2, '0')}`,
  name,
  subtitle,
  hint,
  unlockAfter: index ? `rescue-${String(index).padStart(2, '0')}` : null,
  target: cages.length,
  lives: 3,
  ballSpeed: 250,
  personSpeed: 38,
  paddleWidth: 108,
  releaseGap: 2.0,
  cages,
  bricks,
  ...changes,
});

export const LEVELS = [
  makeLevel(
    0,
    '初次救援',
    '先破笼，再接住',
    '队友会缓慢下落。先把挡板移到队友下方。',
    [
      cage('a', 49, 108),
      cage('b', 170, 108),
      cage('c', 291, 108),
      cage('d', 49, 211),
      cage('e', 170, 211),
      cage('f', 291, 211),
    ],
    [...row('lower', [89, 247], 305), brick('upper', 168, 181)],
    { initialAngle: -0.38 },
  ),
  makeLevel(
    1,
    '左右照应',
    '把接球与接人串起来',
    '挡板边缘能改变球的方向，让球去往下一位队友。',
    [
      cage('a', 39, 112),
      cage('b', 170, 146),
      cage('c', 301, 112),
      cage('d', 63, 239),
      cage('e', 170, 260),
      cage('f', 277, 239),
    ],
    [...row('bridge', [36, 170, 300], 337), ...row('upper', [105, 229], 215)],
    { initialAngle: 0.4 },
  ),
  makeLevel(
    2,
    '双重锁扣',
    '有些笼子需要两次命中',
    '双重锁扣会先破一层，可以留下最后一下，等路线合适再救。',
    [
      cage('a', 49, 108, 2),
      cage('b', 170, 108, 2),
      cage('c', 291, 108, 2),
      cage('d', 49, 240),
      cage('e', 170, 203),
      cage('f', 291, 240),
    ],
    [...row('bridge', [54, 168, 282], 330), ...row('upper', [107, 227], 188)],
    { ballSpeed: 258, initialAngle: -0.38 },
  ),
  makeLevel(
    3,
    '阶梯营救',
    '从顺手的一侧开始',
    '笼子的高度不同，留意队友到达挡板的先后顺序。',
    [
      cage('a', 35, 107, 2),
      cage('b', 143, 142),
      cage('c', 251, 177, 2),
      cage('d', 67, 235),
      cage('e', 175, 270, 2),
      cage('f', 283, 305),
    ],
    [
      brick('step-a', 91, 180, 45),
      brick('step-b', 199, 221, 45),
      brick('step-c', 115, 355),
      brick('step-d', 234, 382),
    ],
    { ballSpeed: 265, paddleWidth: 104, initialAngle: 0.42 },
  ),
  makeLevel(
    4,
    '两翼救援',
    '别让两边一起着急',
    '先释放一侧的队友，再把球带到另一侧。',
    [
      cage('a', 38, 111, 2),
      cage('b', 104, 191),
      cage('c', 38, 280, 2),
      cage('d', 302, 111, 2),
      cage('e', 236, 191),
      cage('f', 302, 280, 2),
    ],
    [...row('center', [167], 130), ...row('center2', [167], 232), ...row('lower', [85, 250], 373)],
    { ballSpeed: 272, personSpeed: 40, paddleWidth: 104, initialAngle: -0.43 },
  ),
  makeLevel(
    5,
    '全员待命',
    '一个都不能少',
    '救回全部队友才算通关。规划破笼顺序，把每个人都接回家。',
    [
      cage('a', 49, 106, 2),
      cage('b', 170, 146, 2),
      cage('c', 291, 106, 2),
      cage('d', 49, 272, 2),
      cage('e', 170, 234),
      cage('f', 291, 272, 2),
    ],
    [...row('upper', [104, 228], 197), ...row('lower', [39, 168, 297], 368)],
    { ballSpeed: 280, personSpeed: 40, paddleWidth: 100, initialAngle: 0.38 },
  ),
];

/** Reusable geometry; campaign blueprints choose routes instead of mirroring training. */
const steel = (id, x, y, w, h = 14, group) => ({
  id,
  x,
  y,
  w,
  h,
  material: 'steel',
  ...(group ? { group } : {}),
});
const armor = (id, x, y, w = 70, hp = 6) => ({ ...brick(id, x, y, w), hp });
const device = (id, kind, x, y, extra = {}) => ({
  id,
  kind,
  x,
  y,
  w: 32,
  h: 26,
  charges: 1,
  ...extra,
});
const formation = (points) =>
  points.map(([x, y], i) => cage(String.fromCharCode(97 + i), x, y, i % 2 ? 1 : 2));

function buildRoute(route, variant) {
  const v = variant;
  if (route === 'vault') {
    const left = 112 - v * 5,
      right = 278 + v * 5,
      floor = 274 + v * 8;
    const gap = 38 - v * 4,
      middle = [195, 215, 175][v];
    return {
      cages: formation([
        [40, 105],
        [300, 105],
        [40, 237],
        [300, 237],
        [170, 335],
        [170, 121],
      ]),
      bricks: [
        armor('vault-armor', 45, v === 2 ? 340 : 390, 78, 4 + v * 2),
        armor('vault-armor-r', 267, v === 2 ? 340 : 390, 78, 4),
      ],
      barriers: [
        steel('roof', left, 86, right - left),
        steel('west', left, 100, 14, floor - 100),
        steel('east', right - 14, 100, 14, floor - 100),
        steel('lip-l', left, floor, middle - gap / 2 - left),
        steel('lip-r', middle + gap / 2, floor, right - middle - gap / 2),
      ],
      devices: [device('vault-core', v === 2 ? 'pulse' : 'splitter', 179, 211, { radius: 150 })],
    };
  }
  if (route === 'gallery') {
    // An actual side entrance: the lower half of the right wall is separated by a slit.
    const floor = 286 + v * 10,
      slit = 42 - v * 4;
    return {
      cages: formation([
        [42, 110],
        [163, 110],
        [292, 110],
        [42, 223],
        [163, 223],
        [285, 326],
      ]),
      bricks: [
        armor('gallery-plug', 35, v === 1 ? 340 : 366, 108, 4 + v * 2),
        brick('gallery-step', 190, 396, 60),
      ],
      barriers: [
        steel('gallery-roof', 28, 82, 214),
        steel('gallery-wall', 28, 96, 12, floor - 96),
        steel('gallery-floor', 28, floor, 214),
        steel('gallery-top', 230, 96, 12, 84),
        steel('gallery-bottom', 230, 180 + slit, 12, floor - 180 - slit),
      ],
      devices: [device('gallery-core', v === 1 ? 'pulse' : 'splitter', 111, 181, { radius: 155 })],
    };
  }
  if (route === 'towers') {
    return {
      cages: formation([
        [48, 107],
        [292, 107],
        [48, 221],
        [292, 221],
        [133, 320],
        [211, 320],
      ]),
      bricks: [
        armor('tower-l', 42, 298, 72, 4 + v * 2),
        armor('tower-r', 276, 298, 72, 6),
        armor('tower-base', 156, 408, 78, 4),
      ],
      barriers: [
        steel('tower-left', 128, 90, 14, 190 + v * 10),
        steel('tower-right', 248, 90, 14, 190 + v * 10),
      ],
      devices: [
        device('tower-core', v === 0 ? 'splitter' : 'pulse', 179, 177 + v * 15, { radius: 160 }),
      ],
    };
  }
  if (route === 'switchback') {
    const shift = v * 12;
    return {
      cages: formation([
        [40, 108],
        [170, 108],
        [300, 108],
        [40, 236],
        [170, 236],
        [300, 236],
      ]),
      bricks: [
        armor('gate-shield', 30 + shift, 398, 90, 4 + v * 2),
        armor('gate-shield-r', 270 - shift, 398, 90, 4),
      ],
      barriers: [
        steel('gate-l', 26, 190, 139, 14, 'A'),
        steel('gate-r', 199, 190, 165, 14, 'A'),
        steel('gate-step', 140 + shift, 321, 105, 14),
      ],
      devices: [
        device('gate-key', 'switch', 180 - shift, 374, { group: 'A' }),
        device('gate-split', 'splitter', 114, 118),
      ],
    };
  }
  if (route === 'stairwell') {
    return {
      cages: formation([
        [34, 108],
        [156, 108],
        [287, 108],
        [49, 220],
        [173, 253],
        [293, 307],
      ]),
      bricks: [
        armor('step-a', 34, 300, 72, 4),
        armor('step-b', 144, 351, 72, 4 + v * 2),
        armor('step-c', 270, 396, 72, 6),
      ],
      barriers: [steel('stair-a', 102, 192, 66 + v * 6), steel('stair-b', 229, 239, 66 + v * 6)],
      devices: [
        device(
          'stair-core',
          v === 1 ? 'switch' : 'pulse',
          44,
          370,
          v === 1 ? { group: 'A' } : { radius: 160 },
        ),
      ],
    };
  }
  if (route === 'well') {
    const gap = 42 - v * 4;
    return {
      cages: formation([
        [44, 107],
        [296, 107],
        [44, 228],
        [296, 228],
        [170, 112],
        [170, 220],
      ]),
      bricks: [armor('well-l', 35, 381, 82, 6), armor('well-r', 273, 381, 82, 4 + v * 2)],
      barriers: [
        steel('well-left', 119, 90, 14, 248),
        steel('well-right', 257, 90, 14, 248),
        steel('well-roof', 133, 90, 124),
        steel('well-lip-l', 133, 338, 62 - gap / 2),
        steel('well-lip-r', 195 + gap / 2, 338, 62 - gap / 2),
      ],
      devices: [device('well-core', 'splitter', 179, 293)],
    };
  }
  if (route === 'crossfire') {
    return {
      cages: formation([
        [42, 106],
        [170, 141],
        [298, 106],
        [42, 252],
        [170, 286],
        [298, 252],
      ]),
      bricks: [
        armor('cross-a', 27, 205, 92, 4 + v * 2),
        armor('cross-b', 271, 205, 92, 6),
        armor('cross-c', 146, 230, 98, 6),
        armor('cross-d', 95, 389, 86, 4),
        armor('cross-e', 209, 389, 86, 4),
      ],
      barriers: [steel('cross-post', 187, 365, 16, 66)],
      devices: [
        device('cross-pulse', 'pulse', 179, 91, { radius: 160 }),
        device('cross-split', 'splitter', v === 1 ? 310 : 48, 337),
      ],
    };
  }
  // Armor is the first introduction: clear alternatives around a broad barricade.
  return {
    cages: formation(
      v === 0
        ? [
            [40, 108],
            [170, 108],
            [300, 108],
            [73, 226],
            [247, 226],
            [170, 307],
          ]
        : v === 1
          ? [
              [34, 110],
              [152, 148],
              [294, 110],
              [34, 272],
              [176, 253],
              [294, 272],
            ]
          : [
              [49, 110],
              [170, 180],
              [291, 110],
              [49, 290],
              [170, 303],
              [291, 290],
            ],
    ),
    bricks: [
      armor('armor-a', 30, 381, 94, 4 + v * 2),
      armor('armor-b', 148, 402, 94, 6),
      armor('armor-c', 266, 381, 94, 4 + v * 2),
      armor('armor-high', 157, v === 2 ? 250 : 245 - v * 18, 76, 4),
    ],
    barriers: [],
    devices: v ? [device('armor-pulse', 'pulse', 179, 92, { radius: 160 })] : [],
  };
}

const blueprints = [
  ['装甲工地', 'armor', 0, '橙色装甲要反复撞击，数字是剩余次数。也可以从两侧绕行。'],
  ['分球密室', 'vault', 0, '从下方窄缝钻进密室，撞中三球标记，放出两颗新球。'],
  ['侧门回廊', 'gallery', 0, '沿右墙反弹进入侧门；回廊里的分球器能帮你清理笼子。'],
  ['双塔夹击', 'towers', 0, '两道竖墙分开三条路线，先撞中央分球器，再击穿两侧装甲。'],
  ['开闸救援', 'switchback', 0, '先撞钥匙机关，带 A 标记的闸门会永久打开。'],
  ['阶梯爆破', 'stairwell', 0, '橙色爆破器能震掉附近装甲两层，沿台阶逐层推进。'],
  ['风井探入', 'well', 0, '瞄准中央井口，把球送进分球舱；接人时留意风中落点。'],
  ['交叉火力', 'crossfire', 0, '侧翼分球、顶部爆破，选择先打通哪一条装甲路线。'],
  ['厚壁仓库', 'armor', 1, '耐心凿穿厚甲，或绕上方触发爆破，削弱周围装甲。'],
  ['偏门机房', 'vault', 1, '入口偏在右边，利用挡板边缘改变角度，钻进去再分球。'],
  ['侧廊震荡', 'gallery', 1, '从侧缝进入，撞亮爆破器；装甲每次受击都保留损伤。'],
  ['双塔共振', 'towers', 1, '把球送入中间长廊，撞击爆破器削弱两边塔脚。'],
  ['钢梁捷径', 'switchback', 1, '钢梁不能撞碎，先击中下方钥匙，打开上层捷径。'],
  ['错层钥匙', 'stairwell', 1, '左下钥匙打开阶梯钢梁，接着沿空出的路线营救。'],
  ['深井分裂', 'well', 1, '长井入口更窄；在井内分出三球，一次打开更多锁扣。'],
  ['火力走廊', 'crossfire', 1, '右侧分球器在装甲之外，先取得多球再向中心推进。'],
  ['重甲堡垒', 'armor', 2, '八层装甲需要持续撞击。绕到顶层爆破器可以节省次数。'],
  ['爆破暗室', 'vault', 2, '穿过左偏窄缝，命中暗室爆破器；再沿两翼救援。'],
  ['医疗回廊', 'gallery', 2, '狭小侧门通向分球器；先救医疗员补充球机会。'],
  ['双塔拆解', 'towers', 2, '高墙分路、重甲封底；中央爆破器可以同时削弱两翼。'],
  ['连锁开闸', 'switchback', 2, '下方钥匙打开闸门，继续向顶层分球器推进。'],
  ['阶梯突围', 'stairwell', 2, '从低处爆破器开路，再在错层障碍之间反弹救人。'],
  ['极夜深井', 'well', 2, '瞄准最窄井口，取得多球；外侧队友要跟随风向接应。'],
  ['黎明协作', 'crossfire', 2, '分球、爆破、重甲和小队支援组合，规划两翼与中央的救援顺序。'],
];

for (const [offset, [name, route, variant, hint]] of blueprints.entries()) {
  const stage = offset + 7;
  const geometry = buildRoute(route, variant);
  if (route === 'stairwell' && variant === 1)
    geometry.barriers.forEach((item) => {
      item.group = 'A';
    });
  geometry.cages = geometry.cages.map((item, i) => ({
    ...item,
    role: i === 0 ? 'engineer' : stage >= 25 && i === 4 ? 'medic' : 'teammate',
  }));
  LEVELS.push(
    makeLevel(
      stage - 1,
      name,
      {
        armor: '持续破甲',
        vault: '窄缝机关室',
        gallery: '侧门回廊',
        towers: '双塔分路',
        switchback: '钥匙开闸',
        stairwell: '错层路线',
        well: '深井分球',
        crossfire: '组合火力',
      }[route],
      hint,
      geometry.cages,
      geometry.bricks,
      {
        ...geometry,
        route,
        chapter:
          stage < 13 ? '机关入门' : stage < 19 ? '路线挑战' : stage < 25 ? '重甲突围' : '协作终章',
        ballSpeed: 265 + variant * 8,
        personSpeed: 38,
        paddleWidth: 108,
        releaseGap: 2.2,
        wind:
          stage >= 13 && stage !== 19
            ? { amplitude: 12 + variant * 3, period: 8, phase: stage % 3 }
            : null,
        initialAngle: route === 'well' || route === 'vault' ? -0.08 : -0.38,
      },
    ),
  );
}

/** Mirror the entire assembly together: apertures and device links stay intact. */
export function createEndlessLevel(wave = 1, seed = 0) {
  if (!Number.isSafeInteger(wave) || wave < 1) throw new RangeError('Invalid endless wave.');
  const hash = Math.imul((seed >>> 0) ^ wave, 2654435761) >>> 0;
  const layout = LEVELS[(wave - 1) % LEVELS.length];
  const shiftX = (hash % 5) - 2;
  const all = [
    ...layout.cages,
    ...layout.bricks,
    ...(layout.barriers || []),
    ...(layout.devices || []),
  ];
  const shiftY = Math.max(80 - Math.min(...all.map((item) => item.y)), ((hash >>> 8) % 5) - 2);
  const advanced = wave > LEVELS.length;
  const shape = (item) => ({
    ...item,
    x: (hash & 128 ? VIEWPORT.width - item.x - item.w : item.x) + shiftX,
    y: item.y + shiftY,
  });
  return {
    ...structuredClone(layout),
    id: `endless-${wave}`,
    name: `无尽救援 · 第 ${wave} 波`,
    unlockAfter: null,
    wave,
    hint:
      hash & 128
        ? layout.hint.replace(/[左右]/g, (direction) => (direction === '左' ? '右' : '左'))
        : layout.hint,
    initialAngle: (hash & 128 ? -1 : 1) * layout.initialAngle,
    ballSpeed: advanced ? Math.max(281, layout.ballSpeed) : layout.ballSpeed,
    wind: advanced ? layout.wind || { amplitude: 18, period: 8, phase: wave % 3 } : layout.wind,
    cages: layout.cages.map((item, i) => ({
      ...shape(item),
      hp: advanced ? 2 : item.hp,
      role: advanced ? (i === 0 ? 'engineer' : i === 4 ? 'medic' : 'teammate') : item.role,
    })),
    bricks: layout.bricks.map((item) => ({
      ...shape(item),
      hp: advanced ? Math.max(2, item.hp) : item.hp,
    })),
    barriers: (layout.barriers || []).map(shape),
    devices: (layout.devices || []).map(shape),
  };
}

/** Return all content errors, keeping validation usable by tests and content tooling. */
export function validateLevels(levels = LEVELS) {
  const errors = [];
  const levelIds = new Set();
  if (!Array.isArray(levels) || levels.length < 1) return ['At least one level is required.'];
  for (const [index, level] of levels.entries()) {
    const prefix = `Level ${index + 1}`;
    if (!level.id || levelIds.has(level.id)) errors.push(`${prefix}: duplicate or missing id.`);
    levelIds.add(level.id);
    if (level.schemaVersion !== CONTENT_VERSION)
      errors.push(`${prefix}: unsupported content version.`);
    if (level.unlockAfter !== (index ? levels[index - 1].id : null))
      errors.push(`${prefix}: invalid unlock dependency.`);
    if (level.target !== level.cages?.length || level.lives !== 3)
      errors.push(`${prefix}: expected all teammates rescued and three lives.`);
    if (!Array.isArray(level.cages) || level.cages.length !== 6)
      errors.push(`${prefix}: six cages are required.`);
    if (!Number.isFinite(level.ballSpeed) || level.ballSpeed < 200 || level.ballSpeed > 320)
      errors.push(`${prefix}: unsafe ball speed.`);
    if (!Number.isFinite(level.personSpeed) || level.personSpeed < 25 || level.personSpeed > 48)
      errors.push(`${prefix}: unsafe falling speed.`);
    if (!Number.isFinite(level.paddleWidth) || level.paddleWidth < 96 || level.paddleWidth > 130)
      errors.push(`${prefix}: unsafe paddle width.`);
    if (!Number.isFinite(level.releaseGap) || level.releaseGap < 1.5)
      errors.push(`${prefix}: insufficient landing separation.`);
    if (
      level.wind &&
      (!Number.isFinite(level.wind.amplitude) ||
        level.wind.amplitude < 0 ||
        level.wind.amplitude > 24 ||
        !Number.isFinite(level.wind.period) ||
        level.wind.period < 6 ||
        !Number.isFinite(level.wind.phase))
    )
      errors.push(`${prefix}: invalid wind field.`);
    for (const member of level.cages || [])
      if (member.role && !['teammate', 'engineer', 'medic'].includes(member.role))
        errors.push(`${prefix}: unknown teammate role.`);
    if (level.barriers && (!Array.isArray(level.barriers) || level.barriers.length > 16))
      errors.push(`${prefix}: invalid barriers.`);
    if (level.devices && (!Array.isArray(level.devices) || level.devices.length > 4))
      errors.push(`${prefix}: invalid devices.`);
    for (const item of Array.isArray(level.devices) ? level.devices : []) {
      if (
        !['splitter', 'switch', 'pulse'].includes(item.kind) ||
        !Number.isInteger(item.charges) ||
        item.charges < 1 ||
        item.charges > 2
      )
        errors.push(`${prefix}: invalid device.`);
      if (
        item.kind === 'switch' &&
        (!item.group || !level.barriers?.some((wall) => wall.group === item.group))
      )
        errors.push(`${prefix}: missing gate group.`);
      if (
        item.kind === 'pulse' &&
        (!Number.isFinite(item.radius) || item.radius < 40 || item.radius > 180)
      )
        errors.push(`${prefix}: invalid pulse radius.`);
      if (
        item.kind === 'pulse' &&
        !level.bricks?.some(
          (brick) =>
            Math.hypot(
              Math.max(brick.x - (item.x + item.w / 2), 0, item.x + item.w / 2 - brick.x - brick.w),
              Math.max(brick.y - (item.y + item.h / 2), 0, item.y + item.h / 2 - brick.y - brick.h),
            ) <= item.radius,
        )
      )
        errors.push(`${prefix}: pulse has no reachable armor target.`);
    }
    for (const wall of Array.isArray(level.barriers) ? level.barriers : [])
      if (
        wall.material !== 'steel' ||
        (wall.group &&
          !level.devices?.some((item) => item.kind === 'switch' && item.group === wall.group))
      )
        errors.push(`${prefix}: invalid barrier or unlinked gate.`);
    const ids = new Set();
    const entities = [
      ...(level.cages || []),
      ...(level.bricks || []),
      ...(Array.isArray(level.barriers) ? level.barriers : []),
      ...(Array.isArray(level.devices) ? level.devices : []),
    ];
    for (const entity of entities) {
      if (!entity.id || ids.has(entity.id))
        errors.push(`${prefix}: duplicate or missing entity id.`);
      ids.add(entity.id);
      if (
        ![entity.x, entity.y, entity.w, entity.h].every(Number.isFinite) ||
        entity.w <= 0 ||
        entity.h <= 0 ||
        entity.x < 20 ||
        entity.x + entity.w > 370 ||
        entity.y < 80 ||
        entity.y + entity.h > 440
      )
        errors.push(`${prefix}: entity outside the upper playfield.`);
      if (
        entity.material === 'steel' &&
        (Math.min(entity.w, entity.h) > 20 || Math.max(entity.w, entity.h) > 300)
      )
        errors.push(`${prefix}: unsafe barrier size.`);
      if (
        entity.material !== 'steel' &&
        !entity.kind &&
        (!Number.isInteger(entity.hp) ||
          entity.hp < 1 ||
          entity.hp > (level.cages?.includes(entity) ? 2 : 8))
      )
        errors.push(`${prefix}: unsupported durability.`);
    }
    for (let i = 0; i < entities.length; i++)
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i],
          b = entities[j];
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y)
          errors.push(`${prefix}: overlapping entities ${a.id} and ${b.id}.`);
      }
  }
  return errors;
}
