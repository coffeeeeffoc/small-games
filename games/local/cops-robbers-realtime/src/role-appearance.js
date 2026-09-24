// Local decoration only: never include this data in room commands or score submissions.
const storageKey = 'chase-role-appearance-v1';
const presets = {
  team: { cop: ['#1677bf', '#d9f3ff', '◆'], robber: ['#d65b19', '#fff0b8', 'ϟ'] },
  animals: { cop: ['#176cb0', '#d9f3ff', '🐱'], robber: ['#bc4c17', '#ffe3be', '🦊'] },
  cosmic: { cop: ['#4d51b8', '#e4e4ff', '✦'], robber: ['#b54920', '#ffdfb4', '☄'] },
};
const images = new Map();
let settings, stored;
const side = (role) => (['cop', 'pursuer', 'chaser'].includes(role) ? 'cop' : 'robber');
const validAvatar = (value) =>
  typeof value === 'string' &&
  value.length <= 120000 &&
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);

function read() {
  try {
    const value = globalThis.localStorage?.getItem(storageKey) || '{}';
    if (settings && value === stored) return settings;
    stored = value;
    settings = JSON.parse(value);
  } catch {
    settings = {};
  }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) settings = {};
  return settings;
}

export function getRoleAppearance(role) {
  const key = side(role),
    value = read()[key];
  const style = Object.hasOwn(presets, value?.style) ? value.style : 'team';
  const [color, accent, badge] = presets[style][key];
  return {
    label: key === 'cop' ? '追逐队' : '突围队',
    style,
    color,
    accent,
    badge,
    avatar: validAvatar(value?.avatar) ? value.avatar : '',
  };
}

export function roleAvatarSvg(role, x, y, size) {
  const { color, accent, badge, avatar } = getRoleAppearance(role);
  const chaser = side(role) === 'cop',
    radius = chaser ? size * 0.16 : size / 2;
  return (
    `<g class="role-avatar" pointer-events="none"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="${accent}" stroke="${color}" stroke-width="${Math.max(2, size * 0.065)}"/>` +
    (avatar
      ? `<image href="${avatar}" x="${x + size * 0.1}" y="${y + size * 0.1}" width="${size * 0.8}" height="${size * 0.8}" preserveAspectRatio="xMidYMid slice"/>`
      : `<text x="${x + size / 2}" y="${y + size * 0.7}" text-anchor="middle" font-size="${size * 0.65}" fill="${color}" stroke="none">${badge}</text>`) +
    `<circle cx="${x + size * 0.87}" cy="${y + size * 0.9}" r="${size * 0.2}" fill="${color}" stroke="#fff9ed" stroke-width="1"/><text x="${x + size * 0.87}" y="${y + size * 0.975}" text-anchor="middle" font-size="${size * 0.22}" fill="white" stroke="none">${chaser ? '追' : '突'}</text></g>`
  );
}

export function drawRoleAvatar(ctx, role, x, y, size) {
  const { color, accent, badge, avatar } = getRoleAppearance(role);
  const chaser = side(role) === 'cop';
  ctx.save();
  ctx.fillStyle = accent;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.065);
  ctx.beginPath();
  if (chaser) ctx.rect(x, y, size, size);
  else ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  let img = images.get(avatar);
  if (avatar && !img && typeof Image !== 'undefined') {
    img = new Image();
    img.src = avatar;
    images.set(avatar, img);
  }
  if (img?.complete && img.naturalWidth)
    ctx.drawImage(img, x + size * 0.1, y + size * 0.1, size * 0.8, size * 0.8);
  else {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${size * 0.65}px sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(badge, x + size / 2, y + size / 2);
  }
  ctx.beginPath();
  ctx.arc(x + size * 0.87, y + size * 0.9, size * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#fff9ed';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${size * 0.22}px sans-serif`;
  ctx.fillStyle = 'white';
  ctx.fillText(chaser ? '追' : '突', x + size * 0.87, y + size * 0.9);
  ctx.restore();
}

