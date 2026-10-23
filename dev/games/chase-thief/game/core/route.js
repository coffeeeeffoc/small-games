/** Deterministic city geometry and content; no engine or platform dependencies. */
                                                       
                                                                                    
export const DISTRICTS             = ['old-town', 'alley', 'market'];
export const DISTRICT_NAMES                           = {
  'old-town': '骑楼街',
  alley: '居民巷',
  market: '集市',
};
export const SEGMENT_LENGTH = 80;
export const WAVE_SPACING = 32;
export const LOOK_AHEAD = 156;
export const KEEP_BEHIND = 28;
export const OBSTACLE_TYPES                 = ['barrier', 'beam', 'crate', 'cart', 'gap', 'barrel'];
export function hash(value        , seed = 1)         {
  let n = (value | 0) ^ (seed | 0);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const smooth = (x        ) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
function curve(s        , seed        , salt        , amplitude        ) {
  const index = Math.floor(s / SEGMENT_LENGTH),
    t = s / SEGMENT_LENGTH - index;
  const point = (i        ) => (hash(i + salt, seed) * 2 - 1) * amplitude;
  const a = point(index),
    b = point(index + 1);
  const m0 = (b - point(index - 1)) * 0.5,
    m1 = (point(index + 2) - a) * 0.5;
  const t2 = t * t,
    t3 = t2 * t;
  return {
    value:
      (2 * t3 - 3 * t2 + 1) * a +
      (t3 - 2 * t2 + t) * m0 +
      (-2 * t3 + 3 * t2) * b +
      (t3 - t2) * m1 -
      point(0),
    derivative:
      ((6 * t2 - 6 * t) * a +
        (3 * t2 - 4 * t + 1) * m0 +
        (-6 * t2 + 6 * t) * b +
        (3 * t2 - 2 * t) * m1) /
      SEGMENT_LENGTH,
  };
}
export function segmentInfo(index        , seed = 1, departure           = 'old-town') {
  index = Math.max(0, Math.floor(index));
  const district =
    DISTRICTS[(Math.floor(index / 3) + Math.max(0, DISTRICTS.indexOf(departure))) % 3];
  const fork = index >= 3 && index % 5 === 4;
  const a = curve(index * SEGMENT_LENGTH, seed, 201, 15);
  const b = curve((index + 1) * SEGMENT_LENGTH, seed, 201, 15);
  const height =
    curve((index + 1) * SEGMENT_LENGTH, seed, 701, 2.4).value -
    curve(index * SEGMENT_LENGTH, seed, 701, 2.4).value;
  const kind = fork
    ? 'fork'
    : b.value - a.value < -6
      ? 'left-bend'
      : b.value - a.value > 6
        ? 'right-bend'
        : Math.abs(height) > 1.5
          ? 'slope'
          : district === 'market'
            ? 'arcade'
            : 'street';
  return {
    index,
    start: index * SEGMENT_LENGTH,
    end: (index + 1) * SEGMENT_LENGTH,
    district,
    kind,
    fork,
    width: district === 'alley' ? 6.6 : district === 'market' ? 8.6 : 9.4,
    riskSide: hash(index + 779, seed) > 0.5 ? 2 : 0,
    landmark: index % 7 === 6,
    seed: Math.floor(hash(index + 91, seed) * 0x7fffffff),
  };
}
export function sampleRoute(s        , seed = 1, departure           = 'old-town') {
  s = Number.isFinite(s) ? Math.max(-100, s) : 0;
  const index = Math.max(0, Math.floor(s / SEGMENT_LENGTH));
  const segment = segmentInfo(index, seed, departure);
  const previous = segmentInfo(Math.max(0, index - 1), seed, departure);
  // Seeded Catmull-Hermite control points share tangents at all segment seams.
  const horizontal = curve(s, seed, 201, 15),
    vertical = curve(s, seed, 701, 2.4);
  const x = horizontal.value,
    dx = horizontal.derivative,
    y = vertical.value,
    slope = vertical.derivative;
  const t = (s - segment.start) / SEGMENT_LENGTH;
  const width = previous.width + (segment.width - previous.width) * smooth(t * 5);
  // A genuine island splits the street into left/right passages and then rejoins it.
  const split = segment.fork ? smooth((t - 0.15) / 0.2) * (1 - smooth((t - 0.65) / 0.2)) : 0;
  return {
    x,
    y,
    z: s,
    heading: Math.atan2(dx, 1),
    slope,
    width: width + split * 3,
    laneWidth: width / 3,
    district: segment.district,
    index,
    kind: segment.kind,
    fork: segment.fork,
    split,
  };
}
export function lanePosition(s        , lane        , seed = 1, departure           = 'old-town') {
  const p = sampleRoute(s, seed, departure);
  const lateral = (1 - lane) * (p.laneWidth + p.split * 1.7);
  return {
    x: p.x + Math.cos(p.heading) * lateral,
    y: p.y,
    z: p.z - Math.sin(p.heading) * lateral,
    heading: p.heading,
  };
}
                           
             
             
               
                     
                    
                 
               
 
                       
             
             
               
                     
                
 
export function waveAt(index        , seed        , departure          )             {
  const at = 38 + index * WAVE_SPACING;
  const segment = segmentInfo(Math.floor(at / SEGMENT_LENGTH), seed, departure);
  const local = at - segment.start;
  // Fork islands use the middle lane; authored obstacle waves never obstruct a fork entrance/exit.
  if (segment.fork) {
    return local >= 24 && local < 56
      ? [
          {
            id: `w${index}-fork`,
            at: segment.start + 52,
            lane: segment.riskSide,
            type: 'barrier',
            resolved: false,
            offset: 0,
            wave: index,
          },
        ]
      : [];
  }
  const kind =
    index < 3 ? OBSTACLE_TYPES[index] : OBSTACLE_TYPES[Math.floor(hash(index + 32, seed) * 6)];
  const lane = index < 3 ? 1 : Math.floor(hash(index + 87, seed) * 3);
  const result             = [
    { id: `w${index}-a`, at, lane, type: kind, resolved: false, offset: 0, wave: index },
  ];
  if (index > 6 && hash(index + 421, seed) > 0.52) {
    const otherLane = (lane + 1 + Math.floor(hash(index + 209, seed) * 2)) % 3;
    const type = OBSTACLE_TYPES[Math.floor(hash(index + 887, seed) * 6)];
    result.push({
      id: `w${index}-b`,
      at,
      lane: otherLane,
      type,
      resolved: false,
      offset: 0,
      wave: index,
    });
  }
  return result;
}
export function coinsAt(index        , seed        , departure          )         {
  const at = 38 + index * WAVE_SPACING;
  const segment = segmentInfo(Math.floor(at / SEGMENT_LENGTH), seed, departure);
  const lane = segment.fork
    ? segment.riskSide
    : index < 3
      ? 1
      : Math.floor(hash(index + 607, seed) * 3);
  // Coin strings are a voluntary risk/reward route, never the only safe path.
  return [0, 1, 2].map((n) => ({
    id: `c${index}-${n}`,
    at: at + 7 + n * 3.2,
    lane,
    collected: false,
    value: segment.fork ? 2 : 1,
  }));
}
