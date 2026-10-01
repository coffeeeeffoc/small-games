import { relayLevelIds } from './relay.js';

export function readPuzzleLink(input) {
  const url = new URL(input), query = url.searchParams;
  if (url.search.length > 1024 || ['mode','level','role','first','rule'].some(key => query.getAll(key).length > 1)) return null;
  if (!query.has('level')) return null;
  const raw = query.get('level'), level = Number(raw);
  if (!/^\d{1,3}$/.test(raw) || level < 1 || level > 100) return null;
  const mode = ['challenge', 'escape', 'survival'].includes(query.get('mode')) ? query.get('mode') : 'challenge';
  const rule = mode === 'challenge' && query.get('rule') === 'relay' && relayLevelIds.includes(level) ? 'relay' : 'standard';
  return { mode, level, rule, role: query.get('role') === 'runner' ? 'runner' : 'pursuer', first: query.get('first') === 'runner' ? 'runner' : 'pursuer' };
}
export function puzzleUrl(input, puzzle) {
  const url = new URL(input);
  url.search = ''; url.hash = ''; url.username = ''; url.password = '';
  url.searchParams.set('mode', puzzle.mode);
  url.searchParams.set('level', String(puzzle.level));
  url.searchParams.set('rule', puzzle.rule || 'standard');
  if (puzzle.mode !== 'challenge') {
    url.searchParams.set('role', puzzle.role);
    url.searchParams.set('first', puzzle.first);
  }
  return url.href;
}
export function showPuzzleShare(puzzle, title) {
  const dialog = document.getElementById('share-dialog');
  const field = document.getElementById('share-url');
  const note = document.getElementById('share-note');
  field.value = puzzleUrl(location.href, puzzle);
  document.getElementById('share-title').textContent = title;
  note.textContent = '好友会从同一地图和规则重新开局，自己的成绩由实际游玩产生。';
  document.getElementById('native-share').hidden = typeof navigator.share !== 'function';
  document.getElementById('copy-share').onclick = async () => {
    try { await navigator.clipboard.writeText(field.value); note.textContent = '同题链接已复制，发给好友试试另一种走法。'; }
    catch { field.focus(); field.select(); note.textContent = '可选中上方链接，手动复制分享。'; }
  };
  document.getElementById('native-share').onclick = async () => {
    try { await navigator.share({ title, text: title, url: field.value }); note.textContent = '分享面板已完成。'; }
    catch (error) { note.textContent = error?.name === 'AbortError' ? '已取消分享，仍可复制同题链接。' : '暂时无法调用分享面板，可复制同题链接。'; }
  };
  if (!dialog.open) dialog.showModal();
}
