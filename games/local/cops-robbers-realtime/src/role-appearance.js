// Local decoration only: never include this data in room commands or score submissions.
const storageKey = 'chase-role-appearance-v1';
const presets = {
  team: { cop: ['#1677bf', '#d9f3ff', '◆'], robber: ['#d65b19', '#fff0b8', 'ϟ'] },
  animals: { cop: ['#176cb0', '#d9f3ff', '🐱'], robber: ['#bc4c17', '#ffe3be', '🦊'] },
  cosmic: { cop: ['#4d51b8', '#e4e4ff', '✦'], robber: ['#b54920', '#ffdfb4', '☄'] },
};
const images = new Map();
const classicRoles = () => globalThis.__CLASSIC_CHASE_ROLES__ === true;
let settings, stored;
const side = (role) => (['cop', 'pursuer', 'chaser'].includes(role) ? 'cop' : 'robber');
const validAvatar = (value) =>
  typeof value === 'string' &&
  value.length <= 120000 &&
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);

function read() {
  try {
    const value =
      (globalThis.__chaseRoleStorage || globalThis.localStorage)?.getItem(storageKey) || '{}';
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
    label: classicRoles() ? (key === 'cop' ? '警察' : '小偷') : key === 'cop' ? '追逐队' : '突围队',
    style,
    color,
    accent,
    badge,
    avatar: validAvatar(value?.avatar) ? value.avatar : '',
  };
}

// The same vector face is used by SVG scenes and Canvas competition views.
function facePaths(role) {
  const { color, accent, style } = getRoleAppearance(role);
  const chaser = side(role) === 'cop';
  const animal = style === 'animals';
  const paths = [];
  const add = (d, fill, stroke = '', width = 3) => paths.push({ d, fill, stroke, width });
  if (animal) {
    add(
      chaser
        ? 'M9 43 10 6Q12 0 18 6L39 27M61 27 82 6Q88 0 90 6L91 43'
        : 'M6 48 13 5Q15 0 21 7L42 29M58 29 79 7Q85 0 87 5L94 48',
      color,
    );
    add('M16 29 17 13 30 30M70 30 83 13 84 29', '#ffb6a2');
  }
  add(
    chaser
      ? 'M8 46Q8 22 31 19H69Q92 22 92 46V65Q92 94 50 96 8 94 8 65Z'
      : 'M5 53Q5 17 50 17T95 53Q95 92 50 97 5 92 5 53Z',
    animal ? color : accent,
    color,
  );
  if (animal)
    add(
      chaser
        ? 'M16 58Q27 43 42 57L50 65 58 57Q73 43 84 58V70Q81 89 50 90 19 89 16 70Z'
        : 'M10 50 42 60 50 70 58 60 90 50Q90 87 50 91 10 87 10 50Z',
      '#fff4df',
    );
  else {
    add(
      chaser
        ? 'M13 34Q19 12 47 17L56 7 59 19Q80 17 88 34L76 39 50 32 24 39Z'
        : 'M16 31Q25 14 48 18L61 6 60 21Q80 20 85 34L67 32 55 39 40 30 25 36Z',
      color,
    );
    if (style === 'cosmic')
      add('M50 19 53 25 60 26 55 31 56 38 50 34 44 38 45 31 40 26 47 25Z', '#ffe075');
  }
  if (classicRoles() && style === 'team') {
    if (chaser) {
      add('M8 29 14 12Q50-5 86 12L92 29 76 39H24Z', '#1677bf', '#155681');
      add('M20 32H80L86 39Q50 50 14 39Z', '#183e59');
      add('M50 9 59 14 57 26 50 31 43 26 41 14Z', '#ffd671');
    } else {
      add('M9 38Q8 4 50 4T91 38Z', '#243b40');
      add('M12 48Q27 43 50 50 73 43 88 48L85 67Q70 75 51 65 30 75 15 67Z', '#243b40');
      add('M24 57Q32 48 41 57L39 64H26ZM59 57Q68 48 77 57L75 64H61Z', '#fff8e9');
    }
  }
  add('M27 58a5 7 0 1 0 10 0a5 7 0 1 0-10 0M63 58a5 7 0 1 0 10 0a5 7 0 1 0-10 0', '#243d49');
  add('M29 55a1.5 2 0 1 0 3 0a1.5 2 0 1 0-3 0M65 55a1.5 2 0 1 0 3 0a1.5 2 0 1 0-3 0', '#fff');
  add('M17 72a7 4 0 1 0 14 0a7 4 0 1 0-14 0M69 72a7 4 0 1 0 14 0a7 4 0 1 0-14 0', '#f49d92');
  if (animal) add('M45 68Q50 64 55 68L50 73Z', '#9e5149');
  add('M39 76Q50 90 61 76', 'none', '#9e5149', 3.5);
  return paths;
}

const portraitOutline = (role) =>
  side(role) === 'cop'
    ? 'M28 0H72Q100 0 100 28V72Q100 100 72 100H28Q0 100 0 72V28Q0 0 28 0Z'
    : 'M0 50a50 50 0 1 0 100 0a50 50 0 1 0-100 0';
let clipSequence = 0;

