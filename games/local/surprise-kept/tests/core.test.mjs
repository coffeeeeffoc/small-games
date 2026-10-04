import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createState,
  applyAction,
  evaluateGoals,
  replayActions,
  legalActions,
  validateLevel,
  validateChapter,
} from '../src/core/engine.js';

const chapter = JSON.parse(
  await readFile(new URL('../content/chapters/birthday.json', import.meta.url), 'utf8'),
);
const clone = (value) => JSON.parse(JSON.stringify(value));
const move = (item, to) => ({ type: 'move', item, to });
const actorAction = (type, character) => ({ type, character });
const requireAction = (level, state, action) => {
  const result = applyAction(level, state, action);
  assert.equal(result.ok, true, result.message);
  return result.state;
};
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

test('the eight authored levels satisfy the chapter data contract', () => {
  assert.deepEqual(validateChapter(chapter), { valid: true, errors: [] });
  assert.equal(chapter.levels.length, 8);
});

for (const level of chapter.levels) {
  test(level.id + ': authored actions meet every actual, belief, and presence goal', () => {
    const state = replayActions(level, level.solution);
    const result = evaluateGoals(level, state);
    assert.equal(
      result.success,
      true,
      JSON.stringify(result.checks.filter((check) => !check.pass)),
    );
    assert.equal(state.steps, level.recommendedSteps);
    assert.equal(state.events.length, state.steps);
    assert.equal(state.screenTarget, null);
    assert.deepEqual(state.locations, level.goals.locations);
    for (const character of ['blue', 'orange']) {
      assert.deepEqual(state.characters[character].beliefs, level.goals.beliefs[character]);
      assert.equal(state.characters[character].present, true);
    }
  });
}

test("a public move is immutable and changes only the moved item's record", () => {
  const level = freeze(clone(chapter.levels[4]));
  const state = freeze(createState(level));
  const result = applyAction(level, state, move('key', 'red'));
  assert.equal(result.ok, true);
  assert.deepEqual(result.event.observers, ['blue', 'orange']);
  assert.equal(state.locations.key, 'blue');
  assert.deepEqual(result.state.locations, { gift: 'red', key: 'red' });
  for (const character of ['blue', 'orange']) {
    assert.deepEqual(result.state.characters[character].beliefs, { gift: 'red', key: 'red' });
    assert.equal(result.state.characters[character].lastSeen.gift.step, 0);
    assert.deepEqual(result.state.characters[character].lastSeen.key, {
      step: 1,
      from: 'blue',
      to: 'red',
    });
  }
});

test('leaving and returning never grant knowledge; reveal requires both home', () => {
  const level = chapter.levels[1];
  const away = replayActions(level, level.solution.slice(0, 2));
  const beforeReturn = clone(away.characters.blue);
  assert.equal(evaluateGoals(level, away).ready, false);
  assert.equal(evaluateGoals(level, away).success, false);
  const home = requireAction(level, away, actorAction('return', 'blue'));
  assert.deepEqual(home.characters.blue.beliefs, beforeReturn.beliefs);
  assert.deepEqual(home.characters.blue.lastSeen, beforeReturn.lastSeen);
  assert.equal(evaluateGoals(level, home).success, true);
});

test('the reference surprise sends the characters to their own false beliefs', () => {
  const level = chapter.levels[2];
  const state = freeze(replayActions(level, level.solution));
  const outcome = evaluateGoals(level, state);
  assert.equal(state.locations.gift, 'green');
  assert.deepEqual(outcome.visits, [
    { character: 'blue', item: 'gift', to: 'red' },
    { character: 'orange', item: 'gift', to: 'blue' },
  ]);
  assert.deepEqual(state.characters.blue.lastSeen.gift, { step: 0, from: 'red', to: 'red' });
  assert.deepEqual(state.characters.orange.lastSeen.gift, { step: 2, from: 'red', to: 'blue' });
  assert.deepEqual(state.events[3].missed, [
    { character: 'blue', reason: 'away' },
    { character: 'orange', reason: 'screen' },
  ]);
});

