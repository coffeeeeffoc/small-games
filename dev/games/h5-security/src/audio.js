let context;
let unlocked = false;
let muted = false;
let paused = false;
let ringWanted = false;
let ringTimer;
let speechVersion = 0;
let currentSpeech;
let recordings;
const buffers = new Map();
const tones = new Map();

const canPlay = () => unlocked && !muted && !paused;
const audioUrl = (file) => new URL(`audio/${file}`, document.baseURI).href;

function loadRecordings() {
  recordings ??= fetch(audioUrl('manifest.json'))
    .then((response) => response.ok ? response.json() : {})
    .catch(() => ({}));
  return recordings;
}

async function wakeContext() {
  if (!context || !canPlay()) return false;
  try {
    if (context.state === 'suspended') await context.resume();
    return canPlay() && context.state === 'running';
  } catch {
    return false;
  }
}

export async function unlockAudio() {
  unlocked = true;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!context && AudioContextClass) context = new AudioContextClass();
    if (await wakeContext()) {
      const silent = context.createBufferSource();
      silent.buffer = context.createBuffer(1, 1, context.sampleRate);
      silent.connect(context.destination);
      silent.start();
    }
  } catch {
    // Subtitles keep calls playable when the browser cannot provide audio.
  }
  void loadRecordings();
  if (ringWanted) startRingPlayback();
  return Boolean(context?.state === 'running' || window.speechSynthesis);
}

function tone(frequency, delay, duration, volume, kind) {
  if (!context || !canPlay() || context.state !== 'running') return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime + delay;
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.015);
  gain.gain.setValueAtTime(volume, start + Math.max(0.016, duration - 0.04));
  gain.gain.linearRampToValueAtTime(0, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  tones.set(oscillator, { gain, kind });
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
    tones.delete(oscillator);
  };
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function stopTones(kind) {
  for (const [oscillator, data] of tones) {
    if (kind && data.kind !== kind) continue;
    data.gain.gain.cancelScheduledValues(0);
    data.gain.gain.value = 0;
    try { oscillator.stop(); } catch { /* Already ended. */ }
    oscillator.disconnect();
    data.gain.disconnect();
    tones.delete(oscillator);
  }
}

export function playNotification() {
  if (!canPlay()) return;
  void wakeContext().then((ready) => {
    if (!ready) return;
    tone(880, 0, 0.11, 0.035, 'notification');
    tone(1174.66, 0.12, 0.17, 0.028, 'notification');
  });
}

function ringPhrase() {
  if (!ringWanted || !canPlay()) return;
  [0, 0.23, 0.72, 0.95].forEach((delay, index) => {
    tone(index % 2 ? 659.25 : 523.25, delay, 0.19, 0.04, 'ring');
  });
}

function startRingPlayback() {
  if (ringTimer || !ringWanted || !canPlay()) return;
  void wakeContext().then((ready) => {
    if (!ready || ringTimer || !ringWanted || !canPlay()) return;
    ringPhrase();
    ringTimer = window.setInterval(ringPhrase, 2700);
  });
}

function stopRingPlayback() {
  window.clearInterval(ringTimer);
  ringTimer = undefined;
  stopTones('ring');
}

export function playRing() {
  ringWanted = true;
  startRingPlayback();
}

export function stopRing() {
  ringWanted = false;
  stopRingPlayback();
}

export function stopSpeech() {
  speechVersion += 1;
  const previous = currentSpeech;
  currentSpeech = undefined;
  if (previous?.source) {
    try { previous.source.stop(); } catch { /* Already ended. */ }
    previous.source.disconnect();
    previous.gain.disconnect();
  }
  try { window.speechSynthesis?.cancel(); } catch { /* Audio is optional. */ }
}

function completeSpeech(speech) {
  if (currentSpeech !== speech) return;
  currentSpeech = undefined;
  if (canPlay() && typeof speech.onEnd === 'function') speech.onEnd();
}

function startSpeech(speech) {
  if (!canPlay() || currentSpeech !== speech || speech.started || !speech.ready) return;
  if (speech.buffer && context?.state === 'running') {
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = speech.buffer;
    gain.gain.value = 0.75;
    source.connect(gain);
    gain.connect(context.destination);
    speech.source = source;
    speech.gain = gain;
    speech.started = true;
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      completeSpeech(speech);
    };
    source.start();
    return;
  }
  try {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    const utterance = new SpeechSynthesisUtterance(speech.text);
    utterance.lang = 'zh-CN';
    utterance.voice = window.speechSynthesis.getVoices().find((voice) => /^zh[-_](CN|Hans)/i.test(voice.lang)) || null;
    utterance.rate = 0.96;
    utterance.volume = 0.75;
    utterance.onend = () => completeSpeech(speech);
    utterance.onerror = () => {
      if (currentSpeech === speech) currentSpeech = undefined;
    };
    speech.started = true;
    speech.synthesized = true;
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  } catch { /* Keep the current subtitle when speech is unavailable. */ }
}

export async function speak(text, onEnd) {
  stopSpeech();
  if (!canPlay() || typeof text !== 'string' || !text.trim()) return;
  const speech = { text, onEnd, version: speechVersion, started: false, ready: false };
  currentSpeech = speech;
  try {
    const manifest = await loadRecordings();
    const filename = manifest[text];
    if (filename && context) {
      if (!buffers.has(filename)) {
        buffers.set(filename, fetch(audioUrl(filename))
          .then((response) => {
            if (!response.ok) throw new Error('Recording unavailable');
            return response.arrayBuffer();
          })
          .then((data) => context.decodeAudioData(data))
          .catch(() => null));
      }
      speech.buffer = await buffers.get(filename);
    }
    if (currentSpeech !== speech || speech.version !== speechVersion) return;
    speech.ready = true;
    await wakeContext();
    startSpeech(speech);
  } catch {
    if (currentSpeech !== speech) return;
    speech.ready = true;
    startSpeech(speech);
  }
}

export function setMuted(value) {
  muted = Boolean(value);
  if (muted) {
    stopRingPlayback();
    stopTones();
    stopSpeech();
  } else if (canPlay()) {
    startRingPlayback();
  }
}

export function pauseAudio() {
  paused = true;
  stopRingPlayback();
  stopTones();
  try { window.speechSynthesis?.pause(); } catch { /* Audio is optional. */ }
  if (context?.state === 'running') void context.suspend().catch(() => {});
}

export function resumeAudio() {
  paused = false;
  if (!canPlay()) return;
  void wakeContext().then(() => {
    if (!canPlay()) return;
    startRingPlayback();
    if (currentSpeech?.synthesized) {
      try { window.speechSynthesis?.resume(); } catch { /* Audio is optional. */ }
    } else if (currentSpeech) {
      startSpeech(currentSpeech);
    }
  });
}
