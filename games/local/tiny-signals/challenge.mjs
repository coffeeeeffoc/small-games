/** Invitations are local, self-reported challenges, never authenticated leaderboard results. */
export function readChallenge(href, levels) {
  let url;
  try { url = new URL(href); } catch { return null; }
  const route = /^#\/games\/tiny-signals(?:\?([^#]*))?$/.exec(url.hash);
  const params = route ? new URLSearchParams(route[1] || '') : url.searchParams;
  if (['challenge', 'level', 'targetMoves'].some((key) => params.getAll(key).length !== 1)) return null;
  if (params.get('challenge') !== '1') return null;
  const index = levels.findIndex((level) => level.id === params.get('level'));
  const raw = params.get('targetMoves');
  if (index < 0 || !/^[1-9]\d{0,5}$/.test(raw || '')) return null;
  const targetMoves = Number(raw);
  if (targetMoves > 100000 || targetMoves < (levels[index].optimalMoves ?? 1)) return null;
  return { levelIndex: index, levelId: levels[index].id, targetMoves };
}

export function challengeOutcome(moves, targetMoves, assisted = false) {
  if (assisted) return '使用了提示 · 本次不参与少步比较';
  if (moves < targetMoves) return `比好友自报的成绩少 ${targetMoves - moves} 步！`;
  if (moves === targetMoves) return '追平好友自报的成绩！';
  return `比好友自报的成绩多 ${moves - targetMoves} 步 · 再试一次`;
}
