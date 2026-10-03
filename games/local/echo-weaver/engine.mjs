/**
 * Echo Weaver's clock and acoustics are deliberately discrete. A unit of path
 * takes one tick; a delay chamber adds ticks without adding path. Audio and
 * animation consume this result and never participate in the win condition.
 */

const nonnegative = (value) => Number.isFinite(value) && value >= 0;

/** Return human-readable schema errors, without changing authored level data. */
export function validateLevel(level) {
  const errors = [];
  if (!level || typeof level !== 'object') return ['Level must be an object.'];
  if (!level.id) errors.push('Level requires an id.');
  for (const key of ['lossPerUnit', 'reflectionLoss', 'minEnergy']) {
    if (!nonnegative(level[key])) errors.push(`${key} must be a nonnegative number.`);
  }
  for (const key of ['ticksPerBeat', 'beatMs']) {
    if (!Number.isFinite(level[key]) || level[key] <= 0) errors.push(`${key} must be positive.`);
  }
  if (
    !Array.isArray(level.targets) ||
    level.targets.length !== 3 ||
    level.targets.some(
      (target, i, targets) =>
        !Number.isFinite(target) || target <= 0 || (i > 0 && target <= targets[i - 1]),
    )
  ) {
    errors.push('Exactly three increasing, positive target ticks are required.');
  }
  const modes = level.splitter?.modes;
  if (!Array.isArray(modes) || modes.length === 0) {
    errors.push('Splitter requires at least one mode.');
  } else {
    for (const mode of modes) {
      if (
        !Array.isArray(mode.energy) ||
        mode.energy.length !== 3 ||
        mode.energy.some((value) => !nonnegative(value))
      ) {
        errors.push('Every splitter mode requires three nonnegative energy values.');
      } else if (Math.abs(mode.energy.reduce((sum, value) => sum + value, 0) - 300) > 1e-9) {
        errors.push('Splitter modes must conserve the initial 300 energy.');
      }
    }
    if (!validIndex(level.splitter.initial, modes)) errors.push('Invalid initial splitter mode.');
  }
  if (!Array.isArray(level.routes) || level.routes.length !== 3) {
    errors.push('Exactly three routes are required.');
    return errors;
  }
  const routeIds = new Set();
  const controlIds = new Set(['splitter']);
  for (const route of level.routes) {
    if (!route.id || routeIds.has(route.id)) errors.push('Route ids must be present and unique.');
    routeIds.add(route.id);
    for (const key of ['baseLength', 'baseLoss']) {
      if (!nonnegative(route[key])) errors.push(`${route.id}.${key} must be nonnegative.`);
    }
    if (!Array.isArray(route.stages)) {
      errors.push(`${route.id} requires a stages array.`);
      continue;
    }
    for (const stage of route.stages) {
      if (!stage.id || controlIds.has(stage.id))
        errors.push('Control ids must be present and unique.');
      controlIds.add(stage.id);
      if (!['reflector', 'delay'].includes(stage.kind))
        errors.push(`${stage.id} has an unsupported kind.`);
      if (!Array.isArray(stage.options) || stage.options.length === 0) {
        errors.push(`${stage.id} requires at least one option.`);
        continue;
      }
      if (!validIndex(stage.initial, stage.options))
        errors.push(`${stage.id} has an invalid initial option.`);
      for (const option of stage.options) {
        for (const key of ['length', 'reflections', 'loss', 'delay']) {
          if (!nonnegative(option[key]))
            errors.push(`${stage.id} option ${key} must be nonnegative.`);
        }
        if (option.blocked !== undefined && typeof option.blocked !== 'boolean') {
          errors.push(`${stage.id} option blocked must be a boolean.`);
        }
      }
    }
  }
  return errors;
}

function validIndex(index, options) {
  return Number.isInteger(index) && index >= 0 && index < options.length;
}

function assertLevel(level) {
  const errors = validateLevel(level);
  if (errors.length) throw new TypeError(`Invalid Echo Weaver level: ${errors.join(' ')}`);
}

function selectedOption(stage, state) {
  const index = state.choices?.[stage.id];
  if (!validIndex(index, stage.options)) throw new RangeError(`Invalid option for ${stage.id}.`);
  return stage.options[index];
}

