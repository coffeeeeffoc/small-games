import { describe, expect, it } from 'vitest';
import { activeGun, command, available } from './duel-actions.js';
import { DuelBot } from './duel-bot.js';
import { DUEL_RULES as R, validateDuelMap } from './duel-map.js';
import { segmentBox, explode } from './duel-physics.js';
import { parseCommand } from './duel-protocol.js';
import { createDuel, stepDuel } from './duel-simulation.js';
import type { Duel } from './duel-types.js';
const run = (d: Duel, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) stepDuel(d);
};
describe('双城实时炮战', () => {
  it('校验等价资源、路由与可达弹道', () => {
    expect(validateDuelMap()).toBe(true);
    const d = createDuel();
    expect(d.fighters[0].medicines).toBe(d.fighters[1].medicines);
    expect(d.fighters[0].guns.length).toBe(3);
    expect(d.structures.filter((s) => s.side === 0).reduce((n, s) => n + s.hp, 0)).toBe(
      d.structures.filter((s) => s.side === 1).reduce((n, s) => n + s.hp, 0),
    );
  });
  it('蓄力封顶不自动发射，取消与另一触点不消耗炮弹', () => {
    const d = createDuel();
    command(d, 0, { type: 'charge' });
    run(d, 3);
    expect(d.shells).toHaveLength(0);
    command(d, 0, { type: 'cancel' });
    command(d, 0, { type: 'fire' });
    expect(d.nextId).toBe(1);
    expect(activeGun(d.fighters[0])!.reload).toBe(1);
    command(d, 0, { type: 'charge' });
    run(d, 0.5);
    command(d, 0, { type: 'fire' });
    expect(d.shells).toHaveLength(1);
    expect(d.shells[0].position.x).not.toBe(d.fighters[0].guns[0].position.x);
  });
  it('同参数可复现，改变角度或力度改变真实落点', () => {
    const shoot = (pitch: number, power: number) => {
      const d = createDuel();
      command(d, 0, { type: 'aim', pitch, yaw: 14 });
      command(d, 0, { type: 'charge' });
      run(d, power * R.chargeSeconds);
      command(d, 0, { type: 'fire' });
      run(d, 8);
      return d.fighters[0].lastShot!.impact;
    };
    expect(shoot(38, 0.5)).toEqual(shoot(38, 0.5));
    expect(shoot(38, 0.5)).not.toEqual(shoot(55, 0.5));
    expect(shoot(38, 0.5)).not.toEqual(shoot(38, 0.8));
  });
  it('换位必须走路，无人炮停止装填，趴下取消蓄力', () => {
    const d = createDuel(),
      p = d.fighters[0],
      ground = p.guns[0];
    command(d, 0, { type: 'charge' });
    run(d, 0.4);
    command(d, 0, { type: 'fire' });
    command(d, 0, { type: 'station', id: 'wall' });
    const loaded = ground.reload;
    expect(p.route.length).toBeGreaterThan(0);
    expect(p.station).toBeNull();
    run(d, 10);
    expect(ground.reload).toBe(loaded);
    expect(p.station).toBe('wall');
    command(d, 0, { type: 'charge' });
    command(d, 0, { type: 'crouch', down: true });
    expect(activeGun(p)!.charge).toBeNull();
    command(d, 0, { type: 'fire' });
    expect(d.nextId).toBe(2);
  });
  it('治疗抵达后扣补给，按时间恢复；取消不退款', () => {
    const d = createDuel(),
      p = d.fighters[0];
    p.hp = 40;
    command(d, 0, { type: 'retreat' });
    run(d, 1);
    expect(p.hp).toBe(40);
    expect(p.medicines).toBe(3);
    while (p.healing === null) stepDuel(d);
    expect(p.medicines).toBe(2);
    run(d, 1);
    expect(p.hp).toBeCloseTo(48.75, 1);
    command(d, 0, { type: 'station', id: 'ground' });
    const hp = p.hp;
    run(d, 4);
    expect(p.hp).toBe(hp);
    expect(p.medicines).toBe(2);
  });
  it('满血、无补给、死亡不会开始治疗', () => {
    for (const [hp, medicines] of [
      [100, 3],
      [50, 0],
      [0, 3],
    ]) {
      const d = createDuel(),
        p = d.fighters[0];
      p.hp = hp;
      p.medicines = medicines;
      p.node = 'shelter';
      command(d, 0, { type: 'heal' });
      expect(p.healing).toBeNull();
      expect(p.medicines).toBe(medicines);
    }
  });
  it('城毁强制撤离，不回血或补给；只可使用地堡炮', () => {
    const d = createDuel(),
      p = d.fighters[0];
    p.hp = 25;
    p.medicines = 1;
    for (const s of d.structures) if (s.side === 0) s.hp = 0;
    stepDuel(d);
    expect(p.destroyed).toBe(true);
    expect(p.route.length).toBeGreaterThan(0);
    run(d, 10);
    expect(p.hp).toBe(25);
    expect(p.medicines).toBe(1);
    expect(p.node).toBe('shelter');
    expect(p.guns.filter((g) => available(p, g)).map((g) => g.id)).toEqual(['bunker']);
    command(d, 0, { type: 'station', id: 'bunker' });
    run(d, 3);
    expect(p.station).toBe('bunker');
  });
  it('完整城池不保护零生命，双方同一步死亡判平', () => {
    const d = createDuel();
    d.fighters[0].hp = 0;
    stepDuel(d);
    expect(d.result).toEqual({ winner: 1, reason: 'death' });
    expect(d.fighters[0].destroyed).toBe(false);
    const tie = createDuel();
    tie.fighters.forEach((p) => (p.hp = 0));
    stepDuel(tie);
    expect(tie.result!.winner).toBeNull();
    const tick = tie.tick;
    stepDuel(tie);
    expect(tie.tick).toBe(tick);
  });
  it('两门普通炮失效仍可到场检修，趴下和离开暂停；修好后必须装填', () => {
    const d = createDuel(),
      p = d.fighters[0],
      g = p.guns[0];
    p.guns.filter((g) => !g.bunker).forEach((g) => (g.hp = 0));
    stepDuel(d);
    expect(p.route.length).toBeGreaterThan(0);
    run(d, 5);
    command(d, 0, { type: 'station', id: 'ground' });
    run(d, 4);
    expect(g.repair).not.toBeNull();
    const partial = g.repair;
    command(d, 0, { type: 'crouch', down: true });
    run(d, 2);
    expect(g.repair).toBe(partial);
    command(d, 0, { type: 'crouch', down: false });
    command(d, 0, { type: 'retreat' });
    run(d, 6);
    expect(g.repair).toBe(partial);
    command(d, 0, { type: 'station', id: 'ground' });
    run(d, 4);
    command(d, 0, { type: 'charge' });
    expect(g.charge).toBeNull();
    for (let i = 0; i < 600 && g.hp === 0; i++) stepDuel(d);
    expect(g.hp).toBe(100);
    expect(g.reload).toBeLessThan(1);
    expect(p.medicines).toBe(3);
    expect(p.destroyed).toBe(false);
  });
  it('范围伤害衰减、趴下减伤，建筑和角色分别受损', () => {
    const damage = (offset: number, crouched = false) => {
      const d = createDuel(),
        p = d.fighters[1];
      p.crouched = crouched;
      explode(
        d,
        {
          id: 1,
          side: 0,
          ammo: 'blast',
          position: { ...p.position, x: p.position.x - offset, y: 0.8 },
          velocity: { x: 0, y: 0, z: 0 },
          power: 1,
          age: 0,
          trail: [],
        },
        'terrain',
      );
      return 100 - p.hp;
    };
    expect(damage(1)).toBeGreaterThan(damage(5));
    expect(damage(1, true)).toBeLessThan(damage(1));
    expect(damage(12)).toBe(0);
  });
  it('高速炮弹使用线段碰撞，不穿越薄墙', () => {
    expect(
      segmentBox(
        { x: -10, y: 2, z: 0 },
        { x: 10, y: 2, z: 0 },
        { x: 0, y: 2, z: 0 },
        { x: 0.2, y: 4, z: 4 },
      ),
    ).toBeCloseTo(0.495);
  });
  it('机器人遵守装填和真实弹道，并形成可结束的持续互轰', () => {
    const d = createDuel(),
      a = new DuelBot(0),
      b = new DuelBot(1);
    for (let i = 0; i < 60 * 250 && !d.result; i++) {
      a.tick(d);
      b.tick(d);
      stepDuel(d);
    }
    expect(d.nextId).toBeGreaterThan(8);
    expect(d.result).not.toBeNull();
    expect(d.fighters.every((p) => p.medicines >= 0 && p.medicines <= 3)).toBe(true);
  });
  it('拒绝篡改血量、非有限角度、非法炮位和伪造动作', () => {
    expect(parseCommand({ type: 'hp', hp: 100 })).toBeNull();
    expect(parseCommand({ type: 'aim', pitch: Infinity, yaw: 0 })).toBeNull();
    expect(parseCommand({ type: 'station', id: 'enemy' })).toBeNull();
    expect(parseCommand({ type: 'crouch', down: 'yes' })).toBeNull();
  });
});
