const ink = '#233b42';

/** Small paper-toy people; their feet sit at the SVG origin. */
export function character(kind, mood = 'idle', index = 0) {
  const cop = kind === 'cop';
  const skin = ['#f4c69f', '#dca579', '#f0bc91'][index % 3];
  const raised = mood === 'caught' || mood === 'cheer';
  const worried = mood === 'nervous';
  const running = mood === 'run';
  const salute = cop && mood === 'selected';
  const coat = cop ? '#177c91' : '#ed7757';
  const sleeve = cop ? '#136779' : '#d76047';
  const leftHand = raised ? '-28,-63' : running ? '-29,-39' : '-24,-20';
  const rightHand = raised ? '28,-63' : salute ? '23,-62' : running ? '28,-18' : '25,-22';
  const eyes = raised
    ? '<path d="M-12-56q4-5 8 0m8 0q4-5 8 0" fill="none"/>'
    : salute
      ? '<path d="M-12-56l7 1"/><ellipse cx="9" cy="-56" rx="2.2" ry="3" fill="currentColor" stroke="none"/>'
      : '<ellipse cx="-8" cy="-56" rx="2.2" ry="3" fill="currentColor" stroke="none"/><ellipse cx="9" cy="-56" rx="2.2" ry="3" fill="currentColor" stroke="none"/>';
  const mouth = worried
    ? '<ellipse cx="1" cy="-44" rx="3" ry="3.5" fill="#723f36" stroke="none"/>'
    : mood === 'caught'
      ? '<path d="M-4-44q5-4 10 0" fill="none"/>'
      : mood === 'cheer'
        ? '<path d="M-6-47h14q-2 10-7 10t-7-10" fill="#723f36"/><path d="M-3-46h8" stroke="#fff6e4" stroke-width="3"/>'
        : '<path d="M-4-46q5 5 11-1" fill="none"/>';
  return `<g class="paper-person ${cop ? 'cop' : 'robber'} mood-${mood}" color="${ink}" stroke="${ink}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    ${!cop && mood !== 'caught' ? `<g class="bag" transform="translate(-1 0)"><path d="M22-38q18 2 13 21-2 8-12 4l-7-5z" fill="#d0ad70"/><path d="M22-37l-1-8 8 4 5-4-1 10m-11 3 10 1" fill="#e4c38a"/><path d="M29-28q-7-2-6 2t6 4-6 3m3-12v16" fill="none" stroke="#936d40" stroke-width="1.6"/></g>` : ''}
    <g class="leg-left"><path d="M-9-15l${running ? '-6 10' : '-1 11'}" stroke="${cop ? '#214956' : '#395457'}" stroke-width="10"/><path d="M${running ? '-16' : '-11'}-4h-6q-3 0-3 3h18v-3" fill="${ink}" stroke="none"/></g>
    <g class="leg-right"><path d="M9-15l${running ? '7 8' : '1 11'}" stroke="${cop ? '#214956' : '#395457'}" stroke-width="10"/><path d="M${running ? '13' : '8'}-4h7q6 0 6 3H5v-3" fill="${ink}" stroke="none"/></g>
    <g class="arm-left"><path d="M-14-33Q-24 ${raised ? '-42' : '-27'} ${leftHand.replace(',', ' ')}" fill="none" stroke="${ink}" stroke-width="12"/><path d="M-14-33Q-24 ${raised ? '-42' : '-27'} ${leftHand.replace(',', ' ')}" fill="none" stroke="${coat}" stroke-width="8"/><circle cx="${leftHand.split(',')[0]}" cy="${leftHand.split(',')[1]}" r="5.4" fill="${skin}"/>${raised ? '<path d="M-29-67v-3m4 4 1-3" stroke-width="2"/>' : ''}</g>
    <g class="arm-right"><path d="M14-33Q${salute ? '31-38' : raised ? '26-42' : '23-26'} ${rightHand.replace(',', ' ')}" fill="none" stroke="${ink}" stroke-width="12"/><path d="M14-33Q${salute ? '31-38' : raised ? '26-42' : '23-26'} ${rightHand.replace(',', ' ')}" fill="none" stroke="${coat}" stroke-width="8"/><circle cx="${rightHand.split(',')[0]}" cy="${rightHand.split(',')[1]}" r="5.4" fill="${skin}"/>${raised ? '<path d="M29-67v-3m-4 4-1-3" stroke-width="2"/>' : ''}</g>
    <g class="body"><path d="M-13-39q13-6 26 0l4 24q-17 6-34 0z" fill="${coat}"/>
      ${cop ? '<path d="M-9-39 0-31 9-39M0-30v17" fill="none" stroke="#0d5d70"/><path d="M-17-19h34v5h-34" fill="#214956" stroke="none"/><rect x="-3" y="-19" width="6" height="5" rx="1" fill="#e5bf65" stroke="none"/><path d="M7-32l3-2 3 2v4l-3 2-3-2z" fill="#f5cf75" stroke="none"/><path d="M-10-29h5m-5 3h5" stroke="#a6d2d4" stroke-width="1.6"/>' : `<path d="M-15-30h30m-31 8h32" stroke="#ffe1b8" stroke-width="4"/><path d="M-7-38q7 10 14 0" fill="${sleeve}"/><path d="M-2-35v6m5-6v5" stroke="#fff0d5" stroke-width="1.6"/>`}
    </g>
    <g class="head">
      <circle cx="-21" cy="-54" r="4.5" fill="${skin}"/><circle cx="21" cy="-54" r="4.5" fill="${skin}"/>
      <path d="M-21-62q0-14 21-14t21 14v12q-1 14-21 14t-21-14z" fill="${skin}"/>
      <path d="M-18-50q0 10 10 11" fill="none" stroke="#e4aa84" stroke-width="3"/>
      ${cop ? '<path d="M-23-67l3-10q20-10 40 0l3 10z" fill="#177c91"/><path d="M-23-68h46v5q-23 6-46 0z" fill="#214956"/><path d="M-19-76q19-6 37 0" fill="none" stroke="#4da0ae" stroke-width="2"/><path d="M-4-77h8v7l-4 3-4-3z" fill="#f1ce78" stroke="#233b42" stroke-width="1.4"/><path d="M-2-74h4m-2-2v4" stroke="#fff0bd" stroke-width="1.3"/>' : '<path d="M-22-67q-2-13 18-14 17-3 23 7l5 7q-22-5-46 0" fill="#354b4c"/><path d="M-15-74q11-5 25-2" fill="none" stroke="#627370"/><path d="M-22-62q21-7 44 0l-1 11q-9 3-20-2-12 5-22 2z" fill="#304747" stroke="none"/><ellipse cx="-8" cy="-56" rx="6.5" ry="5.5" fill="#fff5e0" stroke="none"/><ellipse cx="9" cy="-56" rx="6.5" ry="5.5" fill="#fff5e0" stroke="none"/>'}
      <g stroke-width="2">${eyes}${mouth}</g>
      ${worried || running ? `<path d="M-13-63l8 ${worried ? '-2' : '3'}m10 ${worried ? '0' : '-3'} 9 ${worried ? '2' : '-3'}" fill="none" stroke-width="2"/>` : ''}
      <ellipse cx="-13" cy="-47" rx="4" ry="2" fill="#e99983" opacity=".6" stroke="none"/><ellipse cx="15" cy="-47" rx="4" ry="2" fill="#e99983" opacity=".6" stroke="none"/>
      <path d="M1-53l2 4H0" fill="none" stroke="#c98e69" stroke-width="1.6"/>
      ${worried ? '<path class="sweat" d="M29-67q-10 14-2 15t2-15" fill="#86cbd5" stroke="#4d9dab" stroke-width="1.3"/>' : ''}
    </g>
    ${salute ? `<path d="M20-64l6-2" stroke="${skin}" stroke-width="5"/>` : ''}
    ${!cop && mood === 'caught' ? '<g class="bag dropped-bag" transform="translate(12 -3) rotate(20) scale(.78)"><path d="M4-15q10-5 15 1l2 8Q13 1 2-5z" fill="#d0ad70"/><path d="m10-17-2-5 6 1 4-3-1 7" fill="#e4c38a"/></g>' : ''}
    ${mood === 'guard' ? '<path d="M-9-24q10 8 21-1" fill="none" stroke="#f4c69f" stroke-width="6"/>' : ''}
  </g>`;
}

