export const RUN_VERSION = 'street-solo-v2';
export function onlineEnabled(config = globalThis.__COMPETITION_CONFIG__) {
  return config?.competitionEnabled === true && /^https?:\/\//.test(config.apiUrl || '');
}
export const ONLINE_ENABLED = onlineEnabled();

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
async function request(config, body,admission,starting=false) {
  if (!onlineEnabled()) throw new Error('联网功能暂未开放');
  const client = globalThis.__competition;
  if (!client) throw new Error('服务器暂未连接');
  const query = new URLSearchParams(config);
  if(admission) query.set('admissionId',admission.admissionId);
  return client.request(
    `/runs/cops-robbers-realtime${starting?'/start':''}?${query}`,
    body ? { body: JSON.stringify(body) } : undefined,
    admission?.ownerId,
  );
}
export const readRecords = (config) => request(config);
const configKey=config=>JSON.stringify(Object.entries(config).sort(([a],[b])=>a.localeCompare(b)));
const unavailable=()=>Object.assign(new Error('本局未获得有效开局票据，仅保存本地成绩；请重新开局后再提交。'),{code:'RUN_ADMISSION_REQUIRED'});
export async function startRun(config) {
  const client=globalThis.__competition;
  if(!onlineEnabled() || !client?.session) throw unavailable();
  const owner=await client.session(),ownerId=owner.userId||owner.playerId;
  if(!ownerId) throw unavailable();
  const snapshot={...config};
  const result=await client.request(`/runs/cops-robbers-realtime/start?${new URLSearchParams(snapshot)}`,{body:'{}'},ownerId);
  if(!/^[a-f0-9-]{36}$/i.test(result?.admissionId||'') || !Number.isFinite(result.expiresAt) || result.expiresAt<=Date.now()) throw unavailable();
  return Object.freeze({admissionId:result.admissionId,expiresAt:result.expiresAt,ownerId,configKey:configKey(snapshot)});
}
export function submitRun(config,ticks,orders,admission) {
  if(!admission || admission.expiresAt<=Date.now() || admission.configKey!==configKey(config)) return Promise.reject(unavailable());
  return request(config,{ticks,orders},admission);
}
