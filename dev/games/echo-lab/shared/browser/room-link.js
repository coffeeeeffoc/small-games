import { validateLayout } from '../core/layout.js';
const MAX_LINK_LENGTH = 12000;

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
