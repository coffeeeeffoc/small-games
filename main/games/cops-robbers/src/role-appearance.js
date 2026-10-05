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
  if (classicRoles() && style === 'team') {
    const ink = '#133a55',
      skin = '#ffcf9d';
    add(
      'M10 58a10 12 0 1 0 20 0a10 12 0 1 0-20 0M70 58a10 12 0 1 0 20 0a10 12 0 1 0-20 0',
      skin,
      ink,
      2.8,
    );
    add('M15 47Q15 20 50 20T85 47V62Q85 95 50 96 15 95 15 62Z', skin, ink, 3.2);
    add('M22 53Q22 24 50 26T79 54L74 39 63 42 55 34 41 41 29 38Z', '#513329');
    if (chaser) {
      add('M8 28 15 13Q50-2 85 13L92 28 80 39H20Z', '#146aa9', ink, 3.2);
      add('M15 24Q50 10 85 24L82 30Q50 20 18 30Z', '#3199d4');
      add('M14 31Q50 21 86 31L85 39Q50 53 15 39Z', '#163f63', ink, 2.5);
      add('M17 32Q50 24 83 32L80 35Q50 29 20 36Z', '#bbecff');
      add('M50 9 61 15 58 28 50 34 42 28 39 15Z', '#ffdc60', ink, 2.2);
      add('M50 15 52 20 58 20 54 24 55 29 50 26 45 29 46 24 42 20 48 20Z', '#fff3b1');
      add('M25 47Q32 43 39 47M61 47Q68 43 75 47', 'none', '#513329', 3.2);
    } else {
      add('M10 36Q10 4 50 4T90 36Z', '#f89927', ink, 3.2);
      add('M14 29Q50 16 86 29L89 39Q50 28 11 39Z', '#ffb844', ink, 2.5);
      add('M23 15 21 27M38 9 37 22M53 8 54 21M68 11 71 24M80 18 82 27', 'none', '#ffcd73', 3);
      add('M17 39 26 37 31 46 46 44 55 38 68 44 79 41 82 51H17Z', '#513329');
      add('M10 54Q23 43 49 51 77 43 90 54L85 69Q69 77 50 67 31 77 15 69Z', '#203440', ink, 2.7);
      add('M22 58Q31 49 41 58L39 66H25ZM59 58Q69 49 78 58L75 66H61Z', '#fff8e8');
    }
    add('M28 59a5 7 0 1 0 10 0a5 7 0 1 0-10 0M62 59a5 7 0 1 0 10 0a5 7 0 1 0-10 0', '#172f42');
    add(
      'M30 55a1.7 2 0 1 0 3.4 0a1.7 2 0 1 0-3.4 0M64 55a1.7 2 0 1 0 3.4 0a1.7 2 0 1 0-3.4 0',
      '#fff',
    );
    add('M19 75a7 4 0 1 0 14 0a7 4 0 1 0-14 0M67 75a7 4 0 1 0 14 0a7 4 0 1 0-14 0', '#f8947b');
    add('M46 70Q50 74 54 70', 'none', '#cc8462', 2.2);
    add('M39 80Q50 90 61 80', 'none', ink, 3.2);
    return paths;
  }
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
  if (classicRoles() && style === 'team') {
    const ink = '#133a55',
      skin = '#ffcf9d';
    circle(17, 57, 10, skin);
    circle(83, 57, 10, skin);
    circle(50, 56, 39, ink);
    circle(50, 56, 36, skin);
    polygon(
      [
        [18, 47],
        [26, 24],
        [50, 19],
        [76, 26],
        [82, 47],
        [70, 37],
        [58, 40],
        [48, 32],
        [32, 40],
      ],
      '#513329',
    );
    if (cop) {
      polygon(
        [
          [8, 28],
          [15, 13],
          [50, 2],
          [85, 13],
          [92, 28],
          [80, 39],
          [20, 39],
        ],
        ink,
      );
      polygon(
        [
          [12, 27],
          [19, 16],
          [50, 7],
          [81, 16],
          [88, 27],
          [78, 35],
          [22, 35],
        ],
        '#146aa9',
      );
      polygon(
        [
          [15, 24],
          [50, 14],
          [85, 24],
          [82, 29],
          [50, 22],
          [18, 29],
        ],
        '#3199d4',
      );
      polygon(
        [
          [14, 31],
          [50, 24],
          [86, 31],
          [85, 39],
          [50, 46],
          [15, 39],
        ],
        '#163f63',
      );
      polygon(
        [
          [18, 32],
          [50, 28],
          [82, 32],
          [79, 35],
          [50, 32],
          [21, 36],
        ],
        '#bbecff',
      );
      polygon(
        [
          [50, 9],
          [61, 15],
          [58, 28],
          [50, 34],
          [42, 28],
          [39, 15],
        ],
        '#ffdc60',
      );
      circle(50, 21, 4, '#fff3b1');
    } else {
      polygon(
        [
          [10, 36],
          [13, 17],
          [30, 6],
          [50, 3],
          [70, 6],
          [87, 17],
          [90, 36],
        ],
        ink,
      );
      polygon(
        [
          [14, 34],
          [17, 19],
          [32, 10],
          [50, 7],
          [68, 10],
          [83, 19],
          [86, 34],
        ],
        '#f89927',
      );
      polygon(
        [
          [13, 29],
          [50, 21],
          [87, 29],
          [89, 39],
          [50, 32],
          [11, 39],
        ],
        '#ffb844',
      );
      polygon(
        [
          [10, 54],
          [25, 47],
          [50, 52],
          [75, 47],
          [90, 54],
          [85, 69],
          [69, 74],
          [50, 67],
          [31, 74],
          [15, 69],
        ],
        '#203440',
      );
      circle(32, 59, 10, '#fff8e8');
      circle(68, 59, 10, '#fff8e8');
    }
    circle(33, 59, 5.5, '#172f42');
    circle(67, 59, 5.5, '#172f42');
    circle(31, 56, 1.8, '#fff');
    circle(65, 56, 1.8, '#fff');
    circle(26, 75, 5, '#f8947b');
    circle(74, 75, 5, '#f8947b');
    ctx.beginPath();
    ctx.moveTo(39, 80);
    ctx.quadraticCurveTo(50, 90, 61, 80);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3.2;
    ctx.stroke();
    return;
  }
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
  if (style === 'cosmic') {
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
    [data-role-appearance]{box-sizing:border-box;width:min(560px,calc(100% - 24px));max-height:85dvh;overflow:auto;border:3px solid #17435a;border-radius:28px;background:#fff9e9;color:#143c50;padding:22px;font:16px/1.5 system-ui,sans-serif;box-shadow:0 7px 0 #17435a22,0 20px 55px #102c3940}
    [data-role-appearance]::backdrop{background:#103e4e99;backdrop-filter:blur(5px)}[data-role-appearance] h2{margin:0;font-size:25px;font-weight:900}[data-role-appearance] p{margin:8px 0 16px;font-size:13px;color:#58716b}
    [data-role-appearance] .role-options{display:grid;grid-template-columns:1fr 1fr;gap:12px}[data-role-appearance] fieldset{min-width:0;margin:0;padding:14px 12px;border:2px solid #badaca;border-radius:20px;background:#e7f5e8}
    [data-role-appearance] fieldset:last-child{background:#fff1d9;border-color:#f1d1a0}[data-role-appearance] legend{padding:0 8px;font-size:17px;font-weight:900}[data-role-appearance] label{display:block;margin:12px 0;font-size:13px;font-weight:700}
    [data-role-appearance] select,[data-role-appearance] button{min-height:44px;font:inherit;border:2px solid #bdd7c6;border-radius:13px;background:#fffdf1;color:#143c50;padding:8px 10px;font-size:13px;font-weight:700}
    [data-role-appearance] button{cursor:pointer;box-shadow:0 3px 0 #b4cbbb}[data-role-appearance] button:active{transform:translateY(2px);box-shadow:0 1px 0 #b4cbbb}[data-role-appearance] :focus-visible{outline:3px solid #0fa3b5;outline-offset:3px}
    [data-role-appearance] select,[data-role-appearance] input{box-sizing:border-box;max-width:100%;width:100%}[data-role-appearance] input{font:inherit;font-size:12px}[data-role-appearance] input::file-selector-button{min-height:44px;padding:8px;border:1px solid #a9cbb9;border-radius:10px;background:#fffdf1;color:#143c50;font:inherit}
    [data-role-appearance] .avatar-upload{position:relative;min-height:44px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;border:2px dashed #b8cdb8;border-radius:13px;background:#fffdf1;font-weight:700;overflow:hidden}[data-role-appearance] .avatar-upload input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}[data-role-appearance] .avatar-upload:focus-within{outline:3px solid #0fa3b5;outline-offset:3px}[data-role-appearance] svg{display:block;margin:5px auto 14px;width:96px;height:96px;border-radius:22px;background:#fffef1;box-shadow:0 4px 0 #a8ccb650}[data-role-appearance] footer{display:flex;justify-content:flex-end;margin-top:12px}[data-role-appearance] [data-close-appearance]{min-width:116px;background:#ffdc58;border-color:#dba942;box-shadow:0 4px 0 #dba942;font-size:16px;font-weight:900}[data-role-appearance] [role=status]{min-height:20px;font-size:12px;margin-bottom:0}
    @media(max-width:370px){[data-role-appearance]{padding:16px}[data-role-appearance] .role-options{gap:8px}[data-role-appearance] fieldset{padding:10px 7px}[data-role-appearance] select,[data-role-appearance] button{padding:7px 5px;font-size:12px}[data-role-appearance] input{font-size:11px}}
  </style><h2>小队换装间</h2><p>换个形象，一起出发！装扮用于所有关卡，头像仅保存在本机。</p><div class="role-options"></div><p role="status" aria-live="polite"></p><footer><button type="button" data-close-appearance>完成</button></footer>`;
  const status = dialog.querySelector('[role=status]');
  const save = (key, update) => {
    const previous = read(),
      next = { ...previous, [key]: { ...previous[key], ...update } };
    try {
      (globalThis.__chaseRoleStorage || globalThis.localStorage).setItem(
        storageKey,
        JSON.stringify(next),
      );
      settings = next;
      stored = JSON.stringify(next);
      images.clear();
      status.textContent = '已保存在当前设备。';
    } catch {
      status.textContent = '当前设备无法保存，请释放浏览器存储空间或允许本地存储。原设置未改动。';
      return false;
    }
    onChange();
    globalThis.document?.dispatchEvent(new Event('chase-appearancechange'));
    return true;
  };
  for (const key of ['cop', 'robber']) {
    const field = document.createElement('fieldset'),
      appearance = getRoleAppearance(key);
    field.innerHTML = `<legend>${appearance.label}</legend><svg viewBox="0 0 96 96" aria-label="${appearance.label}头像预览"></svg><label>角色样式<select aria-label="${appearance.label}样式"><option value="team">${classicRoles() ? '警察与小偷' : '卡通小队'}</option><option value="animals">猫狐追逐</option><option value="cosmic">星际追逐</option></select></label><label class="avatar-upload">上传本地头像<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="${appearance.label}本地头像"></label><button type="button">恢复默认形象</button>`;
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
