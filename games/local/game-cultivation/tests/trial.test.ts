import { describe, expect, it } from 'vitest';
import {
  action,
  cancelTrialInput,
  createTrial,
  enterScene,
  hurt,
  interact,
  tickTrial,
  type Trial,
} from '../src/domain/trial.js';
import { distance, direction, enemy } from '../src/domain/world.js';
function advance(s: Trial, seconds: number) {
  for (let t = 0; t < seconds - 0.00001; t += 0.05) tickTrial(s, Math.min(0.05, seconds - t));
}
function run() {
  const s = createTrial();
  action(s, 'start');
  return s;
}

describe('player-driven cultivation trial', () => {
  it('only banks breath on release and loses an unstable or cancelled breath', () => {
    const s = run();
    s.player = { x: 180, y: 370 };
    interact(s, true);
    advance(s, 1);
    expect(s.qi).toBe(35);
    interact(s, false);
    expect(s.qi).toBeCloseTo(59);
    interact(s, true);
    advance(s, 3);
    interact(s, false);
    expect(s.qi).toBeCloseTo(59);
    advance(s, 1);
    interact(s, true);
    advance(s, 1);
    cancelTrialInput(s);
    interact(s, false);
    expect(s.qi).toBeCloseTo(59);
  });
  it('requires actual sword collision, blocks stone and keeps the free basic attack', () => {
    const s = run();
    s.player = { x: 240, y: 400 };
    s.enemies = [enemy('target', 'dummy', 240, 250, 100)];
    s.qi = 0;
    s.aim = { x: 400, y: 400 };
    action(s, 'charge');
    action(s, 'release');
    advance(s, 0.8);
    expect(s.enemies[0].hp).toBe(100);
    s.aim = { x: 240, y: 250 };
    action(s, 'charge');
    advance(s, 1);
    action(s, 'release');
    advance(s, 0.4);
    expect(s.enemies[0].hp).toBe(84);
    expect(s.qi).toBe(0);
    advance(s, 1);
    s.obstacles = [{ id: 'wall', kind: 'rock', hp: 1, x: 240, y: 330, r: 25 }];
    action(s, 'charge');
    action(s, 'release');
    advance(s, 0.8);
    expect(s.enemies[0].hp).toBe(84);
  });
  it('cancels held attacks on dodge and lifecycle interruptions without ghost swords', () => {
    const s = run();
    action(s, 'charge');
    advance(s, 0.8);
    action(s, 'dodge');
    action(s, 'release');
    expect(s.swords).toHaveLength(0);
    hurt(s, 30, '竹妖扑击');
    expect(s.health).toBe(100);
    advance(s, 0.5);
    action(s, 'charge');
    cancelTrialInput(s);
    action(s, 'release');
    expect(s.swords).toHaveLength(0);
    expect(s.move).toEqual({ x: 0, y: 0 });
  });
  it('makes a stone charge break a pillar and creates a recovery window', () => {
    const s = run();
    enterScene(s, 'forest');
    s.player = { x: 355, y: 740 };
    s.enemies = [enemy('test', 'stone', 355, 560, 110)];
    s.enemies[0].mode = 'rush';
    s.enemies[0].timer = 0.6;
    s.enemies[0].direction = { x: 0, y: 1 };
    advance(s, 0.25);
    expect(s.obstacles[0].hp).toBe(0);
    expect(s.enemies[0].mode).toBe('recover');
    expect(s.journal).toContain('引石兽撞断残柱');
  });
  it('preserves explored terrain across cave visits and transports at incense expiry', () => {
    const s = run();
    enterScene(s, 'forest');
    s.enemies[0].hp = 0;
    s.obstacles[0].hp = 0;
    enterScene(s, 'cave');
    enterScene(s, 'forest');
    expect(s.enemies[0].hp).toBe(0);
    expect(s.obstacles[0].hp).toBe(0);
    s.elapsed = 119.98;
    advance(s, 0.1);
    expect(s.scene).toBe('summit');
    expect(s.phase).toBe('tribulation');
  });
  it('uses real relic abilities and a single fox rescue instead of passive stat bonuses', () => {
    const s = run();
    enterScene(s, 'summit');
    s.relics = ['shield', 'wood'];
    s.qi = 50;
    action(s, 'shield');
    hurt(s, 22, '落雷');
    expect(s.health).toBe(100);
    expect(s.qi).toBe(23);
    s.shield = 0;
    s.fox = 'following';
    hurt(s, 22, '落雷');
    expect(s.fox).toBe('spent');
    expect(s.health).toBe(100);
    hurt(s, 22, '落雷');
    expect(s.health).toBe(78);
    action(s, 'wood');
    expect(s.tree).not.toBeNull();
    s.player = { x: 60, y: 450 };
    advance(s, 1.6);
    expect(s.lightning[0].x).toBe(240);
    expect(s.woodUsed).toBe(true);
  });
  it('never clears an eye by waiting and reports timeout', () => {
    const s = run();
    enterScene(s, 'summit');
    s.invulnerable = 100;
    advance(s, 60.1);
    expect(s.phase).toBe('lost');
    expect(s.wave).toBe(0);
    expect(s.enemies[0].hp).toBe(90);
  });
  it('can complete all three eyes with basic attacks, no relics and zero qi', () => {
    const s = run();
    enterScene(s, 'summit');
    s.qi = 0;
    for (let t = 0; t < 60 && s.phase === 'tribulation'; t += 0.05) {
      const eye = s.enemies[0];
      const candidates = [
        { x: 130, y: 330 },
        { x: 350, y: 330 },
        { x: 240, y: 350 },
        { x: 240, y: 260 },
      ];
      const safe =
        candidates
          .filter((p) => s.lightning.every((b) => b.struck || distance(p, b) > b.radius + 25))
          .sort((a, b) => distance(a, s.player) - distance(b, s.player))[0] ?? candidates[0];
      s.move = distance(s.player, safe) > 6 ? direction(s.player, safe) : { x: 0, y: 0 };
      if (
        s.lightning.some((b) => !b.struck && b.timer < 0.3 && distance(s.player, b) < b.radius + 10)
      )
        action(s, 'dodge');
      s.aim = eye;
      if (s.exposed > 0 && distance(s.player, eye) < 265) {
        action(s, 'charge');
        action(s, 'release');
      }
      tickTrial(s, 0.05);
    }
    expect(s.phase).toBe('won');
    expect(s.wave).toBe(3);
    expect(s.health).toBeGreaterThan(0);
  });
});