function house(variant, color = '#ddba98') {
  const market = variant === 1;
  const tower = variant === 4;
  const dock = variant === 3;
  return `<ellipse cy="5" rx="31" ry="7" fill="#53685b" opacity=".09"/><path d="M-25-35h50V3h-50z" fill="${color}"/><path d="M25-35 33-29V0l-8 3" fill="#b4a58b"/><path d="M-28-35 0-52 28-35z" fill="${dock ? '#879ba0' : '#c2856c'}"/><path d="m-28-35 28-17 28 17" fill="none" stroke="#9d7460" stroke-width="2"/>
    ${tower ? '<path d="M-25-67h50v32h-50z" fill="#aec0bd"/><path d="M-28-70h56v5h-56z" fill="#6f8f91"/><path d="M-17-56h9v10h-9zm25 0h9v10H8z" fill="#eaf0df"/>' : '<path d="M14-44v-14h8v19" fill="#b6a087"/>'}
    <path d="M-18-26h10v11h-10zm26 0h10v11H8z" fill="#fff2d2"/><path d="M-5-14H6V3H-5z" fill="#8d9e92"/><path d="M-18-21h10m5 18h19" stroke="#a6b4a1" stroke-width="1.5"/>
    ${market ? '<path d="M-29-30h58l5 12h-68z" fill="#f8e4b9"/><path d="m-21-30-3 12h9l2-12m10 0v12h9V-30m10 0 2 12h9l-3-12" fill="#ce8069"/><path d="M-32-18v21m64-21v21" stroke="#a7896d" stroke-width="2"/><path d="M-26-3h14v8h-14zm40 0h15v8H14z" fill="#b49b70"/><circle cx="-20" cy="-5" r="4" fill="#abc08f"/><circle cx="22" cy="-5" r="4" fill="#e3a268"/>' : ''}`;
}

