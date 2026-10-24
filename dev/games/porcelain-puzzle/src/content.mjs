export const VERSION = 'porcelain-v1';
export const WIDTH = 240;
export const HEIGHT = 300;
export const shapes = [
  {
    id: 'meiping',
    name: '梅瓶',
    profile: [
      [0, 34],
      [0.05, 37],
      [0.12, 24],
      [0.22, 30],
      [0.34, 77],
      [0.48, 91],
      [0.68, 81],
      [0.9, 52],
      [1, 49],
    ],
  },
  {
    id: 'yuhuchun',
    name: '玉壶春瓶',
    profile: [
      [0, 45],
      [0.08, 29],
      [0.3, 26],
      [0.46, 58],
      [0.62, 91],
      [0.8, 87],
      [0.95, 44],
      [1, 46],
    ],
  },
  {
    id: 'jar',
    name: '将军罐',
    profile: [
      [0, 20],
      [0.04, 49],
      [0.1, 59],
      [0.14, 50],
      [0.2, 80],
      [0.34, 96],
      [0.8, 94],
      [0.95, 72],
      [1, 70],
    ],
  },
  {
    id: 'bowl',
    name: '莲瓣碗',
    profile: [
      [0, 102],
      [0.08, 108],
      [0.25, 101],
      [0.52, 80],
      [0.76, 50],
      [0.9, 31],
      [1, 35],
    ],
    aspect: 0.7,
  },
  {
    id: 'plate',
    name: '花口盘',
    profile: [
      [0, 20],
      [0.04, 49],
      [0.14, 79],
      [0.3, 102],
      [0.5, 112],
      [0.7, 102],
      [0.86, 79],
      [0.96, 49],
      [1, 20],
    ],
    aspect: 1,
  },
  {
    id: 'goblet',
    name: '高足杯',
    profile: [
      [0, 86],
      [0.08, 88],
      [0.3, 74],
      [0.44, 44],
      [0.5, 15],
      [0.82, 12],
      [0.88, 30],
      [0.96, 65],
      [1, 65],
    ],
  },
  {
    id: 'perfume',
    name: '香露瓶',
    profile: [
      [0, 28],
      [0.12, 28],
      [0.15, 16],
      [0.25, 16],
      [0.3, 67],
      [0.42, 79],
      [0.9, 79],
      [1, 66],
    ],
  },
  {
    id: 'moon',
    name: '抱月瓶',
    profile: [
      [0, 30],
      [0.13, 25],
      [0.24, 57],
      [0.4, 98],
      [0.6, 106],
      [0.8, 80],
      [0.94, 42],
      [1, 46],
    ],
  },
  {
    id: 'mirror',
    name: '圆光镜',
    profile: [
      [0, 28],
      [0.05, 63],
      [0.18, 94],
      [0.38, 105],
      [0.55, 90],
      [0.7, 45],
      [0.74, 13],
      [0.93, 13],
      [1, 24],
    ],
  },
  {
    id: 'flask',
    name: '玲珑壶',
    profile: [
      [0, 27],
      [0.07, 35],
      [0.16, 26],
      [0.27, 48],
      [0.4, 91],
      [0.6, 97],
      [0.85, 72],
      [1, 58],
    ],
  },
];
export const themes = [
  {
    name: '青花缠枝',
    short: '青花初见',
    material: 'porcelain',
    ink: '#24589a',
    base: '#fff7e2',
    accent: '#c29a52',
    motif: 'flower',
  },
  {
    name: '山水远岫',
    short: '山水入瓷',
    material: 'porcelain',
    ink: '#17446f',
    base: '#f0f5ec',
    accent: '#8ca9aa',
    motif: 'mountain',
  },
  {
    name: '粉彩春庭',
    short: '粉彩春庭',
    material: 'porcelain',
    ink: '#bd6680',
    base: '#fff5e8',
    accent: '#679180',
    motif: 'flower',
  },
  {
    name: '朱砂游鱼',
    short: '釉里流红',
    material: 'porcelain',
    ink: '#aa483d',
    base: '#fff3dd',
    accent: '#c89951',
    motif: 'fish',
  },
  {
    name: '青瓷竹影',
    short: '一色天青',
    material: 'celadon',
    ink: '#3e817d',
    base: '#bfe0d4',
    accent: '#a4bd87',
    motif: 'bamboo',
  },
  {
    name: '琉璃星河',
    short: '琉璃星河',
    material: 'glass',
    ink: '#355b9a',
    base: '#b9ddeb',
    accent: '#edc364',
    motif: 'stars',
  },
  {
    name: '琥珀花窗',
    short: '琥珀微光',
    material: 'glass',
    ink: '#995327',
    base: '#f4ce80',
    accent: '#fcf1c3',
    motif: 'window',
  },
  {
    name: '玫瑰冰晶',
    short: '冰晶花语',
    material: 'glass',
    ink: '#a05787',
    base: '#edc2df',
    accent: '#fff0ff',
    motif: 'crystal',
  },
  {
    name: '银镜月华',
    short: '镜里月华',
    material: 'mirror',
    ink: '#647e9d',
    base: '#cfdfeb',
    accent: '#e2bd73',
    motif: 'moon',
  },
  {
    name: '鎏金百花',
    short: '金彩拾光',
    material: 'porcelain',
    ink: '#c39644',
    base: '#1d416b',
    accent: '#f5d78c',
    motif: 'flower',
  },
];
export const vessels = themes.flatMap((theme, t) =>
  shapes.map((shape, s) => ({
    id: `vessel-${String(t * 10 + s + 1).padStart(3, '0')}`,
    shape: s,
    theme: t,
    ...theme,
    name: `${theme.name}·${shape.name}`,
  })),
);
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(n, seed) {
  const a = Array.from({ length: n }, (_, i) => i);
  const r = random(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function chapterOrder(chapter) {
  const order = shuffled(10, 22031 + chapter);
  if (chapter === 0) {
    const i = order.indexOf(0);
    [order[0], order[i]] = [order[i], order[0]];
  }
  return order;
}
export const levels = themes.flatMap((theme, chapter) =>
  chapterOrder(chapter).map((s, i) => {
    const index = chapter * 10 + i;
    const count =
      index < 5 ? 6 + Math.floor(index / 2) : Math.min(40, 8 + Math.floor(index / 4) * 2);
    return {
      id: `level-${String(index + 1).padStart(3, '0')}`,
      number: index + 1,
      chapter,
      vesselId: vessels[chapter * 10 + s].id,
      pieces: count,
      seed: 77127 + index * 7919,
      timeMs: (50 + count * 4) * 1000,
      reviveMs: 45000,
      maxRevives: 1,
      hints: 2,
      snap: 18,
    };
  }),
);
export function levelAt(number) {
  return levels[Math.max(0, Math.min(99, Math.trunc(Number(number) || 1) - 1))];
}
export function vesselFor(level) {
  return vessels.find((v) => v.id === level.vesselId);
}
export function outline(vessel) {
  const { profile, aspect = 1.25 } = shapes[vessel.shape];
  const height = Math.min(HEIGHT - 12, WIDTH * aspect),
    top = (HEIGHT - height) / 2;
  const right = [];
  for (let i = 0; i <= 48; i++) {
    const y = i / 48;
    let j = 1;
    while (j < profile.length - 1 && profile[j][0] < y) j++;
    const [y0, x0] = profile[j - 1],
      [y1, x1] = profile[j];
    const t = (y - y0) / (y1 - y0);
    const w = x0 + (x1 - x0) * (t * t * (3 - 2 * t));
    right.push({ x: WIDTH / 2 + w, y: top + y * height });
  }
  return [...right, ...[...right].reverse().map((p) => ({ x: WIDTH - p.x, y: p.y }))];
}
export function validateContent() {
  if (
    vessels.length !== 100 ||
    levels.length !== 100 ||
    new Set(vessels.map((v) => v.id)).size !== 100
  )
    throw Error('Invalid catalogue');
  for (const l of levels)
    if (!vesselFor(l) || l.pieces < 2 || l.timeMs <= 0 || l.reviveMs <= 0)
      throw Error(`Invalid ${l.id}`);
  return true;
}
