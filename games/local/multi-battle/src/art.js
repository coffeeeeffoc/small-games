import { CARD_BY_ID, FAMILIES } from './content.js';

const cache = new Map();
const familyDecor = {
  resonance: '<path d="M36 65l18-18 18 18-18 18zM174 92l13-13 13 13-13 13z"/>',
  legacy: '<path d="M52 93c-30-27 14-29 0-57 35 30 9 42 0 57zm135-30c-18-17 9-18 0-36 20 18 6 26 0 36z"/>',
  commerce: '<circle cx="49" cy="72" r="17"/><circle cx="188" cy="99" r="13"/><path d="M43 72h12m-6-6v12M182 99h12"/>',
  arcana: '<path d="M42 44l6 18 18 6-18 6-6 18-6-18-18-6 18-6zM192 32l4 13 13 4-13 4-4 13-4-13-13-4 13-4z"/>',
  armory: '<path d="M35 49h26v15H35zM45 64v30m141-29l12-18 12 18-12 18z"/>',
  ember: '<path d="M34 62l12-10 12 10v18l-12 10-12-10zM174 48l9-8 9 8v14l-9 8-9-8z"/>',
  neutral: '<path d="M38 63l9-21 9 21 21 9-21 9-9 21-9-21-21-9z"/>'
};
const gearShapes = {
  sword: '<path d="M104 192l9-100 9-43 12 42-10 104z" fill="#d4ded9"/><path d="M78 190l77 8-3 12-77-8z" fill="#dcb778"/><path d="M105 207l17 2-5 39-17-2z" fill="#8c6549"/>',
  book: '<path d="M50 105q40-18 70 2 30-20 70-2v117q-40-18-70 2-30-20-70-2z" fill="#ddc998"/><path d="M120 109v110M62 120l44 3m-44 16l44 3m-44 16l44 3m30-40l44-3m-44 22l44-3m-44 22l44-3" stroke="#98794d" stroke-width="3"/>',
  shield: '<path d="M120 77l65 25-7 94q-12 35-58 59-46-24-58-59l-7-94z" fill="#406a62" stroke="#d3b375" stroke-width="6"/><path d="M120 101v116m-43-96l86 55m0-55l-86 55" stroke="#a6c0ad" stroke-width="6"/>',
  pendant: '<path d="M60 40q0 92 60 106 60-14 60-106" fill="none" stroke="#d8b871" stroke-width="6"/><path d="M120 128l43 42-43 60-43-60z" fill="#e0b471"/><path d="M120 144l25 27-25 38-25-38z" fill="#5eaaa5"/>',
  scroll: '<path d="M67 78h98l10 141H78z" fill="#dfcba1"/><path d="M57 77h118m-106 144h117" stroke="#ac8051" stroke-width="13" stroke-linecap="round"/><path d="M97 124l20-18 22 19-20 23zm-4 47h48m-39 15h30" fill="none" stroke="#97744c" stroke-width="4"/>'
};
export function portrait(id) {
  if (cache.has(id)) return cache.get(id);
  const d = CARD_BY_ID[id] || { key: 'puppet', family: 'ember', type: 'character', tier: 1 };
  const color = FAMILIES[d.family]?.color || '#bdc4ac';
  const index = Object.keys(CARD_BY_ID).indexOf(id);
  const skin = ['#c79675','#d4b38b','#b27c62','#b6a088'][Math.abs(index) % 4];
  const cloth = {resonance:'#487e71',legacy:'#88644f',commerce:'#777245',arcana:'#59678f',armory:'#496d7b',ember:'#8a5149',neutral:'#626e60'}[d.family];
  const beard = ['keeper','bookkeeper','magnate','archivist','medic','commander'].includes(d.key);
  const helmet = ['echo_guard','rivet_guard','forge_walker','commander','mercenary','shieldbreaker','duelist'].includes(d.key);
  const mage = ['tuner','vessel','conductor','apprentice','cannoneer','archivist','gravekeeper','queen'].includes(d.key);
  let figure;
  if (d.type === 'character') {
    const headwear = helmet
      ? '<path d="M77 121v-24q3-49 43-49t43 49v24l-25-13-18 7-18-7z" fill="#7e9590" stroke="#d5bb80" stroke-width="3"/><path d="M120 45v65m-40-9h80" fill="none" stroke="#dfc895" stroke-width="6"/>'
      : mage
      ? `<path d="M68 120L81 73l39-48 39 48 13 47-30-17-22-25-22 25z" fill="${cloth}" stroke="${color}" stroke-width="2"/><path d="M120 38l9 26-9 10-9-10z" fill="#e5c88b"/>`
      : '<path d="M75 100q-1-48 42-45 58-15 50 59l-17-22-30 10-26-13z" fill="#343a35"/><path d="M73 95l95 5-8-22-77-8z" fill="#c7ac70"/>';
    figure = `<path d="M33 300l13-75q8-38 50-45h48q43 9 50 45l16 75" fill="${cloth}" stroke="#172e2a" stroke-width="7"/>
      <path d="M99 170v28l21 27 21-27v-28" fill="${skin}"/>
      <path d="M99 185l21 39-40-8-23-22zm42 0l-21 39 40-8 23-22z" fill="#dbbf83"/>
      <path d="M83 96q-5 42 8 60l29 25 28-25q13-18 8-60" fill="${skin}"/>
      <path d="M93 122h16m22 0h16" stroke="#353a31" stroke-width="5" stroke-linecap="round"/>
      <path d="M120 123l-5 22h13m-21 11q13 6 26 0" fill="none" stroke="#795644" stroke-width="3"/>
      ${beard ? '<path d="M90 145l18 13 12-4 12 4 18-13-9 38-21 18-23-18z" fill="#c4c5b2"/>' : ''}${headwear}
      <path d="M73 224l21 76m73-76l-21 76" fill="none" stroke="#1e3c37" stroke-width="6"/>
      <path d="M111 234l9-10 9 10-9 18z" fill="#efcf8d"/>
      ${d.family === 'armory' || d.key === 'mercenary' ? '<path d="M20 236l47-21 37 24-6 61H32z" fill="#45645e" stroke="#b6ac7a" stroke-width="4"/><path d="M42 249l30 4m-15-18v47" stroke="#b6ac7a" stroke-width="5"/>' : '<path d="M183 289l-5-119" stroke="#b99559" stroke-width="8"/><path d="M177 136l13 22-13 21-13-21z" fill="'+color+'"/>'}`;
    if (d.key === 'puppet') figure = '<path d="M57 276l23-96 40-27 40 27 23 96" fill="#baab88"/><path d="M82 90l38-22 38 22v56l-38 26-38-26z" fill="#dac9a2"/><path d="M99 115h10m22 0h10m-33 28h25M120 172v94m-32-62h65" stroke="#54483c" stroke-width="5"/><path d="M58 82h124" stroke="#534b3d" stroke-width="10"/>';
  } else {
    const shape = d.type === 'spell' ? (d.family === 'arcana' ? 'book' : 'scroll') : ['shortsword','spear'].includes(d.key) ? 'sword' : ['coat','tempered_plate'].includes(d.key) ? 'shield' : d.key === 'grimoire' ? 'book' : 'pendant';
    figure = `<circle cx="120" cy="158" r="89" fill="none" stroke="${color}" opacity=".25"/><circle cx="120" cy="158" r="71" fill="none" stroke="${color}" opacity=".2"/>${gearShapes[shape]}<path d="M39 151l6 10 11 3-11 4-6 10-4-10-11-4 11-3zm161 63l5 10 10 3-10 4-5 10-4-10-11-4 11-3z" fill="${color}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 300"><defs><linearGradient id="bg" x2=".3" y2="1"><stop stop-color="#314c43"/><stop offset="1" stop-color="#102d28"/></linearGradient><radialGradient id="halo"><stop stop-color="${color}" stop-opacity=".34"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><path fill="url(#bg)" d="M0 0h240v300H0z"/><circle cx="120" cy="111" r="105" fill="url(#halo)"/><path d="M14 300V88Q14 10 120 10T226 88v212" fill="none" stroke="${color}" opacity=".25"/><g fill="none" stroke="${color}" stroke-width="2" opacity=".3">${familyDecor[d.family] || ''}</g><path d="M0 258L50 224l56 50 69-35 65 39v22H0" fill="#0c2420" opacity=".6"/>${figure}<path d="M0 295h240" stroke="#dbc08a" opacity=".5"/></svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(id, url);
  return url;
}