/** A fresh, serializable state. Authored solutions are never consulted in play. */
export function createState(level) {
  assertLevel(level);
  return {
    splitter: level.splitter.initial,
    choices: Object.fromEntries(
      level.routes.flatMap((route) => route.stages.map((stage) => [stage.id, stage.initial])),
    ),
  };
}

/** Cycle one directly manipulated object; the previous state remains untouched. */
export function cycleControl(level, state, id) {
  const next = { splitter: state.splitter, choices: { ...state.choices } };
  if (id === 'splitter') {
    if (!validIndex(state.splitter, level.splitter.modes))
      throw new RangeError('Invalid splitter mode.');
    next.splitter = (state.splitter + 1) % level.splitter.modes.length;
    return next;
  }
  const stage = level.routes.flatMap((route) => route.stages).find((item) => item.id === id);
  if (!stage) throw new RangeError(`Unknown control: ${id}.`);
  selectedOption(stage, state);
  next.choices[id] = (state.choices[id] + 1) % stage.options.length;
  return next;
}

/**
 * start/end/arrival/target/duration are simulation ticks. Each segment waits
 * `delay` ticks at its entrance, then travels `length` ticks. `loss` is the
 * authored extra absorption; `attenuation` includes distance and reflections.
 */
export function simulate(level, state) {
  assertLevel(level);
  if (!validIndex(state.splitter, level.splitter.modes))
    throw new RangeError('Invalid splitter mode.');
  const split = level.splitter.modes[state.splitter];
  const echoes = level.routes.map((route, routeIndex) => {
    const sourceEnergy = split.energy[routeIndex];
    let energy = sourceEnergy;
    let time = 0;
    let blocked = false;
    let length = 0;
    let reflections = 0;
    let delay = 0;
    const segments = [];
    const append = (stageId, kind, option) => {
      const start = time;
      const energyBefore = energy;
      const attenuation =
        option.length * level.lossPerUnit + option.reflections * level.reflectionLoss + option.loss;
      blocked ||= option.blocked === true;
      energy = blocked ? 0 : Math.max(0, energy - attenuation);
      time += option.length + option.delay;
      length += option.length;
      reflections += option.reflections;
      delay += option.delay;
      segments.push({
        stageId,
        kind,
        length: option.length,
        delay: option.delay,
        reflections: option.reflections,
        loss: option.loss,
        attenuation,
        start,
        end: time,
        energyBefore,
        energyAfter: energy,
        blocked: option.blocked === true,
        status: blocked ? 'blocked' : energy < level.minEnergy ? 'weak' : 'travel',
      });
    };
    if (route.baseLength > 0 || route.baseLoss > 0) {
      append(null, 'travel', {
        length: route.baseLength,
        loss: route.baseLoss,
        reflections: 0,
        delay: 0,
      });
    }
    for (const stage of route.stages) append(stage.id, stage.kind, selectedOption(stage, state));
    const target = level.targets[routeIndex];
    const targetDelta = time - target;
    const status = blocked
      ? 'blocked'
      : energy < level.minEnergy
        ? 'weak'
        : targetDelta < 0
          ? 'early'
          : targetDelta > 0
            ? 'late'
            : 'on-time';
    return {
      id: route.id,
      arrival: time,
      target,
      targetDelta,
      sourceEnergy,
      energy,
      status,
      length,
      reflections,
      delay,
      segments,
    };
  });
  return {
    won: echoes.every((echo) => echo.status === 'on-time'),
    // Keep the visual clock alive through missed target beats as well as echoes.
    duration: Math.max(...level.targets, ...echoes.map((echo) => echo.arrival)) + 1,
    echoes,
  };
}

/** Exhaustive authoring aid for these small, discrete puzzles. */
export function enumerateSolutions(level) {
  const initial = createState(level);
  const controls = level.routes.flatMap((route) => route.stages);
  const solutions = [];
  function visit(state, position) {
    if (position === controls.length) {
      if (simulate(level, state).won)
        solutions.push({ splitter: state.splitter, choices: { ...state.choices } });
      return;
    }
    const stage = controls[position];
    for (let i = 0; i < stage.options.length; i++) {
      state.choices[stage.id] = i;
      visit(state, position + 1);
    }
  }
  for (let splitter = 0; splitter < level.splitter.modes.length; splitter++) {
    visit({ splitter, choices: { ...initial.choices } }, 0);
  }
  return solutions;
}