test('opening false beliefs do not auto-refresh, and same-box moves do nothing', () => {
  const level = chapter.levels[3];
  const state = freeze(createState(level));
  assert.equal(state.locations.gift, 'green');
  assert.equal(state.characters.blue.beliefs.gift, 'red');
  assert.equal(state.characters.orange.beliefs.gift, 'blue');
  assert.equal(evaluateGoals(level, state).success, false);
  const result = applyAction(level, state, move('gift', 'green'));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'same-box');
  assert.equal(result.state, state);
});

test('a screen protects only its selected observer and expires after one real move', () => {
  const level = chapter.levels[4];
  let state = requireAction(level, createState(level), actorAction('screen', 'blue'));
  state = requireAction(level, state, move('gift', 'green'));
  assert.equal(state.characters.blue.beliefs.gift, 'red');
  assert.equal(state.characters.orange.beliefs.gift, 'green');
  assert.equal(state.screensRemaining, 0);
  assert.equal(state.screenTarget, null);
  state = requireAction(level, state, move('gift', 'blue'));
  assert.equal(state.characters.blue.beliefs.gift, 'blue');
  assert.equal(state.characters.orange.beliefs.gift, 'blue');
});

test("moving the wrong item consumes the screen and leaves that item's record stale", () => {
  const level = chapter.levels[4];
  let state = requireAction(level, createState(level), actorAction('screen', 'blue'));
  state = requireAction(level, state, move('key', 'red'));
  state = requireAction(level, state, move('gift', 'green'));
  assert.deepEqual(state.characters.blue.beliefs, { gift: 'green', key: 'blue' });
  assert.deepEqual(state.characters.orange.beliefs, { gift: 'green', key: 'red' });
  assert.equal(state.screensRemaining, 0);
  assert.equal(evaluateGoals(level, state).success, false);
});

test('a previously placed screen expires even if its character leaves before the move', () => {
  const level = chapter.levels[7];
  let state = requireAction(level, createState(level), actorAction('screen', 'blue'));
  state = requireAction(level, state, actorAction('leave', 'blue'));
  assert.equal(state.screenTarget, 'blue');
  state = requireAction(level, state, move('key', 'red'));
  assert.equal(state.screenTarget, null);
  assert.equal(state.screensRemaining, 1);
  assert.equal(state.events.at(-1).screenConsumed, 'blue');
  assert.deepEqual(state.events.at(-1).missed, [{ character: 'blue', reason: 'away' }]);
  assert.equal(state.characters.blue.beliefs.key, 'green');
});

test('invalid actions never consume a pending screen, advance time, or change state', () => {
  const level = chapter.levels[7];
  const state = freeze(requireAction(level, createState(level), actorAction('screen', 'blue')));
  for (const action of [
    move('gift', 'red'),
    move('gift', 'purple'),
    move('unknown', 'blue'),
    actorAction('screen', 'orange'),
    actorAction('return', 'blue'),
    actorAction('leave', '__proto__'),
    { type: 'run-script', script: 'anything' },
    null,
  ]) {
    const result = applyAction(level, state, action);
    assert.equal(result.ok, false);
    assert.equal(result.state, state);
    assert.equal(result.state.screenTarget, 'blue');
    assert.equal(result.state.steps, 1);
    assert.equal(result.state.screensRemaining, 1);
  }
});

test('a screen cannot be placed for an absent character or when inventory is empty', () => {
  const level = chapter.levels[2];
  const away = requireAction(level, createState(level), actorAction('leave', 'blue'));
  assert.equal(applyAction(level, away, actorAction('screen', 'blue')).code, 'screen-away');
  let spent = requireAction(level, createState(level), actorAction('screen', 'blue'));
  spent = requireAction(level, spent, move('gift', 'blue'));
  assert.equal(applyAction(level, spent, actorAction('screen', 'orange')).code, 'no-screens');
});

test('the tea limit and fixed witness are real permissions', () => {
  const level = chapter.levels[5];
  const away = requireAction(level, createState(level), actorAction('leave', 'blue'));
  assert.equal(applyAction(level, away, actorAction('leave', 'orange')).code, 'away-limit');
  const fixed = chapter.levels[6];
  assert.equal(
    applyAction(fixed, createState(fixed), actorAction('leave', 'blue')).code,
    'cannot-leave',
  );
});

