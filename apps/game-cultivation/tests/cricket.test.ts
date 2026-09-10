import { describe, expect, it } from 'vitest';
import {
  actCricket,
  createMatch,
  startMatch,
  tickCricket,
  type CricketMatch,
} from '../src/domain/cricket.js';

function advance(state: CricketMatch, seconds: number) {
  let next = state;
  for (let t = 0; t < seconds - 0.00001; t += 0.01)
    next = tickCricket(next, Math.min(0.01, seconds - t));
  return next;
}
function strike(state: CricketMatch, seconds = 0.75) {
  return actCricket(advance(actCricket(state, 'tease'), seconds), 'strike');
}

describe('cricket timing and complete match', () => {
  it('requires start; golden timing hits harder than tapping or overcharging', () => {
    const ready = createMatch();
    expect(actCricket(ready, 'tease')).toBe(ready);
    const fight = startMatch(ready);
    expect(strike(fight).enemyHealth).toBe(63);
    expect(strike(fight, 0.1).enemyHealth).toBe(72);
    expect(strike(fight, 1.1).enemyHealth).toBe(75);
    expect(fight.enemyHealth).toBe(80);
  });
  it('late dodges avoid damage and create stronger counterattacks; early dodges fail', () => {
    const fight = startMatch(createMatch());
    let late = advance(fight, 2.5);
    late = advance(actCricket(late, 'dodge'), 0.3);
    expect(late.health).toBe(100);
    expect(late.event).toBe('dodge');
    late = advance(late, 0.4);
    expect(strike(late, 0.65).enemyHealth).toBe(53);
    const early = advance(actCricket(advance(fight, 1.8), 'dodge'), 1);
    expect(early.health).toBe(87);
  });
  it('prevents dodge spam, handles cancellation and rejects non-finite time', () => {
    const initial = startMatch(createMatch());
    const dodge = actCricket(initial, 'dodge');
    expect(actCricket(dodge, 'dodge')).toBe(dodge);
    expect(actCricket({ ...initial, stamina: 10 }, 'dodge').stamina).toBe(10);
    const cancelled = actCricket(actCricket(initial, 'tease'), 'cancel');
    expect(cancelled.holding).toBe(false);
    expect(cancelled.charge).toBe(0);
    expect(tickCricket(initial, NaN)).toBe(initial);
  });
  it('settles defeat and timeout once; inputs cannot change a finished match', () => {
    let lost = startMatch(createMatch());
    lost = advance(lost, 60);
    expect(lost.phase).toBe('lost');
    expect(actCricket(lost, 'tease')).toBe(lost);
    expect(tickCricket(lost, 0.1)).toBe(lost);
    const timeout = tickCricket(
      { ...startMatch(createMatch()), time: 0.005, enemyHealth: 40 },
      0.01,
    );
    expect(timeout.phase).toBe('won');
  });
  it('all three opponents can be beaten with timed attacks and recovery', () => {
    for (let round = 0; round < 3; round++) {
      let s = startMatch(createMatch(round));
      for (let frame = 0; frame < 6000 && s.phase === 'fighting'; frame++) {
        if (s.enemyPhase === 'tell' && s.enemyClock < 0.2 && s.cooldown === 0 && s.stamina >= 23)
          s = actCricket(s, 'dodge');
        else if (s.holding && s.charge >= 0.57) s = actCricket(s, 'strike');
        else if (!s.holding && s.enemyPhase !== 'tell' && s.stamina >= 45)
          s = actCricket(s, 'tease');
        s = tickCricket(s, 0.01);
      }
      expect(s.phase, `round ${round + 1}`).toBe('won');
    }
  });
});
