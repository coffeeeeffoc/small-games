const publicParameters: Readonly<Record<string, readonly string[]>> = {
  'carding-car': ['kartChallenge', 'mode', 'theme', 'route', 'vehicle', 'driver', 'seed', 'target'],
  'cops-robbers': ['mode', 'level', 'role', 'first', 'rule'],
  'cops-robbers-realtime': ['mode', 'level', 'role', 'first', 'rule'],
  'letters-words2': ['daily', 'mini', 'v'],
  'vibeJam-myself-history-guess': ['daily', 'route', 'v', 'region', 'timed'],
  'xiangqi-five': ['challenge'],
  'travel-bund': ['route', 'renderDetail'],
  'night-overwatch': ['mission'],
  'wulong-city': ['challenge'],
};

type ChallengeProtocol = {
  fields: Readonly<Record<string, (value: string) => boolean>>;
  required: readonly string[];
  together?: readonly string[];
};
const oneOf =
  (...values: string[]) =>
  (value: string) =>
    values.includes(value);
const integer =
  (maximum: number, minimum = 0) =>
  (value: string) =>
    /^(0|[1-9]\d*)$/.test(value) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) >= minimum &&
    Number(value) <= maximum;
const levelId = (value: string) => /^[a-z][a-z0-9-]{0,63}$/.test(value);
const boxFaces = (value: string) => {
  const faces = value.split(',');
  return (
    faces.length === 2 &&
    faces[0] !== faces[1] &&
    faces.every(oneOf('front', 'back', 'top', 'bottom', 'left', 'right'))
  );
};

// Public challenge contracts, kept separate from development/session parameters.
// A malformed or incomplete contract must not turn into a different valid challenge.
const challengeProtocols: Readonly<Record<string, ChallengeProtocol>> = {
  'chase-thief': {
    fields: {
      chaseChallenge: oneOf('1'),
      level: oneOf('old-town', 'market', 'canal'),
      time: (value) => /^\d{1,2}\.\d$/.test(value) && Number(value) > 0 && Number(value) <= 60,
      mistakes: integer(2),
    },
    required: ['chaseChallenge', 'level', 'time', 'mistakes'],
  },
  'retreat-rally': {
    fields: {
      rallyChallenge: oneOf('1'),
      level: oneOf('valley', 'pursuit', 'crossbow'),
      time: integer(180, 1),
      survivors: integer(6, 1),
    },
    required: ['rallyChallenge', 'level', 'time', 'survivors'],
  },
  'tiny-signals': {
    fields: {
      challenge: oneOf('1'),
      level: oneOf('garden', 'compass', 'bridge', 'wind', 'counterweight', 'echo'),
      targetMoves: integer(100000, 1),
    },
    required: ['challenge', 'level', 'targetMoves'],
  },
  'orbit-atelier': {
    fields: { challenge: (value) => /^orbit-(0[1-9]|1\d|2[0-4])$/.test(value) },
    required: ['challenge'],
  },
  'wulong-city': {
    fields: { challenge: integer(100, 1) },
    required: ['challenge'],
  },
  'surprise-kept': {
    fields: { challenge: (value) => /^birthday-0[1-8]$/.test(value) },
    required: ['challenge'],
  },
  'homebound-station': {
    fields: { station: integer(3, 1) },
    required: ['station'],
  },
  // Slug syntax is public; each Game resolves authored content IDs and validates
  // level-specific goals/face combinations before entering a challenge.
  'waterline-station': {
    fields: { station: levelId, target: integer(99, 1) },
    required: ['station'],
  },
  'rescue-team': {
    fields: { rescueLevel: integer(3, 1) },
    required: ['rescueLevel'],
  },
  'out-of-frame': {
    fields: { challenge: oneOf('frame-v1'), level: levelId, targetMs: integer(3600000) },
    required: ['challenge', 'level'],
  },
  'fold-the-world': {
    fields: { challenge: oneOf('fold-v1'), level: integer(100, 1), targetFolds: integer(1000) },
    required: ['challenge', 'level'],
  },
  'two-sided-box': {
    fields: {
      challenge: oneOf('box-v1'),
      level: levelId,
      faces: boxFaces,
      targetMoves: integer(10000),
    },
    required: ['challenge', 'level', 'faces'],
  },
  'tower-brake': {
    fields: {
      challenge: oneOf('tower-v1'),
      level: oneOf(
        'first-brake',
        'blue-current',
        'left-right',
        'stepping-stones',
        'return-arc',
        'narrow-margins',
        'double-rescue',
        'last-descent',
      ),
      targetScore: integer(20000),
    },
    required: ['challenge', 'level'],
  },
  'cage-rescue': {
    fields: {
      challenge: oneOf('rescue-v1'),
      level: (value) => /^rescue-0[1-6]$/.test(value),
      targetRescued: integer(6),
      targetCombo: integer(6),
    },
    required: ['challenge', 'level'],
  },
  'ball-roguelite': {
    fields: {
      challenge: oneOf('orbit-v1'),
      level: oneOf('stardust', 'prism', 'flare', 'frost', 'void', 'orbit', 'endless'),
      seed: integer(0xffffffff, 1),
      targetScore: integer(10000000),
    },
    required: ['challenge', 'level', 'seed'],
  },
  'ember-bounce': {
    fields: {
      emberChallenge: oneOf('1'),
      level: oneOf(
        'first-spark',
        'side-glow',
        'prism-turn',
        'ember-chain',
        'green-comet',
        'crossfire',
        'hot-horizon',
        'last-light',
      ),
      turns: integer(1000, 1),
    },
    required: ['emberChallenge', 'level', 'turns'],
  },
  'three-choose-two': {
    fields: {
      seed: integer(0xffffffff),
      variant: oneOf('classic', 'refill'),
      targetScore: integer(1000000000),
    },
    required: ['seed'],
  },
  'flick-arena': {
    fields: {
      seed: integer(Number.MAX_SAFE_INTEGER),
      layout: oneOf('first-push', 'triangle', 'chain', 'edge', 'cross'),
      targetShots: integer(999, 1),
    },
    required: ['seed', 'layout'],
  },
  'moss-garden': {
    fields: {
      level: (value) => /^moss-(0[1-9]|[12]\d|30)$/.test(value),
      targetHints: integer(10000),
      targetMistakes: integer(10000),
      targetTime: integer(604800000),
    },
    required: ['level'],
    together: ['targetHints', 'targetMistakes', 'targetTime'],
  },
};

