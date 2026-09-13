let context;
let muted = false;
try { muted = localStorage.getItem('multi-battle-muted') === 'true'; } catch {}
export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('multi-battle-muted', String(muted)); } catch {}
  return muted;
}
export function unlockAudio() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!context && Audio) context = new Audio();
    if (context?.state === 'suspended') context.resume().catch(() => {});
  } catch {}
}
export function sound(kind = 'tap') {
  if (muted || !context || context.state !== 'running') return;
  const notes = { tap: [480], buy: [660, 880], growth: [440, 660, 880], hit: [130, 80], spell: [330, 494, 740], win: [440, 554, 660, 880], lose: [330, 277, 220], error: [180, 145] }[kind] || [480];
  notes.forEach((hz, i) => {
    const at = context.currentTime + i * 0.06;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === 'hit' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(hz, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.065, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.19);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at); oscillator.stop(at + 0.2);
  });
}
