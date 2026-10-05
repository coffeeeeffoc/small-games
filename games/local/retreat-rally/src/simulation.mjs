import { LEVELS } from './levels.mjs';

export const WIDTH = 1200;
export const FLAGS = { blue: 92, red: 1108 };
export const alive = (s, side) => s.units.filter((u) => u.side === side && u.hp > 0);
export const averageStamina = (s, side) => {
  const units = alive(s, side);
  return units.length ? units.reduce((n, u) => n + u.stamina, 0) / units.length : 0;
};

export function createBattle(level = LEVELS[0], mode = 'campaign', seed = 1) {
  const units = [];
  for (const side of ['blue', 'red']) {
    for (let i = 0; i < 6; i++) {
      const blue = side === 'blue';
      const archer = !blue && mode === 'campaign' && i >= 4;
      units.push({
        id: `${side}-${i}`,
        side,
        kind: archer ? 'archer' : 'sword',
        lane: i % 3,
        x: blue ? 190 - Math.floor(i / 3) * 40 : 1010 + Math.floor(i / 3) * 40,
        hp: blue || mode !== 'campaign' ? 100 : level.enemyHealth,
        maxHp: blue || mode !== 'campaign' ? 100 : level.enemyHealth,
        stamina: 100,
        cooldown: (i % 3) * 0.16,
        moving: 0,
        flash: 0,
        fighting: false,
      });
    }
  }
  return {
    version: 1,
    mode,
    seed,
    level,
    units,
    time: 0,
    status: 'playing',
    reason: '',
    retreat: { blue: false, red: false },
    flags: { blue: 100, red: 100 },
    volley: { phase: 'reload', timer: 5, zones: [], remaining: 0, serial: 0 },
    effects: [],
    dodged: 0,
    casualties: 0,
    resultRecorded: false,
  };
}

export function setRetreat(s, side, held) {
  if (s.status === 'playing') s.retreat[side] = Boolean(held);
}

function damage(s, u, amount) {
  if (u.hp <= 0) return;
  u.hp = Math.max(0, u.hp - amount);
  u.flash = 0.18;
  s.effects.push({ x: u.x, lane: u.lane, life: 0.5, text: `−${Math.round(amount)}`, side: u.side });
  if (u.hp === 0 && u.side === 'blue') s.casualties++;
}

function updateVolley(s, dt) {
  const v = s.volley,
    l = s.level;
  if (s.mode === 'campaign' && !alive(s, 'red').some((u) => u.kind === 'archer')) {
    v.phase = 'silent';
    v.zones = [];
    return;
  }
  v.timer -= dt;
  if (v.timer > 0) return;
  if (v.phase === 'reload') {
    v.phase = 'warning';
    v.timer = l.warning;
    v.remaining = l.volleyCount;
    v.serial++;
    // Aim once at the existing formation. Warnings never track retreating units.
    const sides = s.mode === 'campaign' ? ['blue'] : ['blue', 'red'];
    v.zones = sides.map((side) => {
      const group = alive(s, side);
      const center = group.length ? group.reduce((n, u) => n + u.x, 0) / group.length : FLAGS[side];
      return {
        side,
        x: Math.max(30, Math.min(WIDTH - 190, center + (side === 'blue' ? 55 : -55) - 80)),
        width: 160,
      };
    });
  } else if (v.phase === 'warning' || v.phase === 'gap') {
    v.phase = 'impact';
    v.timer = 0.45;
    for (const zone of v.zones) {
      const targets = alive(s, zone.side);
      const hit = targets.filter((u) => u.x >= zone.x && u.x <= zone.x + zone.width);
      hit.forEach((u) => damage(s, u, l.arrowDamage));
      if (zone.side === 'blue' && targets.length && !hit.length) s.dodged++;
    }
    v.remaining--;
  } else if (v.phase === 'impact') {
    if (v.remaining > 0) {
      v.phase = 'gap';
      v.timer = l.volleyGap;
    } else {
      v.phase = 'reload';
      v.timer = l.reload;
      v.zones = [];
    }
  }
}

// Fixed steps are shared by the browser, balance tests, and future native/server adapters.
export function step(s, delta) {
  if (s.status !== 'playing') return s;
  let remaining = Math.min(0.25, Math.max(0, Number.isFinite(delta) ? delta : 0));
  while (remaining > 0 && s.status === 'playing') {
    const dt = Math.min(1 / 60, remaining);
    remaining -= dt;
    tick(s, dt);
  }
  return s;
}

