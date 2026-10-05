// Local decoration only: never include this data in room commands or score submissions.
const storageKey = 'chase-role-appearance-v1';
const presets = {
  team: { cop: ['#1677bf', '#d9f3ff', '◆'], robber: ['#d65b19', '#fff0b8', 'ϟ'] },
  animals: { cop: ['#176cb0', '#d9f3ff', '🐱'], robber: ['#bc4c17', '#ffe3be', '🦊'] },
  cosmic: { cop: ['#4d51b8', '#e4e4ff', '✦'], robber: ['#b54920', '#ffdfb4', '☄'] },
};
const characterSheet = './src/assets/characters.png';
const characters = {
  cop: [
    { name: '阳光巡警', description: '正义、勇敢，守护街区的每一天。', crop: [104, 12, 282] },
    { name: '机灵警花', description: '眼疾手快，任何小线索都逃不过她。', crop: [486, 18, 306] },
    { name: '暖心警长', description: '经验满满，总能找到最佳围捕路线。', crop: [904, 8, 314] },
  ],
  robber: [
    { name: '街头小机灵', description: '一顶橘色帽子，藏着满脑子的鬼点子。', crop: [92, 637, 322] },
    { name: '橘子少女', description: '轻快又灵巧，转个弯就有新惊喜。', crop: [507, 640, 315] },
    { name: '眼镜智多星', description: '观察街区，发现每一条突围小路。', crop: [967, 638, 311] },
  ],
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

export function getRoleAppearance(role, selectedPreset) {
  const key = side(role),
    value = read()[key];
  const style = Object.hasOwn(presets, value?.style) ? value.style : 'team';
  const [color, accent, badge] = presets[style][key];
  const preset =
    Number.isInteger(selectedPreset) && selectedPreset >= 0 && selectedPreset < 3
      ? selectedPreset
      : Number.isInteger(value?.preset) && value.preset >= 0 && value.preset < 3
        ? value.preset
        : 0;
  return {
    label: classicRoles() ? (key === 'cop' ? '警察' : '小偷') : key === 'cop' ? '追逐队' : '突围队',
    style,
    color,
    accent,
    badge,
    preset,
    character: characters[key][preset],
    sprite: characterSheet,
    avatar: selectedPreset === undefined && validAvatar(value?.avatar) ? value.avatar : '',
  };
}

// Slice the original transparent sheet in SVG; Canvas uses the very same source rectangles.
export function roleCharacterMarkup(role, selectedPreset) {
  const key = side(role),
    { preset, character } = getRoleAppearance(key, selectedPreset);
  const width = 1280 / 3,
    left = preset * width,
    top = key === 'cop' ? 0 : 640;
  const id = `character-body-${++clipSequence}`;
  return `<svg class="role-character-art" style="overflow:hidden;pointer-events:none" viewBox="${left + 24} ${top} ${width - 48} 640" role="img" aria-label="${character.name}" focusable="false"><defs><clipPath id="${id}"><rect x="${left}" y="${top}" width="${width}" height="640"/></clipPath></defs><image href="${characterSheet}" x="0" y="0" width="1280" height="1280" clip-path="url(#${id})"/></svg>`;
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

export function roleAvatarSvg(role, x, y, size, selectedPreset) {
  const { avatar, character, style } = getRoleAppearance(role, selectedPreset);
  const id = `role-portrait-${++clipSequence}`;
  const [cropX, cropY, edge] = character.crop;
  const content = avatar
    ? `<defs><clipPath id="${id}"><path d="${portraitOutline(role)}"/></clipPath></defs><image href="${avatar}" width="100" height="100" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
    : style === 'team' || selectedPreset !== undefined
      ? `<defs><clipPath id="${id}"><path d="${portraitOutline(role)}"/></clipPath></defs><g clip-path="url(#${id})"><svg width="100" height="100" viewBox="${cropX} ${cropY} ${edge} ${edge}" preserveAspectRatio="xMidYMid slice"><image href="${characterSheet}" width="1280" height="1280"/></svg></g>`
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

function loadPortraitImage(source) {
  if (!source) return null;
  let img = images.get(source);
  if (!img && (globalThis.__chaseRoleImage || typeof Image !== 'undefined')) {
    img = globalThis.__chaseRoleImage ? globalThis.__chaseRoleImage() : new Image();
    img.onload = () => {
      img.roleLoaded = true;
    };
    img.src = source;
    images.set(source, img);
  }
  return img;
}

// Browser art is preloaded once. Native SDKs keep their DOM-free vector fallback.
if (classicRoles() && typeof Image !== 'undefined' && !globalThis.__chaseRoleImage)
  loadPortraitImage(characterSheet);

export function drawRoleAvatar(ctx, role, x, y, size) {
  const { avatar, character, style } = getRoleAppearance(role);
  const useSheet = !avatar && style === 'team' && !globalThis.__chaseRoleImage;
  const img = loadPortraitImage(avatar || (useSheet ? characterSheet : ''));
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
    const width = img.naturalWidth || img.width,
      height = img.naturalHeight || img.height;
    if (useSheet) {
      const [cropX, cropY, edge] = character.crop;
      ctx.drawImage(
        img,
        (cropX * width) / 1280,
        (cropY * height) / 1280,
        (edge * width) / 1280,
        (edge * height) / 1280,
        0,
        0,
        100,
        100,
      );
    } else {
      const edge = Math.min(width, height);
      ctx.drawImage(img, (width - edge) / 2, (height - edge) / 2, edge, edge, 0, 0, 100, 100);
    }
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

const appearanceIcons = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  shirt:
    '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="m10 4-7 5 4 7 4-2v14h10V14l4 2 4-7-7-5c-1 4-11 4-12 0Z" fill="#299bf3" stroke="#1386da" stroke-width="2" stroke-linejoin="round"/></svg>',
  camera:
    '<svg viewBox="0 0 40 36" aria-hidden="true"><path d="M4 9h8l3-5h10l3 5h8v23H4Z" fill="#299bf3" stroke="#1483d6" stroke-width="2" stroke-linejoin="round"/><circle cx="20" cy="20" r="8" fill="#fff"/><circle cx="20" cy="20" r="5" fill="#8dd8ff"/><circle cx="32" cy="14" r="2" fill="#fff"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 6" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
let appearanceView = null;

export function closeAppearanceSettings() {
  appearanceView?.close();
}

export function openAppearanceSettings(onChange = () => {}) {
  if (typeof document === 'undefined' || document.querySelector('[data-role-appearance]')) return;
  const panel = document.createElement('section');
  panel.id = 'appearance-page';
  panel.className = 'appearance-page game-page';
  panel.dataset.roleAppearance = '';
  panel.setAttribute('aria-labelledby', 'appearance-page-title');
  panel.innerHTML = `<header class="appearance-header"><button type="button" class="appearance-back" data-close-appearance aria-label="返回上一页">${appearanceIcons.back}</button><div><h1 id="appearance-page-title">${appearanceIcons.shirt}角色装扮</h1><p>选个搭档，今天也要帅气出发！</p></div></header>
    <div class="appearance-team-tabs" role="group" aria-label="选择装扮阵营"><button type="button" data-appearance-role="cop">警察阵营</button><button type="button" data-appearance-role="robber">小偷阵营</button></div>
    <div class="appearance-showcase"><div class="appearance-preview" data-appearance-preview></div><div class="appearance-gallery" role="group" aria-label="六款角色形象"></div></div>
    <div class="appearance-details"><div class="appearance-description"><h2 data-character-name></h2><p data-character-description></p><span class="appearance-local-badge">本机装扮 · 即选即保存</span></div><button type="button" class="appearance-camera-tile" data-upload-avatar>${appearanceIcons.camera}<span>自定义头像</span></button><input class="appearance-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="选择本地头像图片" data-avatar-upload></div>
    <div class="appearance-tools"><span>你的两队形象，都会在游戏中出现</span><button type="button" data-reset-avatar>恢复默认</button></div>
    <p class="appearance-status" role="status" aria-live="polite" data-appearance-status>点击角色即可保存装扮</p><footer class="appearance-footer"><button type="button" class="appearance-done" data-close-appearance>${appearanceIcons.check}<span>穿好啦，出发！</span></button><p>头像仅保存在这台设备</p></footer>`;
  let activeRole = 'cop',
    closing = false,
    uploading = false;
  const status = panel.querySelector('[data-appearance-status]');
  const previousFocus = document.activeElement;
  const label = (key) => (key === 'cop' ? '警察' : '小偷');
  const save = (key, update) => {
    const previous = read();
    const next = { ...previous, [key]: { ...previous[key], ...update } };
    try {
      const serialized = JSON.stringify(next);
      (globalThis.__chaseRoleStorage || globalThis.localStorage).setItem(storageKey, serialized);
      settings = next;
      stored = serialized;
      if (previous[key]?.avatar) images.delete(previous[key].avatar);
      status.textContent = `${label(key)}装扮已自动保存！`;
      status.dataset.state = 'saved';
    } catch {
      status.textContent = '暂时无法保存，请检查浏览器的本地存储空间。';
      status.dataset.state = 'error';
      return false;
    }
    onChange();
    document.dispatchEvent(new Event('chase-appearancechange'));
    return true;
  };
  const render = () => {
    const appearance = getRoleAppearance(activeRole);
    panel.dataset.activeRole = activeRole;
    panel
      .querySelector('[data-upload-avatar]')
      .setAttribute('aria-label', `为${label(activeRole)}选择自定义头像`);
    for (const button of panel.querySelectorAll('[data-appearance-role]')) {
      const selected = button.dataset.appearanceRole === activeRole;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    panel.querySelector('[data-appearance-preview]').innerHTML = appearance.avatar
      ? `<div class="appearance-custom-portrait"><svg viewBox="0 0 100 100" role="img" aria-label="${label(activeRole)}自定义头像">${roleAvatarSvg(activeRole, 0, 0, 100)}</svg><span>我的专属头像</span></div>`
      : `${roleCharacterMarkup(activeRole)}<span class="appearance-spark appearance-spark-one" aria-hidden="true">✦</span><span class="appearance-spark appearance-spark-two" aria-hidden="true">✦</span>`;
    panel.querySelector('[data-character-name]').textContent = appearance.avatar
      ? '我的专属形象'
      : appearance.character.name;
    panel.querySelector('[data-character-description]').textContent = appearance.avatar
      ? '用喜欢的照片，成为街区里独一无二的你。'
      : appearance.character.description;
    for (const button of panel.querySelectorAll('[data-avatar-preset]')) {
      const key = button.dataset.avatarRole,
        preset = Number(button.dataset.avatarPreset);
      const value = getRoleAppearance(key);
      const selected = value.style === 'team' && !value.avatar && value.preset === preset;
      button.classList.toggle('is-selected', selected);
      button.classList.toggle('is-active-team', key === activeRole);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute(
        'aria-label',
        `${label(key)}：${characters[key][preset].name}${selected ? '，已选中' : ''}`,
      );
    }
  };
  const gallery = panel.querySelector('.appearance-gallery');
  for (const key of ['cop', 'robber']) {
    for (let preset = 0; preset < 3; preset++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'appearance-character-card';
      button.dataset.avatarRole = key;
      button.dataset.avatarPreset = String(preset);
      button.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${roleAvatarSvg(key, 0, 0, 100, preset)}</svg><span class="appearance-card-name">${characters[key][preset].name}</span><span class="appearance-card-check" aria-hidden="true">${appearanceIcons.check}</span>`;
      button.addEventListener('click', () => {
        activeRole = key;
        save(key, { style: 'team', preset, avatar: '' });
        render();
      });
      gallery.append(button);
    }
  }
  for (const button of panel.querySelectorAll('[data-appearance-role]')) {
    button.addEventListener('click', () => {
      activeRole = button.dataset.appearanceRole;
      render();
    });
  }
  const input = panel.querySelector('[data-avatar-upload]');
  const camera = panel.querySelector('[data-upload-avatar]');
  camera.addEventListener('click', () => {
    if (!uploading) input.click();
  });
  input.addEventListener('change', async () => {
    const file = input.files?.[0],
      key = activeRole;
    if (!file || uploading) return;
    uploading = true;
    input.disabled = camera.disabled = true;
    camera.setAttribute('aria-busy', 'true');
    status.textContent = `正在制作${label(key)}头像…`;
    status.dataset.state = 'loading';
    try {
      const avatar = await avatarFromFile(file);
      if (panel.isConnected && !closing) {
        save(key, { style: 'team', avatar });
        render();
      }
    } catch (error) {
      if (panel.isConnected && !closing) {
        status.textContent = error.message;
        status.dataset.state = 'error';
      }
    } finally {
      uploading = false;
      input.disabled = camera.disabled = false;
      camera.removeAttribute('aria-busy');
      input.value = '';
    }
  });
  panel.querySelector('[data-reset-avatar]').addEventListener('click', () => {
    save(activeRole, { style: 'team', preset: 0, avatar: '' });
    render();
  });
  const close = () => {
    if (closing) return;
    closing = true;
    panel.classList.add('is-leaving');
    panel.inert = true;
    document.removeEventListener('keydown', onKey);
    setTimeout(
      () => {
        panel.remove();
        appearanceView = null;
        document.dispatchEvent(
          new CustomEvent('appearance-visibility', { detail: { open: false } }),
        );
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      },
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 180,
    );
  };
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  for (const button of panel.querySelectorAll('[data-close-appearance]'))
    button.addEventListener('click', close);
  appearanceView = { close };
  document.dispatchEvent(new CustomEvent('appearance-visibility', { detail: { open: true } }));
  (document.querySelector('.app-shell') || document.body).append(panel);
  document.addEventListener('keydown', onKey);
  render();
  panel.querySelector('.appearance-back').focus({ preventScroll: true });
  return appearanceView;
}
