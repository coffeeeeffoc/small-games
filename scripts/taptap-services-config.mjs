import assert from 'node:assert/strict';
const games = ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'];
export const tapServicesVariable = (game) =>
  `TAPTAP_${game.toUpperCase().replaceAll('-', '_')}_SERVICES`;
export function validateTapServices(value) {
  if (value === undefined || value === null) return { enabled: false };
  assert(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).every((key) =>
        ['enabled', 'appConsoleId', 'appId', 'leaderboardId'].includes(key),
      ),
    'Invalid public TapTap services config',
  );
  assert(typeof value.enabled === 'boolean', 'TapTap services require an explicit enabled flag');
  if (!value.enabled) return { enabled: false };
  assert(
    /^\d{3,12}$/.test(String(value.appConsoleId)),
    'TapTap services require the application console ID',
  );
  assert(
    /^tap[A-Za-z0-9_-]{4,96}$/.test(value.appId || ''),
    'TapTap services require the actual target MiniApp ID',
  );
  assert(
    /^[a-z0-9]{10,64}$/.test(value.leaderboardId || ''),
    'TapTap services require the actual target leaderboard ID',
  );
  return {
    enabled: true,
    appConsoleId: String(value.appConsoleId),
    appId: value.appId,
    leaderboardId: value.leaderboardId,
  };
}
export function tapServicesConfig(game, env = process.env) {
  assert(games.includes(game), 'Unknown TapTap services game');
  const text = env[tapServicesVariable(game)];
  return validateTapServices(text ? JSON.parse(text) : undefined);
}