export function roleAvatarSvg(role, x, y, size) {
  const { avatar } = getRoleAppearance(role);
  const id = `role-portrait-${++clipSequence}`;
  const content = avatar
    ? `<defs><clipPath id="${id}"><path d="${portraitOutline(role)}"/></clipPath></defs><image href="${avatar}" width="100" height="100" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
    : facePaths(role)
        .map(
          ({ d, fill, stroke, width }) =>
            `<path d="${d}" fill="${fill}" stroke="${stroke || 'none'}" stroke-width="${width}"/>`,
        )
        .join('');
  return `<g class="role-avatar" pointer-events="none" transform="translate(${x} ${y}) scale(${size / 100})" stroke-linecap="round" stroke-linejoin="round">${content}</g>`;
}

// Mini-game Canvas implementations do not consistently expose Path2D.
function drawNativeFace(ctx, role) {
  const { color, accent, style } = getRoleAppearance(role);
  const cop = side(role) === 'cop';
  const circle = (x, y, radius, fill) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const polygon = (points, fill) => {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  if (style === 'animals') {
    polygon(
      [
        [10, 43],
        [13, 4],
        [42, 30],
      ],
      color,
    );
    polygon(
      [
        [58, 30],
        [87, 4],
        [90, 43],
      ],
      color,
    );
  }
  circle(50, 55, 41, style === 'animals' ? color : accent);
  if (style === 'animals') circle(50, 68, 26, '#fff4df');
  if (classicRoles() && style === 'team') {
    if (cop) {
      polygon(
        [
          [8, 32],
          [14, 12],
          [50, 4],
          [86, 12],
          [92, 32],
        ],
        color,
      );
      ctx.fillStyle = '#183e59';
      ctx.fillRect(14, 31, 72, 9);
      polygon(
        [
          [50, 10],
          [59, 15],
          [57, 26],
          [50, 31],
          [43, 26],
          [41, 15],
        ],
        '#ffd671',
      );
    } else {
      polygon(
        [
          [9, 35],
          [17, 9],
          [50, 3],
          [83, 9],
          [91, 35],
        ],
        '#243b40',
      );
      ctx.fillStyle = '#243b40';
      ctx.fillRect(12, 45, 76, 22);
      circle(32, 56, 9, '#fff8e9');
      circle(68, 56, 9, '#fff8e9');
    }
  } else if (style === 'cosmic') {
    polygon(
      [
        [50, 12],
        [56, 28],
        [73, 29],
        [60, 40],
        [65, 56],
        [50, 46],
        [35, 56],
        [40, 40],
        [27, 29],
        [44, 28],
      ],
      '#ffd671',
    );
  }
  circle(32, 57, 5, '#243d49');
  circle(68, 57, 5, '#243d49');
  circle(30, 55, 1.7, '#fff');
  circle(66, 55, 1.7, '#fff');
  circle(22, 72, 5, '#f49d92');
  circle(78, 72, 5, '#f49d92');
  ctx.beginPath();
  ctx.moveTo(39, 76);
  ctx.quadraticCurveTo(50, 90, 61, 76);
  ctx.strokeStyle = '#9e5149';
  ctx.lineWidth = 3.5;
  ctx.stroke();
}

export function drawRoleAvatar(ctx, role, x, y, size) {
  const { avatar } = getRoleAppearance(role);
  let img = images.get(avatar);
  if (avatar && !img && (globalThis.__chaseRoleImage || typeof Image !== 'undefined')) {
    img = globalThis.__chaseRoleImage ? globalThis.__chaseRoleImage() : new Image();
    img.onload = () => {
      img.roleLoaded = true;
    };
    img.src = avatar;
    images.set(avatar, img);
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.lineCap = ctx.lineJoin = 'round';
  if ((img?.complete || img?.roleLoaded) && (img.naturalWidth || img.width)) {
    if (typeof Path2D !== 'undefined') ctx.clip(new Path2D(portraitOutline(role)));
    else {
      ctx.beginPath();
      if (side(role) === 'cop') ctx.rect(0, 0, 100, 100);
      else ctx.arc(50, 50, 50, 0, Math.PI * 2);
      ctx.clip();
    }
    const edge = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    ctx.drawImage(
      img,
      ((img.naturalWidth || img.width) - edge) / 2,
      ((img.naturalHeight || img.height) - edge) / 2,
      edge,
      edge,
      0,
      0,
      100,
      100,
    );
  } else if (typeof Path2D === 'undefined') {
    drawNativeFace(ctx, role);
  } else {
    for (const { d, fill, stroke, width } of facePaths(role)) {
      const path = new Path2D(d);
      if (fill !== 'none') {
        ctx.fillStyle = fill;
        ctx.fill(path);
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.stroke(path);
      }
    }
  }
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
  </style><h2>双方角色装扮</h2><p>给自己和好友配一套形象。头像只保存在当前设备，不会发送给好友或服务器；蓝橙队色和身体队标帮助区分双方。</p><div class="role-options"></div><p role="status" aria-live="polite"></p><footer><button type="button" data-close-appearance>完成</button></footer>`;
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
    field.innerHTML = `<legend>${appearance.label}</legend><svg viewBox="0 0 96 96" aria-label="${appearance.label}头像预览"></svg><label>角色样式<select aria-label="${appearance.label}样式"><option value="team">卡通小队</option><option value="animals">猫狐追逐</option><option value="cosmic">星际追逐</option></select></label><label>本地头像<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="${appearance.label}本地头像"></label><button type="button">恢复默认形象</button>`;
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
