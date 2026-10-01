export function readPuzzleLink(input) {
  const url = new URL(input), query = url.searchParams, raw = query.get('level'), level = Number(raw);
  if (url.search.length > 1024 || ['mode','level','role','first','rule'].some(key => query.getAll(key).length > 1)) return null;
  if (!raw || !/^\d{1,3}$/.test(raw) || level < 1 || level > 100) return null;
  const mode = ['challenge', 'classic', 'escape'].includes(query.get('mode')) ? query.get('mode') : 'challenge';
  return { level, mode, role: query.get('role') === 'robber' ? 'robber' : 'cop', rule: query.get('rule') === 'relay' ? 'relay' : 'standard',
    first: mode === 'challenge' || query.get('first') === 'none' ? null : query.get('first') === 'robber' ? 'robber' : 'cop' };
}
export function puzzleUrl(input, puzzle) {
  const url = new URL(input); url.search = ''; url.hash = ''; url.username = ''; url.password = '';
  for (const [key, value] of Object.entries({ mode: puzzle.mode, level: puzzle.level, role: puzzle.role, rule: puzzle.rule || 'standard', first: puzzle.first || 'none' })) url.searchParams.set(key, String(value));
  return url.href;
}
export function fillPuzzleShare(puzzle, title) {
  const field = document.getElementById('share-url'), note = document.getElementById('share-note');
  field.value = puzzleUrl(location.href, puzzle);
  document.getElementById('share-title').textContent = title;
  note.textContent = '同地图、角色、先动方与指挥规则。好友从准备状态开局，成绩由实际行动产生。';
  document.getElementById('native-share').hidden = typeof navigator.share !== 'function';
  document.getElementById('copy-share').onclick = async () => {
    try { await navigator.clipboard.writeText(field.value); note.textContent = '同题链接已复制。发给好友，比比怎样分头包抄。'; }
    catch { field.focus(); field.select(); note.textContent = '可选中上方链接，手动复制分享。'; }
  };
  document.getElementById('native-share').onclick = async () => {
    try { await navigator.share({ title, text: title, url: field.value }); note.textContent = '分享面板已完成。'; }
    catch (error) { note.textContent = error?.name === 'AbortError' ? '已取消分享，仍可复制同题链接。' : '暂时无法调用分享面板，可复制同题链接。'; }
  };
}