async function avatarFromFile(file) {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type))
    throw new Error('请选择 PNG、JPG、WebP 或 GIF 图片。');
  if (file.size > 8 * 1024 * 1024) throw new Error('图片不能超过 8 MB。');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('无法读取这张图片，请换一张。'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'),
      edge = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.fillStyle = '#fff7e8';
    ctx.fillRect(0, 0, 128, 128);
    ctx.drawImage(
      img,
      (img.naturalWidth - edge) / 2,
      (img.naturalHeight - edge) / 2,
      edge,
      edge,
      0,
      0,
      128,
      128,
    );
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function openAppearanceSettings(onChange = () => {}) {
  if (typeof document === 'undefined' || document.querySelector('[data-role-appearance]')) return;
  const dialog = document.createElement('dialog');
  dialog.dataset.roleAppearance = '';
  dialog.setAttribute('aria-label', '双方角色装扮');
  dialog.innerHTML = `<style>
    [data-role-appearance]{box-sizing:border-box;width:min(560px,calc(100% - 24px));max-height:85dvh;overflow:auto;border:2px solid #2b544b;border-radius:20px;background:#fff9ed;color:#203f38;padding:20px;font:16px/1.5 system-ui,sans-serif}
    [data-role-appearance]::backdrop{background:#102820aa}[data-role-appearance] h2{margin:0;font-size:23px}[data-role-appearance] p{margin:8px 0 14px}
    [data-role-appearance] .role-options{display:grid;grid-template-columns:1fr 1fr;gap:12px}[data-role-appearance] fieldset{min-width:0;margin:0;padding:12px;border:1px solid #a9b8a7;border-radius:12px}
    [data-role-appearance] label{display:block;margin:10px 0}[data-role-appearance] select,[data-role-appearance] button{min-height:44px;font:inherit;border:1px solid #8b9f93;border-radius:8px;background:#fffdf5;color:#203f38;padding:7px 10px}
    [data-role-appearance] select,[data-role-appearance] input{box-sizing:border-box;max-width:100%;width:100%}[data-role-appearance] input{font:inherit;font-size:12px}[data-role-appearance] input::file-selector-button{min-height:44px}
    [data-role-appearance] svg{display:block;margin:auto;width:88px;height:88px}[data-role-appearance] footer{display:flex;justify-content:flex-end;margin-top:12px}[data-role-appearance] [role=status]{min-height:24px;font-size:14px}
    @media(max-width:370px){[data-role-appearance]{padding:14px}[data-role-appearance] .role-options{grid-template-columns:1fr}}
  </style><h2>双方角色装扮</h2><p>给自己和好友配一套形象。头像只保存在当前设备，不会发送给好友或服务器；队标始终保留，避免认错。</p><div class="role-options"></div><p role="status" aria-live="polite"></p><footer><button type="button" data-close-appearance>完成</button></footer>`;
  const status = dialog.querySelector('[role=status]');
  const save = (key, update) => {
    const previous = read(),
      next = { ...previous, [key]: { ...previous[key], ...update } };
    try {
      globalThis.localStorage.setItem(storageKey, JSON.stringify(next));
      settings = next;
      stored = JSON.stringify(next);
      images.clear();
      status.textContent = '已保存在当前设备。';
    } catch {
      status.textContent = '当前设备无法保存，请释放浏览器存储空间或允许本地存储。原设置未改动。';
      return false;
    }
    onChange();
    return true;
  };
  for (const key of ['cop', 'robber']) {
    const field = document.createElement('fieldset'),
      appearance = getRoleAppearance(key);
    field.innerHTML = `<legend>${appearance.label}</legend><svg viewBox="0 0 96 96" aria-label="${appearance.label}头像预览"></svg><label>角色样式<select aria-label="${appearance.label}样式"><option value="team">运动队标</option><option value="animals">猫狐追逐</option><option value="cosmic">星际追逐</option></select></label><label>本地头像<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="${appearance.label}本地头像"></label><button type="button">恢复默认形象</button>`;
    const preview = () => {
      field.querySelector('svg').innerHTML = roleAvatarSvg(key, 7, 7, 76);
    };
    const select = field.querySelector('select');
    select.value = appearance.style;
    select.onchange = () => {
      if (!save(key, { style: select.value })) select.value = getRoleAppearance(key).style;
      preview();
    };
    field.querySelector('input').onchange = async (event) => {
      const input = event.target,
        file = input.files?.[0];
      if (!file) return;
      input.disabled = true;
      status.textContent = '正在处理本地头像…';
      try {
        const avatar = await avatarFromFile(file);
        if (dialog.isConnected) {
          save(key, { avatar });
          preview();
        }
      } catch (error) {
        status.textContent = error.message;
      } finally {
        input.disabled = false;
        input.value = '';
      }
    };
    field.querySelector('button').onclick = () => {
      if (save(key, { style: 'team', avatar: '' })) select.value = 'team';
      preview();
    };
    preview();
    dialog.querySelector('.role-options').append(field);
  }
  const previousFocus = document.activeElement;
  dialog.querySelector('[data-close-appearance]').onclick = () => dialog.close();
  dialog.addEventListener(
    'close',
    () => {
      dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
    },
    { once: true },
  );
  (document.fullscreenElement || document.body).append(dialog);
  dialog.showModal();
}
