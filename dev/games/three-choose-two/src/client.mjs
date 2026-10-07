const PATH = '/three-choose-two';
export const RANKING_VERSION = 'three-choose-two-v1';

export function createOnlineClient(configOverride = {}, nativeSdk) {
  const config = { ...globalThis.__COMPETITION_CONFIG__, ...configOverride, game: 'three-choose-two' };
  globalThis.__installCompetition?.(config, nativeSdk);
  async function request(path, body) {
    if (!globalThis.__competition) throw new Error('在线服务尚未连接，离线练习仍可正常游玩。');
    return globalThis.__competition.request(PATH + path, body === undefined ? undefined : { body: JSON.stringify(body) });
  }
  return {
    create: () => request('/session', {}),
    restore: (id) => request('/session/' + encodeURIComponent(id)),
    place: (session, slot, x, y) => request('/session/' + encodeURIComponent(session.id) + '/actions', {
      seq: session.seq + 1, group: session.state.group, slot, x, y,
    }),
    finish: (session) => request('/session/' + encodeURIComponent(session.id) + '/finish', {}),
    board: () => request('/board?version=' + encodeURIComponent(RANKING_VERSION)),
  };
}
