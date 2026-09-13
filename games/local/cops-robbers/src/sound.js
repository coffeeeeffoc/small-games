let context;
let enabled = false;
export function setSound(value) { enabled = Boolean(value); }
export function unlockSound() {
  if (!enabled) return;
  try { context ??= new (window.AudioContext || window.webkitAudioContext)(); if (context.state === 'suspended') context.resume().catch(() => {}); } catch { /* Devices without audio still play normally. */ }
}
export function playSound(name) {
  if (!enabled) return;
  unlockSound();
  if (!context || context.state !== 'running') return;
  const notes = { select: [660], plan: [440, 660], step: [180, 220], capture: [660, 880, 1100], win: [523, 659, 784, 1047], lose: [392, 330, 262, 196], undo: [440, 330], error: [170, 145] }[name] || [440];
  notes.forEach((frequency, i) => {
    const oscillator = context.createOscillator(), gain = context.createGain();
    const at = context.currentTime + i * .08;
    oscillator.type = name === 'step' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.07, at + .008); gain.gain.exponentialRampToValueAtTime(.001, at + .13);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(at); oscillator.stop(at + .15);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  });
}
