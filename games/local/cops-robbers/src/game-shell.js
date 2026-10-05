import { roleAvatarSvg, getRoleAppearance } from './role-appearance.js';

export function setupGameShell({ openLevels }) {
  const $ = (id) => document.getElementById(id);
  const platform =
    globalThis.__COMPETITION_CONFIG__?.platform ||
    new URLSearchParams(location.search).get('platform') ||
    'web';
  const native =
    !['web', 'h5'].includes(platform) ||
    [globalThis.wx, globalThis.tt, globalThis.bl, globalThis.ks].some(
      (sdk) => typeof sdk?.createCanvas === 'function',
    );
  const fullscreen = document.querySelector('[data-game-fullscreen]');
  fullscreen.hidden = native;
  if (native) fullscreen.removeAttribute('data-game-fullscreen');

  function portraits() {
    $('appearance-art').innerHTML =
      `${roleAvatarSvg('cop', 0, 8, 58)}${roleAvatarSvg('robber', 44, 20, 52)}`;
    $('home-roster').innerHTML = ['cop', 'robber']
      .map(
        (role) =>
          `<button type="button" aria-label="设置${getRoleAppearance(role).label}形象"><svg viewBox="0 0 100 100" aria-hidden="true">${roleAvatarSvg(role, 3, 3, 94)}</svg></button>`,
      )
      .join('<span aria-hidden="true">×</span>');
  }
  function refresh() {
    const active = document.body.classList.contains('focus-play');
    $('resume-level').textContent =
      `第 ${document.body.dataset.lastGame === 'duel' ? document.body.dataset.duelLevel : document.body.dataset.level || 1} 关`;
    fullscreen.hidden = native || active;
  }
  function shortPrompt() {
    const text = $('instruction').textContent;
    const lesson = text.match(/选 (\d+) 号，点 (\d+) 号路口/);
    const hint = text.match(/最短还需 (\d+) 步：(\d+) 号追逐队员([^。]+)/);
    const inspected = text.match(/(\d+) 号突围队员：已封 (\d+)\/(\d+)/);
    let message = lesson
      ? `${lesson[1]} 号 → ${lesson[2]} 号路口`
      : hint
        ? `${hint[2]} 号${hint[3].replace('追逐队员', '')} · 还需 ${hint[1]} 步`
        : inspected
          ? `已封 ${inspected[2]}/${inspected[3]} 条退路`
          : document.body.dataset.phase === 'planning'
            ? document.body.dataset.rule === 'relay'
              ? '换一位警察，接力包抄！'
              : '点亮起的路口，出发！'
            : {
                police: '出发！',
                robbers: '小偷行动中…',
                caught: '抓到了！',
                won: '漂亮，一网打尽！',
                lost: '换条路线，再试一次',
              }[document.body.dataset.phase] || '点亮起的路口，出发！';
    if (
      ($('instruction').classList.contains('alert') ||
        /无法|不可用|只能|不能|请换|核对|尚未/.test(text)) &&
      !lesson &&
      !hint
    )
      message = text
        .split(/[。；]/)[0]
        .replace('全部围捕', '收网')
        .replace('追逐队员', '警察')
        .replace('突围队员', '小偷')
        .slice(0, 36);
    if ($('play-prompt').textContent !== message) $('play-prompt').textContent = message;
  }
  $('home-start').addEventListener('click', openLevels);
  $('mode-settings').addEventListener('click', () => {
    $('solo-mode').dispatchEvent(new Event('change'));
    $('mode-dialog').showModal();
  });
  $('home-roster').addEventListener('click', () => $('appearance-settings').click());
  document.addEventListener('chase-appearancechange', portraits);
  new MutationObserver(() => {
    refresh();
    shortPrompt();
  }).observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'data-phase', 'data-level', 'data-rule', 'data-duel-level'],
  });
  new MutationObserver(shortPrompt).observe($('instruction'), {
    childList: true,
    characterData: true,
    subtree: true,
  });
  portraits();
  refresh();
  shortPrompt();
}

export function drawLevelPath(count) {
  const svg = document.getElementById('level-path');
  const rows = Math.ceil(count / 3),
    height = rows * 100;
  svg.setAttribute('viewBox', `0 0 300 ${height}`);
  const points = Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / 3),
      col = row % 2 ? 2 - (index % 3) : index % 3;
    return [50 + col * 100, 42 + row * 100];
  });
  let path = `M${points[0].join(' ')}`;
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i],
      [px, py] = points[i - 1];
    path += y === py ? `L${x} ${y}` : `C${px} ${py + 50} ${x} ${y - 50} ${x} ${y}`;
  }
  const decorations = Array.from({ length: rows }, (_, row) => {
    const y = row * 100 + 89;
    return `<g transform="translate(118 ${y})" stroke-linecap="round"><ellipse cy="3" rx="20" ry="5" fill="#70a77a" opacity=".3"/><path d="M0-21v23" stroke="#a48154" stroke-width="5"/><circle cx="-9" cy="-18" r="11" fill="#76bb80" stroke="#569d74" stroke-width="1.5"/><circle cx="8" cy="-20" r="12" fill="#8dcc8c" stroke="#569d74" stroke-width="1.5"/><circle cy="-30" r="11" fill="#a2d68e"/><path d="m-4-33 5-3" stroke="#d2edac" stroke-width="3"/></g><g transform="translate(182 ${y - 4})"><path d="M-9 6q-6-12 2-17M4 8q8-13 10-10" stroke="#6dae76" stroke-width="3" fill="none"/><circle cx="-7" cy="-12" r="5" fill="#fffceb"/><circle cx="-7" cy="-12" r="2" fill="#ffd962"/><circle cx="13" cy="-3" r="4" fill="#ffac7b"/></g>`;
  }).join('');
  svg.innerHTML = `<path d="${path}" fill="none" stroke="#81b393" stroke-width="31" stroke-linecap="round"/><path d="${path}" fill="none" stroke="#fff3d0" stroke-width="26" stroke-linecap="round"/><path d="${path}" fill="none" stroke="#dccda3" stroke-width="2" stroke-dasharray="4 7"/>${decorations}`;
}
