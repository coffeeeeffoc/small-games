export const RUN_VERSION = 'street-solo-v2';

export function runConfig(game) {
  return {
    version: RUN_VERSION,
    mode: game.level.mode || 'challenge',
    role: game.playerRole,
    level: game.level.id,
    rule: game.orderRule,
    first: game.firstRole || 'simultaneous',
  };
}
export function formatRecord(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '暂无';
  const hundredths = Math.round(seconds * 100);
  const minutes = Math.floor(hundredths / 6000);
  return `${String(minutes).padStart(2, '0')}:${((hundredths % 6000) / 100).toFixed(2).padStart(5, '0')}`;
}
async function request(config, body) {
  const client = globalThis.__competition;
  if (!client) throw new Error('服务器暂未连接');
  const query = new URLSearchParams(config);
  return client.request(
    `/runs/cops-robbers-realtime?${query}`,
    body ? { body: JSON.stringify(body) } : undefined,
  );
}
export const readRecords = (config) => request(config);
export const submitRun = (config, ticks, orders) => request(config, { ticks, orders });
