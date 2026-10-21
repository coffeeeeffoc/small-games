import {
  MAX_AUDIO_SECONDS,
  MAX_AUDIO_BYTES,
  softLimitCurve,
  audioPaths,
  createGraph,
  monoClip,
  builtinBuffer,
  encodeWavBytes,
} from '../core/audio.js';
export { MAX_AUDIO_SECONDS, MAX_AUDIO_BYTES } from '../core/audio.js';
export function encodeWav(buffer) {
  return new Blob([encodeWavBytes(buffer)], { type: 'audio/wav' });
}
const RENDER_PADDING_SECONDS = 0.05;

function cancelledError(message = '操作已取消') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function microphoneError(error) {
  if (error?.name === 'AbortError') return error;
  const messages = {
    NotAllowedError: '麦克风权限未开启。请在浏览器地址栏允许麦克风后重试。',
    PermissionDeniedError: '麦克风权限未开启。请在浏览器地址栏允许麦克风后重试。',
    NotFoundError: '没有检测到麦克风，请连接麦克风后重试。',
    DevicesNotFoundError: '没有检测到麦克风，请连接麦克风后重试。',
    NotReadableError: '麦克风无法使用，可能正被其他程序占用。请关闭占用程序后重试。',
    TrackStartError: '麦克风无法使用，可能正被其他程序占用。',
    SecurityError: '浏览器阻止了录音。请通过 localhost 或 HTTPS 打开，并允许麦克风。',
  };
  return new Error(messages[error?.name] || error?.message || '录音失败，请检查麦克风后重试。');
}

