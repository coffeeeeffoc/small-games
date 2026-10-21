/** Original, asset-free Canvas artwork shared by H5 and native mini-game hosts. */
import { CHAPTERS } from './content.ts';

export interface LevelView {
  id: string;
  number: number;
  chapter: number;
  title: string;
  size: number;
  regions: number[];
}

export interface View {
  width: number;
  height: number;
  page:
    | 'home'
    | 'levels'
    | 'play'
    | 'pause'
    | 'help'
    | 'settings'
    | 'result'
    | 'hint'
    | 'dev-levels';
  level: LevelView;
  levels: LevelView[];
  puzzle: {
    placed: number[];
    excluded: number[];
    mistakes: number;
    hints: number;
    completed: boolean;
    message: string;
  };
  completed: Record<string, { hints: number; mistakes: number; timeMs: number }>;
  unlocked: number;
  elapsedMs: number;
  mode: 'seed' | 'mark';
  sound: boolean;
  vibration: boolean;
  hasActive: boolean;
  activeLevelId?: string;
  continueLevel?: LevelView;
  levelChapter?: number;
  dev: boolean;
  practice?: boolean;
  hintBusy?: boolean;
  jumpNumber?: string;
  notice?: string;
  levelPage?: number;
  native?: boolean;
  challenge?: boolean;
  challengeGoal?: { hints: number; mistakes: number; elapsedMs: number };
  invitationNumber?: number;
  canShare?: boolean;
  minimumTouchSize?: number;
}

export interface HitArea {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

type Ink = CanvasRenderingContext2D;
type Icon =
  | 'back'
  | 'pause'
  | 'help'
  | 'gear'
  | 'seed'
  | 'mark'
  | 'undo'
  | 'hint'
  | 'sound'
  | 'vibration'
  | 'fullscreen'
  | 'check'
  | 'lock'
  | 'leaf'
  | 'next';
const PAPER = '#f5f3e8';
const MOSS = '#264a3d';
const MID = '#69785b';
const LINE = '#b4b89b';
const LIGHT = '#e5e6d6';
const GOLD = '#d5a648';
const SERIF = '"Songti SC", "Noto Serif CJK SC", "SimSun", serif';
const SANS = '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
const REGIONS = [
  '#c8d5a7',
  '#efcec5',
  '#bcd4d9',
  '#d9c8df',
  '#f2ddb5',
  '#bfdbcc',
  '#e5d4a5',
  '#cbd1e7',
  '#dfc6b5',
  '#c9dfdf',
];

function chapterTitle(id: number): string {
  return CHAPTERS.find((chapter) => chapter.id === id)?.title ?? `花圃 ${id}`;
}

function rounded(ctx: Ink, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function text(
  ctx: Ink,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = MOSS,
  font = SANS,
  align: CanvasTextAlign = 'center',
  weight = 400,
): void {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y);
}

function strong(ctx: Ink, value: string, x: number, y: number, size = 24, color = MOSS): void {
  text(ctx, value, x, y, size, color, SANS, 'center', 600);
}

export function resultTitle(view: Pick<View, 'level' | 'challenge'>): string {
  return `第 ${view.level.number} 关 · ${view.challenge ? '挑战完成' : '已通关'}`;
}

function continueLabel(view: View): string {
  const number = (view.continueLevel ?? view.level).number;
  const completed = view.levels.every((level) => view.completed[level.id]);
  return `${view.hasActive ? '继续' : completed ? '重玩' : '开始'}第 ${number} 关`;
}

function line(
  ctx: Ink,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = LINE,
  width = 1,
): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function dot(ctx: Ink, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function leaf(
  ctx: Ink,
  x: number,
  y: number,
  size: number,
  angle: number,
  color = '#708768',
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-size * 0.5, -size * 0.33, -size * 0.31, -size * 0.88, 0, -size);
  ctx.bezierCurveTo(size * 0.43, -size * 0.66, size * 0.46, -size * 0.18, 0, 0);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#f2ecc8';
  ctx.globalAlpha *= 0.52;
  ctx.lineWidth = 0.65;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(size * 0.06, -size * 0.56, 0, -size * 0.89);
  for (let i = 1; i < 4; i++) {
    const yy = -size * (i * 0.18 + 0.12);
    ctx.moveTo(0, yy);
    ctx.lineTo(-size * 0.19, yy - size * 0.12);
    ctx.moveTo(0, yy);
    ctx.lineTo(size * 0.19, yy - size * 0.1);
  }
  ctx.stroke();
  ctx.restore();
}

function sprig(ctx: Ink, x: number, y: number, size = 1, angle = 0, color = '#738367'): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(size, size);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-9, -28, 8, -65, -4, -104);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const yy = -15 - i * 18;
    const xx = Math.sin(i * 0.9) * 4 - 2;
    leaf(ctx, xx, yy, 21 - i * 1.7, -0.8, i % 2 ? '#91a478' : color);
    leaf(ctx, xx, yy - 7, 18 - i * 1.2, 0.95, i % 2 ? color : '#a1ad7e');
  }
  ctx.restore();
}

function flower(ctx: Ink, x: number, y: number, size = 7, color = '#fbf6e0'): void {
  ctx.save();
  ctx.translate(x, y);
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-size * 0.75, -size * 0.42, -size * 0.55, -size * 1.2, 0, -size * 1.17);
    ctx.bezierCurveTo(size * 0.55, -size * 1.2, size * 0.75, -size * 0.42, 0, 0);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#d1c7aa';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  dot(ctx, 0, 0, size * 0.26, GOLD);
  ctx.restore();
}

