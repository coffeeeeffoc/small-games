import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CONTACTS } from '../src/game.js';

const directory = new URL('../public/audio/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8'));
const dialogue = new Set(Object.values(CONTACTS).flatMap(contact => [...contact.lines, ...contact.replies.map(reply => reply.text)]));
assert.deepEqual(new Set(Object.keys(manifest)), dialogue, 'Every current line and reply has a recording, with no stale dialogue');
assert.deepEqual(new Set(readdirSync(directory).filter(name => name.endsWith('.mp3'))), new Set(Object.values(manifest)), 'No missing or unused MP3 files');
for (const filename of Object.values(manifest)) {
  const bytes = readFileSync(new URL(filename, directory));
  assert.ok(bytes.length > 1000 && bytes.toString('ascii', 0, 3) === 'ID3', `${filename}: valid nonempty MP3 container`);
}

const intervals = new Map();
const sources = [];
const oscillators = new Set();
const deferred = new Map();
const utterances = [];
let context;
let intervalId = 0;
let synthesized = 0;
let fetched = 0;
const parameter = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
class AudioNode {
  constructor(kind) { this.kind = kind; this.gain = parameter(); this.frequency = parameter(); }
  connect() {}
  disconnect() {}
  start() {
    if (this.kind === 'oscillator') oscillators.add(this);
    if (this.buffer?.recording) sources.push(this);
  }
  stop(at) {
    if (at !== undefined) return;
    this.stopped = true;
    oscillators.delete(this);
    this.onended?.();
  }
}
class AudioContextMock {
  constructor() { context = this; this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 44100; this.destination = {}; }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  createBuffer() { return {}; }
  createBufferSource() { return new AudioNode('buffer'); }
  createOscillator() { return new AudioNode('oscillator'); }
  createGain() { return new AudioNode('gain'); }
  async decodeAudioData() { return { recording: true }; }
}
globalThis.document = { baseURI: 'https://example.test/between-calls/' };
globalThis.window = {
  AudioContext: AudioContextMock,
  setInterval(callback) { intervals.set(++intervalId, callback); return intervalId; },
  clearInterval(id) { intervals.delete(id); },
  SpeechSynthesisUtterance: class {},
  speechSynthesis: { cancel() {}, pause() {}, resume() {}, getVoices() { return []; }, speak(utterance) { synthesized++; utterances.push(utterance); } },
};
globalThis.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
globalThis.fetch = async url => {
  fetched++;
  assert.ok(url.startsWith(document.baseURI + 'audio/'), 'Assets respect the deployment subdirectory');
  const filename = new URL(url).pathname.split('/').at(-1);
  if (filename === 'manifest.json') return { ok: true, json: async () => ({ ...manifest, late: 'delayed-late.mp3', background: 'delayed-background.mp3', muted: 'delayed-muted.mp3', fallback: 'missing.mp3' }) };
  if (filename.startsWith('delayed-')) await new Promise(resolve => deferred.set(filename, resolve));
  return { ok: filename !== 'missing.mp3', arrayBuffer: async () => new ArrayBuffer(32) };
};
const audio = await import('../src/audio.js');
const settle = () => new Promise(resolve => setImmediate(resolve));

audio.playRing(); audio.playNotification(); await audio.speak('before start');
assert.equal(context, undefined, 'No context before a start gesture');
assert.equal(fetched, 0, 'No recording request before unlock');
await audio.unlockAudio(); await settle();
assert.equal(intervals.size, 1);
audio.playRing(); audio.playRing(); await settle();
assert.equal(intervals.size, 1, 'Repeated renders cannot duplicate the ringtone interval');
audio.pauseAudio(); assert.equal(intervals.size, 0); assert.equal(oscillators.size, 0);
audio.resumeAudio(); await settle(); assert.equal(intervals.size, 1);
audio.stopRing(); assert.equal(intervals.size, 0); assert.equal(oscillators.size, 0);

await audio.speak([...dialogue][0]);
assert.equal(sources.length, 1, 'Recorded speech is preferred'); assert.equal(synthesized, 0);
audio.pauseAudio(); assert.equal(context.state, 'suspended');
audio.resumeAudio(); await settle();
assert.equal(context.state, 'running'); assert.equal(sources.length, 1, 'Resume continues the same source without replaying');
audio.stopSpeech(); assert.equal(sources[0].stopped, true);

const late = audio.speak('late', () => assert.fail('A cancelled download cannot advance the call')); await settle(); audio.stopSpeech();
deferred.get('delayed-late.mp3')(); await late;
assert.equal(sources.length, 1, 'A stopped call cannot play after its download completes');
const background = audio.speak('background'); await settle(); audio.pauseAudio();
deferred.get('delayed-background.mp3')(); await background;
assert.equal(sources.length, 1, 'A background download cannot begin speech');
audio.resumeAudio(); await settle(); assert.equal(sources.length, 2);
audio.stopSpeech();

const pendingMute = audio.speak('muted'); await settle(); audio.setMuted(true);
deferred.get('delayed-muted.mp3')(); await pendingMute;
audio.playRing(); audio.playNotification(); await audio.speak('ignored while muted'); await settle();
assert.equal(sources.length, 2); assert.equal(intervals.size, 0); assert.equal(oscillators.size, 0);
audio.setMuted(false); await settle(); assert.equal(intervals.size, 1);
audio.stopRing(); audio.playRing(); audio.setMuted(true); await settle();
assert.equal(intervals.size, 0, 'Muting also cancels a ring waiting for context resume');
audio.stopRing(); audio.setMuted(false);
audio.playNotification(); await settle(); assert.equal(oscillators.size, 2);
audio.setMuted(true); assert.equal(oscillators.size, 0, 'Muting immediately stops notification tones');
audio.setMuted(false);
await audio.speak('fallback'); assert.equal(synthesized, 1, 'Missing media falls back to browser speech');
audio.stopSpeech();

let completed = 0;
const onEnd = () => completed++;
const line = [...dialogue][0];
await audio.speak(line, onEnd);
sources.at(-1).onended(); sources.at(-1).onended();
assert.equal(completed, 1, 'A normal recording completion advances only once');
await audio.speak(line, onEnd); audio.stopSpeech();
await audio.speak(line, onEnd); audio.setMuted(true); audio.setMuted(false);
await audio.speak(line, onEnd); audio.pauseAudio(); sources.at(-1).onended();
audio.resumeAudio(); await settle();
assert.equal(completed, 1, 'Stopping, muting, and background completion never advance');
let following;
await audio.speak(line, () => { following = audio.speak(line, onEnd); });
sources.at(-1).onended(); await following; sources.at(-1).onended();
assert.equal(completed, 2, 'An end callback can start the next line without losing its state');
await audio.speak('fallback', onEnd); utterances.at(-1).onend();
assert.equal(completed, 3, 'Normal synthesized speech completion also advances');
await audio.speak('fallback', onEnd); utterances.at(-1).onerror(); utterances.at(-1).onend();
assert.equal(completed, 3, 'A speech failure cannot advance');
await audio.speak('fallback', onEnd); audio.stopSpeech(); utterances.at(-1).onend();
assert.equal(completed, 3, 'A cancelled synthesis end event cannot advance');
delete window.speechSynthesis;
await audio.speak('Subtitles remain sufficient without a speech API', onEnd);
assert.equal(completed, 3);
audio.stopSpeech();
console.log(`Audio lifecycle passed; all ${dialogue.size} Chinese lines have local MP3 recordings.`);
