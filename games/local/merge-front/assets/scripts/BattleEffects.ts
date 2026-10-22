import { getSpec, getTrait } from './core/content.ts';
import type { Match, Unit } from './core/engine.ts';
import { crystalStyle, TICK_RATE } from './core/engine.ts';
import { MergeView, C } from './MergeView';

type Point = { x: number; y: number };
const alpha = (color: string, opacity: number) =>
  color +
  Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, '0');

export function troopPose(m: Match, unit: Unit, reduced: boolean) {
  const hit = [...m.events].reverse().find((e) => e.type === 'attack' && e.unitId === unit.id);
  const age = hit ? (m.tick - hit.tick) / TICK_RATE : 10;
  const strike = age < 0.42 ? Math.sin((age / 0.42) * Math.PI) : 0;
  const melee = getSpec(unit.key).range < 100;
  const bounce = reduced
    ? 0
    : Math.sin(m.tick * (unit.anim === 'move' ? 0.65 : 0.15) + unit.id) *
      (unit.anim === 'move' ? 3 : 0.6);
  return {
    dx: reduced ? 0 : strike * (melee ? 13 : -6) * (unit.side ? -1 : 1),
    dy: bounce - (melee ? strike * 7 : 0),
    angle: reduced ? 0 : strike * (melee ? -12 : 6) * (unit.side ? -1 : 1),
  };
}