function seed(ctx: Ink, x: number, y: number, size = 16, glow = true): void {
  ctx.save();
  ctx.translate(x, y);
  if (glow) {
    const light = ctx.createRadialGradient(0, 0, 1, 0, 0, size * 1.9);
    light.addColorStop(0, '#fff6bf');
    light.addColorStop(0.55, 'rgba(249,222,143,0.48)');
    light.addColorStop(1, 'rgba(249,222,143,0)');
    dot(ctx, 0, 0, size * 1.9, light as unknown as string);
    for (let i = 0; i < 7; i++) {
      const angle = (i * Math.PI * 2) / 7;
      line(
        ctx,
        Math.cos(angle) * size * 1.2,
        Math.sin(angle) * size * 1.2,
        Math.cos(angle) * size * 1.5,
        Math.sin(angle) * size * 1.5,
        '#e4bc61',
        1,
      );
    }
  }
  ctx.rotate(0.2);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.bezierCurveTo(size * 0.97, -size * 0.38, size * 0.73, size * 0.73, 0, size);
  ctx.bezierCurveTo(-size * 0.9, size * 0.46, -size * 0.63, -size * 0.54, 0, -size);
  const gold = ctx.createLinearGradient(-size, 0, size, 0);
  gold.addColorStop(0, '#b9882d');
  gold.addColorStop(0.42, '#ffecab');
  gold.addColorStop(0.72, '#e8bc57');
  gold.addColorStop(1, '#a5782b');
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.strokeStyle = '#bf913d';
  ctx.lineWidth = 0.85;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, size * 0.79);
  ctx.quadraticCurveTo(-size * 0.29, 0, 0, -size * 0.74);
  ctx.strokeStyle = '#fff9d9';
  ctx.lineWidth = Math.max(1, size * 0.1);
  ctx.stroke();
  ctx.restore();
}

function icon(ctx: Ink, kind: Icon, x: number, y: number, size = 21, color = MOSS): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'seed') seed(ctx, 0, 0, 9, false);
  else if (kind === 'leaf') {
    leaf(ctx, 0, 8, 18, -0.35, color);
    leaf(ctx, 0, 8, 14, 0.65, color);
  } else if (kind === 'pause') {
    // The pause sign is geometry, so font fallback can never alter its two bars.
    ctx.fillRect(-7, -9, 4, 18);
    ctx.fillRect(3, -9, 4, 18);
  } else if (kind === 'mark') {
    line(ctx, -5, -5, 5, 5, color, 2);
    line(ctx, 5, -5, -5, 5, color, 2);
  } else if (kind === 'back') {
    ctx.beginPath();
    ctx.moveTo(3, -8);
    ctx.lineTo(-5, 0);
    ctx.lineTo(3, 8);
    ctx.stroke();
  } else if (kind === 'next') {
    ctx.beginPath();
    ctx.moveTo(-3, -8);
    ctx.lineTo(5, 0);
    ctx.lineTo(-3, 8);
    ctx.stroke();
  } else if (kind === 'help') text(ctx, '?', 0, 1, 23, color, SERIF);
  else if (kind === 'undo') {
    ctx.beginPath();
    ctx.moveTo(-7, -5);
    ctx.lineTo(2, -5);
    ctx.bezierCurveTo(14, -5, 13, 10, 3, 10);
    ctx.lineTo(-4, 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-3, -10);
    ctx.lineTo(-8, -5);
    ctx.lineTo(-3, 0);
    ctx.stroke();
  } else if (kind === 'hint') {
    ctx.beginPath();
    ctx.arc(0, -2, 6.5, Math.PI * 0.1, Math.PI * 0.9, true);
    ctx.lineTo(-3, 7);
    ctx.lineTo(3, 7);
    ctx.closePath();
    ctx.stroke();
    line(ctx, -3, 10, 3, 10, color, 1.8);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (i * Math.PI) / 4;
      line(
        ctx,
        Math.cos(a) * 10,
        -2 + Math.sin(a) * 10,
        Math.cos(a) * 13,
        -2 + Math.sin(a) * 13,
        color,
        1.5,
      );
    }
  } else if (kind === 'check') {
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.lineTo(-2, 5);
    ctx.lineTo(8, -6);
    ctx.stroke();
  } else if (kind === 'lock') {
    rounded(ctx, -6, -1, 12, 11, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -2, 4, Math.PI, 0);
    ctx.stroke();
  } else if (kind === 'gear') {
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 4);
      ctx.fillRect(-2, -11, 4, 4);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = PAPER;
    ctx.fill();
  } else if (kind === 'sound') {
    ctx.beginPath();
    ctx.moveTo(-9, -3);
    ctx.lineTo(-5, -3);
    ctx.lineTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.lineTo(-5, 3);
    ctx.lineTo(-9, 3);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(1, 0, 6, -0.9, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(1, 0, 10, -0.8, 0.8);
    ctx.stroke();
  } else if (kind === 'vibration') {
    rounded(ctx, -5, -9, 10, 18, 2);
    ctx.stroke();
    line(ctx, -9, -5, -11, 0, color, 1.5);
    line(ctx, -11, 0, -9, 5, color, 1.5);
    line(ctx, 9, -5, 11, 0, color, 1.5);
    line(ctx, 11, 0, 9, 5, color, 1.5);
  } else if (kind === 'fullscreen') {
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 2);
      ctx.beginPath();
      ctx.moveTo(3, -9);
      ctx.lineTo(9, -9);
      ctx.lineTo(9, -3);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

function paper(ctx: Ink): void {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, 390, 844);
  // Stable, sparse flecks give a paper surface without image loading or random flicker.
  ctx.fillStyle = 'rgba(121,113,83,0.045)';
  for (let i = 0; i < 220; i++) {
    const x = (i * 137.3) % 390;
    const y = (i * 199.7) % 844;
    ctx.fillRect(x, y, i % 3 ? 0.65 : 1.1, 0.7);
  }
}

