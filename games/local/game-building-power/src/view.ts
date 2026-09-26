/* eslint max-lines: off -- Shared native/browser Canvas renderer and its small drawing primitives. */
import { DEVICES, PV_RATED_W } from './levels.js';
import type { DeviceId } from './model.js';
export const WIDTH = 390,
  HEIGHT = 844,
  COMPACT_HEIGHT = 630;
export type Hit = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  disabled?: boolean;
};
export interface RoomView {
  id: string;
  floor: string;
  name: string;
  device: DeviceId;
  progress: number;
  remaining: number;
  status: 'idle' | 'waiting' | 'starting' | 'running' | 'paused' | 'done' | 'expired';
  source: 'grid' | 'solar' | null;
  power: number;
  normalPower: number;
  startupRemaining?: number;
  canDefer?: boolean;
  deferred?: boolean;
  required?: boolean;
  serviceSeconds?: number;
  arrivesIn?: number;
}
export interface LevelView {
  title: string;
  unlocked: boolean;
  stars: number;
  bestScore?: number;
  quality?: string;
}
export interface ViewState {
  compact?: boolean;
  screen: 'lobby' | 'playing' | 'paused' | 'result';
  levelIndex: number;
  levels: readonly LevelView[];
  rooms: readonly RoomView[];
  load: number;
  capacity: number;
  gridLimit: number;
  temperature: number;
  weather: string;
  heat: number;
  remaining: number;
  served: number;
  target: number;
  total: number;
  solar: { output: number; available: boolean; forecast?: string };
  battery: { available: boolean; remaining: number };
  deferRemaining: number;
  score: number;
  stars: number;
  assisted: boolean;
  selection?: string | null;
  drag?: { from: string; x: number; y: number; target?: string } | null;
  preview?: { immediate: number; stable: number; valid?: boolean } | null;
  reducedMotion: boolean;
  sound: boolean;
  time: number;
  won?: boolean;
  message?: string;
  quality?: string;
  canRescue?: boolean;
  canBonus?: boolean;
  busy?: boolean;
  skin?: string;
}
const INK = '#243e39',
  TEAL = '#24645d',
  CREAM = '#fff8e7',
  ORANGE = '#d9693c',
  RED = '#b73c30';
