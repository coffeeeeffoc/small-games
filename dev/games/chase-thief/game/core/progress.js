import { DISTRICTS } from './route.js';
                                           
                                           
export const SAVE_KEY = 'chase-thief.progress.v2';
export const LEGACY_KEY = 'chase-thief.progress.v1';
                         
                   
                
                
                
 
                           
             
                 
                   
                         
                        
                     
                                          
                                      
                        
                    
 
export function freshProgress()           {
  return {
    version: 2,
    sound: true,
    haptics: true,
    reducedMotion: false,
    touchButtons: false,
    selected: 'old-town',
    best: {},
    legacyBest: {},
    tutorialSeen: false,
    writable: true,
  };
}
function parse(raw         )      {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
}
function validResult(value     )                  {
  return (
    value &&
    ['distance', 'score', 'coins', 'combo'].every(
      (k) => Number.isFinite(value[k]) && value[k] >= 0 && value[k] < 1e12,
    )
  );
}
export function loadProgress(raw         , legacyRaw          = null)           {
  const p = freshProgress();
  const legacy = parse(legacyRaw);
  if (legacy?.version === 1) {
    if (typeof legacy.sound === 'boolean') p.sound = legacy.sound;
    if (typeof legacy.haptics === 'boolean') p.haptics = legacy.haptics;
    if (legacy.best && typeof legacy.best === 'object' && !Array.isArray(legacy.best)) {
      for (const id of ['old-town', 'market', 'canal']) {
        const r = legacy.best[id];
        if (
          r &&
          Number.isFinite(r.time) &&
          r.time > 0 &&
          r.time <= 60 &&
          Number.isInteger(r.collisions) &&
          r.collisions >= 0 &&
          r.collisions < 3
        )
          p.legacyBest[id] = { time: r.time, collisions: r.collisions };
      }
    }
  }
  if (raw === null || raw === undefined || raw === '') return p;
  const data = parse(raw);
  if (!data || data.version !== 2) {
    p.writable = false;
    return p;
  }
  for (const key of ['sound', 'haptics', 'reducedMotion', 'touchButtons', 'tutorialSeen']         )
    if (typeof data[key] === 'boolean') p[key] = data[key];
  if (DISTRICTS.includes(data.selected)) p.selected = data.selected;
  for (const district of DISTRICTS)
    if (validResult(data.best?.[district])) p.best[district] = { ...data.best[district] };
  if (data.legacyBest && typeof data.legacyBest === 'object' && !Array.isArray(data.legacyBest))
    p.legacyBest = { ...data.legacyBest };
  p.writable = data.writable !== false;
  return p;
}
/** Only maxima are recorded, so repeated result delivery is idempotent. No currency is minted here. */
export function recordRun(progress          , run     )           {
  const next = loadProgress(progress);
  if (run.practice || run.invincible || run.phase !== 'lost') return next;
  const result = {
    distance: Math.floor(run.s),
    score: run.score,
    coins: run.coins,
    combo: run.bestCombo,
  };
  if (!validResult(result)) return next;
  const old = next.best[run.departure];
  next.best[run.departure] = old
    ? {
        distance: Math.max(old.distance, result.distance),
        score: Math.max(old.score, result.score),
        coins: Math.max(old.coins, result.coins),
        combo: Math.max(old.combo, result.combo),
      }
    : result;
  next.tutorialSeen = true;
  return next;
}
