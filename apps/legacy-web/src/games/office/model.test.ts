import { describe, it, expect } from 'vitest';
import { tick, upgradeCost } from './model';
describe('office', () => {
  it('earns while safe', () =>
    expect(tick({ joy: 0, coins: 0, suspicion: 0 }, true, false).joy).toBe(2));
  it('raises suspicion under watch', () =>
    expect(tick({ joy: 0, coins: 0, suspicion: 0 }, true, true).suspicion).toBe(8));
  it('applies privacy screen reduction', () =>
    expect(tick({ joy: 0, coins: 0, suspicion: 0 }, true, true, 2).suspicion).toBe(4));
  it('scales upgrades', () => expect(upgradeCost(2)).toBe(39));
});
