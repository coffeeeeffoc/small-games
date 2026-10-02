const escapeText = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );

const number = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

const roles = { crate: '压载开关', boat: '出航水槽', reservoir: '调蓄水槽', wheel: '动力水槽' };

const mint = '#a1e3ce';

const gold = '#f1c875';

function crate(x, bottom, active) {
  return `<g transform="translate(${x - 24} ${bottom - 47})">
    <ellipse cx="24" cy="48" rx="31" ry="5" fill="#092e31" opacity=".25"/>
    <rect x="0" y="0" width="48" height="47" rx="3" fill="#dcae66" stroke="#725b40" stroke-width="2"/>
    <rect x="5" y="5" width="38" height="37" rx="1" fill="#bb8a4e" stroke="#f2ca83" stroke-width="1.5"/>
    <path d="M7 7L41 40M41 7L7 40" stroke="#795b38" stroke-width="6"/>
    <path d="M7 7L41 40M41 7L7 40" stroke="#e8bf7b" stroke-width="3"/>
    <path d="M4 0h40v6H4z" fill="#f0ca84"/>
    <circle cx="5" cy="8" r="1.4" fill="#705d42"/><circle cx="43" cy="39" r="1.4" fill="#705d42"/>
    ${active ? `<circle cx="38" cy="10" r="8" fill="${mint}" stroke="#25574b"/><path d="M34 10l3 3 5-6" fill="none" stroke="#225546" stroke-width="2"/>` : ''}
  </g>`;
}

function boat(x, surface, phase, ready) {
  const bob = Math.sin(phase * 1.7) * 1.1;
  return `<g transform="translate(${x} ${surface + bob})">
    <ellipse cx="0" cy="4" rx="43" ry="4" fill="#acf1da" opacity=".22"/>
    <path d="M-35-8H36L25 7H-22Z" fill="${ready ? '#f4d18a' : '#e7bd77'}" stroke="#735f41" stroke-width="2"/>
    <path d="M-29-4H30" stroke="#fff0c7" stroke-width="2"/>
    <path d="M-2-10V-45" stroke="#e7dbc0" stroke-width="3" stroke-linecap="round"/>
    <path d="M3-40L24-14H3Z" fill="#f5efe0"/><path d="M-7-38L-26-14H-7Z" fill="#9ed8c6"/>
    <path d="M-1-45h17l-5 6H-1Z" fill="#edaa63"/>
    <path d="M-44 11q9-3 18 0m42 0q9-3 18 0" stroke="#acebd6" fill="none" opacity=".65" stroke-linecap="round"/>
  </g>`;
}

function turbine(x, y, phase, active, ratio) {
  const spokes = Array.from(
    { length: 8 },
    (_, index) =>
      `<g transform="rotate(${index * 45})"><path d="M0-12V-36" stroke="#e7c482" stroke-width="5"/><path d="M-10-37H11V-30H-10Z" fill="#d1aa68" stroke="#776346" stroke-width="1.5"/></g>`,
  ).join('');
  return `<g transform="translate(${x} ${y})"><path d="M-23 47L-11-3H11L23 47" fill="#326666" stroke="#8db7a6" stroke-width="3"/><path d="M-36 48H36" stroke="#a6cbbb" stroke-width="5" stroke-linecap="round"/>
    <g transform="rotate(${active ? phase * 35 : ratio * 45})"><circle r="33" fill="#224e4b" stroke="#e7c482" stroke-width="6"/>${spokes}<circle r="14" fill="#d9b274" stroke="#f3d699" stroke-width="3"/><circle r="5" fill="#5e684e"/></g>
    <path d="M-47 53H47" stroke="#0c3337" stroke-width="3" opacity=".45"/></g>`;
}

/** Share geometry between the painted pipes and the native valve buttons. */
export function getBoardLayout(level, viewportWidth = 960) {
  const screenScale = Math.max(1, viewportWidth) / 960;
  const count = level.tanks.length;
  const gap = count > 3 ? 32 : 64;
  const width = (852 - gap * (count - 1)) / count;
  const tanks = level.tanks.map((tank, index) => ({
    ...tank,
    index,
    x: 54 + index * (width + gap),
    center: 54 + index * (width + gap) + width / 2,
  }));
  const byId = new Map(tanks.map((tank) => [tank.id, tank]));
  const valves = [];
  for (const [index, gate] of level.gates.entries()) {
    const from = byId.get(gate.a);
    const to = byId.get(gate.b);
    const fromX = from.center + (index % 2 ? 10 : -10);
    const toX = to.center + (index % 2 ? 10 : -10);
    const x = (fromX + toX) / 2;
    let y = 402 + 30 / screenScale + index * 10;
    // Keep 44px touch targets and their labels clear, even in five-room stations.
    while (
      valves.some(
        (other) =>
          Math.abs(other.x - x) * screenScale < 66 && Math.abs(other.y - y) * screenScale < 76,
      )
    ) {
      y += 76 / screenScale;
    }
    valves.push({ id: gate.id, x, y, fromX, toX });
  }
  return {
    tanks,
    width,
    valves,
    height: Math.max(530, ...valves.map((gate) => gate.y + 55 / screenScale)),
  };
}

