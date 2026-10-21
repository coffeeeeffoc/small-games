import {
  builtinBuffer,
  monoClip,
  encodeWavBytes,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_SECONDS,
} from '../shared/core/audio.js';
import { pcmContext } from '../shared/core/pcm.js';
import { renderPcm } from '../shared/core/pcm.js';

const aborted = () => Object.assign(new Error('操作已取消'), { name: 'AbortError' });
export const wxCall = (api, options = {}) =>
  new Promise((resolve, reject) =>
    api({
      ...options,
      success: resolve,
      fail: (error) => reject(new Error(error.errMsg || '微信操作失败')),
    }),
  );

export class WechatAudio {
  constructor(host) {
    this.host = host;
    this.generation = 0;
    this.inputVersion = 0;
    this.recordVersion = 0;
    this.disposed = false;
    this.cleanupPlayback();
    this.useBuiltin('clap');
  }
  context() {
    if (this.disposed) throw aborted();
    if (!this.webAudio) {
      if (!this.host.createWebAudioContext) throw new Error('请升级微信后使用音频解码。');
      this.webAudio = this.host.createWebAudioContext();
    }
    return this.webAudio;
  }
  useBuiltin(name) {
    this.inputVersion += 1;
    this.stop();
    const result = builtinBuffer(pcmContext(), name);
    this.buffer = result.buffer;
    this.inputName = result.name;
    return this.buffer;
  }
  async importFile(file) {
    if (!file?.path || !file.size || file.size > MAX_AUDIO_BYTES)
      throw new Error('请选择不超过 20 MB 的非空音频。');
    const version = ++this.inputVersion;
    const { data } = await wxCall(
      this.host.getFileSystemManager().readFile.bind(this.host.getFileSystemManager()),
      { filePath: file.path },
    );
    const context = this.context();
    const decoded = await new Promise((resolve, reject) =>
      context.decodeAudioData(data, resolve, reject),
    );
    if (this.disposed || version !== this.inputVersion) throw aborted();
    if (!decoded?.length || !decoded.numberOfChannels) throw new Error('音频没有可播放的内容。');
    this.stop();
    this.buffer = monoClip(pcmContext(), decoded);
    this.inputName = file.name || '导入音频';
    return this.buffer;
  }
  async render(geometry, options = {}) {
    const generation = this.generation;
    return renderPcm(this.buffer, geometry, {
      ...options,
      cancelled: () => this.disposed || generation !== this.generation,
    });
  }
  async play(geometry, options) {
    this.stop();
    const generation = this.generation;
    const buffer = await this.render(geometry, options);
    if (this.disposed || generation !== this.generation) throw aborted();
    // InnerAudioContext can play the exact PCM/WAV exported by the experiment.
    const filePath = `${this.host.env.USER_DATA_PATH}/echo-lab-playback-${(this.fileVersion = (this.fileVersion || 0) + 1) % 2}.wav`;
    this.host.getFileSystemManager().writeFileSync(filePath, encodeWavBytes(buffer));
    if (!this.player) {
      this.player = this.host.createInnerAudioContext();
      this.player.onEnded(() => this.onEnd?.());
      this.player.onError((error) => this.onError?.(new Error(error.errMsg || '音频播放失败')));
    }
    this.player.src = filePath;
    this.player.play();
    return buffer.duration;
  }
  stop() {
    this.generation += 1;
    this.player?.stop();
  }
  cleanupPlayback() {
    for (const index of [0, 1]) {
      try {
        this.host
          .getFileSystemManager()
          .unlinkSync(`${this.host.env.USER_DATA_PATH}/echo-lab-playback-${index}.wav`);
      } catch {
        /* Missing temporary files or a read-only sandbox are harmless. */
      }
    }
  }
  async startRecording() {
    if (this.recording || this.recordPending) throw new Error('录音已经开始。');
    this.stop();
    const version = ++this.recordVersion;
    this.recordPending = true;
    try {
      // RecorderManager is a singleton. Drain an interrupted recording before
      // attaching a new callback, or its delayed stop can impersonate a new take.
      if (this.recordDrain) await this.recordDrain;
      if (this.disposed || version !== this.recordVersion) throw aborted();
      if (this.host.requirePrivacyAuthorize)
        await wxCall(this.host.requirePrivacyAuthorize.bind(this.host));
      if (this.disposed || version !== this.recordVersion) throw aborted();
      await wxCall(this.host.authorize.bind(this.host), { scope: 'scope.record' });
      if (this.disposed || version !== this.recordVersion) throw aborted();
      this.recorder ||= this.host.getRecorderManager();
      this.recordDrain = new Promise((resolve) => {
        this.finishDrain = resolve;
      });
      this.onRecordStop = async (result) => {
        this.removeRecordingListeners();
        this.recording = false;
        if (this.disposed || version !== this.recordVersion) return;
        try {
          await this.importFile({
            path: result.tempFilePath,
            size: result.fileSize,
            name: '我的录音',
          });
          if (version === this.recordVersion && !this.disposed) this.onRecorded?.();
        } catch (error) {
          if (version === this.recordVersion) this.onRecordError?.(error);
        }
      };
      this.onRecordFailure = (error) => {
        this.recording = false;
        this.removeRecordingListeners();
        if (version === this.recordVersion && !this.disposed)
          this.onRecordError?.(new Error(error.errMsg || '录音失败，请重试。'));
      };
      this.recorder.onStop(this.onRecordStop);
      this.recorder.onError(this.onRecordFailure);
      this.recording = true;
      this.recorder.start({
        duration: MAX_AUDIO_SECONDS * 1000,
        sampleRate: 22050,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'mp3',
      });
    } catch (error) {
      if (version === this.recordVersion) {
        this.recording = false;
        this.removeRecordingListeners();
      }
      throw error;
    } finally {
      if (version === this.recordVersion) this.recordPending = false;
    }
  }
  removeRecordingListeners() {
    if (this.onRecordStop) this.recorder?.offStop(this.onRecordStop);
    if (this.onRecordFailure) this.recorder?.offError(this.onRecordFailure);
    this.onRecordStop = null;
    this.onRecordFailure = null;
    this.stopping = false;
    this.finishDrain?.();
    this.finishDrain = null;
    this.recordDrain = null;
  }
  stopRecording() {
    if (!this.recording || this.stopping) return;
    this.stopping = true;
    try {
      this.recorder.stop();
    } catch (error) {
      this.recording = false;
      this.removeRecordingListeners();
      throw error;
    }
  }
  interrupt() {
    this.stop();
    this.inputVersion += 1;
    this.recordVersion += 1;
    this.recordPending = false;
    if (this.recording) {
      try {
        this.stopRecording();
      } catch {
        /* A failed stop has already detached listeners. */
      }
    }
    this.recording = false;
  }
  dispose() {
    this.interrupt();
    this.disposed = true;
    this.player?.destroy();
    this.cleanupPlayback();
    try {
      Promise.resolve(this.webAudio?.close()).catch(() => {});
    } catch {
      /* Already closed. */
    }
    this.buffer = null;
  }
}
