import { FACTIONS, getScore } from './src/core/index.mjs';
export const colors = ['#ac392b', '#326c88', '#477c50', '#9d6e21'];
const color = (owner) => colors[owner] ?? '#747365';
const cityIcon =
  '<svg class="city-icon" viewBox="0 0 60 40" aria-hidden="true"><path d="M5 35V20H12V15H20V20H25V10L19 10 30 2 41 10H35V20H40V15H48V20H55V35H34V25H26V35Z"/><path d="M2 36H58M11 19V12M49 19V12" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const arrow =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V3M5 10 12 3 19 10"/></svg>';
export function nextRoute(current, junctionId) {
  const junction = current.junctions.find((entry) => entry.id === junctionId);
  if (!junction || junction.owner !== 0 || current.status !== 'playing') return null;
  const source = current.cities.find((entry) => entry.id === junction.cityId);
  const target = current.cities.find(
    (entry) => entry.id === junction.exits[(junction.routeIndex + 1) % junction.exits.length],
  );
  return source && target ? { junction, source, target } : null;
}
export function mountBoard(board, state, onSwitch) {
  board.innerHTML =
    '<canvas aria-hidden="true"></canvas><div class="battle-message" role="status" aria-live="polite"></div><div class="route-preview" role="status" aria-live="polite"></div>';
  const canvas = board.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const message = board.querySelector('.battle-message');
  const preview = board.querySelector('.route-preview');
  let currentState = state, press = null;
  const activePointers = new Set(), timers = new Set();
  const cityNodes = new Map(),
    switches = new Map();
  function clearPreview() {
    if (preview.textContent) preview.textContent = '';
    delete preview.dataset.route;
    for (const node of cityNodes.values()) node.classList.remove('route-target');
    for (const node of switches.values()) node.classList.remove('previewing');
  }
  function cancelPress() {
    press = null;
    clearPreview();
    draw(currentState);
  }
  function showPreview() {
    const route = press && nextRoute(currentState, press.junctionId);
    if (!route) return cancelPress();
    const key = `${route.junction.id}:${route.target.id}`;
    if (preview.dataset.route === key) return;
    clearPreview();
    preview.dataset.route = key;
    preview.textContent = `松手改道：${route.source.name} → ${route.target.name}`;
    cityNodes.get(route.target.id)?.classList.add('route-target');
    switches.get(route.junction.id)?.classList.add('previewing');
    draw(currentState);
  }
  const trackPointer = (event) => {
    activePointers.add(event.pointerId);
    if (activePointers.size > 1) cancelPress();
  };
  const releasePointer = (event) => activePointers.delete(event.pointerId);
  const resetPointers = () => { activePointers.clear(); cancelPress(); };
  window.addEventListener('pointerdown', trackPointer, true);
  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);
  window.addEventListener('blur', resetPointers);
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
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary || activePointers.size > 1 || button.disabled) return;
      press = { pointerId: event.pointerId, junctionId: junction.id, x: event.clientX, y: event.clientY };
      button.setPointerCapture(event.pointerId);
      showPreview();
    });
    button.addEventListener('pointermove', (event) => {
      if (press?.pointerId === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 14) cancelPress();
    });
    button.addEventListener('pointerup', (event) => {
      const bounds = button.getBoundingClientRect();
      const commit = press?.pointerId === event.pointerId &&
        event.clientX >= bounds.left && event.clientX <= bounds.right &&
        event.clientY >= bounds.top && event.clientY <= bounds.bottom &&
        nextRoute(currentState, junction.id);
      cancelPress();
      if (commit) onSwitch(junction.id);
    });
    button.addEventListener('pointercancel', cancelPress);
    button.addEventListener('lostpointercapture', cancelPress);
    // Keyboard and assistive activation remain available; pointer release owns touch/mouse.
    button.addEventListener('click', (event) => { if (event.detail === 0) onSwitch(junction.id); });
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
    const planned = press && nextRoute(current, press.junctionId);
    if (planned) {
      ctx.beginPath();
      ctx.moveTo(planned.junction.x, planned.junction.y);
      ctx.lineTo(planned.target.x, planned.target.y);
      ctx.strokeStyle = '#a66b00';
      ctx.lineWidth = 5;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
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
    currentState = current;
    if (press) showPreview();
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
        `${city.name}岔路，当前通往${target.name}${junction.owner === 0 ? `，下一出口${nextRoute(current, junction.id)?.target.name ?? target.name}，按住预览，松手改道` : '，不可控制'}`,
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
    signalCity(id, lost) {
      const node = cityNodes.get(id);
      if (!node) return;
      const name = lost ? 'city-lost' : 'city-captured';
      node.classList.add(name);
      const timer = setTimeout(() => { node.classList.remove(name); timers.delete(timer); }, 2500);
      timers.add(timer);
    },
    destroy() {
      observer.disconnect();
      resetPointers();
      for (const timer of timers) clearTimeout(timer);
      window.removeEventListener('pointerdown', trackPointer, true);
      window.removeEventListener('pointerup', releasePointer);
      window.removeEventListener('pointercancel', releasePointer);
      window.removeEventListener('blur', resetPointers);
    },
  };
}
export function formatTime(seconds) {
  const n = Math.ceil(seconds);
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