export function renderBoard(
  svg,
  level,
  state,
  displayVolumes = state.volumes,
  previewState = null,
  phase = 0,
  layout = getBoardLayout(level),
) {
  const { tanks: layouts, width, height } = layout;
  const tankTop = 125;
  const tankBottom = 363;
  const scale = (tankBottom - tankTop) / 10;
  const byId = new Map(layouts.map((tank) => [tank.id, tank]));
  const latched = new Set(state.latched || []);
  const overflows = Array.isArray(level.overflow)
    ? level.overflow
    : level.overflow
      ? [level.overflow]
      : [];
  const heightAt = (volume) => tankBottom - clamp(volume, 0, 10) * scale;
  const waterPower = Number(state.wheelPower || 0);
  const defs = `<defs>
    <linearGradient id="station-water" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#72caba" stop-opacity=".75"/><stop offset=".55" stop-color="#4eaaa0" stop-opacity=".5"/><stop offset="1" stop-color="#328d8c" stop-opacity=".25"/></linearGradient>
    <linearGradient id="station-tank" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#102f33"/><stop offset=".5" stop-color="#17484a"/><stop offset="1" stop-color="#15383d"/></linearGradient>
    <pattern id="station-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#78c4b5" stroke-opacity=".055" stroke-width="1"/></pattern>
    <pattern id="station-stripe" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="10" fill="#102f33" opacity=".5"/></pattern>
    ${layouts.map((tank) => `<clipPath id="tank-clip-${tank.index}"><rect x="${tank.x + 4}" y="${tankTop - 1}" width="${width - 8}" height="${tankBottom - tankTop + 1}" rx="3"/></clipPath>`).join('')}
  </defs>`;
  const background = `<rect width="960" height="${height}" fill="#153e40"/><rect width="960" height="${height}" fill="url(#station-grid)"/><path d="M28 21h12m-12 0v12m904-12h-12m12 0v12M28 ${height - 20}h12m-12 0v-12m904 12h-12m12 0v-12" stroke="#548c80" fill="none" stroke-opacity=".45"/><path d="M34 402H926" stroke="#4b786f" stroke-opacity=".18" stroke-dasharray="3 7"/>`;
  const pipes = level.gates
    .map((gate, index) => {
      const open = Boolean(state.gates[index]);
      const { fromX, toX, y } = layout.valves[index];
      const path = `M${fromX} ${tankBottom + 1}V${y - 9}Q${fromX} ${y} ${fromX + (toX > fromX ? 9 : -9)} ${y}H${toX + (toX > fromX ? -9 : 9)}Q${toX} ${y} ${toX} ${y - 9}V${tankBottom + 1}`;
      return `<g data-pipe="${escapeText(gate.id)}"><path d="${path}" fill="none" stroke="#0d2f33" stroke-width="12" stroke-linejoin="round"/><path d="${path}" fill="none" stroke="${open ? '#609d90' : '#53716c'}" stroke-width="7" stroke-linejoin="round"/>
      <path d="${path}" fill="none" stroke="${open ? '#a2e3c8' : '#6f8980'}" stroke-width="2" stroke-linejoin="round" ${open ? `stroke-dasharray="5 13" stroke-dashoffset="${-phase * 16}"` : ''}/>
      </g>`;
    })
    .join('');
  const tanks = layouts
    .map((tank) => {
      const volume = clamp(displayVolumes[tank.index] ?? state.volumes[tank.index], 0, 10);
      const surface = heightAt(volume);
      const active = latched.has(tank.id);
      const switchY = heightAt(tank.switchAt ?? 0);
      const exitY = heightAt(tank.exitAt ?? 10);
      const boatReady = tank.kind === 'boat' && state.volumes[tank.index] + 0.001 >= tank.exitAt;
      const previewVolume = previewState?.volumes?.[tank.index];
      const difference =
        previewVolume === undefined ? 0 : previewVolume - state.volumes[tank.index];
      const hasPreview = previewVolume !== undefined && Math.abs(difference) > 0.005;
      const wave = Math.sin(phase * 2 + tank.index) * 1.25;
      const label =
        tank.kind === 'crate'
          ? active
            ? '开关已锁存'
            : `开关线 ≤ ${number(tank.switchAt ?? 0)}`
          : tank.kind === 'boat'
            ? boatReady
              ? '已到达出口'
              : `出航线 ≥ ${number(tank.exitAt ?? 10)}`
            : tank.kind === 'wheel'
              ? `累计动力 ${number(waterPower)}`
              : '连通后共享液位';
      const statusColor =
        active || boatReady ? '#a9ead0' : tank.kind === 'reservoir' ? '#90b7ab' : '#e6c17c';
      const ticks = Array.from(
        { length: 11 },
        (_, value) =>
          `<path d="M${tank.x - (value % 2 ? 5 : 9)} ${heightAt(value)}H${tank.x - 2}" stroke="#85b8a7" stroke-width="1" opacity="${value % 2 ? '.3' : '.55'}"/>${value % 2 === 0 ? `<text x="${tank.x - 14}" y="${heightAt(value) + 3}" text-anchor="end" font-size="9" fill="#83ab9f">${value}</text>` : ''}`,
      ).join('');
      let content = '';
      if (tank.kind === 'crate') {
        content = `<path d="M${tank.center - 43} ${switchY + 5}H${tank.center + 43}V${switchY + 14}H${tank.center - 43}Z" fill="#b5945e"/>
        <rect x="${tank.center - 43}" y="${switchY + 5}" width="86" height="9" fill="url(#station-stripe)"/>
        <rect x="${tank.center - 43}" y="${switchY}" width="86" height="6" rx="2" fill="${active ? '#9ee6c5' : gold}"/>
        <path d="M${tank.x + 5} ${switchY}H${tank.center - 43}m86 0H${tank.x + width - 5}" stroke="${gold}" stroke-dasharray="4 5" opacity=".65"/>
        <circle cx="${tank.center + 33}" cy="${switchY + 9}" r="3" fill="${active ? '#c6f8d7' : '#75543c'}"/>
        ${crate(tank.center, Math.min(surface, switchY), active)}`;
      } else if (tank.kind === 'boat') {
        content = `<path d="M${tank.x + 8} ${exitY}H${tank.x + width - 4}" stroke="${gold}" stroke-dasharray="5 5" opacity=".8"/>
        <path d="M${tank.x + width - 23} ${exitY - 15}h24v30h-24" fill="#213e3c" fill-opacity=".6" stroke="${gold}" stroke-width="2"/>
        <path d="M${tank.x + width - 19} ${exitY}h12m-5-5 5 5-5 5" stroke="${gold}" stroke-width="2" fill="none" stroke-linecap="round"/>
        ${boat(tank.center - 7, surface, phase, boatReady)}`;
      } else if (tank.kind === 'wheel') {
        const required =
          overflows.reduce((total, outlet) => total + (outlet.powerNeeded || 0), 0) || 1;
        const ratio = clamp(waterPower / required, 0, 1);
        content = `${turbine(tank.center, tankTop + 100, phase, waterPower > 0, ratio)}
        <rect x="${tank.center - 35}" y="${tankTop + 167}" width="70" height="6" rx="3" fill="#163537" stroke="#4e7d72"/>
        <rect x="${tank.center - 35}" y="${tankTop + 167}" width="${70 * ratio}" height="6" rx="3" fill="${gold}"/>`;
      } else {
        content = `<g transform="translate(${tank.center} ${tankTop + 77})" opacity=".23"><circle r="24" stroke="#a0d0bb" fill="none"/><path d="M-11-3h22m-16-5-5 5 5 5M11 7h-22m16-5 5 5-5 5" stroke="#bbdfc8" stroke-width="2" fill="none"/></g>`;
      }
      const preview = hasPreview
        ? `<g data-preview="${escapeText(tank.id)}"><path d="M${tank.x + 5} ${heightAt(previewVolume)}H${tank.x + width - 5}" stroke="#f4f8e8" stroke-width="2" stroke-dasharray="7 5"/>
      <rect x="${tank.x + 10}" y="${clamp(heightAt(previewVolume) - 26, tankTop + 3, tankBottom - 29)}" width="62" height="21" rx="5" fill="#edf8e4"/>
      <text x="${tank.x + 41}" y="${clamp(heightAt(previewVolume) - 11, tankTop + 18, tankBottom - 14)}" text-anchor="middle" fill="#24584c" font-size="12" font-weight="700">${difference > 0 ? '↑ +' : '↓ '}${number(difference)}</text></g>`
        : '';
      return `<g data-tank="${escapeText(tank.id)}" data-water="${number(state.volumes[tank.index])}" aria-label="${escapeText(tank.id)} 槽 ${escapeText(tank.name)}，水位 ${number(state.volumes[tank.index])}">
      <text x="${tank.x + 1}" y="49" fill="#d6efda" font-size="32" font-weight="600" letter-spacing="-1">${escapeText(tank.id)}</text>
      <text x="${tank.x + 1}" y="73" fill="#a6cabb" font-size="13" font-weight="500">${escapeText(tank.name || roles[tank.kind])}</text>
      <text x="${tank.x + width - 2}" y="48" text-anchor="end" fill="#c1f4dc" font-size="29" font-weight="400" style="font-variant-numeric:tabular-nums">${volume.toFixed(1)}</text>
      <text x="${tank.x + width - 2}" y="72" text-anchor="end" fill="#759f94" font-size="10" letter-spacing="2">液位 / 10</text>
      <path d="M${tank.x} 91H${tank.x + width}" stroke="#457568" stroke-opacity=".5"/>
      <rect x="${tank.x}" y="${tankTop}" width="${width}" height="${tankBottom - tankTop + 3}" rx="5" fill="url(#station-tank)"/>
      <g clip-path="url(#tank-clip-${tank.index})"><path d="M${tank.x + 3} ${surface}Q${tank.center - width * 0.2} ${surface + wave * 2} ${tank.center} ${surface}T${tank.x + width - 3} ${surface}V${tankBottom + 2}H${tank.x + 3}Z" fill="url(#station-water)"/>
        <path d="M${tank.x + 4} ${surface}Q${tank.center - width * 0.2} ${surface + wave * 2} ${tank.center} ${surface}T${tank.x + width - 4} ${surface}" fill="none" stroke="#a7e4cd" stroke-width="2" opacity=".92"/>
        <path d="M${tank.x + 12} ${surface + 7}H${tank.x + width * 0.33}m10 0h12" stroke="#b3e9d5" stroke-opacity=".28" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M${tank.x + 15} ${tankTop + 10}V${tankBottom - 10}" stroke="#c1e9d0" stroke-opacity=".055" stroke-width="5"/>
      </g>
      ${ticks}${content}${preview}
      <path d="M${tank.x} ${tankTop - 1}V${tankBottom - 3}q0 7 7 7H${tank.x + width - 7}q7 0 7-7V${tankTop - 1}" fill="none" stroke="#94b5a3" stroke-width="4"/>
      <path d="M${tank.x - 4} ${tankTop - 2}h9m${width - 10} 0h9" stroke="#cee4c9" stroke-width="4" stroke-linecap="round"/>
      <circle cx="${tank.x + 11}" cy="${tankBottom + 3}" r="2" fill="#204e4b"/><circle cx="${tank.x + width - 11}" cy="${tankBottom + 3}" r="2" fill="#204e4b"/>
      <circle cx="${tank.x + 5}" cy="386" r="3" fill="${statusColor}" opacity=".85"/>
      <text x="${tank.x + 15}" y="390" fill="${statusColor}" font-size="11">${escapeText(label)}</text>
    </g>`;
    })
    .join('');
  const overflowPipes = overflows
    .map((overflow) => {
      const from = byId.get(overflow.from);
      const to = byId.get(overflow.to);
      if (!from || !to) return '';
      const forward = to.center > from.center;
      const startX = forward ? from.x + width : from.x;
      const endX = forward ? to.x + 18 : to.x + width - 18;
      const y = heightAt(overflow.at);
      const endY = Math.max(y + 22, tankTop + 52);
      const path = `M${startX - (forward ? 12 : -12)} ${y}H${endX - (forward ? 8 : -8)}Q${endX} ${y} ${endX} ${y + 8}V${endY}`;
      return `<g><path d="${path}" stroke="#102f33" stroke-width="12" fill="none"/><path d="${path}" stroke="#bbad7a" stroke-width="7" fill="none"/><path d="${path}" stroke="#eee0ad" stroke-width="2" fill="none"/>
      <path d="M${startX - (forward ? 15 : -15)} ${y - 7}v14" stroke="${gold}" stroke-width="3"/>
      <path d="M${endX - 5} ${endY - 5}l5 7 5-7" stroke="#f4d18b" stroke-width="2" fill="none"/>
      <rect x="${Math.min(startX, endX) - 2}" y="${y - 28}" width="76" height="19" rx="4" fill="#173f3e"/>
      <text x="${Math.min(startX, endX) + 4}" y="${y - 14}" fill="#e7ca87" font-size="10">溢流线 ${number(overflow.at)}</text>
    </g>`;
    })
    .join('');
  svg.setAttribute(
    'aria-label',
    level.tanks
      .map((tank, index) => `${tank.id} 槽${tank.name || ''}水位 ${number(state.volumes[index])}`)
      .join('，') +
      '。' +
      level.gates
        .map((gate, index) => `闸门 ${index + 1}${state.gates[index] ? '已开启' : '已关闭'}`)
        .join('，'),
  );
  svg.innerHTML = `${defs}<g font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif">${background}${pipes}${tanks}${overflowPipes}</g>`;
}