function stopTracks(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export class AudioEngine {
  constructor() {
    this.context = null;
    this.buffer = null;
    this.inputName = '拍手';
    this.inputInfo = null;
    this.onRecordingStop = null;
    this.onPlaybackEnd = null;
    this._limiterCurve = softLimitCurve();
    this._activeGraph = null;
    this._playTimer = null;
    this._playVersion = 0;
    this._inputVersion = 0;
    this._recordVersion = 0;
    this._recordingPending = false;
    this._session = null;
    this._disposed = false;
  }

  get isRecording() {
    return this._recordingPending || Boolean(this._session);
  }

  _ensureContext() {
    if (this._disposed) throw new Error('音频引擎已关闭，请刷新页面。');
    if (!this.context) {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context)
        throw new Error('当前浏览器不支持 Web Audio，请使用新版 Chrome、Edge、Firefox 或 Safari。');
      this.context = new Context();
    }
    return this.context;
  }

  async init() {
    const context = this._ensureContext();
    if (context.state === 'suspended') await context.resume();
    if (context.state === 'closed') throw new Error('音频已关闭，请刷新页面后重试。');
    return context;
  }

  useBuiltin(name = 'clap') {
    const { buffer, name: inputName } = builtinBuffer(this._ensureContext(), name);
    this._inputVersion += 1;
    this.stop();
    this.buffer = buffer;
    this.inputName = inputName;
    this.inputInfo = { duration: buffer.duration, truncated: false, builtin: name };
    return buffer;
  }

  async importFile(file) {
    if (!file || !file.size) throw new Error('请选择一个非空音频文件。');
    if (file.size > MAX_AUDIO_BYTES) throw new Error('音频文件不能超过 20 MB，请先裁剪或压缩。');
    const context = this._ensureContext();
    const version = ++this._inputVersion;
    let decoded;
    try {
      decoded = await context.decodeAudioData(await file.arrayBuffer());
    } catch {
      throw new Error('无法读取此音频。请尝试 WAV、MP3、M4A 或浏览器支持的其他音频格式。');
    }
    if (version !== this._inputVersion || this._disposed) throw cancelledError();
    if (!decoded.length || !decoded.numberOfChannels) throw new Error('这个音频没有可播放的内容。');
    const buffer = monoClip(context, decoded);
    this.stop();
    this.buffer = buffer;
    this.inputName = file.name || '导入音频';
    this.inputInfo = {
      duration: buffer.duration,
      originalDuration: decoded.duration,
      truncated: decoded.duration > MAX_AUDIO_SECONDS,
      builtin: null,
    };
    return { buffer, inputName: this.inputName, ...this.inputInfo };
  }

  async play(geometry, { dry = false, volume = 0.65 } = {}) {
    this.stop();
    const version = this._playVersion;
    const context = await this.init();
    if (version !== this._playVersion || this._disposed) return 0;
    if (!this.buffer) {
      const builtin = builtinBuffer(context, 'clap');
      this.buffer = builtin.buffer;
      this.inputName = builtin.name;
    }
    const graph = createGraph(
      context,
      this.buffer,
      audioPaths(geometry, dry),
      volume,
      this._limiterCurve,
    );
    this._activeGraph = graph;
    graph.source.start();
    // Source.onended fires before the convolution tail; retain the graph until it decays.
    this._playTimer = setTimeout(
      () => {
        if (this._activeGraph !== graph) return;
        graph.disconnect();
        this._activeGraph = null;
        this._playTimer = null;
        this.onPlaybackEnd?.();
      },
      Math.ceil(graph.duration * 1000) + 30,
    );
    return graph.duration;
  }

  stop() {
    this._playVersion += 1;
    clearTimeout(this._playTimer);
    this._playTimer = null;
    if (this._activeGraph) {
      try {
        this._activeGraph.source.stop();
      } catch {
        /* Playback may have naturally ended. */
      }
      this._activeGraph.disconnect();
      this._activeGraph = null;
    }
  }

  async exportWav(geometry, { volume = 0.65, dry = false, input = this.buffer } = {}) {
    const context = this._ensureContext();
    if (!input) input = this.buffer || this.useBuiltin('clap');
    const paths = audioPaths(geometry, dry);
    const maxDelay = paths.reduce((max, path) => Math.max(max, path.delay), 0);
    const duration = input.duration + maxDelay + RENDER_PADDING_SECONDS;
    const OfflineContext = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!OfflineContext)
      throw new Error('当前浏览器不支持离线导出，请使用新版 Chrome、Edge、Firefox 或 Safari。');
    const offline = new OfflineContext(
      2,
      Math.ceil(duration * context.sampleRate),
      context.sampleRate,
    );
    const graph = createGraph(offline, input, paths, volume, this._limiterCurve);
    graph.source.start(0);
    let rendered;
    try {
      rendered = await offline.startRendering();
    } catch {
      throw new Error('音频导出失败，请减少反射次数或缩短音频后重试。');
    } finally {
      graph.disconnect();
    }
    let peak = 0;
    for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
      const samples = rendered.getChannelData(channel);
      for (let i = 0; i < samples.length; i += 1) peak = Math.max(peak, Math.abs(samples[i]));
    }
    return { blob: encodeWav(rendered), duration: rendered.duration, peak };
  }

  async startRecording() {
    if (this.isRecording) throw new Error('录音正在进行或等待麦克风授权。');
    if (!globalThis.navigator?.mediaDevices?.getUserMedia) {
      throw new Error('当前页面无法访问麦克风。请通过 localhost 或 HTTPS 打开，或先导入音频。');
    }
    if (!globalThis.MediaRecorder)
      throw new Error('当前浏览器不支持录音，请导入音频或更换新版浏览器。');
    const recordVersion = ++this._recordVersion;
    const inputVersion = ++this._inputVersion;
    this._recordingPending = true;
    this.stop();
    let stream;
    try {
      await this.init();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (recordVersion !== this._recordVersion || this._disposed) {
        stopTracks(stream);
        throw cancelledError('已取消录音');
      }
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(
        (type) => MediaRecorder.isTypeSupported?.(type),
      );
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const session = {
        stream,
        recorder,
        chunks: [],
        bytes: 0,
        inputVersion,
        automatic: false,
        stopping: false,
        timer: null,
      };
      session.done = new Promise((resolve, reject) => {
        session.resolve = resolve;
        session.reject = reject;
      });
      // Auto-stop has no caller awaiting it; report its error through the callback.
      session.done.catch(() => {});
      recorder.ondataavailable = (event) => {
        if (!event.data?.size) return;
        session.chunks.push(event.data);
        session.bytes += event.data.size;
        if (session.bytes >= MAX_AUDIO_BYTES && !session.stopping) {
          session.automatic = true;
          this.stopRecording().catch(() => {});
        }
      };
      recorder.onerror = (event) => {
        session.error = microphoneError(event.error || new Error('浏览器录音失败，请重试。'));
        this._finishRecording(session).catch(() => {});
      };
      recorder.onstop = () => {
        this._finishRecording(session).catch(() => {});
      };
      this._session = session;
      recorder.start(250);
      session.timer = setTimeout(() => {
        session.automatic = true;
        this.stopRecording().catch(() => {});
      }, MAX_AUDIO_SECONDS * 1000);
      this._recordingPending = false;
      return { maxSeconds: MAX_AUDIO_SECONDS };
    } catch (error) {
      stopTracks(stream);
      if (recordVersion === this._recordVersion) {
        this._recordingPending = false;
        if (this._session?.stream === stream) this._session = null;
      }
      throw microphoneError(error);
    }
  }

  async stopRecording() {
    this._recordVersion += 1;
    this._recordingPending = false;
    const session = this._session;
    if (!session) return this.buffer;
    if (!session.stopping) {
      session.stopping = true;
      clearTimeout(session.timer);
      try {
        if (session.recorder.state !== 'inactive') session.recorder.stop();
        else this._finishRecording(session).catch(() => {});
      } catch (error) {
        session.error = microphoneError(error);
        this._finishRecording(session).catch(() => {});
      }
      stopTracks(session.stream);
    }
    return session.done;
  }

  async _finishRecording(session) {
    if (session.finishing) return session.done;
    session.finishing = true;
    clearTimeout(session.timer);
    stopTracks(session.stream);
    try {
      if (session.error) throw session.error;
      const blob = new Blob(session.chunks, { type: session.recorder.mimeType || 'audio/webm' });
      if (!blob.size) throw new Error('没有录到声音，请录制至少一秒后再停止。');
      const decoded = await this._ensureContext().decodeAudioData(await blob.arrayBuffer());
      if (session.inputVersion !== this._inputVersion || this._disposed)
        throw cancelledError('录音结果已取消');
      const buffer = monoClip(this.context, decoded);
      this.buffer = buffer;
      this.inputName = '我的录音';
      this.inputInfo = {
        duration: buffer.duration,
        originalDuration: decoded.duration,
        truncated: decoded.duration > MAX_AUDIO_SECONDS,
        builtin: null,
      };
      if (this._session === session) this._session = null;
      session.resolve(buffer);
      this.onRecordingStop?.({
        buffer,
        inputName: this.inputName,
        automatic: session.automatic,
        ...this.inputInfo,
      });
      return buffer;
    } catch (error) {
      const reported =
        error?.name === 'EncodingError'
          ? new Error('浏览器未能解码录音，请尝试新版浏览器或导入音频。')
          : microphoneError(error);
      if (this._session === session) this._session = null;
      session.reject(reported);
      this.onRecordingStop?.({ error: reported, automatic: session.automatic });
      throw reported;
    } finally {
      session.chunks.length = 0;
      session.recorder.ondataavailable = null;
      session.recorder.onstop = null;
      session.recorder.onerror = null;
    }
  }

  async dispose() {
    this.stop();
    this._inputVersion += 1;
    this._recordVersion += 1;
    this._recordingPending = false;
    this.onRecordingStop = null;
    this.onPlaybackEnd = null;
    if (this._session) {
      const session = this._session;
      clearTimeout(session.timer);
      stopTracks(session.stream);
      try {
        if (session.recorder.state !== 'inactive') session.recorder.stop();
      } catch {
        /* Already stopped. */
      }
      this._session = null;
    }
    this._disposed = true;
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.buffer = null;
  }
}
