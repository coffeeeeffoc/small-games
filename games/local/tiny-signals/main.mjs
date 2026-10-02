import { gameDefinition } from './game.mjs';
import { createLocalHost } from './host.mjs';

const target = document.getElementById('game-root');
try {
  const instance = await gameDefinition.mount(target, createLocalHost());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) instance.pause();
    else instance.resume();
  });
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) instance.pause();
    else void instance.dispose();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) instance.resume();
  });
} catch (error) {
  target.textContent = '信使暂时未能出发，请刷新页面重试。';
  console.error(error);
}
