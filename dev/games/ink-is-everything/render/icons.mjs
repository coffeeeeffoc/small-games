import { escape } from './palette.mjs';

const iconPaths = {
  hand: '<path d="M9 13V5a2 2 0 0 1 4 0v6m0-2a2 2 0 0 1 4 0v3m0-1a2 2 0 0 1 4 0v5l-3 6H9l-6-8a2 2 0 0 1 3-2l3 3"/>',
  chest:
    '<path d="M3 11V8a9 9 0 0 1 18 0v3M3 11h18v10H3Zm-1 0h20M8 4v7m8-7v7"/><path d="M10 10h4v5h-4Zm2 5v2"/>',
  nova: '<circle cx="12" cy="12" r="5"/><path d="m12 2 1 4m6-2-2 3m5 5-4 1m2 6-3-2m-5 5-1-4m-6 2 2-3m-5-5 4-1m-2-6 3 2"/><path d="m12 8-2 5q2 4 4 0Z" fill="currentColor" stroke="none"/>',
  reclaim:
    '<path d="M12 2C10 7 5 10 5 15a7 7 0 0 0 14 0c0-5-5-8-7-13Z"/><path d="M9 13a4 4 0 0 0 6 4m0-4v4h-4"/>',
  gear: '<path d="m5 2 13 1 2 19-15-1Z"/><path d="M8 3v17m6-13-3 5h5l-3 6"/>',
  upgrade: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/><path d="m9 12 3-3 3 3m-3-3v7"/>',
  ink: '<path d="M9 3h6v4l4 4v10H5V11l4-4Z"/><path d="M8 3h8M5 13h14"/><path d="m12 11-3 5a3 3 0 0 0 6 0Z" fill="currentColor" stroke="none"/>',
  heart:
    '<path d="M20.4 5.6a5.1 5.1 0 0 0-7.3 0L12 6.7l-1.1-1.1a5.1 5.1 0 0 0-7.3 7.2L12 21l8.4-8.2a5.1 5.1 0 0 0 0-7.2Z"/>',
  key: '<circle cx="8" cy="8" r="5"/><path d="m11.5 11.5 9 9m-4-4 3-3m-6 0 3-3"/><circle cx="7" cy="7" r="1" fill="currentColor" stroke="none"/>',
  map: '<path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2Z"/><path d="M9 3v15m6-12v15M6 9l1 1m5 1 1 1m5-1 1 1"/>',
  attack:
    '<path d="m5 20 9-12 7-5-3 8-11 11ZM5 14l6 5M4 20l-2 2"/><path d="m15 2 1 2M5 6l3 2m12 9 2 1M3 11h3"/>',
  heal: '<path d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5Z"/><path d="M12 8v8m-4-4h8"/>',
  trade:
    '<path d="m6 3 11 1 2 17-14-1ZM9 7l6 1M8 11l8 1M8 15l4 1"/><path d="m2 10 3 3-3 3m20-7-3 3 3 3"/>',
  brush:
    '<path d="m7 14 9-12 4 3-9 12Z"/><path d="M7 14c-6 0-1 7-6 8 9 1 13-3 10-6Z" fill="currentColor"/><path d="m15 5 3 3"/>',
  dodge: '<path d="M5 17c-5-7 7-13 13-6m-3-5 5 6-8 1"/><path d="m9 18 5-3 5 3-5 3Z"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  sound:
    '<path d="m3 9 5-1 5-5v18l-5-5-5-1Z"/><path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m3 9 5-1 5-5v18l-5-5-5-1Z"/><path d="m17 9 5 6m0-6-5 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 0c0 3-3 2-3 5m0 3v.5"/>',
  restart: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  close: '<path d="m5 5 14 14M5 19 19 5"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  shield: '<path d="m12 2 9 4-2 10-7 6-7-6L3 6Z"/><path d="m8 12 3 3 6-7"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  pause: '<path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor" stroke="none"/>',
};

export function icon(name, className = '') {
  return `<svg class="icon ${escape(className)}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.ink}</svg>`;
}