test('a future level can allow two absentees and restrict which item moves', () => {
  const level = clone(chapter.levels[7]);
  level.rules.maxAway = 2;
  level.rules.movableItems = ['key'];
  let state = requireAction(level, createState(level), actorAction('leave', 'blue'));
  state = requireAction(level, state, actorAction('leave', 'orange'));
  state = requireAction(level, state, move('key', 'red'));
  assert.equal(state.characters.blue.beliefs.key, 'green');
  assert.equal(state.characters.orange.beliefs.key, 'green');
  assert.equal(state.events.at(-1).observers.length, 0);
  assert.equal(applyAction(level, state, move('gift', 'blue')).code, 'item-fixed');
  assert.deepEqual(legalActions(level, state), [
    move('key', 'blue'),
    move('key', 'green'),
    actorAction('return', 'blue'),
    actorAction('return', 'orange'),
  ]);
});

test('a retained snapshot restores positions, memory, events, and screen inventory together', () => {
  const level = chapter.levels[2];
  const history = [createState(level)];
  for (const action of level.solution) {
    history.push(requireAction(level, history.at(-1), action));
  }
  const beforeLastMove = history[3];
  assert.equal(beforeLastMove.screenTarget, 'orange');
  assert.equal(beforeLastMove.locations.gift, 'blue');
  assert.equal(beforeLastMove.characters.orange.beliefs.gift, 'blue');
  assert.equal(beforeLastMove.events.length, 3);
  const alternative = requireAction(level, beforeLastMove, move('gift', 'red'));
  assert.equal(alternative.locations.gift, 'red');
  assert.equal(history[4].locations.gift, 'green');
  assert.equal(history[4].events.at(-1).to, 'green');
});

test('last-witness timestamps update for a visible move even if the remembered box already matched', () => {
  const level = chapter.levels[3];
  const state = requireAction(level, createState(level), move('gift', 'red'));
  assert.equal(state.characters.blue.beliefs.gift, 'red');
  assert.deepEqual(state.characters.blue.lastSeen.gift, { step: 1, from: 'green', to: 'red' });
});

test("replay reports an invalid action's index and a state cannot enter a different level", () => {
  const level = chapter.levels[0];
  assert.throws(
    () => replayActions(level, [move('gift', 'red')]),
    (error) => error.code === 'same-box' && error.actionIndex === 0,
  );
  const state = createState(level);
  assert.equal(applyAction(chapter.levels[1], state, move('gift', 'blue')).code, 'level-mismatch');
});

test('external chapter validation rejects broken references, unsafe keys, and invalid limits', () => {
  const changes = [
    (level) => {
      level.initial.locations.gift = 'missing-box';
    },
    (level) => {
      level.initial.characters.blue.beliefs.key = 'red';
    },
    (level) => {
      level.initial.characters.orange.present = 'yes';
    },
    (level) => {
      level.rules.screens = -1;
    },
    (level) => {
      level.rules.screens = 0.5;
    },
    (level) => {
      level.rules.screens = Infinity;
    },
    (level) => {
      level.rules.maxAway = 3;
    },
    (level) => {
      level.rules.canLeave = ['missing-character'];
    },
    (level) => {
      level.rules.movableItems = ['key'];
    },
    (level) => {
      level.rules.requireEveryoneHome = false;
    },
    (level) => {
      level.goals.beliefs.blue.gift = 'purple';
    },
    (level) => {
      level.goals.locations.key = 'blue';
    },
    (level) => {
      level.theme = '../unregistered-script.js';
    },
    (level) => {
      level.items = ['gift', 'gift'];
    },
    (level) => {
      level.solution = [{ type: 'eval', source: 'alert(1)' }];
    },
    (level) => {
      level.onMove = 'function(){}';
    },
    (level) => {
      Object.defineProperty(level.initial.locations, '__proto__', { value: {}, enumerable: true });
    },
  ];
  for (const change of changes) {
    const level = clone(chapter.levels[0]);
    change(level);
    const result = validateLevel(level);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length);
  }
  for (const invalid of [null, [], 'json', 3, {}])
    assert.equal(validateLevel(invalid).valid, false);
  const duplicate = clone(chapter);
  duplicate.levels.push(clone(duplicate.levels[0]));
  assert.equal(validateChapter(duplicate).valid, false);
});

