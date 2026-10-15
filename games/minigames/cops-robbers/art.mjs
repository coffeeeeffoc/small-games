const files = {
  home: 'home-chase.webp',
  garden: 'patrol-garden.webp',
  characters: 'patrol-characters.webp',
};

export function roundedPath(ctx, x, y, width, height, radius = 18) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function paperPanel(
  ctx,
  x,
  y,
  width,
  height,
  fill = '#fff9e7',
  border = '#9bbcaf',
  radius = 18,
) {
  roundedPath(ctx, x, y + 4, width, height, radius);
  ctx.fillStyle = border;
  ctx.fill();
  roundedPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function createCopsArt(sdk, redraw) {
  const images = {},
    loaded = new Set(),
    failed = new Set();
  let disposed = false;
  for (const [name, file] of Object.entries(files)) {
    if (typeof sdk.createImage !== 'function') continue;
    const image = sdk.createImage();
    images[name] = image;
    image.onload = () => {
      if (disposed) return;
      loaded.add(name);
      redraw();
    };
    image.onerror = () => {
      if (disposed) return;
      failed.add(name);
      redraw();
    };
    image.src = file;
  }
  const paint = (ctx, name, x, y, width, height, crop) => {
    if (!loaded.has(name)) return false;
    if (crop) ctx.drawImage(images[name], ...crop, x, y, width, height);
    else ctx.drawImage(images[name], x, y, width, height);
    return true;
  };
  return {
    cover(ctx, name, x, y, width, height) {
      if (!loaded.has(name)) return false;
      const image = images[name];
      const iw = image.naturalWidth || image.width,
        ih = image.naturalHeight || image.height;
      const scale = Math.max(width / iw, height / ih);
      return paint(ctx, name, x, y, width, height, [
        (iw - width / scale) / 2,
        (ih - height / scale) / 2,
        width / scale,
        height / scale,
      ]);
    },
    actor(ctx, role, x, feetY, height) {
      return paint(ctx, 'characters', x - height * 0.375, feetY - height, height * 0.75, height, [
        role === 'pursuer' ? 0 : 768,
        0,
        768,
        1024,
      ]);
    },
    snapshot: () => ({ loaded: [...loaded], failed: [...failed] }),
    dispose() {
      disposed = true;
      for (const image of Object.values(images)) image.onload = image.onerror = null;
    },
  };
}