/** Public mode parameters shared by catalog entries and same-game sharing. */
export function publicGameQuery(gameId: string, search: string): string {
  if (search.length > 2048) return '';
  const incoming = new URLSearchParams(search);
  const parameters = new URLSearchParams();
  const protocol = challengeProtocols[gameId];
  if (protocol) {
    if (protocol.required.some((key) => !incoming.has(key))) return '';
    if (
      protocol.together?.some((key) => incoming.has(key)) &&
      protocol.together.some((key) => !incoming.has(key))
    )
      return '';
    for (const [key, validate] of Object.entries(protocol.fields)) {
      const values = incoming.getAll(key);
      if (values.length > 1 || (values.length === 1 && !validate(values[0]))) return '';
      if (values.length === 1) parameters.set(key, values[0]);
    }
    return parameters.toString();
  }
  for (const key of publicParameters[gameId] ?? []) {
    const values = incoming.getAll(key);
    if (values.length > 1 || (values[0] && !/^[A-Za-z0-9_-]{1,64}$/.test(values[0]))) return '';
    if (values[0]) parameters.set(key, values[0]);
  }
  return parameters.toString();
}

/** Share the published Game entry and its public challenge, never Shell credentials. */
export function gameShareUrl(gameId: string, entryUrl: string, currentUrl?: string): string {
  const entry = new URL(entryUrl);
  entry.search = publicGameQuery(gameId, entry.search);
  entry.hash = '';
  entry.username = '';
  entry.password = '';
  if (!currentUrl) return entry.href;
  try {
    const current = new URL(currentUrl);
    if (current.origin !== entry.origin || current.pathname !== entry.pathname) return entry.href;
    // Each Game independently validates the selected mode and its rules.
    entry.search = publicGameQuery(gameId, current.search);
  } catch {
    // A navigated or inaccessible frame still has a usable public entry.
  }
  return entry.href;
}