export function attackEffects(
  u: MergeView,
  m: Match,
  project: (x: number, y: number) => Point,
  reduced: boolean,
) {
  for (const e of m.events) {
    const age = (m.tick - e.tick) / TICK_RATE;
    if (age < 0 || age > 0.48) continue;
    const p = project(e.x, e.y),
      fade = 1 - age / 0.48;
    if (e.type === 'hit' || e.type === 'death') {
      u.ellipse(
        p.x,
        p.y,
        15 + age * 55,
        7 + age * 20,
        '#ffffff00',
        alpha(e.side ? C.red : C.mint, fade * 0.7),
        2,
      );
      if (e.type === 'hit' && e.value)
        u.text(
          'damage:' + e.id,
          '−' + e.value,
          p.x + 17,
          p.y - 60 - age * 38,
          19,
          95,
          alpha(C.paper, fade),
          2,
        );
      if (!reduced)
        for (let j = 0; j < 5; j++) {
          const a = j * 1.26 + e.id;
          u.polygon(
            [
              { x: p.x + Math.cos(a) * age * 65, y: p.y - 22 + Math.sin(a) * age * 40 },
              { x: p.x + Math.cos(a) * age * 65 + 5, y: p.y - 26 + Math.sin(a) * age * 40 },
              { x: p.x + Math.cos(a) * age * 65 + 8, y: p.y - 20 + Math.sin(a) * age * 40 },
            ],
            alpha(C.gold, fade),
            '',
            2,
          );
        }
      continue;
    }
    if (e.type === 'skill') {
      u.ellipse(p.x, p.y, 36 + age * 100, 16 + age * 36, '#ffffff00', alpha('#90f4cd', fade), 2);
      continue;
    }
    if (e.type !== 'attack' || !e.key) continue;
    const source = m.units.find((t) => t.id === e.unitId);
    if (!source) continue;
    const from = project(source.x, source.y),
      a = { x: from.x, y: from.y - 34 },
      b = { x: p.x, y: p.y - 28 };
    const color = getTrait(e.key).color,
      t = Math.min(1, age / 0.3),
      dx = b.x - a.x,
      dy = b.y - a.y;
    if (['nezha', 'wukong', 'juling', 'guard', 'ram'].includes(e.key)) {
      const reach = e.key === 'wukong' ? 53 : e.key === 'juling' ? 42 : 32;
      u.arc(
        b.x,
        b.y,
        reach,
        -0.8 + t * 1.5,
        1.4 + t * 1.5,
        alpha(color, fade),
        e.key === 'wukong' ? 8 : 5,
        2,
      );
      u.arc(b.x, b.y, reach + 6, -0.6 + t * 1.5, 1 + t * 1.5, alpha('#fff0bc', fade * 0.7), 2, 2);
      if (e.key === 'ram' || e.key === 'juling')
        u.ellipse(p.x, p.y, 14 + t * 48, 6 + t * 18, '#ffffff00', alpha(C.gold, fade), 2);
    } else if (e.key === 'leizhen' || e.key === 'erlang') {
      let previous = a;
      for (let j = 1; j <= 6; j++) {
        const q = {
          x: a.x + (dx * j) / 6,
          y: a.y + (dy * j) / 6 + (j === 6 ? 0 : Math.sin(j * 2.7 + e.id) * 12),
        };
        u.line(previous.x, previous.y, q.x, q.y, alpha('#6bceff', fade), 6, 2);
        u.line(previous.x, previous.y, q.x, q.y, alpha('#e9ffff', fade), 2, 2);
        previous = q;
      }
    } else if (e.key === 'fire') {
      for (let j = 0; j < 7; j++) {
        const f = (j + t) / 7;
        u.circle(
          a.x + dx * f,
          a.y + dy * f + Math.sin(j * 3 + e.id) * 8,
          4 + f * 12,
          alpha(j % 2 ? '#ffe988' : '#ff753c', fade * (1 - f * 0.3)),
          '',
          2,
        );
      }
    } else if (e.key === 'cannon') {
      const q = { x: a.x + dx * t, y: a.y + dy * t - Math.sin(t * Math.PI) * 65 };
      u.line(q.x - dx * 0.1, q.y - dy * 0.1 - 8, q.x, q.y, alpha('#ffb44f', fade), 8, 2);
      u.circle(q.x, q.y, 9, alpha('#ffe6a1', fade), '', 2);
      if (t === 1)
        u.ellipse(p.x, p.y, 18 + age * 72, 9 + age * 30, '#ffffff00', alpha('#ffb55b', fade), 2);
    } else if (e.key === 'crossbow' || e.key === 'drone') {
      for (let j = -1; j <= 1; j++) {
        const x = a.x + dx * t,
          y = a.y + dy * t + j * 7;
        u.line(
          x - dx * 0.22,
          y - dy * 0.22,
          x,
          y,
          alpha(j === 0 ? C.paper : color, fade),
          j === 0 ? 3 : 2,
          2,
        );
      }
    } else if (e.key === 'frost' || e.key === 'change') {
      const x = a.x + dx * t,
        y = a.y + dy * t;
      for (let j = 0; j < 6; j++) {
        const angle = (j * Math.PI) / 3 + age * 8;
        u.line(
          x,
          y,
          x + Math.cos(angle) * 20,
          y + Math.sin(angle) * 20,
          alpha('#9aeaff', fade),
          3,
          2,
        );
      }
      u.ellipse(x, y, 24, 15, '#ffffff00', alpha('#d8fcff', fade), 2);
    } else {
      const x = a.x + dx * t,
        y = a.y + dy * t - Math.sin(t * Math.PI) * 18;
      u.polygon(
        [
          { x, y: y - 18 },
          { x: x + 10, y },
          { x, y: y + 18 },
          { x: x - 10, y },
        ],
        alpha(color, fade * 0.7),
        alpha(C.paper, fade),
        2,
      );
      u.ellipse(p.x, p.y, 12 + t * 24, 5 + t * 10, '#ffffff00', alpha(color, fade), 2);
    }
  }
}

