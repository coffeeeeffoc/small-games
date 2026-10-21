import { validateScene, presets } from './acoustics.js';

export const LAYOUT_VERSION = 2;
const SOUNDS = ['clap', 'kick', 'chime'];

// Whitelist at every entry point; audio buffers and file names never enter links.
export function validateLayout(data) {
  if (!data || data.format !== 'echo-lab' || ![1, LAYOUT_VERSION].includes(data.version)) {
    throw new Error('请选择回声实验室的 v1 或 v2 房间配置。');
  }
  const volume = data.volume ?? 65;
  if (!Number.isFinite(volume) || volume < 0 || volume > 100)
    throw new Error('音量必须在 0–100 之间。');
  if (data.sound != null && !SOUNDS.includes(data.sound)) throw new Error('配置中的测试音无效。');
  return {
    format: 'echo-lab',
    version: LAYOUT_VERSION,
    preset: Object.prototype.hasOwnProperty.call(presets, data.preset) ? data.preset : 'first',
    scene: validateScene(data.scene),
    sound: data.sound ?? 'clap',
    volume,
  };
}

export function createLayout(scene, { preset = 'first', sound = 'clap', volume = 65 } = {}) {
  return validateLayout({
    format: 'echo-lab',
    version: LAYOUT_VERSION,
    scene,
    preset,
    sound: SOUNDS.includes(sound) ? sound : 'clap',
    volume,
  });
}
