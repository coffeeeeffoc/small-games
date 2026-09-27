const ink = '#263646';
const mix = (a, b, p) => a + (b - a) * p;
const ease = p => p * p * (3 - 2 * p);
const group = (body, transform = '') => `<g transform="${transform}">${body}</g>`;
const line = (x1, y1, x2, y2, color = ink, width = 6) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" fill="none"/>`;
function chair(x, y, scale = 1) {
  return group(`<path d="M-25 -44L-30 0M25 -44L31 0M-25 -92L-25 -43M25 -92L25 -43" stroke="#694732" stroke-width="9" stroke-linecap="round"/><rect x="-31" y="-100" width="63" height="39" rx="12" fill="#bb8150" stroke="#694732" stroke-width="3"/><path d="M-33 -49Q0 -58 34 -49L32 -36H-33Z" fill="#d5a068" stroke="#694732" stroke-width="3"/>`, `translate(${x} ${y}) scale(${scale})`);
}
function person(x, y, { teal = false, pose = 'standing', scale = 1, rotate = 0, cream = 'none' } = {}) {
  const shirt = teal ? '#399e99' : '#e47862';
  const legs = pose === 'standing'
    ? '<path d="M-13 -35L-17 -4L-31 0M12 -35L18 -4L30 0"/>'
    : '<path d="M-15 -35L9 -18L43 -12M14 -36L43 -28L67 -11"/>';
  const hairCream = cream !== 'none' ? '<path d="M-31 -118Q-52 -111 -34 -97Q-44 -79 -24 -78Q-15 -60 -2 -77Q15 -63 27 -78Q50 -80 35 -96Q51 -116 27 -120Q11 -141 1 -124Q-20 -141 -31 -118" fill="#fffced" stroke="#dbcbb3" stroke-width="2"/>' : '';
  return group(`<ellipse cx="9" cy="1" rx="49" ry="8" fill="#564c4320"/><g fill="none" stroke="${ink}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round">${legs}</g><path d="M-24 -83Q0 -95 24 -83L32 -37Q1 -21 -30 -37Z" fill="${shirt}" stroke="${ink}" stroke-width="3"/><path d="M-13 -82V-45H19V-82" fill="${teal ? '#c6e5c5' : '#f3bf90'}" opacity=".7"/><rect x="-6" y="-63" width="18" height="13" rx="3" fill="#fff2c5"/>${line(-24,-73,-40,-47,'#eab58d',12)}${line(-40,-47,-26,-60,'#eab58d',12)}${line(24,-73,40,-56,'#eab58d',12)}${line(40,-56,46,-73,'#eab58d',12)}<circle cx="0" cy="-107" r="31" fill="#f1bf98" stroke="${ink}" stroke-width="3"/><path d="M-30 -109Q-31 -142 6 -137Q34 -136 32 -111L17 -122L-13 -123Z" fill="${teal ? '#214952' : '#544238'}"/>${teal ? '<circle cx="21" cy="-140" r="14" fill="#214952"/>' : '<path d="M-31 -128Q-22 -151 9 -143L30 -128Z" fill="#df6654"/><path d="M-12 -127L40 -126" stroke="#943f39" stroke-width="6" stroke-linecap="round"/>'}${hairCream}${cream === 'full' ? '<ellipse cx="0" cy="-106" rx="31" ry="29" fill="#fffced"/><path d="M-24 -95L-22 -78M18 -92L20 -77" stroke="#fffced" stroke-width="10" stroke-linecap="round"/>' : '<ellipse cx="0" cy="-106" rx="24" ry="24" fill="#f1bf98"/>'}<circle cx="-10" cy="-110" r="3" fill="${ink}"/><circle cx="11" cy="-110" r="3" fill="${ink}"/><path d="M-4 -99Q3 -94 10 -99" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>${!teal ? '<path d="M-13 -102Q-7 -110 0 -103Q9 -110 17 -102Q9 -92 1 -98Q-8 -92 -13 -102" fill="#493d38"/><path d="M32 -77h24v23h-24zM56 -73q13 0 0 14" stroke="#665348" stroke-width="3" fill="#fff4d7"/>' : ''}`, `translate(${x} ${y}) rotate(${rotate}) scale(${scale})`);
}
function paper(x, y, dirty = false, scale = 1) {
  return group(`<circle r="34" fill="#fff9e5" stroke="#c7ad88" stroke-width="3"/><circle r="27" fill="none" stroke="#e5d4b8" stroke-width="2"/>${dirty ? '<path d="M-23 -7Q-20 -25 -4 -19Q13 -29 20 -12Q31 4 15 16Q-2 29 -12 16Q-32 19 -23 -7" fill="#fff" stroke="#e0d5c5" stroke-width="2"/><circle cx="6" cy="-2" r="5" fill="#ef7e6b"/>' : ''}`, `translate(${x} ${y}) scale(${scale})`);
}
function cake(x, y, scale = 1, angle = 0) {
  return group('<ellipse cy="22" rx="45" ry="10" fill="#c5b799"/><path d="M-36 -10H36V19Q0 29 -36 19Z" fill="#e8b86b" stroke="#967657" stroke-width="2"/><path d="M-36 -10Q-19 -29 0 -18Q16 -32 36 -10V3Q25 15 18 3Q8 17 -1 4Q-14 16 -21 3Q-32 11 -36 0Z" fill="#fffced" stroke="#dbcab1" stroke-width="2"/><circle cy="-24" r="8" fill="#df6654"/>', `translate(${x} ${y}) rotate(${angle}) scale(${scale})`);
}
function food(type, x, y, scale = 1) {
  return group(type === 'sausage'
    ? '<path d="M-27 5Q-8 -18 24 -1" stroke="#7f4238" stroke-width="19" stroke-linecap="round" fill="none"/><path d="M-27 3Q-8 -19 24 -3" stroke="#d87958" stroke-width="13" stroke-linecap="round" fill="none"/><path d="M-17 -7L-12 1M-3 -11L0 -3M12 -9L16 -3" stroke="#f6b683" stroke-width="3"/>'
    : '<path d="M0 18V-7M0 8L-17 -5M0 4L17 -10" stroke="#89aa57" stroke-width="10" stroke-linecap="round"/><g fill="#428363" stroke="#2b6553" stroke-width="2"><circle cx="-18" cy="-10" r="13"/><circle cx="3" cy="-19" r="17"/><circle cx="20" cy="-9" r="13"/></g>', `translate(${x} ${y}) scale(${scale})`);
}
function dome(x, y, nose = false) {
  return group(`<path d="M-65 17Q-64 -48 0 -51Q63 -48 65 17Z" fill="#afd8d4" fill-opacity=".45" stroke="#517d80" stroke-width="3"/><ellipse cy="17" rx="67" ry="9" fill="#dfebe0" fill-opacity=".6" stroke="#517d80" stroke-width="3"/><path d="M-38 -21Q-31 -35 -18 -37" stroke="#fff9e6" stroke-width="6" stroke-linecap="round"/><circle cy="-56" r="7" fill="#eac876" stroke="#517d80" stroke-width="2"/>${nose ? '<ellipse cx="-22" cy="-4" rx="9" ry="6" fill="#748f8870"/>' : ''}`, `translate(${x} ${y})`);
}
function dog(x, y, eaten = null) {
  return group(`<ellipse cx="-4" cy="-15" rx="38" ry="23" fill="#c99450" stroke="#76583b" stroke-width="3"/><path d="M-36 -12Q-64 -51 -48 -45" stroke="#c99450" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M-26 -2V10M18 -2V10" stroke="#76583b" stroke-width="12" stroke-linecap="round"/><ellipse cx="7" cy="-48" rx="31" ry="29" fill="#e5b772" stroke="#76583b" stroke-width="3"/><path d="M-17 -63Q-42 -62 -29 -27Q-17 -30 -17 -63M27 -67Q52 -62 42 -32Q27 -29 27 -67" fill="#91633f"/><ellipse cx="8" cy="-35" rx="19" ry="12" fill="#f5dca7"/><ellipse cx="8" cy="-43" rx="8" ry="5" fill="#453e36"/><circle cx="-5" cy="-56" r="3" fill="#453e36"/><circle cx="22" cy="-56" r="3" fill="#453e36"/>${eaten ? food(eaten,9,-21,.7) : '<path d="M5 -31q5 7 11 0" fill="none" stroke="#76583b" stroke-width="2"/>'}`, `translate(${x} ${y})`);
}
function room(id) {
  return `<rect width="600" height="340" fill="#f1dfbd"/><rect y="244" width="600" height="96" fill="#d1bb96"/><path d="M0 245H600M0 294H600M115 245L78 340M300 245V340M485 245L522 340" stroke="#b49d7e" stroke-width="2" opacity=".55"/><rect x="0" y="220" width="600" height="11" fill="#c4a87f"/><path d="M13 0V215M586 0V215" stroke="#e1cba7" stroke-width="13"/><path d="M105 0v22" stroke="#344552" stroke-width="5"/><path d="M72 42Q74 9 106 13Q135 12 139 42Z" fill="#344552"/><ellipse cx="106" cy="43" rx="33" ry="8" fill="#edc671"/><rect x="25" y="92" width="77" height="85" rx="3" fill="#f9efd5" stroke="#c3a982" stroke-width="2"/><text x="64" y="115" text-anchor="middle" fill="#7e6850" font-size="11" font-family="sans-serif">深 夜 小 店</text><path d="M40 136h47M43 147h41M50 158h27" stroke="#cdb992" stroke-width="4" stroke-linecap="round"/><circle cx="539" cy="42" r="21" fill="#fff5dd" stroke="#6b766d" stroke-width="4"/><path d="M539 29V42L550 48" stroke="#6b766d" stroke-width="3" fill="none"/>${id !== 'chair' ? '<rect x="462" y="93" width="110" height="95" rx="4" fill="#497f78"/><path d="M480 111h75M480 144h75" stroke="#a8c2a3" stroke-width="5"/><path d="M491 111v-17M518 111v-15M542 111v-13M491 144v-17M518 144v-15M542 144v-13" stroke="#edc671" stroke-width="12"/>' : '<rect x="35" y="198" width="94" height="82" rx="4" fill="#9a7960"/><rect x="49" y="135" width="63" height="66" rx="5" fill="#43535b"/><rect x="59" y="147" width="43" height="20" rx="3" fill="#99bbb1"/><rect x="63" y="179" width="14" height="16" fill="#fff4d7"/>'}`;
}
function chairScene(s, motion) {
  let chairX = s.chair === 'left' ? 219 : 509;
  let bossX = s.boss === 'standing' ? 170 : s.boss === 'carried' ? 508 : 215;
  let bossY = s.boss === 'floor' ? 314 : s.boss === 'standing' ? 286 : 261;
  let clerkX = s.clerk === 'waiting' ? 402 : 437;
  let pose = s.boss === 'standing' ? 'standing' : 'seated', rotate = 0;
  if (motion?.action === 'move') {
    const p = ease(motion.p), carry = Math.max(0, (p - .3) / .7);
    chairX = mix(219,509,carry);
    clerkX = p < .3 ? mix(402,171,p/.3) : mix(171,437,carry);
    if (s.boss === 'seated') { bossX = chairX; bossY = 261 - Math.sin(carry*Math.PI)*10; }
  } else if (motion?.action === 'sit') {
    const p = ease(motion.p); bossX = mix(170,215,Math.min(1,p*2));
    const falling = motion.after.boss === 'floor';
    bossY = mix(286,falling ? 314 : 261,p); pose = p > .25 ? 'seated' : 'standing';
    rotate = falling ? Math.sin(p*Math.PI)*-15 : 0;
  }
  return `${chair(chairX,287)}${person(bossX,bossY,{pose,rotate})}${person(clerkX,280,{teal:true})}<g><rect x="482" y="103" width="103" height="187" rx="4" fill="#38817c" stroke="#285f60" stroke-width="4"/><path d="M491 109V281M525 108V284M559 108V284" stroke="#73aaa0" stroke-width="2"/><rect x="500" y="140" width="67" height="57" rx="3" fill="#d9e5c9"/><text x="534" y="162" text-anchor="middle" fill="#38635c" font-size="12">监控盲区</text><path d="M514 178h39" stroke="#83a28a" stroke-width="3"/><path d="M486 289v10M579 289v10" stroke="#345456" stroke-width="5"/></g>${s.boss === 'floor' || motion?.action === 'sit' && motion.after.boss === 'floor' && motion.p > .8 ? '<path d="M292 268l9 -13l3 16l15 3l-15 6l-5 16l-5 -15l-15 -5Z" fill="#e9b94d"/><path d="M172 315l-14 -6M182 321l-17 6" stroke="#9e7861" stroke-width="3"/>' : ''}`;
}
function creamScene(s, motion) {
  let visible = s, maskX = s.mask === 'table' ? 147 : s.mask === 'face' ? 307 : 417;
  let maskY = s.mask === 'table' ? 252 : s.mask === 'face' ? 132 : 230;
  let extra = '';
  if (motion) {
    const p = ease(motion.p);
    if (motion.action === 'mask') { maskX=mix(147,307,p);maskY=mix(252,132,p); }
    if (motion.action === 'unmask') { maskX=mix(307,417,p);maskY=mix(132,230,p); }
    if (motion.action === 'cake') {
      if (p < .7) extra=cake(mix(136,307,p/.7),mix(196,133,p/.7)-Math.sin(p/.7*Math.PI)*58,1-p*.3,p*260);
      else visible=motion.after;
    }
  }
  const drawMask = paper(maskX,maskY,visible.maskCream,s.mask === 'table' && !motion ? .88 : 1.07);
  return `<rect x="85" y="264" width="122" height="14" rx="5" fill="#9e7659"/><path d="M105 277v43M187 277v43" stroke="#755840" stroke-width="8"/>${person(307,285,{scale:1.44,cream:visible.cream})}${line(348,211,maskX-15,maskY+10,'#efba92',14)}${s.cake && motion?.action !== 'cake' ? cake(136,218,.86) : ''}${drawMask}${extra}${visible.cream !== 'none' ? '<circle cx="233" cy="178" r="6" fill="#fffced"/><circle cx="378" cy="102" r="5" fill="#fffced"/><circle cx="251" cy="217" r="4" fill="#fffced"/>' : ''}`;
}
function lunchScene(s, motion) {
  let visible=s, xs = [198,408], ys=[211,211], dogX=304, dogY=318, extra='';
  if (motion?.action === 'swap') { const p=ease(motion.p); xs=[mix(198,408,p),mix(408,198,p)];ys=[211-Math.sin(p*Math.PI)*32,211+Math.sin(p*Math.PI)*15]; }
  if (motion?.action === 'steal') {
    const jump=Math.sin(Math.PI*motion.p); dogX=mix(304,195,jump);dogY=mix(318,251,jump);
    if (motion.p>.52) visible=motion.after;
  }
  let plates = s.plates.map((id,i)=>`${group(`<ellipse rx="72" ry="21" fill="${id==='sausage' ? '#edab93' : '#bdd4a2'}" stroke="${id==='sausage' ? '#a96a55' : '#648068'}" stroke-width="3"/><ellipse rx="58" ry="15" fill="#fff3d6"/>`, `translate(${xs[i]} ${ys[i]})`)}${visible.food[id] ? food(id,xs[i],ys[i]-17,1.1) : ''}${s.cover===id ? dome(xs[i],ys[i]-18,visible.nose) : ''}`).join('');
  if (motion?.action==='cover') { const p=ease(motion.p);extra=dome(mix(537,198,p),mix(123,193,p)); }
  else if (!s.cover) extra=dome(534,205);
  return `${person(527,282,{teal:true,scale:.9})}<path d="M113 239L105 319M489 239L495 319" stroke="#775b43" stroke-width="14"/><rect x="76" y="215" width="448" height="26" rx="8" fill="#b08459" stroke="#775b43" stroke-width="3"/><rect x="83" y="210" width="434" height="12" rx="5" fill="#e4c38c"/>${plates}${extra}${dog(dogX,dogY,visible.eaten)}<path d="M191 260h-45" stroke="#9f825e" stroke-width="3" stroke-dasharray="5 5"/><text x="144" y="278" text-anchor="middle" fill="#826f55" font-size="10">左盘</text>`;
}
export function scene(c, state, { motion = null, box = null, highlight = null } = {}) {
  const body = c.id === 'chair' ? chairScene(state,motion) : c.id === 'cream' ? creamScene(state,motion) : lunchScene(state,motion);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box ? box.join(' ') : '0 0 600 340'}" aria-hidden="true" class="scene-svg">${room(c.id)}${body}${highlight ? `<rect x="${highlight[0]+3}" y="${highlight[1]+3}" width="${highlight[2]-6}" height="${highlight[3]-6}" rx="12" stroke="#e76643" stroke-width="5" stroke-dasharray="12 7" fill="none"/>` : ''}</svg>`;
}
export function icon(id) {
  let b='';
  if (id==='move') b=chair(31,61,.48)+person(57,62,{teal:true,scale:.36})+'<path d="M77 34h25l-8 -8m8 8l-8 8" fill="none" stroke="#398780" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>';
  if (id==='sit') b=chair(63,64,.5)+person(57,54,{pose:'seated',scale:.46})+'<path d="M22 17v22l-6 -7m6 7l6 -7" fill="none" stroke="#d87860" stroke-width="4" stroke-linecap="round"/>';
  if (id==='mask') b=person(45,80,{scale:.55})+paper(72,30,false,.53)+'<path d="M88 56L74 47" stroke="#c68d50" stroke-width="4"/>';
  if (id==='cake') b=cake(37,45,.6)+'<path d="M73 21l20 15l-7 -2m7 2l-1 -8" stroke="#d87860" stroke-width="4" fill="none" stroke-linecap="round"/>';
  if (id==='unmask') b=person(36,81,{scale:.52,cream:'rim'})+paper(89,36,true,.55)+'<path d="M57 52h13" stroke="#c68d50" stroke-width="3"/>';
  if (id==='swap') b=food('sausage',26,28,.64)+food('broccoli',88,44,.66)+'<path d="M51 22h21l-6 -6m-23 35H25l6 6" stroke="#398780" stroke-width="3" fill="none" stroke-linecap="round"/>';
  if (id==='steal') b=dog(48,77)+food('sausage',94,27,.47);
  if (id==='cover') b=dome(57,45)+'<path d="M20 9v15l-5 -5m5 5l5 -5" stroke="#398780" stroke-width="3" fill="none"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 116 76" aria-hidden="true">${b}</svg>`;
}