export function crystalImpact(u: MergeView, m: Match, p: Point, reduced: boolean) {
  const t = m.roundTicks / (2 * TICK_RATE),
    variant = crystalStyle(m.seed, m.roundNumber);
  const colors = ['#ff7944', '#88dcff', '#ffdf8a', '#ffae5b', '#9ce7f9', '#ffe39b'];
  const color = colors[variant],
    charge = Math.min(1, t / 0.55),
    burst = Math.max(0, (t - 0.55) / 0.45);
  u.ellipse(p.x, p.y, 28 + charge * 30, 12 + charge * 12, '#ffffff00', alpha(color, 0.8), 2);
  if (reduced) {
    u.ellipse(p.x, p.y, 45 + burst * 35, 20 + burst * 15, '#ffffff00', color, 2);
    if(t>.45)u.image('crystal-impact','impact'+variant,p.x,p.y-42,124,124,2);
    return;
  }
  for (let i = 0; i < 7; i++) {
    const a = (i * Math.PI * 2) / 7 + t * 3;
    u.circle(
      p.x + Math.cos(a) * (72 - charge * 35),
      p.y - 30 + Math.sin(a) * 25,
      2 + charge * 3,
      alpha(color, 0.7),
      '',
      2,
    );
  }
  if (t < 0.45) return;
  const power = Math.min(1, (t - 0.45) * 4),
    foot = p.y - 8;
  const size=variant===2?240:variant===1?195:180+power*35;
  u.image('crystal-impact','impact'+variant,p.x-(variant===3?(1-power)*80:0),foot-size*.37-(variant===2||variant===3?(1-power)*75:0),size,size,2,false,'#ffffff',variant===5?Math.sin(t*8)*10:0);
  if (variant === 0) {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const x = p.x + Math.cos(a) * 55 * power,
        y = foot + Math.sin(a) * 18 * power;
      u.polygon(
        [
          { x: p.x, y: foot },
          { x: x - 16, y: y - 25 * power },
          { x, y: y - 80 * power },
          { x: x + 16, y: y - 25 * power },
        ],
        alpha(i % 2 ? '#ffcc60' : color, 0.7),
        '#ffefb488',
        2,
      );
    }
  } else if (variant === 1) {
    for (let j = -1; j <= 1; j++) {
      let x = p.x + j * 13,
        y = foot - 155;
      for (let i = 1; i <= 6; i++) {
        const nx = p.x + j * 13 + Math.sin(i * 2.4 + j) * 18,
          ny = foot - 155 + i * 25;
        u.line(x, y, nx, ny, color, 7, 2);
        u.line(x, y, nx, ny, '#ecffff', 2, 2);
        x = nx;
        y = ny;
      }
    }
  } else if (variant === 2) {
    u.ellipse(p.x,foot,25+power*42,9+power*16,'#ffffff00','#ffe2a1',2);
  } else if (variant === 3) {
    const x = p.x - 85 * (1 - power),
      y = foot - 130 * (1 - power);
    for (let j = 4; j >= 0; j--)
      u.circle(
        x - j * 13,
        y - j * 19,
        22 - j * 3,
        alpha(j ? '#ff9b43' : '#754837', 0.9 - j * 0.14),
        '',
        2,
      );
    u.arc(x, y, 24, 0, Math.PI * 2, color, 5, 2);
  } else if (variant === 4) {
    for (let i = 0; i < 7; i++) {
      const x = p.x + (i - 3) * 16,
        y = foot + Math.abs(i - 3) * 2,
        h = (115 - Math.abs(i - 3) * 20) * power;
      u.polygon(
        [
          { x: x - 10, y },
          { x: x - 6, y: y - h * 0.75 },
          { x: x + 2, y: y - h },
          { x: x + 12, y },
        ],
        i % 2 ? '#9ceaffb0' : '#4eaecbaa',
        '#e5ffff',
        2,
      );
    }
  } else {
    for (let i = 0; i < 3; i++) {
      u.ellipse(p.x, foot - i * 32 * power, 30 + i * 14, 12 + i * 5, '#ffffff00', color, 2);
      u.arc(p.x, foot - 25, 66 + i * 6, t * 7 + i, t * 7 + i + 1.7, '#fff1b1', 4, 2);
    }
  }
  if (burst > 0) {
    u.ellipse(
      p.x,
      p.y,
      32 + burst * 76,
      13 + burst * 32,
      '#ffffff00',
      alpha(color, 1 - burst * 0.5),
      2,
    );
    for (let i = 0; i < 12; i++) {
      const a = i * 0.5236,
        r = 25 + burst * 75,
        x = p.x + Math.cos(a) * r,
        y = p.y + Math.sin(a) * r * 0.4 - Math.sin(burst * Math.PI) * 27;
      u.polygon(
        [
          { x, y: y - 7 },
          { x: x + 5, y: y + 2 },
          { x: x - 4, y: y + 4 },
        ],
        alpha(color, 1 - burst * 0.5),
        '',
        2,
      );
    }
  }
}
