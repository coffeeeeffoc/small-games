import test from 'node:test';
import assert from 'node:assert/strict';
import { WechatAudio } from '../wechat/audio.js';
import { createPcmBuffer } from '../shared/core/pcm.js';

function fixture() {
  const callbacks = { stop: new Set(), error: new Set() };
  const recorder = {
    starts: 0,
    stops: 0,
    onStop: (fn) => callbacks.stop.add(fn),
    offStop: (fn) => callbacks.stop.delete(fn),
    onError: (fn) => callbacks.error.add(fn),
    offError: (fn) => callbacks.error.delete(fn),
    start(options) {
      this.options = options;
      this.starts += 1;
      if (this.throwStart) throw new Error('device unavailable');
    },
    stop() {
      this.stops += 1;
    },
    emit(kind, result) {
      for (const fn of [...callbacks[kind]]) fn(result);
    },
  };
  const files = new Map();
  let decoding;
  const host = {
    authorize: ({ success }) => success(),
    env: { USER_DATA_PATH: '/user' },
    getRecorderManager: () => recorder,
    createWebAudioContext: () => ({
      decodeAudioData(data, success) {
        decoding = success;
      },
      close() {},
    }),
    getFileSystemManager: () => ({
      readFile: ({ success }) => success({ data: new ArrayBuffer(4) }),
      writeFileSync: (path, data) => files.set(path, data),
      unlinkSync: (path) => files.delete(path),
    }),
    createInnerAudioContext: () => ({
      onEnded() {},
      onError() {},
      play() {},
      stop() {},
      destroy() {},
    }),
  };
  return {
    host,
    recorder,
    files,
    callbacks,
    decoded: () => decoding?.(createPcmBuffer(1, 100, 1000)),
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('recording denial and synchronous host failure are recoverable', async () => {
  const f = fixture(),
    audio = new WechatAudio(f.host);
  f.host.authorize = ({ fail }) => fail({ errMsg: 'auth deny' });
  await assert.rejects(audio.startRecording(), /auth deny/);
  assert.equal(audio.recordPending, false);
  assert.equal(audio.recording, false);
  f.host.authorize = ({ success }) => success();
  f.recorder.throwStart = true;
  await assert.rejects(audio.startRecording(), /device unavailable/);
  assert.equal(audio.recording, false);
  assert.equal(f.callbacks.stop.size, 0);
  f.recorder.throwStart = false;
  await audio.startRecording();
  assert.equal(f.recorder.options.duration, 15000);
  assert.equal(audio.recording, true);
  audio.dispose();
  f.recorder.emit('stop', {});
});
test('backgrounding while permission is pending never starts the microphone', async () => {
  const f = fixture();
  let approve;
  f.host.authorize = ({ success }) => {
    approve = success;
  };
  const audio = new WechatAudio(f.host),
    pending = audio.startRecording();
  await tick();
  audio.interrupt();
  approve();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(f.recorder.starts, 0);
});
test('singleton recorder drains an old stop before a new take can attach', async () => {
  const f = fixture(),
    audio = new WechatAudio(f.host);
  let recorded = 0;
  audio.onRecorded = () => recorded++;
  await audio.startRecording();
  audio.interrupt();
  const pending = audio.startRecording();
  await tick();
  assert.equal(f.recorder.starts, 1);
  f.recorder.emit('stop', { tempFilePath: '/old', fileSize: 10 });
  await pending;
  assert.equal(f.recorder.starts, 2);
  assert.equal(recorded, 0);
  audio.stopRecording();
  audio.stopRecording();
  assert.equal(f.recorder.stops, 2);
  f.recorder.emit('stop', { tempFilePath: '/new', fileSize: 10 });
  await tick();
  f.decoded();
  await tick();
  assert.equal(recorded, 1);
  assert.equal(audio.inputName, '我的录音');
  audio.dispose();
});
test('a late decode cannot overwrite a newly selected source or hidden page', async () => {
  const f = fixture(),
    audio = new WechatAudio(f.host);
  const pending = audio.importFile({ path: '/input', size: 10 });
  await tick();
  audio.useBuiltin('chime');
  f.decoded();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(audio.inputName, '清脆铃音');
  const second = audio.importFile({ path: '/input', size: 10 });
  await tick();
  audio.interrupt();
  f.decoded();
  await assert.rejects(second, { name: 'AbortError' });
  audio.dispose();
});
test('playback uses actual rendered WAV and alternates files to avoid native cache reuse', async () => {
  const f = fixture(),
    audio = new WechatAudio(f.host);
  await audio.play({ paths: [] }, { dry: true });
  await audio.play({ paths: [] }, { dry: false });
  assert.equal(f.files.size, 2);
  const wavs = [...f.files.values()].map((buffer) => new DataView(buffer));
  assert.equal(wavs[0].getUint32(0), 0x52494646);
  assert.ok(new Int16Array([...f.files.values()][0].slice(44)).some((value) => value !== 0));
  assert.ok(new Int16Array([...f.files.values()][1].slice(44)).every((value) => value === 0));
  audio.dispose();
  assert.equal(f.files.size, 0);
});
