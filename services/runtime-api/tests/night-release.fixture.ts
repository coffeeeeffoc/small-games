import type { RankedRule } from '../src/competition/ranked-types.js';
import type { Rule } from '../src/competition/types.js';
import { createNightRelease, type NightReleaseConfig } from '../src/competition/night-release.js';

export const game = 'night-overwatch';
export const owner = '11111111-1111-4111-8111-111111111111';
type State = {
  engine: string;
  value: number;
  elapsed: number;
  finished: boolean;
  takenOver?: number;
};
function generation(name: string, multiplier: number) {
  const state = (value: unknown) => {
    const result = value as State;
    if (result.engine !== name) throw Error('Wrong engine');
    return structuredClone(result);
  };
  const initial = () => ({ engine: name, value: 0, elapsed: 0, finished: false });
  const ranked: RankedRule = {
    id: game,
    title: name,
    version: `solo-${name}`,
    boards: [
      {
        id: 'level-corridor-01',
        title: name,
        description: '',
        guestAllowed: true,
        scoreUnit: 'x',
        secondaryUnit: 'milliseconds',
      },
    ],
    boardKey: (board) => `${game}:${board}:board-${name}`,
    create: initial,
    apply(value, frames) {
      const next = state(value);
      next.value += multiplier * frames.reduce((total, frame) => total + frame.ticks, 0);
      return next;
    },
    result(value) {
      return {
        complete: true,
        eligible: true,
        score: state(value).value + multiplier,
        secondary: 1000,
      };
    },
  };
  const multiplayer: Rule = {
    id: game,
    title: name,
    version: `duel-${name}`,
    durationMs: 5000,
    duel: true,
    lobby: true,
    noTimeLimit: true,
    unrated: true,
    modes: [
      { id: 'friend', title: 'friend' },
      { id: 'match', title: 'match' },
    ],
    initial,
    view: (value) => ({ engine: name, displayed: state(value).value + multiplier }),
    action(value) {
      const next = state(value);
      next.value += multiplier;
      return next;
    },
    advance(value, elapsed) {
      const next = state(value);
      next.value += (elapsed - next.elapsed) * multiplier;
      next.elapsed = elapsed;
      return next;
    },
    takeover(value, seat) {
      const next = state(value);
      next.takenOver = seat;
      return next;
    },
    result(value) {
      return {
        finished: state(value).finished,
        eligible: false,
        score: state(value).value + multiplier,
        secondary: 1000,
      };
    },
  };
  return { ranked, multiplayer };
}
export function releaseFixture(stopOld = false) {
  const old = generation('a', 1),
    current = generation('b', 100);
  const config: NightReleaseConfig = {
    schemaVersion: 1,
    builds: [
      {
        buildId: 'build-a',
        channel: 'h5',
        ranked: old.ranked.version,
        multiplayer: old.multiplayer.version,
      },
      {
        buildId: 'build-b',
        channel: 'h5',
        ranked: current.ranked.version,
        multiplayer: current.multiplayer.version,
      },
    ],
    channels: [{ channel: 'h5', latestBuildId: 'build-b' }],
    legacy: { channel: 'h5', ranked: old.ranked.version, multiplayer: old.multiplayer.version },
    allowNew: {
      ranked: stopOld ? ['solo-b'] : ['solo-a', 'solo-b'],
      multiplayer: stopOld ? ['duel-b'] : ['duel-a', 'duel-b'],
    },
  };
  const release = createNightRelease(
    [current.ranked, old.ranked],
    [current.multiplayer, old.multiplayer],
    config,
  );
  return { old, current, config, release };
}
