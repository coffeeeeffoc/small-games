import {
  cloneScene,
  presets,
  validateScene,
  computePaths,
  WALL_IDS,
  WALL_NAMES,
  wallReflectionFor,
} from '../../../shared/core/acoustics.js';
import { createLayout, validateLayout } from '../../../shared/core/layout.js';
import { addScenePanel, removeScenePanel } from '../../../shared/core/editor.js';
import { movePanel } from '../../../shared/core/editor-geometry.js';
import { encodeWavBytes } from '../../../shared/core/audio.js';
import { WechatAudio, wxCall } from '../../audio.js';
import { drawRoom, roomPoint, hitObject } from '../../canvas.js';

const STORAGE_KEY = 'echo-lab.scene.v1';
const presetKeys = ['first', 'hall', 'dry'];
const sounds = ['clap', 'kick', 'chime'];
const round = (value) => Math.round(value * 10) / 10;

export function createLabPage(wx) {
  return {
    data: {
      tab: 'experiment',
      tabs: [
        { id: 'experiment', label: '实验' },
        { id: 'sound', label: '声音' },
        { id: 'layout', label: '配置' },
        { id: 'help', label: '帮助' },
      ],
      presetNames: ['一声回应', '空旷大厅', '安静房间'],
      presetIndex: 0,
      soundNames: ['拍手', '短鼓点', '清脆铃音'],
      soundIndex: 0,
      movementNames: ['自由移动', '沿板移动', '垂直板移动'],
      movementIndex: 0,
      volume: 65,
      busy: false,
      recording: false,
      playing: false,
      inputName: '拍手',
      pathsVisible: true,
      selected: 'source',
      scene: {},
      walls: [],
      object: {},
      isPanel: false,
    },
    onLoad() {
      this.alive = true;
      this.visible = true;
      this.action = 0;
      this.audio = new WechatAudio(wx);
      this.audio.onEnd = () => this.alive && this.setData({ playing: false });
      this.audio.onError = (error) => {
        if (this.alive) {
          this.setData({ playing: false });
          this.notify(error.message);
        }
      };
      this.audio.onRecorded = () => {
        if (this.alive)
          this.setData({ recording: false, busy: false, inputName: this.audio.inputName });
      };
      this.audio.onRecordError = (error) => {
        if (this.alive) {
          this.setData({ recording: false, busy: false });
          this.report(error);
        }
      };
      let layout = createLayout(cloneScene(presets.first));
      try {
        const saved = wx.getStorageSync(STORAGE_KEY);
        if (saved) layout = validateLayout(typeof saved === 'string' ? JSON.parse(saved) : saved);
      } catch {
        /* Corrupt or unavailable storage must never block experiments. */
      }
      this.applyLayout(layout);
    },
    onReady() {
      this.measure();
    },
    onShow() {
      this.visible = true;
      this.resumeExternal?.();
      this.resumeExternal = null;
    },
    onHide() {
      this.visible = false;
      if (this.externalPending) {
        // Native file pickers may hide the page. Silence audio, but keep the
        // explicitly requested picker transaction until it returns to the page.
        this.touchCancel();
        this.audio.interrupt();
        this.setData({ playing: false, recording: false });
      } else this.cancelActions();
    },
    onUnload() {
      this.cancelActions();
      this.alive = false;
      this.audio.dispose();
    },
    onResize() {
      this.touchCancel();
      this.measure();
    },
    notify(title) {
      if (this.alive && this.visible) wx.showToast({ title, icon: 'none', duration: 3000 });
    },
    report(error) {
      if (error?.name !== 'AbortError' && !/cancel/i.test(error?.message || ''))
        this.notify(error?.message || '操作失败，请重试。');
    },
    cancelActions() {
      this.action += 1;
      this.touchCancel();
      this.audio?.interrupt();
      this.resumeExternal?.();
      this.resumeExternal = null;
      if (this.alive) this.setData({ busy: false, recording: false, playing: false });
    },
    currentLayout() {
      return createLayout(this.scene, {
        preset: presetKeys[this.data.presetIndex],
        sound: sounds[this.data.soundIndex],
        volume: this.data.volume,
      });
    },
    applyLayout(layout) {
      const valid = validateLayout(layout);
      this.scene = valid.scene;
      this.selected = this.scene.panels[0]?.id || 'source';
      this.audio.useBuiltin(valid.sound);
      this.setData({
        presetIndex: presetKeys.indexOf(valid.preset),
        soundIndex: sounds.indexOf(valid.sound),
        volume: valid.volume,
        inputName: this.audio.inputName,
      });
      this.commit();
    },
    commit() {
      this.audio.stop();
      this.scene = validateScene(this.scene);
      if (
        !['source', 'listener'].includes(this.selected) &&
        !this.scene.panels.some((panel) => panel.id === this.selected)
      )
        this.selected = 'source';
      this.geometry = computePaths(this.scene);
      const object = this.object();
      const echo = this.geometry.paths
        .filter((path) => path.order > 0)
        .sort((a, b) => b.gain - a.gain)[0];
      this.setData({
        scene: this.scene,
        selected: this.selected,
        object: {
          ...object,
          x: round(object.x),
          y: round(object.y),
          reflectionPercent: Math.round((object.reflection || 0) * 100),
        },
        isPanel: !['source', 'listener'].includes(this.selected),
        selectionName:
          this.selected === 'source'
            ? '声源'
            : this.selected === 'listener'
              ? '收音点'
              : object.type === 'absorber'
                ? '吸音屏'
                : '反射板',
        wallPercent: Math.round(this.scene.wallReflection * 100),
        walls: WALL_IDS.map((id) => ({
          id,
          name: WALL_NAMES[id],
          value: Math.round(wallReflectionFor(this.scene, id) * 100),
          override: Object.prototype.hasOwnProperty.call(this.scene.wallReflections, id),
        })),
        echoMs: echo ? Math.round((echo.delay - this.geometry.directDelay) * 1000) : '—',
        pathCount: this.geometry.paths.length,
        playing: false,
      });
      this.draw();
      try {
        wx.setStorageSync(STORAGE_KEY, this.currentLayout());
      } catch {
        if (!this.storageWarned) {
          this.storageWarned = true;
          this.notify('自动保存不可用，请在配置页导出 JSON。');
        }
      }
    },
    object() {
      return ['source', 'listener'].includes(this.selected)
        ? this.scene[this.selected]
        : this.scene.panels.find((panel) => panel.id === this.selected);
    },
    measure() {
      if (!this.alive || this.data.tab !== 'experiment') return;
      wx.createSelectorQuery()
        .in(this)
        .select('#room')
        .fields({ node: true, size: true })
        .exec((result) => {
          if (!this.alive || !result?.[0]?.node) return;
          const { node, width, height } = result[0];
          const ratio = wx.getWindowInfo
            ? wx.getWindowInfo().pixelRatio
            : wx.getSystemInfoSync().pixelRatio;
          this.canvas = node;
          this.width = width;
          this.height = height;
          node.width = Math.round(width * ratio);
          node.height = Math.round(height * ratio);
          this.ctx = node.getContext('2d');
          this.ctx.scale(ratio, ratio);
          this.draw();
        });
    },
    draw() {
      if (this.ctx && this.scene)
        this.view = drawRoom(
          this.ctx,
          this.scene,
          this.geometry,
          this.selected,
          this.width,
          this.height,
          this.data.pathsVisible,
        );
    },
    touchStart(event) {
      if (this.data.busy || this.data.recording || !this.view || event.touches.length !== 1) {
        this.touchCancel();
        return;
      }
      const touch = event.touches[0];
      const selected = hitObject(this.scene, touch, this.view);
      if (!selected) return;
      this.selected = selected;
      this.drag = {
        id: touch.identifier,
        point: roomPoint(touch, this.view),
        object: { ...this.object() },
        view: { ...this.view },
      };
      this.commit();
    },
    touchMove(event) {
      if (!this.drag) return;
      if (event.touches.length !== 1) {
        this.touchCancel();
        return;
      }
      const touch = event.touches.find((point) => point.identifier === this.drag.id);
      if (!touch) return;
      const point = roomPoint(touch, this.drag.view);
      const object = this.object();
      if (this.data.isPanel)
        Object.assign(
          object,
          movePanel(
            this.drag.object,
            this.drag.point,
            point,
            ['free', 'parallel', 'normal'][this.data.movementIndex],
            this.scene,
          ),
        );
      else {
        object.x = this.drag.object.x + point.x - this.drag.point.x;
        object.y = this.drag.object.y + point.y - this.drag.point.y;
      }
      this.commit();
    },
    touchCancel() {
      this.drag = null;
    },
    switchTab(event) {
      this.cancelActions();
      this.setData({ tab: event.currentTarget.dataset.tab }, () => this.measure());
    },
    changePreset(event) {
      if (this.data.busy || this.data.recording) return;
      const index = Number(event.detail.value);
      this.scene = cloneScene(presets[presetKeys[index]]);
      this.selected = this.scene.panels[0]?.id || 'source';
      this.setData({ presetIndex: index });
      this.commit();
    },
    reset() {
      this.changePreset({ detail: { value: this.data.presetIndex } });
    },
    addPanel(event) {
      if (this.data.busy || this.data.recording) return;
      try {
        const next = addScenePanel(this.scene, event.currentTarget.dataset.type);
        this.scene = next.scene;
        this.selected = next.selected;
        this.commit();
      } catch (error) {
        this.report(error);
      }
    },
    removePanel() {
      if (this.data.busy || this.data.recording) return;
      const next = removeScenePanel(this.scene, this.selected);
      this.scene = next.scene;
      this.selected = next.selected;
      this.commit();
    },
    selectObject(event) {
      this.selected = event.currentTarget.dataset.id;
      this.commit();
    },
    movement(event) {
      this.setData({ movementIndex: Number(event.detail.value) });
    },
    edit(event) {
      if (this.data.busy || this.data.recording) return;
      const { field, scope, divisor = 1 } = event.currentTarget.dataset;
      const value = Number(event.detail.value) / Number(divisor);
      if (!Number.isFinite(value)) return;
      if (scope === 'volume') this.setData({ volume: Math.max(0, Math.min(100, value)) });
      else if (scope === 'wall') this.scene.wallReflections[field] = value;
      else (scope === 'scene' ? this.scene : this.object())[field] = value;
      try {
        this.commit();
      } catch (error) {
        this.report(error);
      }
    },
    wallOverride(event) {
      const id = event.currentTarget.dataset.id;
      if (event.detail.value) this.scene.wallReflections[id] = this.scene.wallReflection;
      else delete this.scene.wallReflections[id];
      this.commit();
    },
    toggleDelay() {
      this.scene.delayScale = this.scene.delayScale === 1 ? 4 : 1;
      this.commit();
    },
    togglePaths() {
      this.setData({ pathsVisible: !this.data.pathsVisible });
      this.draw();
    },
    async run(operation) {
      if (this.data.busy || this.data.recording) return;
      const action = ++this.action;
      this.setData({ busy: true });
      try {
        await operation(() => this.alive && this.visible && action === this.action);
      } catch (error) {
        if (action === this.action) this.report(error);
      } finally {
        if (this.alive && action === this.action) this.setData({ busy: false });
      }
    },
    async externalCall(api, options) {
      this.externalPending = true;
      try {
        const result = await wxCall(api, options);
        if (this.alive && !this.visible)
          await new Promise((resolve) => {
            this.resumeExternal = resolve;
          });
        return result;
      } finally {
        this.externalPending = false;
      }
    },
    play(event) {
      return this.run(async (active) => {
        await this.audio.play(this.geometry, {
          dry: event.currentTarget.dataset.dry === 'true',
          volume: this.data.volume / 100,
        });
        if (active()) this.setData({ playing: true });
      });
    },
    stop() {
      this.cancelActions();
    },
    chooseSound(event) {
      if (this.data.busy || this.data.recording) return;
      const index = Number(event.detail.value);
      this.audio.useBuiltin(sounds[index]);
      this.setData({ soundIndex: index, inputName: this.audio.inputName });
      this.commit();
    },
    record() {
      if (this.data.recording) {
        this.setData({ busy: true });
        try {
          this.audio.stopRecording();
        } catch (error) {
          this.setData({ busy: false, recording: false });
          this.report(error);
        }
        return;
      }
      return this.run(async (active) => {
        await this.audio.startRecording();
        if (active()) this.setData({ recording: this.audio.recording });
      });
    },
    importAudio() {
      return this.run(async (active) => {
        const result = await this.externalCall(wx.chooseMessageFile.bind(wx), {
          count: 1,
          type: 'file',
          extension: ['wav', 'mp3', 'm4a', 'aac', 'ogg'],
        });
        if (!active()) return;
        const file = result.tempFiles[0];
        await this.audio.importFile(file);
        if (active()) this.setData({ inputName: this.audio.inputName });
      });
    },
    async shareFile(filename, data) {
      if (!wx.shareFileMessage) throw new Error('当前微信不支持文件分享，请升级微信后重试。');
      const filePath = `${wx.env.USER_DATA_PATH}/${filename}`;
      wx.getFileSystemManager().writeFileSync(
        filePath,
        data,
        typeof data === 'string' ? 'utf8' : undefined,
      );
      try {
        await this.externalCall(wx.shareFileMessage.bind(wx), { filePath, fileName: filename });
      } finally {
        try {
          wx.getFileSystemManager().unlinkSync(filePath);
        } catch {
          /* Best-effort temporary file cleanup. */
        }
      }
    },
    exportAudio(event) {
      return this.run(async (active) => {
        const dry = event.currentTarget.dataset.dry === 'true';
        const buffer = await this.audio.render(this.geometry, {
          dry,
          volume: this.data.volume / 100,
        });
        if (active())
          await this.shareFile(
            dry ? 'echo-lab-dry.wav' : 'echo-lab-wet.wav',
            encodeWavBytes(buffer),
          );
      });
    },
    exportLayout() {
      return this.run(() =>
        this.shareFile('echo-lab-layout.json', JSON.stringify(this.currentLayout(), null, 2)),
      );
    },
    importLayout() {
      return this.run(async (active) => {
        const result = await this.externalCall(wx.chooseMessageFile.bind(wx), {
          count: 1,
          type: 'file',
          extension: ['json'],
        });
        if (!active()) return;
        const file = result.tempFiles[0];
        if (!file?.size || file.size > 100000) throw new Error('布局文件应小于 100 KB。');
        const json = wx.getFileSystemManager().readFileSync(file.path, 'utf8');
        const layout = validateLayout(JSON.parse(json));
        if (active()) {
          this.applyLayout(layout);
          this.notify('已复用房间配置');
        }
      });
    },
    copyLayout() {
      return this.run(() =>
        wxCall(wx.setClipboardData.bind(wx), { data: JSON.stringify(this.currentLayout()) }),
      );
    },
    pasteLayout() {
      return this.run(async (active) => {
        const { data } = await wxCall(wx.getClipboardData.bind(wx));
        if (data.length > 100000) throw new Error('配置过大。');
        const layout = validateLayout(JSON.parse(data));
        if (active()) this.applyLayout(layout);
      });
    },
  };
}
