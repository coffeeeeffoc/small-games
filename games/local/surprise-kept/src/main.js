import { loadCatalog } from './content/loader.js';
import { SurpriseGame } from './runtime/game.js';
import { $ } from './render/view.js';

try {
  const game = new SurpriseGame(await loadCatalog());
  // Read-only diagnostics used by browser acceptance. All tests send real UI input.
  globalThis.__surprise = Object.freeze({
    snapshot: () =>
      structuredClone({
        state: game.state,
        phase: game.phase,
        level: game.level.id,
        actions: game.actions,
        selected: game.selected,
        mode: game.mode,
      }),
  });
} catch (error) {
  document.body.dataset.phase = 'error';
  $('level-title').textContent = '内容加载失败';
  $('modal-title').textContent = '房间还没准备好';
  const p = document.createElement('p');
  p.textContent = error.message;
  const retry = document.createElement('button');
  retry.textContent = '重新加载';
  retry.className = 'primary';
  retry.onclick = () => location.reload();
  $('modal-body').replaceChildren(p, retry);
  $('modal').showModal();
}