test('chapter loading is not hard-coded to eight levels or to included answer sequences', () => {
  const extension = clone(chapter);
  const ninth = clone(extension.levels[0]);
  ninth.id = 'birthday-09';
  ninth.title = '新的排练';
  ninth.theme = 'afternoon';
  delete ninth.solution;
  extension.levels.push(ninth);
  assert.equal(validateChapter(extension).valid, true);
  const state = requireAction(ninth, createState(ninth), move('gift', 'blue'));
  assert.equal(evaluateGoals(ninth, state).success, true);
});

/**
 * Independent reachability oracle. It searches numeric information states,
 * without reading the authored solution or using the engine's transition,
 * legal-action generator, event history, or goal evaluator.
 */
function shortestPlan(level) {
  const boxes = ['red', 'blue', 'green'];
  const actors = ['blue', 'orange'];
  const items = level.items;
  const n = items.length;
  const presentOffset = n * 3;
  const stockIndex = presentOffset + 2;
  const shieldIndex = stockIndex + 1;
  const start = [
    ...items.map((item) => boxes.indexOf(level.initial.locations[item])),
    ...actors.flatMap((actor) =>
      items.map((item) => boxes.indexOf(level.initial.characters[actor].beliefs[item])),
    ),
    ...actors.map((actor) => Number(level.initial.characters[actor].present)),
    level.rules.screens,
    -1,
  ];
  const constraints = [];
  for (const [item, box] of Object.entries(level.goals.locations))
    constraints.push([items.indexOf(item), boxes.indexOf(box)]);
  actors.forEach((actor, index) => {
    constraints.push([presentOffset + index, 1]);
    for (const [item, box] of Object.entries(level.goals.beliefs[actor])) {
      constraints.push([n * (index + 1) + items.indexOf(item), boxes.indexOf(box)]);
    }
  });
  const queue = [{ values: start, distance: 0 }];
  const seen = new Set([start.join(',')]);
  const enqueue = (values, distance) => {
    const key = values.join(',');
    if (!seen.has(key)) {
      seen.add(key);
      queue.push({ values, distance });
    }
  };
  for (let head = 0; head < queue.length; head += 1) {
    const { values, distance } = queue[head];
    if (constraints.every(([index, expected]) => values[index] === expected))
      return { distance, explored: head + 1 };
    // An actual move atomically writes the destination into visible observers'
    // columns; the other item's columns are never part of this operation.
    items.forEach((item, itemIndex) => {
      if (!level.rules.movableItems.includes(item)) return;
      for (let box = 0; box < 3; box += 1) {
        if (box === values[itemIndex]) continue;
        const next = values.slice();
        next[itemIndex] = box;
        for (let actor = 0; actor < 2; actor += 1) {
          if (values[presentOffset + actor] === 1 && values[shieldIndex] !== actor) {
            next[n * (actor + 1) + itemIndex] = box;
          }
        }
        next[shieldIndex] = -1;
        enqueue(next, distance + 1);
      }
    });
    const away = 2 - values[presentOffset] - values[presentOffset + 1];
    for (let actor = 0; actor < 2; actor += 1) {
      const present = values[presentOffset + actor] === 1;
      if (
        !present ||
        (away < level.rules.maxAway && level.rules.canLeave.includes(actors[actor]))
      ) {
        const next = values.slice();
        next[presentOffset + actor] = present ? 0 : 1;
        enqueue(next, distance + 1);
      }
      if (present && values[stockIndex] > 0 && values[shieldIndex] === -1) {
        const next = values.slice();
        next[stockIndex] -= 1;
        next[shieldIndex] = actor;
        enqueue(next, distance + 1);
      }
    }
  }
  return { distance: Infinity, explored: seen.size };
}

for (const level of chapter.levels) {
  test(level.id + ': independently searchable within the advertised action count', () => {
    const result = shortestPlan(level);
    assert.equal(
      result.distance,
      level.recommendedSteps,
      'explored ' + result.explored + ' information states',
    );
  });
}
