import { beforeAll, describe, expect, it } from 'vitest';
import type { Rule } from '../src/competition/types.js';

type State = {
  revision: number;
  elapsedMs: number;
  turnStartsAtMs: number | null;
  turnDeadlineMs: number | null;
  nextRoundAtMs: number | null;
  nextReady: number[];
  reason: string | null;
  lastTimeout: { seat: number; at: number } | null;
  series: {
    phase: string;
    players: { id: string }[];
    round: number;
    winnerId: string | null;
    history: { roundId: string }[];
    scores: Record<string, number>;
    wins: Record<string, number>;
  };
  match: {
    active: number;
    phase: string;
    tournamentRoundId: string;
    seats: string[];
    discs: { x: number; y: number; alive: boolean }[];
    shots: number;
  };
};
type FlickRule = Omit<Rule, 'initial' | 'action' | 'advance'> & {
  initial(seed: number, mode?: string): State;
  action(state: State, input: unknown, elapsed: number, seat: number): State;
  advance(state: State, elapsed: number): State;
};
let rule: FlickRule;
beforeAll(async () => {
  const path = new URL('../rules/flick.mjs', import.meta.url).href;
  rule = ((await import(path)) as { default: FlickRule }).default;
});
const seatFor = (state: State) => Number(state.match.seats[state.match.active]!.slice(7)) - 1;
const atTurn = (state: State) => Math.max(state.elapsedMs, state.turnStartsAtMs ?? 0);
const shot = (state: State, x = 1, y = 0, power = 0.08) => ({
  type: 'shoot',
  revision: state.revision,
  x,
  y,
  power,
});

describe('authoritative Flick Arena series', () => {
  it('rejects invented modes and invalid vectors, powers, revisions and seats without mutation', () => {
    expect(() => rule.initial(1, 'party5')).toThrow();
    const state = rule.initial(1, 'duel');
    const before = structuredClone(state);
    for (const change of [
      { x: 0, y: 0 },
      { x: Infinity },
      { y: NaN },
      { x: 10001 },
      { power: 0 },
      { power: 1.01 },
      { revision: -1 },
      { revision: 0.1 },
      { score: 999 },
      { elapsedMs: 100000 },
      { type: 'finish' },
    ])
      expect(() => rule.action(state, { ...shot(state), ...change }, 0, 0)).toThrow();
    for (const seat of [-1, 1, 2, 0.5])
      expect(() => rule.action(state, shot(state), 0, seat)).toThrow();
    expect(state).toEqual(before);
  });

  it('holds the next turn until server-simulated motion has finished', () => {
    const initial = rule.initial(1, 'duel');
    const state = rule.action(initial, shot(initial), 0, seatFor(initial));
    expect(state.match.phase).toBe('aim');
    expect(state.turnStartsAtMs).toBeGreaterThan(0);
    expect(initial.match.shots).toBe(0);
    expect(() =>
      rule.action(state, shot(state), state.turnStartsAtMs! - 1, seatFor(state)),
    ).toThrow();
    expect(() =>
      rule.action(state, shot(state), state.turnStartsAtMs!, seatFor(state)),
    ).not.toThrow();
    const skipped = rule.advance(state, state.turnDeadlineMs!);
    expect(skipped.revision).toBe(state.revision + 1);
    expect(skipped.lastTimeout?.at).toBe(state.turnDeadlineMs);
    expect(skipped.lastTimeout?.seat).toBe(seatFor(state));
  });

  it.each(['duel', 'party3', 'party4'])(
    'completes %s with authoritative points, ready consensus and rotating seats',
    (mode) => {
      let state = rule.initial(123, mode);
      const count = state.series.players.length;
      const openings: number[] = [];
      let lastRound = '';
      for (let commands = 0; commands < 60 && state.series.phase !== 'finished'; commands++) {
        if (state.series.phase === 'round-result') {
          const previousRound = state.match.tournamentRoundId;
          const input = { type: 'next', revision: state.revision, roundId: previousRound };
          expect(() =>
            rule.action(state, { ...input, roundId: 'old-round' }, state.elapsedMs, 0),
          ).toThrow();
          for (let seat = 0; seat < count; seat++) {
            state = rule.action(state, input, state.elapsedMs, seat);
            expect(state.series.phase).toBe(seat === count - 1 ? 'playing' : 'round-result');
          }
          expect(state.match.tournamentRoundId).not.toBe(previousRound);
          continue;
        }
        const seat = seatFor(state);
        if (state.match.tournamentRoundId !== lastRound) {
          openings.push(seat);
          lastRound = state.match.tournamentRoundId;
        }
        const disc = state.match.discs[state.match.active]!;
        // Player 1 stays near the center; all other players deliberately launch outwards.
        const direction = seat === 0 ? -1 : 1;
        const action = shot(state, disc.x * direction, disc.y * direction, seat === 0 ? 0.08 : 1);
        const otherSeat = (seat + 1) % count;
        expect(() => rule.action(state, action, atTurn(state), otherSeat)).toThrow();
        state = rule.action(state, action, atTurn(state), seat);
      }
      expect(state.series.phase).toBe('finished');
      expect(state.series.winnerId).toBe('player-1');
      expect(state.series.history).toHaveLength(count === 2 ? 2 : count);
      expect(openings).toEqual(
        Array.from({ length: count === 2 ? 2 : count }, (_, index) => index),
      );
      expect(new Set(state.series.history.map((entry) => entry.roundId)).size).toBe(
        state.series.history.length,
      );
      expect(state.series.scores['player-1']).toBe(count === 2 ? 2 : count * count);
      for (let seat = 0; seat < count; seat++) {
        const result = rule.result(state, seat);
        expect(result.finished).toBe(true);
        expect(result.eligible).toBe(false);
        expect(result.score).toBe(state.series.scores[`player-${seat + 1}`]);
      }
      expect(rule.advance(state, state.elapsedMs + 100000).series).toEqual(state.series);
    },
  );

  it('resumes an unattended room through multiple rounds and ends at the server time limit', () => {
    const state = rule.advance(rule.initial(456, 'duel-relaxed'), rule.durationMs);
    expect(state.series.phase).toBe('finished');
    expect(state.reason).toBe('time-limit');
    expect(state.series.winnerId).toBeNull();
    expect(state.series.history.length).toBeGreaterThan(1);
    expect(state.turnDeadlineMs).toBeNull();
    expect(rule.result(state, 0).eligible).toBe(false);
    expect(rule.advance(state, rule.durationMs * 2)).toEqual(state);
  });
});