function tree(variant) {
  return `<ellipse cy="4" rx="17" ry="5" fill="#53685b" opacity=".09"/><path d="M0-21V2m0-13 8-7" stroke="#a58e6d" stroke-width="5" stroke-linecap="round"/>
    ${variant % 2 ? '<path d="M0-53q-18 16-17 30 0 12 17 12t17-12Q18-37 0-53" fill="#a5bb90"/><path d="M0-43v24" stroke="#91aa7e" stroke-width="2"/>' : '<circle cx="-8" cy="-28" r="14" fill="#b9cba2"/><circle cx="8" cy="-31" r="15" fill="#a8c193"/><circle cy="-42" r="13" fill="#bdd0a9"/><path d="M-9-35q-4-5 1-10" fill="none" stroke="#d2dec0" stroke-width="3" stroke-linecap="round"/>'}`;
}

function bench() {
  return '<ellipse cy="5" rx="24" ry="5" fill="#53685b" opacity=".08"/><path d="M-18-20v24m36-24v24" stroke="#7b9087" stroke-width="3"/><path d="M-22-22h44v5h-44zm0 8h44v5h-44zm-2 9h48v5h-48z" fill="#c4ab7c"/>';
}

function pond() {
  return '<ellipse cy="-9" rx="39" ry="22" fill="#cbd8b7"/><ellipse cy="-11" rx="33" ry="17" fill="#b4d3cf"/><path d="M-22-15h12m7 8h16m-4-12h13" stroke="#e3ece1" stroke-width="2.5" stroke-linecap="round"/><path d="M-31-7q-6-9-1-15m-1 11-6-6" fill="none" stroke="#9bb181" stroke-width="2"/><path d="M15-2q5-8 12-2-6 5-12 0" fill="#94b29c"/>';
}

function dockProps() {
  return '<ellipse cy="3" rx="29" ry="6" fill="#53685b" opacity=".08"/><path d="M-27-18h23V1h-23z" fill="#baa67c"/><path d="m-25-16 19 15m-19 0 19-15" stroke="#998864" stroke-width="2"/><path d="M6-12h21V4H6z" fill="#cbb98f"/><path d="M8-10h17M17-10V2" stroke="#a79772" stroke-width="2"/><path d="M-9-23h23v12H-9z" fill="#d4c49d"/><path d="M-6-21h17" stroke="#b09d77" stroke-width="2"/>';
}

/** Decorations use the same road geometry as the game, leaving every junction clear. */
export function scenery(level, chapter = 0) {
  const { nodes, edges } = level;
  const chapterIndex = Math.max(0, Math.min(4, chapter));
  const distanceToRoad = (x, y, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
  };
  const occupied = [];
  const clear = (x, y, radius) => nodes.every(node => Math.hypot(x - node.x, y - node.y) > radius + 37)
    && edges.every(([a, b]) => distanceToRoad(x, y, nodes[a], nodes[b]) > radius + 20)
    && occupied.every(item => Math.hypot(x - item.x, y - item.y) > radius + item.radius + 9);
  const candidates = [[65, 90], [535, 85], [66, 530], [531, 527], [285, 62], [305, 549], [53, 295], [549, 303], [160, 74], [425, 77], [152, 541], [435, 538], [73, 188], [534, 424]];
  const parts = [];
  const tones = ['#dfc7a9', '#e0c4a0', '#d4c7a5', '#b9c4bd', '#b9c9c1'];
  candidates.forEach(([x, y], i) => {
    const featured = i < 4;
    const radius = featured ? 36 : 19;
    if (!clear(x, y - 20, radius)) return;
    occupied.push({ x, y: y - 20, radius });
    const decoration = featured
      ? chapterIndex === 2 ? (i % 2 ? bench() : pond()) : house(chapterIndex, tones[chapterIndex])
      : chapterIndex === 3 && i % 3 === 0 ? dockProps() : chapterIndex === 4 && i % 3 === 0 ? bench() : tree(i);
    parts.push(`<g transform="translate(${x} ${y})" opacity=".84">${decoration}</g>`);
  });
  for (const [x, y] of [[114, 354], [475, 198], [226, 497], [374, 112], [52, 425], [548, 165], [214, 39], [387, 567]]) {
    if (clear(x, y, 7)) parts.push(`<path d="m${x - 5} ${y + 3} 2-7m3 8v-10m4 9 3-6" fill="none" stroke="${chapterIndex === 3 ? '#a6bcb0' : '#b2bf95'}" stroke-width="2.5" stroke-linecap="round"/>`);
  }
  return `<g class="scenery" pointer-events="none" aria-hidden="true">${parts.join('')}</g>`;
}
