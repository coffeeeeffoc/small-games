import { avatars, drawAvatar } from './avatars.js';
// Legacy platform images still use the API's reviewed image origins.
export function regionText(player) {
  return [player?.region?.country, player?.region?.province].filter(Boolean).join(' · ');
}

export function profileDetails(player) {
  const source = {
    'user-authorized': '已授权资料',
    'self-reported': '自行设置',
    legacy: '原有昵称',
    default: '默认资料',
  };
  return `${regionText(player) || '地区未知'} · ${source[player?.profileSource] || '默认资料'}`;
}

export function allowedAvatar(value, policy) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\p{Cc}]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return !!(
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      policy?.origins?.includes(url.origin) &&
      ![...url.searchParams.keys()].some((key) =>
        /token|secret|password|credential|session/i.test(key),
      )
    );
  } catch {
    return false;
  }
}

export async function avatarBlob(value, policy, transport = fetch) {
  if (!allowedAvatar(value, policy)) return null;
  const max = Math.min(Number(policy.maxBytes) || 0, 1_048_576);
  if (max <= 0) return null;
  const response = await transport(value, {
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    mode: 'cors',
    signal: AbortSignal.timeout(5000),
  });
  if (
    !response.ok ||
    response.redirected ||
    !/^image\/(png|jpeg|webp|gif)$/i.test(
      response.headers.get('content-type')?.split(';')[0] || '',
    ) ||
    Number(response.headers.get('content-length')) > max
  ) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) return null;
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > max) return null;
      chunks.push(chunk);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return size
    ? new Blob(chunks, { type: response.headers.get('content-type').split(';')[0] })
    : null;
}

const images = new Map(),
  queue = [];
let active = 0;
function drain() {
  while (active < 4 && queue.length) {
    const { url, policy, resolve } = queue.shift();
    active++;
    void avatarBlob(url, policy)
      .catch(() => null)
      .then(resolve)
      .finally(() => {
        active--;
        drain();
      });
  }
}
function imageUrl(url, policy) {
  if (!allowedAvatar(url, policy)) return Promise.resolve(null);
  if (!images.has(url)) {
    const pending = new Promise((resolve) => {
      queue.push({ url, policy, resolve });
    });
    images.set(url, pending);
    if (images.size > 64) {
      const oldest = images.keys().next().value;
      images.delete(oldest);
    }
    drain();
  }
  return images.get(url);
}

export function renderAvatar(element, player, policy) {
  const fallback = Array.from(player?.nickname || player?.name || '新')[0];
  element.dataset.playerAvatar = '';
  element.removeAttribute('data-custom');
  element.removeAttribute('data-preset');
  element.removeAttribute('data-portrait-role');
  element.style.removeProperty('background-image');
  element.replaceChildren(document.createTextNode(fallback));
  const marker = {};
  element.avatarRequest = marker;
  if (avatars.some((avatar) => avatar.id === player?.avatarId)) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    canvas.style.cssText = 'width:100%;height:100%;display:block;border-radius:inherit';
    canvas.setAttribute('aria-hidden', 'true');
    drawAvatar(canvas.getContext('2d'), player.avatarId, 0, 0, 128);
    element.dataset.preset = player.avatarId;
    element.replaceChildren(canvas);
    return element;
  }
  void imageUrl(player?.avatarUrl, policy).then((blob) => {
    if (
      !blob ||
      blob.size > policy.maxBytes ||
      element.avatarRequest !== marker ||
      !element.isConnected
    )
      return;
    const url = URL.createObjectURL(blob);
    const image = document.createElement('img');
    image.alt = '';
    image.decoding = 'async';
    image.onload = () => {
      URL.revokeObjectURL(url);
      if (element.avatarRequest === marker) element.replaceChildren(image);
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
  });
  return element;
}

export function avatarPicker(selected, policy) {
  const field = document.createElement('fieldset');
  field.className = 'player-avatar-picker';
  const legend = document.createElement('legend');
  legend.textContent = '选择头像';
  const grid = document.createElement('div');
  field.append(legend, grid);
  for (const avatar of avatars.filter((item) => policy?.presets?.includes(item.id))) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.avatarId = avatar.id;
    button.setAttribute('aria-label', avatar.name);
    button.setAttribute('aria-pressed', String(selected === avatar.id));
    renderAvatar(button, { avatarId: avatar.id }, policy);
    button.onclick = () => {
      for (const sibling of grid.children)
        sibling.setAttribute('aria-pressed', String(sibling === button));
    };
    grid.append(button);
  }
  return {
    element: field,
    value: () => grid.querySelector('[aria-pressed="true"]')?.dataset.avatarId,
  };
}

export const avatarPickerStyles = `.player-avatar-picker{border:0;margin:16px 0;padding:0;min-width:0;grid-column:1/-1}.player-avatar-picker legend{font-weight:700;margin-bottom:10px}.player-avatar-picker>div{display:grid;grid-template-columns:repeat(4,minmax(44px,1fr));gap:12px}.player-avatar-picker button{width:100%;height:auto;aspect-ratio:1;min-height:44px;padding:5px!important;border:2px solid transparent!important;border-radius:18px;box-shadow:none!important;background:transparent!important}.player-avatar-picker button[aria-pressed=true]{border-color:currentColor!important;background:#f4e5bd!important}.player-avatar-picker canvas{max-width:52px;height:auto!important;aspect-ratio:1;margin:auto}`;
