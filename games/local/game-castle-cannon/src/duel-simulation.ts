import {
  DUEL_MAP,
  DUEL_RULES as R,
  createStructures,
  nodePoint,
  validateDuelMap,
} from './duel-map.js';
import { activeGun, arrive, available, operatorPoint } from './duel-actions.js';
import { advanceShells } from './duel-physics.js';
import { distance, type Duel, type Fighter, type Side } from './duel-types.js';
export function createDuel(): Duel {
  validateDuelMap();
  const fighter = (side: Side): Fighter => {
    const p: Fighter = {
      side,
      hp: R.hp,
      medicines: R.medicines,
      position: nodePoint(side, 'ground'),
      node: 'ground',
      destination: 'ground',
      route: [],
      station: 'ground',
      crouched: false,
      healing: null,
      healOnArrival: false,
      destroyed: false,
      lastShot: null,
      lastInput: 0,
      guns: DUEL_MAP.guns.map((g) => ({
        ...g,
        position: nodePoint(side, g.node),
        hp: 100,
        repair: null,
        pitch: 38,
        yaw: 0,
        reload: 1,
        ammo: 'blast',
        charge: null,
        firedAt: -10,
      })),
    };
    p.position = operatorPoint(p, p.guns[0]!);
    return p;
  };
  return {
    version: 'duel-v1',
    mapId: DUEL_MAP.id,
    time: 0,
    tick: 0,
    nextId: 1,
    fighters: [fighter(0), fighter(1)],
    structures: createStructures(),
    shells: [],
    impacts: [],
    result: null,
  };
}
export function stepDuel(duel: Duel) {
  if (duel.result) return;
  const dt = R.step;
  duel.time += dt;
  duel.tick++;
  for (const p of duel.fighters) {
    if (p.hp <= 0) continue;
    if (p.route.length) {
      const next = p.route[0]!,
        d = distance(p.position, next),
        t = Math.min(1, (R.speed * dt) / Math.max(d, 0.0001));
      for (const axis of ['x', 'y', 'z'] as const)
        p.position[axis] += (next[axis] - p.position[axis]) * t;
      if (t >= 1) {
        const reached = Object.keys(DUEL_MAP.nodes).find(
          (id) => distance(nodePoint(p.side, id), next) < 0.05,
        );
        if (reached) p.node = reached;
        p.route.shift();
        if (!p.route.length) arrive(p);
      }
    } else if (p.healing !== null) {
      const delta = Math.min(dt, R.healSeconds - p.healing);
      p.hp = Math.min(R.hp, p.hp + (R.heal / R.healSeconds) * delta);
      p.healing += delta;
      if (p.hp >= R.hp || p.healing >= R.healSeconds - 1e-6) p.healing = null;
    } else {
      const g = activeGun(p);
      if (g && g.repair !== null && !p.crouched && g.bunker === p.destroyed) {
        g.repair += dt;
        p.position = operatorPoint(p, g);
        if (g.repair >= R.repairSeconds) {
          g.hp = 100;
          g.reload = 0;
          g.repair = null;
        }
      }
      if (g && available(p, g) && !p.crouched) {
        g.reload = Math.min(1, g.reload + dt / (g.bunker ? R.bunkerReload : R.reload));
        p.position = operatorPoint(p, g);
        // Short trips to the ammunition crate are part of the reload clock.
        if (g.reload < 1) p.position.z += Math.sin(g.reload * Math.PI * 2) * 0.8;
      }
    }
  }
  advanceShells(duel, dt);
  const dead = duel.fighters.map((p) => p.hp <= 0);
  if (dead.some(Boolean))
    duel.result = { winner: dead[0] && dead[1] ? null : dead[0] ? 1 : 0, reason: 'death' };
  else if (duel.time >= R.timeLimit) duel.result = { winner: null, reason: 'time' };
}