const FONT = '"Trebuchet MS", "Microsoft YaHei", sans-serif';
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const kw = (n: number) => (n / 1000).toFixed(2);
function box(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  r = 8,
) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}
function text(
  c: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 13,
  color = INK,
  align: CanvasTextAlign = 'left',
  bold = false,
) {
  c.font = (bold ? 'bold ' : '') + size + 'px ' + FONT;
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  c.fillText(value, x, y);
}
function wrap(
  c: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  width: number,
  lines = 3,
  color = INK,
) {
  c.font = '13px ' + FONT;
  let row = '',
    line = 0;
  for (const char of value) {
    if (c.measureText(row + char).width > width && row) {
      text(c, row, x, y + line * 20, 13, color);
      row = '';
      line++;
      if (line >= lines) return;
    }
    row += char;
  }
  if (line < lines) text(c, row, x, y + line * 20, 13, color);
}
function district(
  c: CanvasRenderingContext2D,
  y: number,
  height: number,
  live: boolean,
  time: number,
) {
  c.save();
  c.translate(0, y);
  c.scale(1, height / 150);
  box(c, 16, 0, 358, 145, '#d4ded0', 16);
  c.fillStyle = '#edbf62';
  c.beginPath();
  c.arc(323, 28, 18, 0, Math.PI * 2);
  c.fill();
  for (let b = 0; b < 2; b++) {
    const x = 67 + b * 130;
    box(c, x, 34, 106, 102, b ? '#acc1b2' : '#e0c9a3', 3);
    box(c, x - 6, 28, 118, 9, TEAL, 2);
    for (let panel = 0; panel < 3; panel++) {
      box(c, x + panel * 33, 15, 29, 15, '#45717a', 2);
      c.strokeStyle = '#a6c7cb';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x + panel * 33 + 14, 16);
      c.lineTo(x + panel * 33 + 14, 29);
      c.stroke();
    }
    text(c, b ? 'B' : 'A', x + 9, 54, 13, TEAL, 'left', true);
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 3; col++)
        box(
          c,
          x + 10 + col * 29,
          63 + row * 32,
          19,
          23,
          live || (row + col) % 2 ? '#f9d881' : '#748f86',
          2,
        );
  }
  c.strokeStyle = TEAL;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(31, 135);
  c.lineTo(31, 78);
  c.lineTo(48, 78);
  c.stroke();
  box(c, 40, 76, 17, 5, '#f2b958', 2);
  box(c, 315, 111, 45, 21, TEAL, 5);
  c.fillStyle = INK;
  for (const x of [323, 350]) {
    c.beginPath();
    c.arc(x, 134, 5, 0, Math.PI * 2);
    c.fill();
  }
  // A visible current marker, frozen by reduced-motion or pause.
  c.fillStyle = ORANGE;
  c.beginPath();
  c.arc(27 + ((time * 18) % 332), 143, 3, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

const STORIES: Record<DeviceId, [string, string, string]> = {
  rice: ['孩子等着开饭呢。', '锅里咕嘟咕嘟，饭快好了。', '饭赶上了！来吃一口？'],
  microwave: ['帮我热口饭，还得去上班。', '转起来了，马上能吃热饭。', '吃饱了，出门不迟到！'],
  computer: ['线上会议快开始了。', '连上了，工作总算能继续。', '会议顺利结束，谢谢！'],
  phone: ['手机快没电，家人还等我回信。', '充上了，不怕联系不上。', '给家里报平安了。'],
  ac: ['屋里闷，快帮我降降温。', '凉风出来了，好多了。', '终于能舒服地歇一会。'],
  fan: ['能省一点，先吹风扇吧。', '风扇转着呢，天热得多吹会。', '这阵凉风刚刚好！'],
  tv: ['一家人就等着今晚的节目。', '电视亮了，大家都坐好了。', '一家人看完，满足啦！'],
  blanket: ['被窝冰凉，帮我暖暖床。', '慢慢暖起来了。', '暖和了，今晚能睡好。'],
  washer: ['明天要穿，衣服还没洗。', '滚筒转起来了。', '洗好了，赶紧去晾上！'],
  heater: ['刚下班，等着洗个热水澡。', '水在加热，辛苦师傅。', '热水好了，一身轻松。'],
  street: ['晚归的邻居要走这段小路。', '步道亮着，大家放心走。', '邻居们都平安走过了。'],
  garage: ['车进库了，看不清车位。', '引导灯亮了，慢慢倒车。', '车停好了，回家！'],
};
function face(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  index: number,
  happy: boolean,
  worried: boolean,
) {
  c.fillStyle = ['#d4a978', '#c8956c', '#e0b58c', '#c59777'][index];
  c.beginPath();
  c.arc(x, y, 13, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = index === 3 ? '#d3d2be' : '#4c4840';
  c.beginPath();
  c.arc(x, y - 3, 13, Math.PI, Math.PI * 2);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  for (const eye of [-4, 4]) {
    c.beginPath();
    c.moveTo(x + eye, y);
    c.lineTo(x + eye, y + 2);
    c.stroke();
  }
  c.beginPath();
  c.moveTo(x - 4, y + 6);
  c.quadraticCurveTo(x, y + (happy ? 12 : worried ? 2 : 6), x + 4, y + 6);
  c.stroke();
}
function appliance(
  c: CanvasRenderingContext2D,
  kind: DeviceId,
  x: number,
  y: number,
  on: boolean,
  time: number,
  color: string,
) {
  c.save();
  c.translate(x, y);
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = 1.5;
  const line = (ax: number, ay: number, bx: number, by: number) => {
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(bx, by);
    c.stroke();
  };
  const circle = (px: number, py: number, r: number) => {
    c.beginPath();
    c.arc(px, py, r, 0, Math.PI * 2);
    c.stroke();
  };
  if (kind === 'fan') {
    circle(10, 9, 8);
    line(10, 17, 10, 22);
    line(4, 22, 16, 22);
    c.translate(10, 9);
    c.rotate(on ? time * 8 : 0);
    for (let i = 0; i < 3; i++) {
      c.rotate((Math.PI * 2) / 3);
      line(0, 0, 0, -6);
      circle(0, -4, 2);
    }
  } else if (kind === 'washer') {
    c.strokeRect(1, 1, 18, 22);
    circle(10, 13, 6);
    c.translate(10, 13);
    c.rotate(on ? time * 4 : 0);
    line(-4, 0, 4, 0);
    line(0, -4, 0, 4);
  } else if (kind === 'rice' || kind === 'heater' || kind === 'microwave') {
    c.strokeRect(2, 9, 17, 12);
    line(0, 9, 21, 9);
    for (let i = 0; i < 3; i++) {
      const dy = on ? (time * 9 + i * 3) % 7 : 0;
      line(5 + i * 5, 7 - dy, 7 + i * 5, 3 - dy);
    }
  } else if (kind === 'phone') {
    c.strokeRect(5, 0, 12, 24);
    if (on)
      c.fillRect(8, 17 - (Math.floor(time * 2) % 4) * 3, 6, 3 + (Math.floor(time * 2) % 4) * 3);
    line(9, 21, 13, 21);
  } else if (kind === 'ac') {
    c.strokeRect(0, 2, 22, 9);
    line(3, 8, 19, 8);
    for (let i = 0; i < 3; i++)
      line(4 + i * 6, 14, 4 + i * 6 + (on ? Math.sin(time * 4 + i) * 3 : 0), 21);
  } else if (kind === 'blanket') {
    c.strokeRect(1, 3, 20, 19);
    for (let i = 0; i < 3; i++) line(4 + i * 6, 5, 4 + i * 6, 20);
  } else if (kind === 'street' || kind === 'garage') {
    line(4, 24, 4, 3);
    line(4, 3, 18, 3);
    line(14, 3, 19, 6);
    if (on) {
      line(15, 10, 12, 16);
      line(18, 10, 18, 17);
      line(21, 10, 24, 16);
    }
  } else {
    c.strokeRect(0, 2, 22, 14);
    line(11, 16, 11, 21);
    line(5, 21, 17, 21);
    if (on) {
      c.globalAlpha = 0.45 + 0.25 * Math.sin(time * 3);
      c.fillRect(3, 5, 16, 8);
    }
  }
  c.restore();
}
function story(rooms: readonly RoomView[]): string {
  const missed = rooms.find((r) => r.status === 'expired');
  if (missed) return '没赶上' + DEVICES[missed.device].name + '，下次早点来呀。';
  const active = rooms
    .filter((r) => !['idle', 'done'].includes(r.status))
    .sort(
      (a, b) => a.remaining - (a.serviceSeconds ?? 0) - (b.remaining - (b.serviceSeconds ?? 0)),
    );
  if (active[0]) return STORIES[active[0].device][active[0].source ? 1 : 0];
  const done = rooms.find((r) => r.status === 'done');
  return done ? STORIES[done.device][2] : '刚到家，一会儿还有事情要忙。';
}

export function draw(c: CanvasRenderingContext2D, ui: ViewState): Hit[] {
  const hits: Hit[] = [],
    compact = !!ui.compact,
    h = compact ? COMPACT_HEIGHT : HEIGHT;
  const paper = ui.skin === '海边民宿' ? '#e6efe6' : ui.skin === '霓虹公寓' ? '#e9e0ed' : '#f5edd7';
  const anim = ui.reducedMotion || ui.screen !== 'playing' ? 0 : ui.time;
  c.fillStyle = paper;
  c.fillRect(0, 0, WIDTH, h);
  const button = (
    id: string,
    label: string,
    x: number,
    y: number,
    w: number,
    height = 54,
    disabled = false,
    fill = TEAL,
  ) => {
    box(c, x, y + 3, w, height, '#cbbd9f');
    box(c, x, y, w, height, disabled ? '#dcd8c7' : fill);
    text(c, label, x + w / 2, y + height / 2 + 5, 14, disabled ? '#777e71' : CREAM, 'center', true);
    hits.push({ id, label, x, y, w, h: height, disabled: disabled || ui.busy });
  };
  if (ui.screen === 'lobby') {
    text(
      c,
      '邻里供电调度 / SHIFT ' + String(ui.levelIndex + 1).padStart(2, '0'),
      22,
      32,
      11,
      TEAL,
      'left',
      true,
    );
    text(c, '忙碌的电工', 22, 70, 32, INK, 'left', true);
    district(c, compact ? 87 : 110, compact ? 100 : 165, true, 0);
    const y = compact ? 214 : 310;
    text(c, '下班高峰，邻居们都等着你', 22, y, 17, INK, 'left', true);
    text(c, '线路检修限电，只能错峰供电；你是今晚值班电工', 22, y + 25, 12);
    box(c, 18, y + 40, 354, 108, CREAM);
    text(c, '01  听听邻居的急事，点电器马上帮忙', 30, y + 64, 13);
    text(c, '02  热饭、洗澡、降温，抢出空档轮流来', 30, y + 89, 13);
    text(c, '03  忙不过来可协商延后，别漏了公共灯', 30, y + 114, 13);
    text(c, '屋顶 6×450W = ' + PV_RATED_W / 1000 + 'kWp · 实际 0–2.2kW', 24, y + 140, 12, TEAL);
    const ly = compact ? 377 : 482;
    text(
      c,
      '第' + (ui.levelIndex + 1) + '班  ' + ui.levels[ui.levelIndex].title,
      88,
      ly + 20,
      17,
      INK,
      'left',
      true,
    );
    text(
      c,
      '最佳 ' +
        (ui.levels[ui.levelIndex].bestScore ?? 0) +
        '  /  ' +
        '★'.repeat(ui.levels[ui.levelIndex].stars),
      88,
      ly + 43,
      12,
      TEAL,
    );
    button(
      'level:' + Math.max(0, ui.levelIndex - 1),
      '上一班',
      18,
      ly,
      62,
      54,
      ui.levelIndex === 0,
    );
    button(
      'level:' + Math.min(19, ui.levelIndex + 1),
      '下一班',
      310,
      ly,
      62,
      54,
      !ui.levels[ui.levelIndex + 1]?.unlocked,
    );
    wrap(c, ui.message || '功率接近家电典型值；用电时长与天气已压缩。', 24, ly + 79, 340, 2, TEAL);
    button('start', '开始第' + (ui.levelIndex + 1) + '班  →', 18, h - 136, 354, 60, false, ORANGE);
    button('sound', ui.sound ? '声音开' : '声音关', 18, h - 66, 110);
    button('motion', ui.reducedMotion ? '动态少' : '动态开', 140, h - 66, 110);
    button('skin', ui.skin ?? '换外观', 262, h - 66, 110);
    return hits;
  }
  if (ui.screen === 'paused' || ui.screen === 'result') {
    text(c, '忙碌的电工 / 值班记录', 22, 40, 14, TEAL, 'left', true);
    district(c, 76, compact ? 95 : 170, !!ui.won, 0);
    const y = compact ? 202 : 291;
    text(
      c,
      ui.screen === 'paused' ? '歇口气，再继续' : ui.won ? '灯火有你，值班完成' : '这班还差一点',
      195,
      y,
      27,
      INK,
      'center',
      true,
    );
    text(
      c,
      '服务 ' + ui.served + '/' + ui.target + '  ·  得分 ' + ui.score,
      195,
      y + 32,
      16,
      TEAL,
      'center',
    );
    text(
      c,
      ui.screen === 'paused'
        ? '时间已冻结，回来后手动继续'
        : ('★'.repeat(ui.stars) || '再来一次') + (ui.assisted ? ' · 援助成绩' : ''),
      195,
      y + 60,
      15,
      ORANGE,
      'center',
    );
    wrap(c, ui.message || '看看天气预告，把最急的电器安排在前面。', 28, y + 94, 334, 3);
    const bottom = h - 210;
    if (ui.screen === 'paused') button('resume', '继续值班', 18, bottom, 354, 54, false, ORANGE);
    else if (ui.canRescue || ui.canBonus)
      button(
        ui.canRescue ? 'rescue' : 'bonus',
        ui.canRescue ? '观看奖励 · 抢修续班' : '观看奖励 · 装饰币 +30',
        18,
        bottom,
        354,
      );
    else text(c, '同天气重试便于复盘，也可抽取新天气', 195, bottom + 32, 13, TEAL, 'center');
    button('retry', '同天气重试', 18, h - 146, 172);
    button('weather', '换天气开班', 200, h - 146, 172, 54, false, ORANGE);
    button('menu', '返回值班室', 18, h - 76, 354);
    return hits;
  }
  button('pause', '暂停', 12, 12, 54);
  text(c, '忙碌的电工', 80, 36, 22, INK, 'left', true);
  text(
    c,
    '第' +
      (ui.levelIndex + 1) +
      '班  ' +
      Math.ceil(ui.remaining) +
      '秒 · 服务 ' +
      ui.served +
      '/' +
      ui.target,
    80,
    59,
    12,
    TEAL,
  );
  box(c, 12, 78, 366, compact ? 92 : 110, TEAL, 12);
  text(c, '用电 / 当前可用', 24, 99, 11, '#cae1cc');
  const overload = ui.load > ui.capacity;
  text(
    c,
    kw(ui.load) + ' / ' + kw(ui.capacity) + ' kW',
    24,
    124,
    24,
    overload ? '#ffd08d' : CREAM,
    'left',
    true,
  );
  box(c, 24, 133, 342, 7, '#163e39', 3);
  box(
    c,
    24,
    133,
    Math.max(1, 342 * clamp(ui.load / ui.capacity)),
    7,
    overload ? '#ed8054' : '#b9d994',
    3,
  );
  text(
    c,
    '电网 ' +
      kw(ui.gridLimit) +
      ' + 太阳能 ' +
      kw(ui.solar.output) +
      (ui.battery.remaining ? ' + 电池 1.50' : ''),
    24,
    compact ? 163 : 158,
    11,
    CREAM,
  );
  text(c, ui.weather + ' ' + ui.temperature + '℃', 24, compact ? 151 : 177, 11, '#cde1c9');
  text(
    c,
    '电闸热量 ' + Math.round(ui.heat) + '/60' + (overload ? '  ↑ 快减载' : '  安全'),
    365,
    compact ? 151 : 177,
    11,
    overload ? '#ffd08d' : '#cde1c9',
    'right',
  );
  if (!compact) {
    district(c, 210, 62, ui.load > 80, anim);
    text(c, '2.7kWp 屋顶光伏 / 四户示范支路', 24, 292, 11, TEAL);
  }
  const top = compact ? 191 : 307,
    step = compact ? 76 : 84,
    tileH = compact ? 54 : 62;
  const tile = (room: RoomView, x: number, y: number, w: number, height: number) => {
    const ended = room.status === 'done' || room.status === 'expired' || room.status === 'idle';
    const urgent = !ended && room.remaining < (room.serviceSeconds ?? 0) + 4;
    const selected = ui.drag?.target === 'room:' + room.id;
    const fill =
      (ui.selection === 'defer' && room.canDefer) || selected
        ? '#edc27a'
        : room.status === 'done'
          ? '#d6e1c5'
          : room.source
            ? TEAL
            : urgent
              ? '#fae0c7'
              : CREAM;
    box(c, x, y + 2, w, height, '#c9baa0', 6);
    box(c, x, y, w, height, fill, 6);
    const color = room.source ? CREAM : urgent ? RED : INK;
    appliance(c, room.device, x + 4, y + 3, !!room.source, anim, color);
    text(
      c,
      DEVICES[room.device].name + (room.required ? ' · 必保' : ''),
      x + (w > 100 ? 38 : 28),
      y + 13,
      w > 100 ? 11 : 10,
      color,
      'left',
      true,
    );
    text(
      c,
      (room.source ? room.power : room.normalPower) + 'W',
      x + (w > 100 ? 38 : 28),
      y + 26,
      11,
      color,
    );
    const stateText =
      room.status === 'done'
        ? '已完成 ✓'
        : room.status === 'expired'
          ? '已超时'
          : room.status === 'idle'
            ? Math.ceil(room.arrivesIn ?? 0) + '秒后'
            : room.source
              ? room.status === 'starting'
                ? '启动中'
                : '供电中'
              : '接电';
    text(
      c,
      stateText + (!ended ? ' ' + Math.ceil(room.remaining) + 's' : ''),
      x + w / 2,
      y + 38,
      11,
      color,
      'center',
      true,
    );
    if (!ended)
      text(
        c,
        (room.canDefer ? '可缓 需' : '还需约') + (room.serviceSeconds ?? 0) + 's',
        x + w / 2,
        y + height - 4,
        9,
        color,
        'center',
      );
    box(c, x + 3, y + height - 2, Math.max(1, (w - 6) * clamp(room.progress)), 3, ORANGE, 1);
    if (room.source && !ended) {
      c.strokeStyle = ORANGE;
      c.lineWidth = 2;
      c.beginPath();
      const phase = anim * 5;
      for (let dot = 0; dot < 5; dot++) {
        const px = x + w - 7,
          py = y + 6 + dot * 4;
        if (dot === 0) c.moveTo(px + Math.sin(phase + dot) * 2, py);
        else c.lineTo(px + Math.sin(phase + dot) * 2, py);
      }
      c.stroke();
    }
    hits.push({
      id: 'room:' + room.id,
      label:
        room.name +
        ' ' +
        DEVICES[room.device].name +
        ' ' +
        room.normalPower +
        'W ' +
        stateText +
        ' 截止' +
        Math.ceil(room.remaining) +
        '秒' +
        (room.canDefer ? ' 可错峰' : ''),
      x,
      y,
      w,
      h: height,
      disabled: ended || ui.busy || (ui.selection === 'defer' && !room.canDefer),
    });
  };
  for (let home = 1; home <= 4; home++) {
    const row = top + (home - 1) * step,
      y = row + 17;
    const rooms = ui.rooms.filter((r) => r.floor === String(home));
    const happy = rooms.every((r) => r.status === 'done');
    const worried = rooms.some(
      (r) =>
        r.status === 'expired' ||
        (r.status === 'waiting' && r.remaining < (r.serviceSeconds ?? 0) + 4),
    );
    box(c, 10, row, 370, tileH + 20, home <= 2 ? '#e4dbc3' : '#cbdacd', 8);
    const words = story(rooms);
    text(
      c,
      words.length > 27 ? words.slice(0, 26) + '…' : words,
      74,
      row + 12,
      11,
      worried ? RED : TEAL,
    );
    face(c, 39, y + 17, home - 1, happy, worried);
    text(c, ['陈阿姨', '小周', '林姐', '吴叔'][home - 1], 39, y + 43, 11, INK, 'center', true);
    text(c, home <= 2 ? 'A栋' : 'B栋', 15, row + 11, 9, TEAL);
    rooms.forEach((r, i) => tile(r, 72 + i * 79, y, 74, tileH));
    const cool = rooms.find((r) => r.device === 'ac' || r.device === 'fan');
    if (cool) {
      const ended = ['done', 'expired', 'idle'].includes(cool.status);
      button(
        'cooling:' + cool.id,
        cool.device === 'ac' ? '换风扇' : '换空调',
        312,
        y,
        64,
        tileH,
        ended,
        cool.device === 'ac' ? ORANGE : '#64886a',
      );
    } else {
      text(c, '冬日', 344, y + 25, 12, TEAL, 'center');
      text(c, '保暖', 344, y + 44, 12, TEAL, 'center');
    }
  }
  const py = compact ? 500 : 669;
  const street = ui.rooms.find((r) => r.floor === '5'),
    garage = ui.rooms.find((r) => r.floor === '6');
  if (street) tile(street, 12, py, 179, 54);
  if (garage) tile(garage, 199, py, 179, 54);

  const fy = compact ? 565 : 746;
  button(
    'defer',
    ui.selection === 'defer' ? '点可错峰电器' : '错峰 ×' + ui.deferRemaining,
    12,
    fy,
    174,
    54,
    ui.deferRemaining <= 0,
    ui.selection === 'defer' ? ORANGE : TEAL,
  );
  button(
    'battery',
    ui.battery.remaining ? '电池剩 ' + Math.ceil(ui.battery.remaining) + '秒' : '应急 1.5kW · 8秒',
    198,
    fy,
    180,
    54,
    !ui.battery.available,
    ORANGE,
  );
  const forecast = ui.preview
    ? '接入后 ' + kw(ui.preview.immediate) + 'kW / 稳态 ' + kw(ui.preview.stable) + 'kW'
    : (ui.solar.forecast ?? '夜间太阳能为零，留意余量');
  const urgentWeather = ui.solar.forecast && /^[1-5]秒/.test(ui.solar.forecast);
  const notice = urgentWeather ? forecast : ui.message || forecast;
  box(c, 12, compact ? 172 : 188, 366, 18, ui.message && !urgentWeather ? '#f1cc8f' : paper, 4);
  text(
    c,
    notice.length > 32 ? notice.slice(0, 31) + '…' : notice,
    195,
    compact ? 185 : 201,
    11,
    TEAL,
    'center',
  );
  const message =
    ui.selection === 'defer'
      ? '点可错峰请求，最多延后15秒；不能跨班次'
      : ui.message || '先保公共灯 · 云来前减载 · 不必让所有电器一起开';
  if (compact) {
    // Keep the important part readable; full text is also in the live region.
    text(
      c,
      message.length > 32 ? message.slice(0, 31) + '…' : message,
      195,
      627,
      10,
      TEAL,
      'center',
    );
  } else wrap(c, message, 20, 824, 350, 1, TEAL);
  if (ui.drag) {
    const from = hits.find((hit) => hit.id === ui.drag!.from);
    if (from) {
      c.strokeStyle = ORANGE;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(from.x + from.w / 2, from.y + from.h / 2);
      c.lineTo(ui.drag.x, ui.drag.y);
      c.stroke();
    }
  }
  return hits;
}
