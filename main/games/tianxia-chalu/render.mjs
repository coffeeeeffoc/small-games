import { FACTIONS, getScore } from './src/core/index.mjs';
export const colors = ['#ac392b', '#326c88', '#477c50', '#9d6e21'];
const color = (owner) => colors[owner] ?? '#747365';
const cityIcon =
  '<svg class="city-icon" viewBox="0 0 60 40" aria-hidden="true"><path d="M5 35V20H12V15H20V20H25V10L19 10 30 2 41 10H35V20H40V15H48V20H55V35H34V25H26V35Z"/><path d="M2 36H58M11 19V12M49 19V12" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const arrow =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V3M5 10 12 3 19 10"/></svg>';
export function mountBoard(board, state, onSwitch) {
  board.innerHTML =
    '<canvas aria-hidden="true"></canvas><div class="battle-message" role="status" aria-live="polite"></div>';
  const canvas = board.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const message = board.querySelector('.battle-message');
  const cityNodes = new Map(),
    switches = new Map();
  for (const city of state.cities) {
    const el = document.createElement('div');
    el.className = 'city';
    el.style.left = `${city.x / 3.9}%`;
    el.style.top = `${city.y / 6.6}%`;
    el.innerHTML = `${cityIcon}<div class="city-label"><span></span><b></b></div><div class="city-owner"></div>`;
    el.querySelector('.city-label span').textContent = city.name;
    board.append(el);
    cityNodes.set(city.id, el);
  }
  for (const junction of state.junctions) {
    const button = document.createElement('button');
    button.className = 'junction';
    button.type = 'button';
    button.style.left = `${junction.x / 3.9}%`;
    button.style.top = `${junction.y / 6.6}%`;
    button.dataset.junction = junction.id;
    button.innerHTML = arrow;
    button.addEventListener('click', () => onSwitch(junction.id));
    board.append(button);
    switches.set(junction.id, button);
  }
  let width = 0,
    height = 0;
  const resize = () => {
    const rect = board.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(canvas.width / 390, 0, 0, canvas.height / 660, 0, 0);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(board);
  resize();
  function draw(current) {
    if (!width || !height) return;
    ctx.clearRect(0, 0, 390, 660);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const junction of current.junctions) {
      const city = current.cities.find((c) => c.id === junction.cityId);
      ctx.beginPath();
      ctx.moveTo(city.x, city.y);
      ctx.lineTo(junction.x, junction.y);
      ctx.strokeStyle = '#57615155';
      ctx.lineWidth = 2;
      ctx.stroke();
      for (const [i, exit] of junction.exits.entries()) {
        const target = current.cities.find((c) => c.id === exit);
        const active = i === junction.routeIndex && junction.owner !== null;
        ctx.beginPath();
        ctx.moveTo(junction.x, junction.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = active
          ? color(junction.owner) + (junction.owner === 0 ? '8c' : '40')
          : '#55625024';
        ctx.lineWidth = active ? 3 : 1.2;
        ctx.setLineDash(active ? [] : [4, 7]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (active) {
          const x = junction.x + (target.x - junction.x) * 0.48,
            y = junction.y + (target.y - junction.y) * 0.48;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.atan2(target.y - junction.y, target.x - junction.x));
          ctx.beginPath();
          ctx.moveTo(-4, -4);
          ctx.lineTo(1, 0);
          ctx.lineTo(-4, 4);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
    for (const packet of current.packets) {
      const p = Math.min(1, packet.elapsed / packet.duration),
        x = packet.from.x + (packet.to.x - packet.from.x) * p,
        y = packet.from.y + (packet.to.y - packet.from.y) * p;
      const angle = Math.atan2(packet.to.y - packet.from.y, packet.to.x - packet.from.x);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = color(packet.owner);
      ctx.strokeStyle = '#f9e9c2';
      ctx.lineWidth = 0.7;
      for (let i = 0; i < Math.min(packet.troops, 4); i++) {
        const xx = -i * 5.5;
        ctx.beginPath();
        ctx.arc(xx, 0, 2.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(3, 0);
      ctx.lineTo(9, 0);
      ctx.strokeStyle = color(packet.owner);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
    // Geographic labels stay secondary to the troops and routing controls.
    ctx.fillStyle = '#54694b77';
    ctx.font = '14px serif';
    ctx.textAlign = 'center';
    ctx.fillText('山 河 驿 路', 195, 59);
    ctx.fillStyle = '#55624c66';
    ctx.font = '11px serif';
    ctx.fillText('兵至城下，胜负一线', 195, 620);
  }
  function update(current, teach = false) {
    draw(current);
    for (const city of current.cities) {
      const el = cityNodes.get(city.id);
      el.style.setProperty('--faction', color(city.owner));
      el.querySelector('b').textContent = Math.floor(city.troops);
      el.querySelector('.city-owner').textContent =
        city.owner === null
          ? '无主城'
          : city.owner === 0
            ? '我军'
            : `${FACTIONS[city.owner].shortName} · AI`;
      el.setAttribute(
        'aria-label',
        `${city.name}，${city.owner === null ? '无主城' : FACTIONS[city.owner].name}，驻军${Math.floor(city.troops)}`,
      );
    }
    for (const junction of current.junctions) {
      const button = switches.get(junction.id),
        target = current.cities.find((c) => c.id === junction.exits[junction.routeIndex]);
      const city = current.cities.find((c) => c.id === junction.cityId);
      button.dataset.route = target.id;
      button.dataset.owner = String(junction.owner);
      button.disabled = junction.owner !== 0 || current.status !== 'playing';
      button.setAttribute(
        'aria-label',
        `${city.name}岔路，当前通往${target.name}${junction.owner === 0 ? '，点击改道' : '，不可控制'}`,
      );
      button.querySelector('svg').style.transform =
        `rotate(${(Math.atan2(target.y - junction.y, target.x - junction.x) * 180) / Math.PI + 90}deg)`;
      button.classList.toggle('teach', teach && junction.owner === 0);
    }
    const rankings = getScore(current);
    for (const row of rankings) {
      const label = document.querySelector(`[data-score="${row.factionId}"]`);
      if (label) {
        label.querySelector('strong').textContent = row.cities;
        label.title = `${row.cities}城 · ${row.troops}兵`;
      }
    }
    const timer = document.querySelector('#timer');
    if (timer) timer.textContent = formatTime(Math.max(0, current.duration - current.time));
  }
  return {
    update,
    draw,
    tell(text) {
      message.textContent = text;
    },
    flash(id) {
      const button = switches.get(id);
      button?.classList.remove('flare');
      requestAnimationFrame(() => button?.classList.add('flare'));
    },
    destroy() {
      observer.disconnect();
    },
  };
}
export function formatTime(seconds) {
  const n = Math.ceil(seconds);
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
