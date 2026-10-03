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

const getOverflows = (level) =>
  Array.isArray(level.overflow) ? level.overflow : level.overflow ? [level.overflow] : [];

/** Native valve controls and SVG pipes use the same collision-free geometry. */
export function getBoardLayout(level, viewportWidth = 960) {
  const screenScale = Math.max(240, viewportWidth) / 960;
  const count = level.tanks.length;
  const gap = count > 3 ? 34 : 64;
  const width = (852 - gap * (count - 1)) / count;
  const tanks = level.tanks.map((tank, index) => ({
    ...tank,
    index,
    x: 54 + index * (width + gap),
    center: 54 + index * (width + gap) + width / 2,
  }));
  const byId = new Map(tanks.map((tank) => [tank.id, tank]));
  const overflows = getOverflows(level);
  const longOverflows = overflows.filter(
    (outlet) => Math.abs(byId.get(outlet.from).index - byId.get(outlet.to).index) > 1,
  );
  // Keep overhead spillways clear of crates even at a full water level.
  const tankTop = longOverflows.length ? 104 + (longOverflows.length - 1) * 22 : 94;
  const tankBottom = tankTop + 244;
  const ports = new Map();
  for (const tank of tanks) {
    const connections = level.gates
      .map((gate, index) => ({ gate, index, other: gate.a === tank.id ? gate.b : gate.a }))
      .filter(({ gate }) => gate.a === tank.id || gate.b === tank.id)
      .sort((a, b) => byId.get(a.other).index - byId.get(b.other).index || a.index - b.index);
    const spread = Math.min(width - 40, 80);
    connections.forEach(({ gate }, index) => {
      const offset =
        connections.length === 1 ? 0 : (index / (connections.length - 1) - 0.5) * spread;
      ports.set(`${tank.id}:${gate.id}`, tank.center + offset);
    });
  }
  const valves = [];
  for (const gate of level.gates) {
    const fromX = ports.get(`${gate.a}:${gate.id}`);
    const toX = ports.get(`${gate.b}:${gate.id}`);
    const left = Math.min(fromX, toX);
    const right = Math.max(fromX, toX);
    const candidates = [0.5, 0.35, 0.65, 0.2, 0.8].map((ratio) => left + (right - left) * ratio);
    let y = tankBottom + 32 + 28 / screenScale;
    let x;
    // Separate overlapping rails; then find room for a full valve and its label.
    // Long links may shift their valve along the pipe instead of growing the scene.
    while (x === undefined) {
      const railBlocked = valves.some(
        (other) =>
          Math.min(right, Math.max(other.fromX, other.toX)) >
            Math.max(left, Math.min(other.fromX, other.toX)) &&
          Math.abs(other.y - y) * screenScale < 17,
      );
      if (!railBlocked) {
        x = candidates.find((candidate) =>
          valves.every(
            (other) =>
              Math.abs(other.x - candidate) * screenScale >= 58 ||
              Math.abs(other.y - y) * screenScale >= 78,
          ),
        );
      }
      if (x === undefined) y += 20 / screenScale;
    }
    valves.push({ id: gate.id, x, y, fromX, toX });
  }
  return {
    tanks,
    width,
    valves,
    tankTop,
    tankBottom,
    screenScale,
    height: Math.max(tankBottom + 130, ...valves.map((gate) => gate.y + 62 / screenScale)),
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
  focusedConnection = null,
) {
  const { tanks: layouts, width, height, tankTop = 94, tankBottom = 338 } = layout;
  const scale = (tankBottom - tankTop) / 10;
  const byId = new Map(layouts.map((tank) => [tank.id, tank]));
  const latched = new Set(state.latched || []);
  const overflows = getOverflows(level);
  const focusedGate = level.gates.find((gate) => gate.id === focusedConnection);
  const focusedOverflow = overflows.find((_, index) => `overflow:${index}` === focusedConnection);
  const focusedTanks = new Set(
    focusedGate
      ? [focusedGate.a, focusedGate.b]
      : focusedOverflow
        ? [focusedOverflow.from, focusedOverflow.to]
        : [],
  );
  const heightAt = (volume) => tankBottom - clamp(volume, 0, 10) * scale;
  const waterPower = Number(state.wheelPower || 0);
  const defs = `<defs>
    <linearGradient id="station-water" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#72d1c0" stop-opacity=".82"/><stop offset=".45" stop-color="#38a6a1" stop-opacity=".66"/><stop offset="1" stop-color="#126473" stop-opacity=".86"/></linearGradient>
    <linearGradient id="station-water-surface" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ade8d2" stop-opacity=".45"/><stop offset="1" stop-color="#5cc0b1" stop-opacity=".9"/></linearGradient>
    <linearGradient id="station-glass" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#b5ecdf" stop-opacity=".13"/><stop offset=".12" stop-color="#7abfac" stop-opacity=".03"/><stop offset=".55" stop-color="#072930" stop-opacity=".03"/><stop offset=".88" stop-color="#09252d" stop-opacity=".42"/><stop offset="1" stop-color="#bcdfcb" stop-opacity=".18"/></linearGradient>
    <linearGradient id="station-tank" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#143b41"/><stop offset=".32" stop-color="#205152"/><stop offset=".76" stop-color="#153a40"/><stop offset="1" stop-color="#082d35"/></linearGradient>
    <linearGradient id="station-metal" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#527a75"/><stop offset=".16" stop-color="#c3d8bc"/><stop offset=".32" stop-color="#84a89a"/><stop offset=".7" stop-color="#648d80"/><stop offset=".9" stop-color="#a5c3a7"/><stop offset="1" stop-color="#41685f"/></linearGradient>
    <linearGradient id="station-metal-side" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#a8c3ac"/><stop offset=".32" stop-color="#d3e3c8"/><stop offset=".65" stop-color="#668c7c"/><stop offset="1" stop-color="#375e56"/></linearGradient>
    <pattern id="station-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#78c4b5" stroke-opacity=".045" stroke-width="1"/></pattern>
    <pattern id="station-stripe" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="10" fill="#102f33" opacity=".5"/></pattern>
    ${layouts.map((tank) => `<clipPath id="tank-clip-${tank.index}"><path d="M${tank.x + 5} ${tankTop - 9}H${tank.x + width - 5}V${tankBottom - 1}Q${tank.center} ${tankBottom + 17} ${tank.x + 5} ${tankBottom - 1}Z"/></clipPath>`).join('')}
  </defs>`;
  const background = `<rect width="960" height="${height}" fill="#153e40"/><rect width="960" height="${height}" fill="url(#station-grid)"/><path d="M28 21h12m-12 0v12m904-12h-12m12 0v12M28 ${height - 20}h12m-12 0v-12m904 12h-12m12 0v-12" stroke="#548c80" fill="none" stroke-opacity=".35"/><path d="M30 ${tankBottom + 33}H930" stroke="#709889" stroke-opacity=".16"/>`;
  const pipeGroups = level.gates.map((gate, index) => {
    const open = Boolean(state.gates[index]);
    const focused = focusedConnection === gate.id;
    const { fromX, toX, y } = layout.valves[index];
    const direction = toX > fromX ? 1 : -1;
    const path = `M${fromX} ${tankBottom + 27}V${y - 10}Q${fromX} ${y} ${fromX + direction * 10} ${y}H${toX - direction * 10}Q${toX} ${y} ${toX} ${y - 10}V${tankBottom + 27}`;
    const color = focused ? '#d3f4d2' : open ? '#77bba5' : '#7b9182';
    // The dark casing separates crossings visually. The controller clones the
    // complete group into its foreground layer, preserving this DOM/Tab order.
    return {
      id: gate.id,
      markup: `<g class="pipe-connection${focused ? ' is-focused' : ''}" data-pipe="${escapeText(gate.id)}" data-connection="${escapeText(gate.id)}" data-focused="${focused}" role="button" tabindex="0" aria-pressed="${focused}" aria-label="突出显示 ${escapeText(gate.a)} 到 ${escapeText(gate.b)} 连通管">
      <title>${escapeText(gate.a)}—${escapeText(gate.b)} 连通管，点击突出显示</title>
      <path class="pipe-hit" d="${path}" fill="none" stroke="transparent" stroke-width="26" vector-effect="non-scaling-stroke" pointer-events="stroke" style="cursor:pointer"/>
      ${focused ? `<path d="${path}" fill="none" stroke="#c7f0bc" stroke-width="18" stroke-opacity=".2"/>` : ''}
      <path d="${path}" fill="none" stroke="#0a2b31" stroke-width="13" stroke-linejoin="round"/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="8" stroke-linejoin="round"/>
      <path d="${path}" fill="none" stroke="${open ? '#c3f3d7' : '#bfd0b3'}" stroke-opacity="${open || focused ? '.85' : '.4'}" stroke-width="2" ${open ? `stroke-dasharray="5 13" stroke-dashoffset="${-phase * 16}"` : ''}/>
      ${[fromX, toX].map((x) => `<g class="pipe-port"><rect x="${x - 8}" y="${tankBottom + 24}" width="16" height="10" rx="2" fill="${focused ? '#cae9bf' : 'url(#station-metal)'}" stroke="#28514b" stroke-width="1.5"/><path d="M${x - 6} ${tankBottom + 29}h12" stroke="#e1edd0" stroke-opacity=".6"/></g>`).join('')}
    </g>`,
    };
  });
  const tanks = layouts
    .map((tank) => {
      const volume = clamp(displayVolumes[tank.index] ?? state.volumes[tank.index], 0, 10);
      const surface = heightAt(volume);
      const active = latched.has(tank.id);
      const connected = focusedTanks.has(tank.id);
      const switchY = heightAt(tank.switchAt ?? 0);
      const exitY = heightAt(tank.exitAt ?? 10);
      const boatReady = tank.kind === 'boat' && state.volumes[tank.index] + 0.001 >= tank.exitAt;
      const previewVolume = previewState?.volumes?.[tank.index];
      const difference =
        previewVolume === undefined ? 0 : previewVolume - state.volumes[tank.index];
      const hasPreview = previewVolume !== undefined && Math.abs(difference) > 0.005;
      const label =
        tank.kind === 'crate'
          ? active
            ? '开关已锁存'
            : `开关 ≤ ${number(tank.switchAt ?? 0)}`
          : tank.kind === 'boat'
            ? boatReady
              ? '已抵达出口'
              : `出口 ≥ ${number(tank.exitAt ?? 10)}`
            : tank.kind === 'wheel'
              ? `动力 ${number(waterPower)}`
              : '共享液位';
      const statusColor =
        active || boatReady ? '#b8f0c9' : tank.kind === 'reservoir' ? '#a3bcaa' : '#f0cd87';
      const ticks = Array.from(
        { length: 11 },
        (_, value) =>
          `<path d="M${tank.x - (value % 2 ? 6 : 10)} ${heightAt(value)}H${tank.x - 2}" stroke="#85b8a7" opacity="${value % 2 ? '.35' : '.65'}"/>${value % 2 === 0 ? `<text x="${tank.x - 14}" y="${heightAt(value) + 3}" text-anchor="end" font-size="9" fill="#94b5a4">${value}</text>` : ''}`,
      ).join('');
      let content = '';
      if (tank.kind === 'crate') {
        content = `<path d="M${tank.center - 43} ${switchY + 5}H${tank.center + 43}V${switchY + 14}H${tank.center - 43}Z" fill="#b5945e"/>
      <rect x="${tank.center - 43}" y="${switchY + 5}" width="86" height="9" fill="url(#station-stripe)"/>
      <rect x="${tank.center - 43}" y="${switchY}" width="86" height="6" rx="2" fill="${active ? '#9ee6c5' : gold}"/>
      <path d="M${tank.x + 7} ${switchY}H${tank.center - 43}m86 0H${tank.x + width - 7}" stroke="${gold}" stroke-dasharray="4 5" opacity=".7"/>
      <circle cx="${tank.center + 33}" cy="${switchY + 9}" r="3" fill="${active ? '#c6f8d7' : '#75543c'}"/>
      ${crate(tank.center, Math.min(surface, switchY), active)}`;
      } else if (tank.kind === 'boat') {
        content = `<path d="M${tank.x + 8} ${exitY}H${tank.x + width - 4}" stroke="${gold}" stroke-dasharray="5 5" opacity=".8"/>
      <path d="M${tank.x + width - 23} ${exitY - 15}h24v30h-24" fill="#213e3c" fill-opacity=".75" stroke="${gold}" stroke-width="2"/>
      <path d="M${tank.x + width - 19} ${exitY}h12m-5-5 5 5-5 5" stroke="${gold}" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${boat(tank.center - 7, surface, phase, boatReady)}`;
      } else if (tank.kind === 'wheel') {
        const required =
          overflows.reduce((total, outlet) => total + (outlet.powerNeeded || 0), 0) || 1;
        const ratio = clamp(waterPower / required, 0, 1);
        content = `${turbine(tank.center, tankTop + 100, phase, waterPower > 0, ratio)}
      <rect x="${tank.center - 35}" y="${tankTop + 165}" width="70" height="6" rx="3" fill="#163537" stroke="#789b82"/>
      <rect x="${tank.center - 35}" y="${tankTop + 165}" width="${70 * ratio}" height="6" rx="3" fill="${gold}"/>`;
      } else {
        content = `<g transform="translate(${tank.center} ${tankTop + 90})" opacity=".25"><circle r="24" stroke="#a0d0bb" fill="none"/><path d="M-11-3h22m-16-5-5 5 5 5M11 7h-22m16-5 5 5-5 5" stroke="#bbdfc8" stroke-width="2" fill="none"/></g>`;
      }
      const preview = hasPreview
        ? `<g data-preview="${escapeText(tank.id)}"><path d="M${tank.x + 7} ${heightAt(previewVolume)}H${tank.x + width - 7}" stroke="#f4f8e8" stroke-width="2" stroke-dasharray="7 5"/>
      <rect x="${tank.x + 12}" y="${clamp(heightAt(previewVolume) - 26, tankTop + 3, tankBottom - 29)}" width="62" height="21" rx="5" fill="#edf8e4"/>
      <text x="${tank.x + 43}" y="${clamp(heightAt(previewVolume) - 11, tankTop + 18, tankBottom - 14)}" text-anchor="middle" fill="#24584c" font-size="12" font-weight="700">${difference > 0 ? '↑ +' : '↓ '}${number(difference)}</text></g>`
        : '';
      const cylinder = `M${tank.x + 3} ${tankTop}Q${tank.center} ${tankTop + 17} ${tank.x + width - 3} ${tankTop}V${tankBottom}Q${tank.center} ${tankBottom + 19} ${tank.x + 3} ${tankBottom}Z`;
      const bolt = (x, y) =>
        `<circle cx="${x}" cy="${y}" r="2.4" fill="#d9e5c9" stroke="#476b5e"/><path d="M${x - 1.3} ${y + 1.3}l2.6-2.6" stroke="#567665" stroke-width=".9"/>`;
      return `<g data-tank="${escapeText(tank.id)}" data-water="${number(state.volumes[tank.index])}" data-connected="${connected}" aria-label="${escapeText(tank.id)} 槽 ${escapeText(tank.name)}，水位 ${number(state.volumes[tank.index])}" pointer-events="none">
      <text x="${tank.x}" y="30" fill="${connected ? '#e4ffd7' : '#d6efda'}" font-size="25" font-weight="650">${escapeText(tank.id)}</text>
      <text x="${tank.x + 28}" y="29" fill="#aacbbb" font-size="11">${escapeText(tank.name || roles[tank.kind])}</text>
      <text x="${tank.x + width}" y="30" text-anchor="end" fill="#c1f4dc" font-size="22" style="font-variant-numeric:tabular-nums">${volume.toFixed(1)}</text>
      ${connected ? `<rect x="${tank.x - 5}" y="${tankTop - 16}" width="${width + 10}" height="${tankBottom - tankTop + 33}" rx="12" fill="none" stroke="#c4f0b7" stroke-width="2" opacity=".7"/>` : ''}
      <ellipse cx="${tank.center}" cy="${tankBottom + 20}" rx="${width / 2 + 8}" ry="11" fill="#082b31" opacity=".52"/>
      <path d="M${tank.x + 12} ${tankBottom - 5}v27h12v-24m${width - 47} 0v24h12v-27" fill="url(#station-metal)" stroke="#284f47" stroke-width="2"/>
      <path d="${cylinder}" fill="url(#station-tank)" stroke="#719a87" stroke-width="1.5"/>
      <ellipse cx="${tank.center}" cy="${tankTop}" rx="${width / 2 - 3}" ry="11" fill="#113138" stroke="#7f9f8c" stroke-width="2"/>
      <g clip-path="url(#tank-clip-${tank.index})">
        ${
          volume > 0
            ? `<path d="M${tank.x + 5} ${surface}H${tank.x + width - 5}V${tankBottom + 12}H${tank.x + 5}Z" fill="url(#station-water)"/>
        <ellipse cx="${tank.center}" cy="${surface}" rx="${width / 2 - 5}" ry="7" fill="url(#station-water-surface)" stroke="#b6ebcf" stroke-opacity=".8" stroke-width="1.5"/>
        <path d="M${tank.x + width * 0.22} ${surface + 2}q${width * 0.11} 3 ${width * 0.25} 1" fill="none" stroke="#d3f6df" stroke-opacity=".45" stroke-width="1.5" stroke-linecap="round"/>`
            : ''
        }
        <path d="${cylinder}" fill="url(#station-glass)"/>
        <path d="M${tank.x + 17} ${tankTop + 16}V${tankBottom - 18}" stroke="#e0fae4" stroke-opacity=".16" stroke-width="7" stroke-linecap="round"/>
        <path d="M${tank.x + 26} ${tankTop + 27}V${tankBottom - 33}" stroke="#d7f5dd" stroke-opacity=".07" stroke-width="2"/>
        <path d="M${tank.x + width - 12} ${tankTop + 17}V${tankBottom - 13}" stroke="#b3e1c1" stroke-opacity=".16" stroke-width="3"/>
      </g>
      ${ticks}${content}${preview}
      <path d="M${tank.x + 3} ${tankTop}V${tankBottom}m${width - 6} 0V${tankTop}" fill="none" stroke="#143b36" stroke-width="10"/>
      <path d="M${tank.x + 3} ${tankTop}V${tankBottom}m${width - 6} 0V${tankTop}" fill="none" stroke="url(#station-metal-side)" stroke-width="6"/>
      <path d="M${tank.x - 1} ${tankTop - 3}Q${tank.center} ${tankTop + 17} ${tank.x + width + 1} ${tankTop - 3}" fill="none" stroke="#294d45" stroke-width="8"/>
      <path d="M${tank.x - 1} ${tankTop - 5}Q${tank.center} ${tankTop + 15} ${tank.x + width + 1} ${tankTop - 5}" fill="none" stroke="url(#station-metal)" stroke-width="5"/>
      <path d="M${tank.x} ${tankBottom - 4}Q${tank.center} ${tankBottom + 14} ${tank.x + width} ${tankBottom - 4}v13Q${tank.center} ${tankBottom + 28} ${tank.x} ${tankBottom + 9}Z" fill="url(#station-metal)" stroke="#375d51" stroke-width="1.5"/>
      <path d="M${tank.x + 6} ${tankBottom - 1}Q${tank.center} ${tankBottom + 14} ${tank.x + width - 6} ${tankBottom - 1}" fill="none" stroke="#d5e6c6" stroke-width="1.5" opacity=".65"/>
      ${[tank.x + 4, tank.x + width - 4].map((x) => bolt(x, tankTop + 10) + bolt(x, tankBottom - 9)).join('')}
      <rect x="${tank.center - 48}" y="${tankBottom + 8}" width="96" height="19" rx="3" fill="#173e39" stroke="#739681" stroke-width="1"/>
      <circle cx="${tank.center - 39}" cy="${tankBottom + 17}" r="2.5" fill="${statusColor}"/>
      <text x="${tank.center + 4}" y="${tankBottom + 21}" text-anchor="middle" fill="${statusColor}" font-size="10">${escapeText(label)}</text>
    </g>`;
    })
    .join('');
  let overheadIndex = 0;
  const overflowGroups = overflows.map((overflow, index) => {
    const from = byId.get(overflow.from);
    const to = byId.get(overflow.to);
    if (!from || !to) return { id: `overflow:${index}`, markup: '' };
    const id = `overflow:${index}`;
    const focused = focusedConnection === id;
    const direction = to.center > from.center ? 1 : -1;
    const startX = direction > 0 ? from.x + width : from.x;
    const endX = direction > 0 ? to.x + 18 : to.x + width - 18;
    const y = heightAt(overflow.at);
    const endY = Math.max(y + 22, tankTop + 52);
    const long = Math.abs(to.index - from.index) > 1;
    const railY = long ? 45 + overheadIndex++ * 22 : y;
    const sourceSide = startX + direction * 12;
    const targetSide = direction > 0 ? to.x - 12 : to.x + width + 12;
    const path = long
      ? `M${startX - direction * 10} ${y}H${sourceSide}V${railY + 8}Q${sourceSide} ${railY} ${sourceSide + direction * 8} ${railY}H${targetSide - direction * 8}Q${targetSide} ${railY} ${targetSide} ${railY + 8}V${endY - 8}Q${targetSide} ${endY} ${targetSide + direction * 8} ${endY}H${endX}`
      : `M${startX - direction * 10} ${y}H${endX - direction * 8}Q${endX} ${y} ${endX} ${y + 8}V${endY}`;
    const labelX = long ? (sourceSide + targetSide) / 2 : (startX + endX) / 2;
    return {
      id,
      markup: `<g class="pipe-connection overflow-connection${focused ? ' is-focused' : ''}" data-connection="${id}" data-focused="${focused}" role="button" tabindex="0" aria-pressed="${focused}" aria-label="突出显示 ${escapeText(overflow.from)} 到 ${escapeText(overflow.to)} 自动溢流管">
      <title>${escapeText(overflow.from)}→${escapeText(overflow.to)} 自动溢流管，溢流线 ${number(overflow.at)}，点击突出显示</title>
      <path class="pipe-hit" d="${path}" stroke="transparent" stroke-width="26" vector-effect="non-scaling-stroke" pointer-events="stroke" fill="none" style="cursor:pointer"/>
      ${focused ? `<path d="${path}" stroke="#f2d88b" stroke-width="18" stroke-opacity=".2" fill="none"/>` : ''}
      <path d="${path}" stroke="#0b2b2f" stroke-width="13" fill="none" stroke-linejoin="round"/>
      <path d="${path}" stroke="${focused ? '#f3d992' : '#b9aa76'}" stroke-width="8" fill="none" stroke-linejoin="round"/>
      <path d="${path}" stroke="#f4e3b1" stroke-width="2" fill="none" stroke-opacity=".85"/>
      <path d="M${startX - direction * 12} ${y - 7}v14" stroke="${gold}" stroke-width="4"/>
      <path d="M${endX - 5} ${endY - 5}l5 7 5-7" stroke="#f4d18b" stroke-width="2" fill="none"/>
      <rect x="${labelX - 25}" y="${railY - 10}" width="50" height="20" rx="5" fill="#244e42" stroke="#a48e5e" stroke-width="1"/>
      <text x="${labelX}" y="${railY + 4}" text-anchor="middle" fill="#f2d898" font-size="10">溢流 ${number(overflow.at)}</text>
    </g>`,
    };
  });
  const connections = [...pipeGroups, ...overflowGroups];
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
  svg.innerHTML = `${defs}<g font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif">${background}${tanks}${connections.map((connection) => connection.markup).join('')}</g>`;
}