function tick(s, dt) {
  s.time += dt;
  if (s.mode === 'random') {
    const inDanger = ['warning', 'gap', 'impact'].includes(s.volley.phase);
    // Different deterministic timing per match; an explicitly labelled local opponent.
    if (averageStamina(s, 'red') < 30) s.aiRecovering = true;
    if (averageStamina(s, 'red') > 90) s.aiRecovering = false;
    s.retreat.red =
      (inDanger && s.volley.timer < s.level.warning - (0.2 + (s.seed % 4) * 0.12)) ||
      Boolean(s.aiRecovering);
  }
  updateVolley(s, dt);
  const positions = new Map(s.units.map((u) => [u.id, u.x]));
  const hits = [];
  for (const u of s.units) {
    u.flash = Math.max(0, u.flash - dt);
    u.fighting = false;
    u.moving = 0;
    if (u.hp <= 0) continue;
    const direction = u.side === 'blue' ? 1 : -1;
    const foes = alive(s, u.side === 'blue' ? 'red' : 'blue');
    const target = foes.reduce(
      (best, foe) =>
        !best || Math.abs(positions.get(foe.id) - u.x) < Math.abs(positions.get(best.id) - u.x)
          ? foe
          : best,
      null,
    );
    const distance = target ? Math.abs(positions.get(target.id) - u.x) : Infinity;
    u.cooldown -= dt;
    if (s.retreat[u.side]) {
      u.moving = -direction;
      u.x += -direction * 79 * dt;
      if (distance > 68) u.stamina = Math.min(100, u.stamina + 23 * dt);
    } else if (target && distance < 39) {
      u.fighting = true;
      u.stamina = Math.max(0, u.stamina - 10 * dt);
      if (u.cooldown <= 0) {
        const base = u.side === 'red' && s.mode === 'campaign' ? s.level.enemyDamage : 11.4;
        hits.push([target, base * (0.28 + (0.72 * u.stamina) / 100)]);
        u.cooldown = 0.68;
      }
    } else {
      const archerWaiting =
        u.kind === 'archer' &&
        foes.some((f) => f.x < u.x - 160) &&
        alive(s, 'red').some((f) => f.kind !== 'archer');
      const speed =
        u.side === 'red' && s.mode === 'campaign'
          ? s.level.enemySpeed * (s.retreat.blue ? s.level.pursuit : 1)
          : 43;
      if (!archerWaiting) {
        u.moving = direction;
        u.x += direction * speed * dt;
      }
      u.stamina = Math.max(0, u.stamina - 0.6 * dt);
    }
    u.x = Math.max(FLAGS.blue, Math.min(FLAGS.red, u.x));
  }
  for (const [target, amount] of hits) damage(s, target, amount);
  // Simultaneous annihilation/capture is a draw, independent of array ordering.
  const blue = alive(s, 'blue'),
    red = alive(s, 'red');
  for (const [side, attackers] of [
    ['blue', red],
    ['red', blue],
  ]) {
    const count = attackers.filter((u) => Math.abs(u.x - FLAGS[side]) < 28).length;
    s.flags[side] = Math.max(0, s.flags[side] - count * 11 * dt);
  }
  const blueLost = !blue.length || s.flags.blue <= 0;
  const redLost = !red.length || s.flags.red <= 0;
  // Eliminating defenders opens the road; victory still requires taking the flag.
  if (blueLost && redLost) {
    s.status = 'draw';
    s.reason = '双方同时失守';
  } else if (s.flags.red <= 0) {
    s.status = 'won';
    s.reason = '敌方军旗已夺下';
  } else if (s.flags.blue <= 0 || !blue.length) {
    s.status = 'lost';
    s.reason = !blue.length ? '兵力耗尽' : '己方军旗失守';
  } else if (s.mode !== 'campaign' && !red.length) {
    s.status = 'won';
    s.reason = '对方兵力耗尽';
  } else if (s.time >= 180) {
    s.status = 'draw';
    s.reason = '三分钟战线未决';
  }
  s.effects = s.effects.filter((e) => (e.life -= dt) > 0);
}
