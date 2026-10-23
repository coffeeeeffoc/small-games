import {
  DISTRICTS,
  LOOK_AHEAD,
  KEEP_BEHIND,
  WAVE_SPACING,
  SEGMENT_LENGTH,
  sampleRoute,
  segmentInfo,
  waveAt,
  coinsAt,
} from './route.js';
                                                           
export const RULES = Object.freeze({
  fixedStep: 1 / 60,
  startSpeed: 9,
  maxSpeed: 15,
  acceleration: 0.015,
  jumpDuration: 0.94,
  slideDuration: 0.88,
  jumpHeight: 1.65,
  laneRate: 12,
  collisionProtection: 1.5,
  slowDuration: 1.15,
  health: 3,
  maxEvents: 24,
});
                                                         
                           
               
                  
                         
 
                      
               
                      
                                       
                    
                      
            
                
                  
                
                      
                
               
                     
                                   
                          
                     
                 
                
                
                    
                
                   
                        
                     
                    
                     
                        
                   
                        
                  
                     
                 
                     
                    
                
                           
               
 
function emit(run     , type        , details                          = {}) {
  run.events.push({ type, elapsed: run.elapsed, ...details });
  if (run.events.length > RULES.maxEvents)
    run.events.splice(0, run.events.length - RULES.maxEvents);
}
export function createRun({
  seed = 1,
  departure = 'old-town',
  practice = false,
}                                                              = {})      {
  const run      = {
    seed: Number.isFinite(seed) ? seed >>> 0 || 1 : 1,
    departure: DISTRICTS.includes(departure) ? departure : 'old-town',
    phase: 'running',
    practice,
    invincible: false,
    s: 0,
    world: 0,
    elapsed: 0,
    ticks: 0,
    accumulator: 0,
    speed: RULES.startSpeed,
    lane: 1,
    laneVisual: 1,
    action: 'run',
    actionRemaining: 0,
    jumpHeight: 0,
    health: RULES.health,
    coins: 0,
    combo: 0,
    bestCombo: 0,
    score: 0,
    distance: 0,
    thiefDistance: 17,
    collisions: 0,
    successes: 0,
    protection: 0,
    slowRemaining: 0,
    nextWave: 0,
    obstacles: [],
    pickups: [],
    events: [],
    reason: '',
    forkChoice: -1,
    forkIndex: -1,
    forks: 0,
    lastWaveResolved: -1,
    hint: '上滑跳跃 · 下滑滑铲',
  };
  fill(run);
  return run;
}
export function act(run     , action        )          {
  if (run.phase !== 'running') return false;
  if (action === 'left' || action === 'right') {
    const next = Math.max(0, Math.min(2, run.lane + (action === 'left' ? -1 : 1)));
    if (next === run.lane) return false;
    // Once inside the split, the two streets are separated by the island.
    const route = sampleRoute(run.s, run.seed, run.departure);
    if (route.split > 0.05 && run.forkChoice >= 0) return false;
    run.lane = next;
  } else if (action === 'jump' || action === 'slide') {
    if (run.action !== 'run') return false;
    run.action = action;
    run.actionRemaining = action === 'jump' ? RULES.jumpDuration : RULES.slideDuration;
  } else return false;
  emit(run, 'action', { action, lane: run.lane });
  return true;
}
export function pauseRun(run     ) {
  if (run.phase === 'running') {
    run.phase = 'paused';
    run.accumulator = 0;
  }
}
export function resumeRun(run     ) {
  if (run.phase === 'paused') {
    run.phase = 'running';
    run.accumulator = 0;
  }
}
export function markPractice(run     ) {
  run.practice = true;
}
export function visibleObstacles(run     ) {
  return run.obstacles.filter((o) => o.at >= run.s - 8 && o.at <= run.s + LOOK_AHEAD);
}
export function visibleCoins(run     ) {
  return run.pickups.filter((c) => !c.collected && c.at >= run.s - 3 && c.at <= run.s + LOOK_AHEAD);
}
export function drainEvents(run     ) {
  const events = run.events.slice();
  run.events.length = 0;
  return events;
}
function fill(run     ) {
  while (38 + run.nextWave * WAVE_SPACING < run.s + LOOK_AHEAD) {
    run.obstacles.push(...waveAt(run.nextWave, run.seed, run.departure));
    run.pickups.push(...coinsAt(run.nextWave, run.seed, run.departure));
    run.nextWave++;
  }
  run.obstacles = run.obstacles.filter((o) => o.at > run.s - KEEP_BEHIND);
  run.pickups = run.pickups.filter((c) => c.at > run.s - KEEP_BEHIND);
}
function lose(run     , reason        ) {
  if (run.phase !== 'running') return;
  run.phase = 'lost';
  run.reason = reason;
  run.accumulator = 0;
  emit(run, 'lose', { reason });
}
function hit(run     , type        ) {
  if (run.invincible) {
    run.practice = true;
    return;
  }
  if (type === 'gap') {
    run.health = 0;
    lose(run, '没有跳过沟壑');
    return;
  }
  if (run.protection > 0) return;
  run.health--;
  run.collisions++;
  run.combo = 0;
  run.protection = RULES.collisionProtection;
  run.slowRemaining = RULES.slowDuration;
  emit(run, 'collision', { obstacle: type, health: run.health });
  if (run.health <= 0) lose(run, type === 'island' ? '撞到了岔路中央的花坛' : '连续碰撞，体力耗尽');
}
function tick(run     ) {
  const dt = RULES.fixedStep;
  run.ticks++;
  run.elapsed = run.ticks * dt;
  run.protection = Math.max(0, run.protection - dt);
  run.slowRemaining = Math.max(0, run.slowRemaining - dt);
  run.actionRemaining = Math.max(0, run.actionRemaining - dt);
  if (run.actionRemaining <= 0) run.action = 'run';
  const age = run.action === 'jump' ? 1 - run.actionRemaining / RULES.jumpDuration : 0;
  run.jumpHeight = run.action === 'jump' ? Math.sin(age * Math.PI) * RULES.jumpHeight : 0;
  run.laneVisual += (run.lane - run.laneVisual) * (1 - Math.exp(-RULES.laneRate * dt));
  run.speed =
    Math.min(RULES.maxSpeed, RULES.startSpeed + run.elapsed * RULES.acceleration) *
    (run.slowRemaining > 0 ? 0.58 : 1);
  const before = run.s;
  run.s += run.speed * dt;
  run.world = run.s;
  run.distance = run.s;
  const route = sampleRoute(run.s, run.seed, run.departure);
  const info = segmentInfo(route.index, run.seed, run.departure);
  if (route.fork) {
    if (run.forkIndex !== route.index) {
      run.forkIndex = route.index;
      run.forkChoice = -1;
      emit(run, 'fork-warning', { riskSide: info.riskSide });
    }
    if (route.split >= 0.5 && run.forkChoice < 0) {
      run.forkChoice = run.laneVisual < 1 ? 0 : 2;
      run.lane = run.forkChoice;
      if (Math.abs(run.laneVisual - 1) < 0.72) {
        hit(run, 'island');
        // Recover into the safe passage; never leave the character inside geometry.
        run.forkChoice = info.riskSide === 0 ? 2 : 0;
        run.lane = run.forkChoice;
      }
      emit(run, 'fork-choice', { lane: run.forkChoice, risk: run.forkChoice === info.riskSide });
    }
    if (run.forkChoice >= 0 && route.split < 0.05 && run.s - info.start > SEGMENT_LENGTH * 0.8) {
      run.forks++;
      run.coins += run.forkChoice === info.riskSide ? 5 : 1;
      emit(run, 'fork-clear', { lane: run.forkChoice });
      run.forkChoice = -2;
    }
  } else run.forkChoice = -1;
  for (const o of run.obstacles) {
    // Moving props remain within their advertised lane, preserving the safe route.
    o.offset =
      o.type === 'cart'
        ? Math.sin(run.elapsed * 1.8 + o.wave) * 0.38
        : o.type === 'barrel'
          ? Math.sin(run.elapsed * 3 + o.wave) * 0.18
          : 0;
    if (o.resolved || o.at > run.s) continue;
    o.resolved = true;
    const touched = Math.abs(run.laneVisual - (o.lane + o.offset / route.laneWidth)) < 0.38;
    const avoids =
      ((o.type === 'barrier' || o.type === 'gap' || o.type === 'barrel') &&
        run.jumpHeight > 0.55) ||
      (o.type === 'beam' &&
        run.action === 'slide' &&
        run.actionRemaining < RULES.slideDuration - 0.025 &&
        run.actionRemaining > 0.025);
    if (touched && !avoids) hit(run, o.type);
    else if (touched && avoids) {
      run.combo++;
      run.successes++;
      run.bestCombo = Math.max(run.bestCombo, run.combo);
      emit(run, 'clear', { obstacle: o.type, combo: run.combo });
    }
    if (run.phase !== 'running') break;
  }
  if (run.phase === 'running')
    for (const coin of run.pickups) {
      if (
        !coin.collected &&
        coin.at >= before &&
        coin.at <= run.s &&
        Math.abs(run.laneVisual - coin.lane) < 0.4
      ) {
        coin.collected = true;
        run.coins += coin.value;
        emit(run, 'pickup', { value: coin.value });
      }
    }
  const targetDistance = Math.max(
    10,
    Math.min(
      24,
      17 +
        Math.sin(run.s / 58) * 3 -
        Math.min(run.combo, 8) * 0.5 +
        (run.slowRemaining > 0 ? 4 : 0),
    ),
  );
  run.thiefDistance += (targetDistance - run.thiefDistance) * (1 - Math.exp(-dt * 1.5));
  run.score = Math.floor(run.s) + run.coins * 25 + run.successes * 40;
  const next = run.obstacles.find((o) => !o.resolved && o.at > run.s);
  run.hint =
    route.fork && route.split < 0.4
      ? '前方分路 · 向左或向右滑动'
      : next && next.wave < 3 && next.at - run.s < 26
        ? ['上滑 · 跳过矮栏', '下滑 · 穿过横杆', '左右滑动 · 绕开箱堆'][next.wave]
        : '';
  fill(run);
}
/** Consumes fixed simulation steps; rendering stalls cannot skip collision planes. Pause owns its clock. */
export function updateRun(run     , dt        )      {
  if (run.phase !== 'running' || !Number.isFinite(dt) || dt <= 0) return run;
  run.accumulator += dt;
  while (run.accumulator + 1e-10 >= RULES.fixedStep && run.phase === 'running') {
    run.accumulator = Math.max(0, run.accumulator - RULES.fixedStep);
    tick(run);
  }
  return run;
}
