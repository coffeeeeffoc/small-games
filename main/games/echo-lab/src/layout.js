import { validateScene, presets } from './acoustics.js';

export const LAYOUT_VERSION = 2;
const MAX_LINK_LENGTH = 12000;
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
    preset: Object.hasOwn(presets, data.preset) ? data.preset : 'first',
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

export function createRoomLink(base, layout) {
  const json = JSON.stringify(validateLayout(layout));
  const bytes = new TextEncoder().encode(json);
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  if (encoded.length > MAX_LINK_LENGTH) throw new Error('配置链接过长，请使用 JSON 文件分享。');
  const url = new URL(base);
  url.search = '';
  url.hash = `room=${encoded}`;
  return url.href;
}

export function readRoomLink(url) {
  const hash = new URL(url).hash.slice(1);
  if (!hash.startsWith('room=')) return null;
  const encoded = hash.slice(5);
  if (!encoded.length || encoded.length > MAX_LINK_LENGTH || !/^[\w-]+$/.test(encoded))
    throw new Error('配置链接无效或过长。');
  try {
    const binary = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'));
    return validateLayout(
      JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          Uint8Array.from(binary, (c) => c.charCodeAt(0)),
        ),
      ),
    );
  } catch (error) {
    throw new Error(`无法读取配置链接：${error.message}`);
  }
}