function cornerGarden(ctx: Ink, subtle = false): void {
  ctx.save();
  ctx.globalAlpha = subtle ? 0.48 : 0.9;
  sprig(ctx, 6, 139, 0.94, 0.22);
  sprig(ctx, 387, 116, 0.85, -0.58);
  sprig(ctx, 20, 843, 1.13, 0.5);
  sprig(ctx, 370, 850, 1.15, -0.52);
  flower(ctx, 370, 52, 7, '#f6e7bd');
  flower(ctx, 14, 790, 7, '#edccbf');
  flower(ctx, 376, 784, 7, '#fcf5e0');
  leaf(ctx, 112, 839, 30, -1.15, '#869375');
  leaf(ctx, 297, 841, 31, 1.0, '#9eab82');
  ctx.restore();
}

function garden(ctx: Ink, centerX: number, centerY: number, scale = 1): void {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.ellipse(0, 69, 155, 24, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#e3dfc3';
  ctx.fill();
  const stems = [
    [-113, 69, 1.1, -0.36],
    [-96, 59, 1.5, -0.14],
    [-64, 42, 1.42, 0.33],
    [93, 64, 1.32, 0.46],
    [122, 66, 1.02, 0.31],
    [71, 41, 1.6, -0.16],
    [-136, 73, 0.66, -0.52],
    [138, 75, 0.8, 0.69],
  ];
  stems.forEach((s, i) => sprig(ctx, s[0], s[1], s[2], s[3], i % 2 ? '#6e8873' : '#8b9d73'));
  leaf(ctx, -59, 23, 93, -0.34, '#4e7662');
  leaf(ctx, -55, 30, 84, 0.8, '#769064');
  leaf(ctx, 99, 32, 68, 0.85, '#9caa7b');
  leaf(ctx, 90, 40, 77, -0.1, '#617f68');
  ctx.save();
  ctx.translate(0, 24);
  ctx.rotate(-0.09);
  rounded(ctx, -78, -64, 156, 138, 11);
  ctx.fillStyle = '#ded8b9';
  ctx.fill();
  ctx.save();
  rounded(ctx, -75, -61, 150, 132, 9);
  ctx.clip();
  const cells = [
    [0, 0, 1, 1, 1],
    [0, 2, 2, 1, 1],
    [0, 2, 3, 3, 1],
    [4, 2, 3, 3, 3],
    [4, 4, 4, 3, 3],
  ];
  cells.forEach((row, yy) =>
    row.forEach((r, xx) => {
      ctx.fillStyle = REGIONS[r];
      ctx.fillRect(-75 + xx * 30, -61 + yy * 26.4, 30, 26.4);
    }),
  );
  for (let i = 0; i <= 5; i++) {
    line(ctx, -75 + i * 30, -61, -75 + i * 30, 71, 'rgba(70,88,67,0.18)', 0.8);
    line(ctx, -75, -61 + i * 26.4, 75, -61 + i * 26.4, 'rgba(70,88,67,0.18)', 0.8);
  }
  ctx.restore();
  ctx.restore();
  for (let i = 0; i < 13; i++) {
    const xx = -135 + i * 22;
    const yy = 64 + Math.sin(i * 1.7) * 12;
    leaf(ctx, xx, yy, 25 + (i % 4) * 3, Math.sin(i * 2.3) * 1.4, i % 2 ? '#849974' : '#66826c');
  }
  const flowers = [
    [-123, 30],
    [-94, -13],
    [-52, -42],
    [-106, 65],
    [106, 9],
    [124, 43],
    [72, 59],
    [37, 83],
    [-33, 81],
  ];
  flowers.forEach((p, i) =>
    flower(ctx, p[0], p[1], i % 3 === 0 ? 8 : 6, i % 4 === 0 ? '#e7c4b7' : '#fff5dd'),
  );
  [
    [-42, -3],
    [7, -48],
    [51, 32],
  ].forEach((p, i) => {
    line(ctx, p[0], p[1] + 21, p[0] - 2, p[1] + 44, '#758665', 1.2);
    leaf(ctx, p[0] - 2, p[1] + 44, 19, -0.9, '#91a578');
    leaf(ctx, p[0] - 2, p[1] + 41, 15, 0.85, '#758b65');
    seed(ctx, p[0], p[1], i === 1 ? 20 : 17);
  });
  for (let i = 0; i < 11; i++) dot(ctx, -118 + i * 24, 86 + Math.sin(i * 2) * 4, 1, '#c2b999');
  ctx.restore();
}

function time(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

/** Returned hit areas are already transformed into the canvas target coordinate space. */
export function renderGame(ctx: Ink, view: View): HitArea[] {
  const areas: HitArea[] = [];
  const scale = Math.min(view.width / 390, view.height / 844);
  const offsetX = (view.width - 390 * scale) / 2;
  const offsetY = (view.height - 844 * scale) / 2;
  const hit = (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
  ): void => {
    areas.push({ id, x, y, width, height, label });
  };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#e5e5d9';
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  paper(ctx);

  const button = (
    id: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h: number,
    primary = false,
    symbol?: Icon,
  ): void => {
    rounded(ctx, x, y + 4, w, h, Math.min(20, h / 2));
    ctx.fillStyle = primary ? '#a6b68e' : '#dedfca';
    ctx.fill();
    rounded(ctx, x, y, w, h, Math.min(20, h / 2));
    ctx.fillStyle = primary ? MOSS : '#f8f6ed';
    ctx.fill();
    ctx.strokeStyle = primary ? MOSS : LINE;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    const fg = primary ? '#fff7df' : MOSS;
    if (symbol) {
      icon(ctx, symbol, x + w / 2 - 43, y + h / 2, 21, fg);
      strong(ctx, label, x + w / 2 + 12, y + h / 2 + 1, 18, fg);
    } else {
      strong(ctx, label, x + w / 2 - (primary ? 5 : 0), y + h / 2, primary ? 21 : 18, fg);
      if (primary) icon(ctx, 'next', x + w - 25, y + h / 2, 18, '#e4d6a2');
    }
    hit(id, x, y, w, h, label);
  };
  const circleButton = (
    id: string,
    label: string,
    symbol: Icon,
    x: number,
    y: number,
    size = 46,
  ): void => {
    rounded(ctx, x, y, size, size, size / 2);
    ctx.fillStyle = '#f8f6ed';
    ctx.fill();
    ctx.strokeStyle = '#8d9a7e';
    ctx.lineWidth = 1;
    ctx.stroke();
    icon(ctx, symbol, x + size / 2, y + size / 2, 21);
    hit(id, x, y, size, size, label);
  };
  const header = (title: string, subtitle?: string): void => {
    circleButton('nav:back', '返回花园', 'back', 25, 84);
    strong(ctx, title, 202, 108, 25);
    if (subtitle) text(ctx, subtitle, 195, 161, 14, MID);
    leaf(ctx, 297, 120, 13, 1.1, '#a2ad87');
  };

  if (view.page === 'home') {
    cornerGarden(ctx);
    icon(ctx, 'leaf', 195, 108, 28);
    text(ctx, '苔光花园', 195, 164, 42, MOSS, SERIF);
    line(ctx, 90, 212, 126, 212, LINE, 0.8);
    line(ctx, 264, 212, 300, 212, LINE, 0.8);
    text(ctx, 'MOSS & GLOW', 195, 212, 13, MOSS, SERIF);
    leaf(ctx, 81, 215, 13, -1, '#9aa980');
    leaf(ctx, 310, 217, 13, 1, '#9aa980');
    garden(ctx, 195, 394, 1.02);
    text(
      ctx,
      view.invitationNumber && view.challengeGoal
        ? `好友自报 ${view.challengeGoal.hints} 提示 / ${view.challengeGoal.mistakes} 调整 / ${time(view.challengeGoal.elapsedMs)}`
        : '每行、每列、每片花圃各一颗',
      195,
      526,
      14,
      MID,
      SANS,
    );
    text(ctx, '彼此留空，种满就开花', 195, 546, 12, MID);
    const done = view.levels.filter((l) => view.completed[l.id]).length;
    rounded(ctx, 106, 564, 178, 30, 15);
    ctx.fillStyle = '#e5ead7';
    ctx.fill();
    text(ctx, `已通关 ${done} / ${view.levels.length}`, 195, 579, 14, MOSS);
    button(
      'home:start',
      view.invitationNumber ? `挑战第 ${view.invitationNumber} 关` : continueLabel(view),
      36,
      610,
      318,
      60,
      true,
    );
    button('home:levels', '关卡选择', 36, 690, 318, 56);
    circleButton('home:settings', '设置', 'gear', 95, 770, 48);
    circleButton('home:help', '玩法手册', 'help', 247, 770, 48);
  } else if (view.page === 'levels') {
    cornerGarden(ctx, true);
    header('关卡选择');
    const done = view.levels.filter((l) => view.completed[l.id]).length;
    text(
      ctx,
      `已通关 ${done} / ${view.levels.length} · 当前第 ${(view.continueLevel ?? view.level).number} 关`,
      195,
      167,
      14,
      MID,
    );
    rounded(ctx, 50, 190, 290, 7, 3.5);
    ctx.fillStyle = '#d6d8c1';
    ctx.fill();
    if (done) {
      rounded(ctx, 50, 190, (290 * done) / Math.max(1, view.levels.length), 7, 3.5);
      ctx.fillStyle = '#788c5a';
      ctx.fill();
    }
    const chapters = CHAPTERS.filter((chapter) =>
      view.levels.some((l) => l.chapter === chapter.id),
    );
    const chapterIndex = Math.max(
      0,
      chapters.findIndex((c) => c.id === view.levelChapter),
    );
    const chapter = chapters[chapterIndex];
    const levels = view.levels.filter((l) => l.chapter === chapter.id);
    const count = levels.filter((l) => view.completed[l.id]).length;
    rounded(ctx, 31, 220, 328, 84, 20);
    ctx.fillStyle = '#e9ebd8';
    ctx.fill();
    strong(ctx, chapter.title, 195, 246, 20);
    text(
      ctx,
      `第 ${chapterIndex + 1} / ${chapters.length} 章 · 已通关 ${count} / ${levels.length}`,
      195,
      279,
      12,
      MID,
    );
    if (chapterIndex > 0) circleButton('levels:prev', '上一章', 'back', 38, 234, 52);
    else icon(ctx, 'leaf', 64, 260, 23, '#a2ad87');
    if (chapterIndex + 1 < chapters.length)
      circleButton('levels:next', '下一章', 'next', 300, 234, 52);
    else icon(ctx, 'leaf', 326, 260, 23, '#a2ad87');
    levels.forEach((level, i) =>
      drawLevelChip(ctx, level, 35 + (i % 3) * 112, 337 + Math.floor(i / 3) * 132, 96, view, hit),
    );
    icon(ctx, 'check', 97, 618, 17, '#718953');
    text(ctx, '已通关', 134, 618, 12, MID);
    icon(ctx, 'lock', 223, 618, 17, '#959c85');
    text(ctx, '未解锁', 260, 618, 12, MID);
    if (view.dev) button('dev:select', '输入关卡号 · 试玩', 67, 650, 256, 54);
    else text(ctx, '通关后解锁下一关', 195, 658, 13, MID);
    button('levels:continue', continueLabel(view), 36, 732, 318, 60, true);
  } else if (view.page === 'play') {
    circleButton('nav:back', '返回花园', 'back', 25, 84);
    strong(ctx, `第 ${view.level.number} 关`, 195, 98, 26);
    text(ctx, view.level.title, 195, 129, 13, MID);
    circleButton('play:pause', '暂停', 'pause', 319, 84);
    rounded(ctx, 69, 151, 252, 40, 20);
    ctx.fillStyle = '#eeeedf';
    ctx.fill();
    ctx.strokeStyle = '#c6c7ad';
    ctx.lineWidth = 1;
    ctx.stroke();
    seed(ctx, 91, 171, 11, false);
    text(ctx, `光种 ${view.puzzle.placed.length} / ${view.level.size}`, 151, 172, 16, MOSS, SERIF);
    line(ctx, 209, 160, 209, 181, '#c4c7ae');
    text(ctx, time(view.elapsedMs), 263, 172, 16, MOSS, SERIF);
    const boardWidth = view.level.size >= 8 ? 352 : 328;
    const boardX = (390 - boardWidth) / 2;
    drawBoard(ctx, view, boardX, 220, boardWidth, hit);
    const message =
      view.puzzle.message ||
      (view.level.number === 1
        ? view.puzzle.placed.length === 0
          ? '先点金框：这片花圃只有一格'
          : '每行、每列、每片花圃各一颗'
        : '每行、每列、每片花圃各一颗');
    text(ctx, '种子不能紧挨，斜角也要留空', 195, 607, 12, MID);
    const danger = view.puzzle.message && /冲突|相邻|已有|不能|错误/.test(view.puzzle.message);
    text(ctx, message, 195, 585, message.length > 23 ? 12 : 14, danger ? '#a24d41' : MID, SERIF);
    const tools: Array<[string, string, Icon, number, number, boolean]> = [
      ['play:seed', '种子', 'seed', 31, 624, view.mode === 'seed'],
      ['play:mark', '标记', 'mark', 201, 624, view.mode === 'mark'],
      ['play:undo', '撤回', 'undo', 31, 714, false],
      [
        'play:hint',
        view.practice || view.puzzle.hints === 0 ? '免费提示' : '视频提示',
        'hint',
        201,
        714,
        false,
      ],
    ];
    tools.forEach(([id, label, symbol, x, y, selected]) => {
      rounded(ctx, x, y, 158, 76, 22);
      ctx.fillStyle = selected ? MOSS : '#f7f5ea';
      ctx.fill();
      ctx.strokeStyle = selected ? MOSS : LINE;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      icon(ctx, symbol, x + 79, y + 25, 24, selected ? '#fff6df' : MOSS);
      strong(ctx, label, x + 79, y + 56, 16, selected ? '#fff6df' : MOSS);
      hit(id, x, y, 158, 76, label);
    });
    hit('play:help', 129, 795, 132, 44, '玩法手册');
    text(ctx, '玩法手册', 195, 815, 12, MID);
    leaf(ctx, 143, 820, 12, -0.9, '#a7b18b');
    leaf(ctx, 247, 820, 12, 0.9, '#a7b18b');
  } else if (view.page === 'pause') {
    cornerGarden(ctx, true);
    header('暂歇片刻');
    garden(ctx, 195, 305, 0.67);
    strong(ctx, `第 ${view.level.number} 关 · ${view.level.title}`, 195, 423, 23);
    text(ctx, `${chapterTitle(view.level.chapter)} · ${time(view.elapsedMs)}`, 195, 463, 14, MID);
    button('pause:resume', `继续第 ${view.level.number} 关`, 36, 518, 318, 60, true);
    button('pause:restart', '重新播种', 36, 604, 153, 56);
    button('pause:levels', '关卡选择', 201, 604, 153, 56);
    button('pause:home', '返回花园', 36, 690, 318, 56);
    if (!view.native) {
      circleButton('settings:fullscreen', '切换全屏', 'fullscreen', 173, 774, 44);
    }
  } else if (view.page === 'help') {
    cornerGarden(ctx, true);
    header('玩法手册', '用观察与排除，点亮整座花园');
    const rules = [
      ['每行、每列，各一颗', '把光种均匀散开，让整片花园都亮起来。'],
      ['每片花圃，各一颗', '相同颜色与边界组成一片独立花圃。'],
      ['种子彼此不相邻', '给嫩芽留空间；上下左右、斜角不能紧挨。'],
      ['标记帮助你推理', '切到标记排除空格；再次点击可取消。'],
    ];
    rules.forEach(([title, desc], i) => {
      const yy = 232 + i * 109;
      rounded(ctx, 34, yy, 322, 87, 17);
      ctx.fillStyle = '#efefdf';
      ctx.fill();
      icon(ctx, i === 3 ? 'mark' : 'seed', 60, yy + 28, 18);
      text(ctx, title, 84, yy + 28, 19, MOSS, SERIF, 'left');
      text(ctx, desc, 54, yy + 62, 13, MID, SANS, 'left');
    });
    text(ctx, '首次提示免费；之后完整看视频获得一次提示。', 195, 711, 12, MID);
    button('nav:back', '返回花园', 67, 751, 256, 50, true);
  } else if (view.page === 'hint') {
    cornerGarden(ctx, true);
    header('让园丁帮一步');
    icon(ctx, 'hint', 195, 257, 56);
    strong(ctx, '本局免费提示已用完', 195, 348, 23);
    text(ctx, '完整观看视频，获得 1 次提示', 195, 395, 18);
    text(ctx, '帮你种下一颗，或取回一颗错种', 195, 433, 14, MID);
    text(ctx, '未看完不会改变棋盘', 195, 469, 14, MID);
    if (view.hintBusy) text(ctx, '正在准备或播放视频…', 195, 592, 19);
    else button('hint:watch', '看视频 · 获得提示', 36, 560, 318, 60, true);
    button('hint:cancel', view.hintBusy ? '取消 · 返回棋盘' : '返回棋盘', 36, 662, 318, 60);
  } else if (view.page === 'dev-levels' && view.dev) {
    header('开发选关');
    text(ctx, `输入 1–${view.levels.length} · 试玩不计进度`, 195, 167, 14, MID);
    strong(ctx, view.jumpNumber || '关卡号', 195, 243, 32);
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'backspace'];
    keys.forEach((key, i) =>
      button(
        `jump:${key}`,
        key === 'clear' ? '清空' : key === 'backspace' ? '退格' : key,
        36 + (i % 3) * 110,
        304 + Math.floor(i / 3) * 82,
        98,
        64,
      ),
    );
    button('jump:start', '进入关卡 · 试玩', 36, 688, 318, 64, true);
  } else if (view.page === 'settings') {
    cornerGarden(ctx);
    header('花园设置');
    icon(ctx, 'leaf', 195, 227, 49);
    const settingRows: Array<[string, string, Icon, boolean, number]> = [
      ['settings:sound', '音效', 'sound', view.sound, 326],
      ['settings:vibration', '触感反馈', 'vibration', view.vibration, 424],
    ];
    settingRows.forEach(([id, label, symbol, enabled, y]) => {
      rounded(ctx, 37, y, 316, 74, 20);
      ctx.fillStyle = '#eeefdf';
      ctx.fill();
      icon(ctx, symbol, 72, y + 37, 24);
      text(ctx, label, 105, y + 37, 21, MOSS, SERIF, 'left');
      rounded(ctx, 274, y + 22, 54, 30, 15);
      ctx.fillStyle = enabled ? '#7f956d' : '#c6c9b4';
      ctx.fill();
      dot(ctx, enabled ? 313 : 289, y + 37, 11.5, '#f9f6e9');
      hit(id, 37, y, 316, 74, `${label}：${enabled ? '开启' : '关闭'}`);
    });
    if (!view.native)
      button('settings:fullscreen', '切换全屏', 67, 548, 256, 50, false, 'fullscreen');
    text(ctx, '进度自动保存在当前设备', 195, 657, 13, MID);
    button('nav:back', '返回花园', 67, 724, 256, 50, true);
  } else if (view.page === 'result') {
    cornerGarden(ctx);
    dot(ctx, 195, 136, 44, '#e9ebd8');
    ctx.beginPath();
    ctx.arc(195, 136, 44, 0, Math.PI * 2);
    ctx.strokeStyle = '#c9bd83';
    ctx.lineWidth = 2;
    ctx.stroke();
    strong(ctx, String(view.level.number).padStart(2, '0'), 195, 128, 34);
    text(ctx, '已点亮', 195, 157, 11, MID);
    leaf(ctx, 144, 157, 25, -0.7, '#91a578');
    leaf(ctx, 246, 157, 25, 0.7, '#91a578');
    strong(ctx, resultTitle(view), 195, 214, 29);
    text(ctx, `${chapterTitle(view.level.chapter)} · ${view.level.title}`, 195, 253, 14, MID, SANS);
    drawBoard(ctx, view, 107, 280, 176, () => {});
    const goal = view.challenge ? view.challengeGoal : undefined;
    const improved =
      goal &&
      (view.puzzle.hints < goal.hints ||
        (view.puzzle.hints === goal.hints &&
          (view.puzzle.mistakes < goal.mistakes ||
            (view.puzzle.mistakes === goal.mistakes && view.elapsedMs <= goal.elapsedMs))));
    text(
      ctx,
      goal
        ? improved
          ? '已达成好友自报目标，再分享新战绩'
          : '先减少提示和调整，再挑战更快用时'
        : view.puzzle.hints === 0 && view.puzzle.mistakes === 0
          ? '零提示、零调整，你的花圃开花了'
          : '你种下的光种，让这片花圃开花了',
      195,
      478,
      13,
      MID,
      SANS,
    );
    rounded(ctx, 36, 505, 318, 64, 20);
    ctx.fillStyle = '#e9ebd8';
    ctx.fill();
    line(ctx, 144, 520, 144, 554, '#d1d5ba');
    line(ctx, 246, 520, 246, 554, '#d1d5ba');
    strong(ctx, time(view.elapsedMs), 91, 528, 22);
    text(ctx, '用时', 91, 552, 11, MID);
    strong(ctx, String(view.puzzle.hints), 195, 528, 22);
    text(ctx, '提示', 195, 552, 11, MID);
    strong(ctx, String(view.puzzle.mistakes), 299, 528, 22);
    text(ctx, '调整', 299, 552, 11, MID);
    const next = view.levels.find((l) => l.number === view.level.number + 1);
    button(
      'result:next',
      view.challenge
        ? `再战第 ${view.level.number} 关`
        : next
          ? `挑战第 ${next.number} 关`
          : '全部通关 · 查看关卡',
      36,
      599,
      318,
      60,
      true,
    );
    button('result:replay', '再玩本关', 36, 677, 153, 56);
    button('result:levels', '关卡选择', 201, 677, 153, 56);
    hit('result:home', view.canShare ? 36 : 122, 756, 146, 56, '返回花园');
    text(ctx, '返回花园', view.canShare ? 109 : 195, 784, 15, MID);
    if (view.canShare) {
      hit('result:share', 208, 756, 146, 56, '分享花园');
      text(ctx, '分享花园', 281, 784, 15, MOSS);
    }
  }

  if (view.notice) {
    rounded(ctx, 34, 25, 322, 37, 18);
    ctx.fillStyle = '#e8eddb';
    ctx.fill();
    text(ctx, view.notice, 195, 44, 12, MOSS);
  }
  ctx.restore();
  return areas.map((a) => {
    const minimum =
      a.id.startsWith('cell:') || a.id.startsWith('level:') ? 0 : (view.minimumTouchSize ?? 0);
    const width = Math.max(minimum, a.width * scale),
      height = Math.max(minimum, a.height * scale);
    return {
      ...a,
      x: offsetX + (a.x + a.width / 2) * scale - width / 2,
      y: offsetY + (a.y + a.height / 2) * scale - height / 2,
      width,
      height,
    };
  });
}

function drawLevelChip(
  ctx: Ink,
  level: LevelView,
  x: number,
  y: number,
  size: number,
  view: View,
  hit: (id: string, x: number, y: number, width: number, height: number, label: string) => void,
): void {
  const completed = Boolean(view.completed[level.id]);
  const playable = view.dev || level.number <= view.unlocked;
  const current = level.id === (view.continueLevel?.id ?? view.level.id);
  rounded(ctx, x, y + 4, size, size, 22);
  ctx.fillStyle = current ? '#a6b68e' : '#d0d5bd';
  ctx.fill();
  rounded(ctx, x, y, size, size, 22);
  ctx.fillStyle = current ? MOSS : completed ? '#d9dfbd' : playable ? '#efefd9' : '#e5e5d7';
  ctx.fill();
  if (current) {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
  const color = current ? '#fff7df' : playable ? MOSS : '#939783';
  strong(ctx, String(level.number).padStart(2, '0'), x + size / 2, y + 28, 30, color);
  text(ctx, level.title, x + size / 2, y + 56, 12, color);
  if (current)
    text(ctx, view.activeLevelId === level.id ? '继续' : '当前', x + size / 2, y + 80, 11, color);
  else {
    icon(ctx, completed ? 'check' : playable ? 'seed' : 'lock', x + 25, y + 80, 13, color);
    text(
      ctx,
      view.dev ? '试玩' : completed ? '已通关' : playable ? '可挑战' : '未解锁',
      x + 57,
      y + 80,
      10,
      color,
    );
  }
  if (playable)
    hit(
      `level:${level.id}`,
      x,
      y,
      size,
      size,
      `第 ${level.number} 关：${level.title}${completed ? '，已通关' : !current ? '，可挑战' : ''}${current ? (view.activeLevelId === level.id ? '，可继续' : '，当前') : ''}`,
    );
}

function drawBoard(
  ctx: Ink,
  view: View,
  x: number,
  y: number,
  width: number,
  hit: (id: string, x: number, y: number, width: number, height: number, label: string) => void,
): void {
  const size = view.level.size;
  const cell = width / size;
  const regions = view.level.regions;
  const selected = new Set(view.puzzle.placed);
  const excluded = new Set(view.puzzle.excluded);
  const rowCount = Array<number>(size).fill(0);
  const colCount = Array<number>(size).fill(0);
  const regionCount = new Map<number, number>();
  for (const index of selected) {
    rowCount[Math.floor(index / size)]++;
    colCount[index % size]++;
    regionCount.set(regions[index], (regionCount.get(regions[index]) ?? 0) + 1);
  }
  const conflicts = new Set<number>();
  for (const index of selected) {
    const r = Math.floor(index / size),
      c = index % size;
    if (rowCount[r] > 1 || colCount[c] > 1 || (regionCount.get(regions[index]) ?? 0) > 1)
      conflicts.add(index);
    for (const other of selected) {
      if (
        other !== index &&
        Math.abs(r - Math.floor(other / size)) <= 1 &&
        Math.abs(c - (other % size)) <= 1
      )
        conflicts.add(index);
    }
  }
  ctx.save();
  ctx.globalAlpha = 0.58;
  sprig(ctx, x + 3, y + 6, 0.37, -0.8, '#84976c');
  sprig(ctx, x + width - 4, y + width + 14, 0.49, 0.47, '#83916a');
  flower(ctx, x - 2, y + width - 8, 6, '#fff1ce');
  flower(ctx, x + width + 2, y + 5, 6, '#e6c5b6');
  ctx.restore();
  rounded(ctx, x - 3, y - 3, width + 6, width + 6, 11);
  ctx.fillStyle = MOSS;
  ctx.fill();
  ctx.save();
  rounded(ctx, x, y, width, width, 8);
  ctx.clip();
  for (let i = 0; i < regions.length; i++) {
    const xx = x + (i % size) * cell;
    const yy = y + Math.floor(i / size) * cell;
    const region = regions[i];
    ctx.fillStyle = REGIONS[((region % REGIONS.length) + REGIONS.length) % REGIONS.length];
    ctx.fillRect(xx, yy, cell, cell);
    // Faint strokes retain the original paper appearance in all board sizes.
    line(ctx, xx + 3, yy + 3, xx + cell - 3, yy + 3, 'rgba(255,255,255,0.10)', 1);
  }
  for (let i = 1; i < size; i++) {
    line(ctx, x + i * cell, y, x + i * cell, y + width, 'rgba(45,72,53,0.19)', 1);
    line(ctx, x, y + i * cell, x + width, y + i * cell, 'rgba(45,72,53,0.19)', 1);
  }
  // Thick irregular territory edges communicate the puzzle even without color.
  for (let i = 0; i < regions.length; i++) {
    const r = Math.floor(i / size),
      c = i % size;
    if (c + 1 < size && regions[i] !== regions[i + 1])
      line(
        ctx,
        x + (c + 1) * cell,
        y + r * cell,
        x + (c + 1) * cell,
        y + (r + 1) * cell,
        '#45634e',
        2.3,
      );
    if (r + 1 < size && regions[i] !== regions[i + size])
      line(
        ctx,
        x + c * cell,
        y + (r + 1) * cell,
        x + (c + 1) * cell,
        y + (r + 1) * cell,
        '#45634e',
        2.3,
      );
  }
  const identified = new Set<number>();
  for (let i = 0; i < regions.length; i++) {
    const r = Math.floor(i / size),
      c = i % size;
    const xx = x + c * cell,
      yy = y + r * cell;
    if (!identified.has(regions[i])) {
      const order = identified.size;
      identified.add(regions[i]);
      text(ctx, String.fromCharCode(65 + order), xx + 8, yy + 10, 9, 'rgba(43,69,48,0.52)', SANS);
    }
    if (selected.has(i)) {
      if (conflicts.has(i)) {
        rounded(ctx, xx + 4, yy + 4, cell - 8, cell - 8, 6);
        ctx.strokeStyle = '#bd6851';
        ctx.lineWidth = 2.6;
        ctx.stroke();
      }
      if (view.puzzle.completed) {
        leaf(ctx, xx + cell / 2, yy + cell * 0.76, cell * 0.32, -0.8);
        flower(ctx, xx + cell / 2, yy + cell / 2, cell * 0.24);
      } else seed(ctx, xx + cell / 2, yy + cell / 2, Math.min(17, cell * 0.24), true);
    } else if (excluded.has(i))
      icon(ctx, 'mark', xx + cell / 2, yy + cell / 2, Math.min(22, cell * 0.4), '#667461');
    if (
      view.level.number === 1 &&
      !selected.size &&
      regions.filter((r) => r === regions[i]).length === 1
    ) {
      rounded(ctx, xx + 4, yy + 4, cell - 8, cell - 8, 6);
      ctx.strokeStyle = '#ae7e25';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    hit(`cell:${i}`, xx, yy, cell, cell, `花圃 第${r + 1}行 第${c + 1}列`);
  }
  ctx.restore();
  for (let i = 0; i < size; i++) {
    const rc = rowCount[i],
      cc = colCount[i];
    dot(
      ctx,
      x - 12,
      y + (i + 0.5) * cell,
      3.8,
      rc === 1 ? '#708c59' : rc > 1 ? '#b66b50' : '#d2d1b9',
    );
    dot(
      ctx,
      x + (i + 0.5) * cell,
      y - 13,
      3.8,
      cc === 1 ? '#708c59' : cc > 1 ? '#b66b50' : '#d2d1b9',
    );
    if (rc === 1)
      line(
        ctx,
        x - 13.6,
        y + (i + 0.5) * cell,
        x - 11.7,
        y + (i + 0.5) * cell + 1.5,
        '#fff7e6',
        0.9,
      );
    if (cc === 1)
      line(
        ctx,
        x + (i + 0.5) * cell - 1.6,
        y - 13,
        x + (i + 0.5) * cell + 0.3,
        y - 11.5,
        '#fff7e6',
        0.9,
      );
  }
}
