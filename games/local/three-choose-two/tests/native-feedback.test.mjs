import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNativeFeedback } from '../native/feedback.mjs';

function harness() {
  const events = [], resources = [];
  const settings = { sound: true, music: true, vibration: true };
  const target = { createSound(path, options) {
    resources.push({ path, options });
    return Object.fromEntries(['play','stop','dispose'].map(method => [method, () => events.push([method,path]) ]));
  } };
  const sdk = { vibrateShort(options) { events.push(['vibrate', options.type]); } };
  const feedback = createNativeFeedback(target,sdk,()=>settings);
  const count = (method,path) => events.filter(event=>event[0] === method && event[1] === path).length;
  return { events, resources, settings, feedback, count };
}

test('music, effects and vibration remain independently selectable', () => {
  const {feedback,settings,count}=harness();
  settings.sound=false;
  feedback.setActive(true);
  feedback.sound('place');
  assert.equal(count('play','assets/audio/music.wav'),1);
  assert.equal(count('play','assets/audio/place.wav'),0);
  assert.equal(count('vibrate','light'),1);
  settings.music=false;settings.sound=true;settings.vibration=false;
  feedback.settingsChanged();feedback.sound('clear');
  assert.equal(count('stop','assets/audio/music.wav'),1);
  assert.equal(count('play','assets/audio/clear.wav'),1);
  assert.equal(count('vibrate','medium'),0);
  feedback.dispose();
});

test('repeated renders do not restart music, and pause/resume release playback', () => {
  const {feedback,count,resources}=harness();
  assert.equal(count('play','assets/audio/music.wav'),0);
  assert.deepEqual(resources.find(item=>item.path.endsWith('music.wav')).options,{loop:true,volume:.16});
  feedback.setActive(true);feedback.setActive(true);feedback.settingsChanged();
  assert.equal(count('play','assets/audio/music.wav'),1);
  feedback.setActive(false);feedback.setActive(false);feedback.sound('place');
  assert.equal(count('stop','assets/audio/music.wav'),1);
  assert.equal(count('vibrate','light'),0);
  feedback.setActive(true);
  assert.equal(count('play','assets/audio/music.wav'),2);
  feedback.dispose();feedback.dispose();feedback.setActive(true);feedback.sound('clear');
  for (const {path} of resources) assert.equal(count('dispose',path),1);
  assert.equal(count('play','assets/audio/music.wav'),2);
  assert.equal(count('vibrate','medium'),0);
});

test('missing or rejected optional platform feedback cannot break gameplay', async () => {
  const settings={sound:true,music:true,vibration:true};
  const feedback=createNativeFeedback({createSound(){throw new Error('not available');}}, {vibrateShort(){return Promise.reject(new Error('denied'));}},()=>settings);
  assert.doesNotThrow(()=>{feedback.setActive(true);feedback.sound('place');feedback.settingsChanged();feedback.setActive(false);feedback.dispose();});
  const missing=createNativeFeedback({},null,()=>settings);
  assert.doesNotThrow(()=>{missing.setActive(true);missing.sound('clear');missing.dispose();});
  await Promise.resolve();
});

test('original loop is small playable PCM audio with smooth boundaries', () => {
  const buffer=readFileSync(new URL('../native/assets/audio/music.wav',import.meta.url));
  assert.equal(buffer.toString('ascii',0,4),'RIFF');
  assert.equal(buffer.toString('ascii',8,12),'WAVE');
  assert.equal(buffer.readUInt16LE(20),1);
  assert.equal(buffer.readUInt16LE(22),1);
  assert.equal(buffer.readUInt32LE(24),11025);
  assert.equal(buffer.readUInt16LE(34),16);
  assert.ok(buffer.length < 60*1024);
  assert.ok(buffer.readUInt32LE(40)/2/11025 >= 2);
  assert.equal(buffer.readInt16LE(44),0);
  assert.ok(Math.abs(buffer.readInt16LE(buffer.length-2)) < 50);
  assert.ok(Array.from({length:500},(_,index)=>buffer.readInt16LE(44+index*10)).some(sample=>Math.abs(sample)>500));
});
