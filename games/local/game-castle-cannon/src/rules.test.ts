import { describe, it, expect } from 'vitest';
import { LEVELS, validateLevels } from './levels.js';
import { createBattle, shoot, step, alive } from './rules.js';
import { newProgress, readProgress, settle } from './progress.js';
const fire = (b: ReturnType<typeof createBattle>, ammo: 'solid' | 'blast', id: string) => {
  const m = b.modules.find((m) => m.id === id)!;
  expect(shoot(b, ammo, m.x, m.y)).toBe(true);
  step(b, 2.81);
};
describe('deterministic siege rules', () => {
  it('solid destroys first gate in one shot and troops enter the breach', () => {
    const b = createBattle(LEVELS[0]);
    step(b, 12);
    expect(Math.max(...alive(b).map((u) => u.x))).toBe(554);
    fire(b, 'solid', 'gate');
    expect(b.modules[0].hp).toBe(0);
    expect(Math.max(...alive(b).map((u) => u.x))).toBeGreaterThan(590);
  });
  it('single solid impact and local blast affect different target sets', () => {
    const b = createBattle(LEVELS[1]);
    fire(b, 'solid', 'tower-a');
    expect(b.modules.find((m) => m.id === 'tower-a')?.hp).toBe(1);
    expect(b.modules.find((m) => m.id === 'tower-b')?.hp).toBe(4);
    const c = createBattle(LEVELS[1]);
    fire(c, 'blast', 'tower-a');
    expect(c.modules.find((m) => m.id === 'tower-a')?.hp).toBe(2);
    expect(c.modules.find((m) => m.id === 'tower-b')?.hp).toBe(2);
    expect(c.modules[0].hp).toBe(5);
  });
  it('reload, miss, invalid aim and time are bounded', () => {
    const b = createBattle(LEVELS[0]);
    expect(shoot(b, 'solid', 590, 280)).toBe(true);
    expect(shoot(b, 'solid', 680, 160)).toBe(false);
    step(b, 3);
    expect(shoot(b, 'blast', 250, 100)).toBe(true);
    step(b, 3);
    expect(b.modules[1].hp).toBe(3);
    expect(shoot(b, 'solid', NaN, 0)).toBe(false);
    expect(() => step(b, -1)).toThrow();
  });
  it('towers suppress troops, idle army cannot win, destruction prevents more casualties', () => {
    const b = createBattle(LEVELS[0]);
    step(b, 40);
    expect(b.result).toBe('lost');
    expect(b.losses).toBe(12);
    const c = createBattle(LEVELS[0]);
    step(c, 9);
    fire(c, 'solid', 'tower');
    const losses = c.losses;
    step(c, 15);
    expect(c.losses).toBe(losses);
    expect(c.capture).toBe(0);
  });
  it('gate first advances sooner; tower first preserves more troops in an observed approach', () => {
    const gate = createBattle(LEVELS[0]),
      tower = createBattle(LEVELS[0]);
    step(gate, 9);
    step(tower, 9);
    fire(gate, 'solid', 'gate');
    fire(tower, 'solid', 'tower');
    expect(Math.max(...alive(gate).map((u) => u.x))).toBeGreaterThan(
      Math.max(...alive(tower).map((u) => u.x)),
    );
    step(gate, 4);
    step(tower, 4);
    fire(gate, 'solid', 'tower');
    fire(tower, 'solid', 'gate');
    step(gate, 30);
    step(tower, 30);
    expect(gate.result).toBe('won');
    expect(tower.result).toBe('won');
    expect(gate.losses).toBeGreaterThan(tower.losses);
  });
  it('all three castles reachable with normal ammo and soldiers', () => {
    for (const l of LEVELS) {
      const b = createBattle(l);
      for (const m of b.modules.filter((m) => m.kind === 'tower'))
        while (m.hp > 0) fire(b, 'solid', m.id);
      for (const m of b.modules.filter((m) => m.kind !== 'tower'))
        while (m.hp > 0) fire(b, 'solid', m.id);
      step(b, 60);
      expect(b.result, l.id).toBe('won');
      expect(b.capture).toBe(1);
    }
  });
  it('configuration rejects duplicates and missing gate', () => {
    expect(() => validateLevels([...LEVELS, LEVELS[0]])).toThrow();
    expect(() => validateLevels([{ ...LEVELS[0], modules: [] }])).toThrow();
  });
  it('save restore, unlocks and repeated retry cannot duplicate rewards; practice isolated', () => {
    const p = newProgress();
    expect(settle(p, 0)).toBe(4);
    expect(settle(p, 0)).toBe(0);
    expect(settle(p, 1, true)).toBe(0);
    expect(p.unlocked).toBe(1);
    const loaded = readProgress(JSON.parse(JSON.stringify(p)));
    expect(loaded).toEqual(p);
    expect(readProgress({ version: 99 })).toEqual(newProgress());
  });
});
